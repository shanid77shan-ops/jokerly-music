"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { Search, Loader2, Music, Mic2, Play, ListPlus, AlertCircle, RefreshCw, LogOut } from "lucide-react";
import { signOut } from "next-auth/react";
import SpotifyTrackCard from "@/components/music/SpotifyTrackCard";
import SpotifyArtistCard from "@/components/music/SpotifyArtistCard";
import SpotifyAlbumCard from "@/components/music/SpotifyAlbumCard";
import AddToPlaylistModal from "@/components/playlist/AddToPlaylistModal";
import ArtistSheet from "@/components/music/ArtistSheet";
import { SpotifyTrack, SpotifyArtist, SpotifyAlbum, trackImage, artistImage, artistNames } from "@/types/spotify";
import { usePlayerStore, PlayableTrack } from "@/store/player";
import { useToastStore } from "@/store/toast";
import Image from "next/image";

type Tab = "track" | "artist" | "album";

interface SearchCache { tracks: SpotifyTrack[]; artists: SpotifyArtist[]; albums: SpotifyAlbum[] }
const searchCache = new Map<string, SearchCache>();

interface Suggestion {
  type: "track" | "artist";
  name: string;
  sub: string;
  image: string | null;
  id: string;
  uri?: string;
  durationMs?: number;
}

const suggestCache = new Map<string, Suggestion[]>();

const TABS: { label: string; value: Tab }[] = [
  { label: "Tracks", value: "track" },
  { label: "Artists", value: "artist" },
  { label: "Albums", value: "album" },
];

function toPlayable(t: SpotifyTrack): PlayableTrack {
  return {
    name: t.name,
    artist: artistNames(t),
    image: trackImage(t),
    uri: t.uri,
    durationMs: t.duration_ms,
  };
}

export default function SearchClient() {
  const searchParams = useSearchParams();
  const initialQ = searchParams.get("q") ?? "";
  const [query, setQuery] = useState(initialQ);
  const [tab, setTab] = useState<Tab>("track");
  const [tracks, setTracks] = useState<SpotifyTrack[]>([]);
  const [artists, setArtists] = useState<SpotifyArtist[]>([]);
  const [albums, setAlbums] = useState<SpotifyAlbum[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [searchError, setSearchError] = useState<{ message: string; status: number } | null>(null);
  const [selectedArtist, setSelectedArtist] = useState<SpotifyArtist | null>(null);
  const [similarSeed, setSimilarSeed] = useState<SpotifyTrack | null>(null);
  const [similarTracks, setSimilarTracks] = useState<SpotifyTrack[]>([]);
  const [loadingSimilar, setLoadingSimilar] = useState(false);

  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [playingKey, setPlayingKey] = useState<string | null>(null);
  const [resolvingSuggestKey, setResolvingSuggestKey] = useState<string | null>(null);
  const [modalTrack, setModalTrack] = useState<{ name: string; uri: string } | null>(null);

  const suggestTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestBoxRef = useRef<HTMLDivElement>(null);

  const { setQueueAndPlay, currentTrack, isPlaying } = usePlayerStore();
  const { toast } = useToastStore();

  // Auto-search if navigated with ?q=
  useEffect(() => {
    if (initialQ.trim()) handleSearch(initialQ);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced suggestions fetch
  useEffect(() => {
    clearTimeout(suggestTimer.current);
    if (query.trim().length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    const cacheKey = query.trim().toLowerCase();
    const cached = suggestCache.get(cacheKey);
    if (cached) {
      setSuggestions(cached);
      setShowSuggestions(true);
      return;
    }

    setSuggestionsLoading(true);
    suggestTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/spotify/search?q=${encodeURIComponent(query)}&type=all&limit=8`);
        const data = await res.json();

        const trackSugs: Suggestion[] = (data.tracks ?? []).slice(0, 5).map((t: SpotifyTrack) => ({
          type: "track",
          name: t.name,
          sub: artistNames(t),
          image: trackImage(t) ?? null,
          id: t.id,
          uri: t.uri,
          durationMs: t.duration_ms,
        }));
        const artistSugs: Suggestion[] = (data.artists ?? []).slice(0, 3).map((a: SpotifyArtist) => ({
          type: "artist",
          name: a.name,
          sub: a.followers?.total != null ? `${a.followers.total.toLocaleString()} followers` : "Artist",
          image: artistImage(a) ?? null,
          id: a.id,
        }));

        const combined = [...trackSugs, ...artistSugs];
        suggestCache.set(cacheKey, combined);
        setSuggestions(combined);
        setShowSuggestions(true);
      } catch {
        setSuggestions([]);
      } finally {
        setSuggestionsLoading(false);
      }
    }, 150);
    return () => clearTimeout(suggestTimer.current);
  }, [query]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        !inputRef.current?.contains(e.target as Node) &&
        !suggestBoxRef.current?.contains(e.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSearch = useCallback(async (q = query) => {
    if (!q.trim()) return;
    setSearched(true);
    setShowSuggestions(false);
    setSimilarSeed(null);
    setSimilarTracks([]);
    setSearchError(null);

    const key = q.trim().toLowerCase();
    const cached = searchCache.get(key);
    if (cached) {
      setTracks(cached.tracks);
      setArtists(cached.artists);
      setAlbums(cached.albums);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/spotify/search?q=${encodeURIComponent(q)}&type=all&limit=20`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setSearchError({ message: body.error ?? `Search failed (${res.status})`, status: res.status });
        return;
      }
      const data = await res.json();
      const result = { tracks: data.tracks ?? [], artists: data.artists ?? [], albums: data.albums ?? [] };
      searchCache.set(key, result);
      setTracks(result.tracks);
      setArtists(result.artists);
      setAlbums(result.albums);
    } catch (e) {
      setSearchError({ message: (e as Error).message ?? "Search failed", status: 0 });
    } finally {
      setLoading(false);
    }
  }, [query, toast]);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSearch();
    if (e.key === "Escape") setShowSuggestions(false);
  };

  const handleSuggestionAdd = async (s: Suggestion) => {
    if (!s.uri) return;
    const key = s.id;
    setResolvingSuggestKey(key);
    setShowSuggestions(false);
    setModalTrack({ uri: s.uri, name: s.name });
    setResolvingSuggestKey(null);
  };

  const handleSuggestionPlay = (s: Suggestion) => {
    if (s.type === "artist") {
      setQuery(s.name);
      setShowSuggestions(false);
      handleSearch(s.name);
      return;
    }

    setPlayingKey(s.id);
    setShowSuggestions(false);

    const playable: PlayableTrack = {
      name: s.name,
      artist: s.sub,
      image: s.image ?? undefined,
      uri: s.uri ?? null,
      durationMs: s.durationMs,
    };

    setQueueAndPlay([playable], 0);
    setPlayingKey(null);
  };

  const handleGetSimilar = async (track: SpotifyTrack) => {
    setSimilarSeed(track);
    setLoadingSimilar(true);
    try {
      const res = await fetch(`/api/spotify/recommendations?trackId=${encodeURIComponent(track.id)}`);
      const data = await res.json();
      setSimilarTracks(data.tracks ?? []);
    } finally {
      setLoadingSimilar(false);
    }
  };

  const handlePlay = (track: SpotifyTrack, trackList: SpotifyTrack[]) => {
    const index = trackList.findIndex((t) => t.id === track.id);
    if (index === -1) return;
    setQueueAndPlay(trackList.map(toPlayable), index);
  };

  const isTrackPlaying = (track: SpotifyTrack) =>
    currentTrack?.name === track.name &&
    currentTrack?.artist === artistNames(track) &&
    isPlaying;

  const handleAddToPlaylist = (track: SpotifyTrack) => {
    setModalTrack({ uri: track.uri, name: track.name });
  };

  return (
    <div className="w-full space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-white mb-1">Search</h2>
        <p className="text-zinc-400">Search and instantly play any track</p>
      </div>

      {/* Search bar */}
      <div className="relative">
        <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none z-10" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKey}
          onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
          placeholder="Search tracks, artists, albums..."
          className="w-full bg-zinc-800 text-white placeholder-zinc-500 rounded-xl pl-12 pr-28 py-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 transition"
          autoComplete="off"
        />
        <button
          onClick={() => handleSearch()}
          disabled={loading || !query.trim()}
          className="absolute right-3 top-1/2 -translate-y-1/2 bg-red-500 hover:bg-red-400 disabled:opacity-40 text-black font-semibold text-sm px-4 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : "Search"}
        </button>

        {/* Suggestions dropdown */}
        {showSuggestions && (suggestions.length > 0 || suggestionsLoading) && (
          <div
            ref={suggestBoxRef}
            className="absolute top-full left-0 right-0 mt-1.5 bg-zinc-900 border border-zinc-700/60 rounded-2xl shadow-2xl z-50 overflow-hidden"
          >
            {suggestionsLoading && suggestions.length === 0 ? (
              <div className="flex items-center justify-center py-5">
                <Loader2 size={16} className="animate-spin text-zinc-500" />
              </div>
            ) : (
              <>
                {suggestions.filter((s) => s.type === "track").length > 0 && (
                  <div>
                    <p className="text-zinc-600 text-xs font-medium px-4 pt-3 pb-1 uppercase tracking-wider">Tracks</p>
                    {suggestions
                      .filter((s) => s.type === "track")
                      .map((s) => {
                        const isResolving = resolvingSuggestKey === s.id;
                        const isLoading = playingKey === s.id;
                        return (
                          <div key={s.id} className="flex items-center gap-2 px-3 py-2 hover:bg-zinc-800 transition-colors group">
                            <button
                              onClick={() => handleSuggestionPlay(s)}
                              className="flex items-center gap-3 min-w-0 flex-1 text-left"
                            >
                              <div className="relative w-9 h-9 shrink-0">
                                {s.image ? (
                                  <Image src={s.image} alt={s.name} fill unoptimized sizes="36px" className="rounded-md object-cover" />
                                ) : (
                                  <div className="w-9 h-9 bg-zinc-700 rounded-md flex items-center justify-center">
                                    <Music size={13} className="text-zinc-500" />
                                  </div>
                                )}
                                <div className="absolute inset-0 rounded-md bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                  {isLoading ? <Loader2 size={13} className="text-white animate-spin" /> : <Play size={13} className="text-white" />}
                                </div>
                              </div>
                              <div className="min-w-0">
                                <p className="text-white text-sm font-medium truncate">{s.name}</p>
                                <p className="text-zinc-400 text-xs truncate">{s.sub}</p>
                              </div>
                            </button>
                            {s.uri && (
                              <button
                                onClick={() => handleSuggestionAdd(s)}
                                disabled={isResolving}
                                title="Add to playlist"
                                className="shrink-0 p-1.5 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-zinc-700 transition-colors"
                              >
                                {isResolving ? <Loader2 size={14} className="animate-spin" /> : <ListPlus size={14} />}
                              </button>
                            )}
                          </div>
                        );
                      })}
                  </div>
                )}

                {suggestions.filter((s) => s.type === "artist").length > 0 && (
                  <div className="border-t border-zinc-800">
                    <p className="text-zinc-600 text-xs font-medium px-4 pt-3 pb-1 uppercase tracking-wider">Artists</p>
                    {suggestions
                      .filter((s) => s.type === "artist")
                      .map((s) => (
                        <button
                          key={s.id}
                          onClick={() => handleSuggestionPlay(s)}
                          className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-800 transition-colors text-left"
                        >
                          <div className="relative w-10 h-10 shrink-0">
                            {s.image ? (
                              <Image src={s.image} alt={s.name} fill unoptimized sizes="40px" className="rounded-full object-cover" />
                            ) : (
                              <div className="w-10 h-10 bg-zinc-700 rounded-full flex items-center justify-center">
                                <Mic2 size={14} className="text-zinc-500" />
                              </div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-white text-sm font-medium truncate">{s.name}</p>
                            <p className="text-zinc-500 text-xs truncate">{s.sub}</p>
                          </div>
                          <Search size={13} className="text-zinc-600 shrink-0" />
                        </button>
                      ))}
                  </div>
                )}

                <div className="border-t border-zinc-800 px-4 py-2">
                  <button
                    onClick={() => handleSearch()}
                    className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                  >
                    See all results for &ldquo;{query}&rdquo; →
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Search error banner */}
      {searchError && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 flex flex-col gap-3">
          <div className="flex items-start gap-3">
            <AlertCircle size={18} className="text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-red-300 text-sm font-medium">
                {searchError.status === 401 ? "Session expired" :
                 searchError.status === 429 ? "Too many requests — please wait a moment" :
                 "Search failed"}
              </p>
              <p className="text-red-400/70 text-xs mt-0.5 break-all">{searchError.message}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {searchError.status === 401 ? (
              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="flex items-center gap-1.5 text-xs bg-red-500 hover:bg-red-400 text-white px-3 py-1.5 rounded-lg transition-colors font-medium"
              >
                <LogOut size={13} /> Sign out &amp; re-login
              </button>
            ) : (
              <button
                onClick={() => handleSearch()}
                className="flex items-center gap-1.5 text-xs bg-zinc-700 hover:bg-zinc-600 text-white px-3 py-1.5 rounded-lg transition-colors font-medium"
              >
                <RefreshCw size={13} /> Retry
              </button>
            )}
          </div>
        </div>
      )}

      {/* Full search results */}
      {searched && !loading && !searchError && (
        <>
          <div className="flex gap-2">
            {TABS.map((t) => (
              <button
                key={t.value}
                onClick={() => setTab(t.value)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  tab === t.value ? "bg-white text-black" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === "track" && (
            <div className="space-y-1">
              {tracks.length === 0 ? (
                <p className="text-zinc-500 text-sm py-8 text-center">No tracks found.</p>
              ) : (
                tracks.map((t, i) => (
                  <SpotifyTrackCard
                    key={t.id}
                    track={t}
                    rank={i + 1}
                    onGetSimilar={handleGetSimilar}
                    onPlay={(track) => handlePlay(track, tracks)}
                    onAddToPlaylist={handleAddToPlaylist}
                    isCurrentlyPlaying={isTrackPlaying(t)}
                  />
                ))
              )}
            </div>
          )}

          {tab === "artist" && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {artists.length === 0 ? (
                <p className="text-zinc-500 text-sm py-8 col-span-4 text-center">No artists found.</p>
              ) : (
                artists.map((a) => (
                  <SpotifyArtistCard key={a.id} artist={a} onSelect={setSelectedArtist} />
                ))
              )}
            </div>
          )}

          {tab === "album" && (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {albums.length === 0 ? (
                <p className="text-zinc-500 text-sm py-8 col-span-5 text-center">No albums found.</p>
              ) : (
                albums.map((a) => (
                  <SpotifyAlbumCard key={a.id} album={a} />
                ))
              )}
            </div>
          )}

          {similarSeed && (
            <div className="mt-6 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-white font-semibold">
                  Similar to <span className="text-red-400">{similarSeed.name}</span>
                </h3>
                <button
                  onClick={() => { setSimilarSeed(null); setSimilarTracks([]); }}
                  className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  Clear
                </button>
              </div>
              {loadingSimilar ? (
                <div className="flex justify-center py-8">
                  <Loader2 size={24} className="animate-spin text-zinc-500" />
                </div>
              ) : (
                <div className="space-y-1">
                  {similarTracks.map((t, i) => (
                    <SpotifyTrackCard
                      key={t.id}
                      track={t}
                      rank={i + 1}
                      onGetSimilar={handleGetSimilar}
                      onPlay={(track) => handlePlay(track, similarTracks)}
                      onAddToPlaylist={handleAddToPlaylist}
                      isCurrentlyPlaying={isTrackPlaying(t)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {modalTrack && (
        <AddToPlaylistModal track={modalTrack} onClose={() => setModalTrack(null)} />
      )}

      {selectedArtist && (
        <ArtistSheet artist={selectedArtist} onClose={() => setSelectedArtist(null)} />
      )}
    </div>
  );
}
