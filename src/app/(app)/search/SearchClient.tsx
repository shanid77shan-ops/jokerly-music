"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Search, Loader2, Music, Mic2, Play } from "lucide-react";
import LfmTrackCard from "@/components/music/LfmTrackCard";
import LfmArtistCard from "@/components/music/LfmArtistCard";
import LfmAlbumCard from "@/components/music/LfmAlbumCard";
import AddToPlaylistModal from "@/components/playlist/AddToPlaylistModal";
import { LfmTrack, LfmArtist, LfmAlbum, lfmArtistName, lfmImage } from "@/lib/lastfm";
import ArtistDetailSheet from "@/components/music/ArtistDetailSheet";
import { usePlayerStore, PlayableTrack } from "@/store/player";
import Image from "next/image";

type Tab = "track" | "artist" | "album";

const TABS: { label: string; value: Tab }[] = [
  { label: "Tracks", value: "track" },
  { label: "Artists", value: "artist" },
  { label: "Albums", value: "album" },
];

interface Suggestion {
  type: "track" | "artist";
  name: string;
  sub: string;
  image: string | null;
}

interface ResolvedTrackPayload {
  uri: string;
  name: string;
}

function toPlayable(t: LfmTrack): PlayableTrack {
  return {
    name: t.name,
    artist: lfmArtistName(t.artist),
    image: lfmImage(t.image, "large") ?? undefined,
    lfmUrl: t.url,
  };
}

async function fetchPreview(name: string, artist: string) {
  const res = await fetch(
    `/api/spotify/resolve?track=${encodeURIComponent(name)}&artist=${encodeURIComponent(artist)}`
  );
  return res.json() as Promise<{ uri: string | null; imageUrl: string | null; durationMs: number | null }>;
}

async function resolveTrackForPlaylist(name: string, artist: string): Promise<ResolvedTrackPayload | null> {
  const data = await fetchPreview(name, artist);
  if (!data.uri) return null;
  return { uri: data.uri, name };
}

export default function SearchClient() {
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<Tab>("track");
  const [tracks, setTracks] = useState<LfmTrack[]>([]);
  const [artists, setArtists] = useState<LfmArtist[]>([]);
  const [albums, setAlbums] = useState<LfmAlbum[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [selectedArtist, setSelectedArtist] = useState<LfmArtist | null>(null);
  const [similarSeed, setSimilarSeed] = useState<LfmTrack | null>(null);
  const [similarTracks, setSimilarTracks] = useState<LfmTrack[]>([]);
  const [loadingSimilar, setLoadingSimilar] = useState(false);

  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [playingKey, setPlayingKey] = useState<string | null>(null); // tracks which suggestion is loading
  const [resolvingAddKey, setResolvingAddKey] = useState<string | null>(null);
  const [modalTrack, setModalTrack] = useState<ResolvedTrackPayload | null>(null);

  const suggestTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestBoxRef = useRef<HTMLDivElement>(null);

  const { setQueueAndPlay, currentTrack, isPlaying } = usePlayerStore();

  // Debounced suggestions fetch
  useEffect(() => {
    clearTimeout(suggestTimer.current);
    if (query.trim().length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    setSuggestionsLoading(true);
    suggestTimer.current = setTimeout(async () => {
      try {
        const [trackRes, artistRes] = await Promise.all([
          fetch(`/api/lastfm/search?q=${encodeURIComponent(query)}&type=track&limit=5`),
          fetch(`/api/lastfm/search?q=${encodeURIComponent(query)}&type=artist&limit=3`),
        ]);
        const [trackData, artistData] = await Promise.all([trackRes.json(), artistRes.json()]);
        const trackSugs: Suggestion[] = (trackData.tracks ?? []).map((t: LfmTrack) => ({
          type: "track",
          name: t.name,
          sub: lfmArtistName(t.artist),
          image: lfmImage(t.image, "small"),
        }));
        const artistSugs: Suggestion[] = (artistData.artists ?? []).map((a: LfmArtist) => ({
          type: "artist",
          name: a.name,
          sub: a.listeners ? `${Number(a.listeners).toLocaleString()} listeners` : "Artist",
          image: lfmImage(a.image, "small"),
        }));
        setSuggestions([...trackSugs, ...artistSugs]);
        setShowSuggestions(true);
      } catch {
        setSuggestions([]);
      } finally {
        setSuggestionsLoading(false);
      }
    }, 280);
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
    setLoading(true);
    setSearched(true);
    setShowSuggestions(false);
    setSimilarSeed(null);
    setSimilarTracks([]);
    try {
      const res = await fetch(`/api/lastfm/search?q=${encodeURIComponent(q)}&type=all`);
      const data = await res.json();
      setTracks(data.tracks ?? []);
      setArtists(data.artists ?? []);
      setAlbums(data.albums ?? []);
    } finally {
      setLoading(false);
    }
  }, [query]);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSearch();
    if (e.key === "Escape") setShowSuggestions(false);
  };

  // Click on a track suggestion → play immediately
  const handleSuggestionPlay = async (s: Suggestion) => {
    if (s.type === "artist") {
      setQuery(s.name);
      setShowSuggestions(false);
      handleSearch(s.name);
      return;
    }

    const key = `${s.name}::${s.sub}`;
    setPlayingKey(key);
    setShowSuggestions(false);

    const playable: PlayableTrack = {
      name: s.name,
      artist: s.sub,
      image: s.image ?? undefined,
    };

    try {
      const data = await fetchPreview(s.name, s.sub);
      playable.uri = data.uri ?? null;
      if (typeof data.durationMs === "number") playable.durationMs = data.durationMs;
      if (data.imageUrl) playable.image = data.imageUrl;
    } catch {
      playable.uri = null;
    }

    setQueueAndPlay([playable], 0);
    setPlayingKey(null);
  };

  const handleGetSimilar = async (track: LfmTrack) => {
    setSimilarSeed(track);
    setLoadingSimilar(true);
    const artistName = lfmArtistName(track.artist);
    const res = await fetch(
      `/api/lastfm/recommendations?track=${encodeURIComponent(track.name)}&artist=${encodeURIComponent(artistName)}`
    );
    const data = await res.json();
    setSimilarTracks(data.tracks ?? []);
    setLoadingSimilar(false);
  };

  const handlePlay = async (track: LfmTrack, trackList: LfmTrack[]) => {
    const index = trackList.findIndex(
      (t) => t.name === track.name && lfmArtistName(t.artist) === lfmArtistName(track.artist)
    );
    if (index === -1) return;

    const playable = trackList.map(toPlayable);
    try {
      const data = await fetchPreview(track.name, lfmArtistName(track.artist));
      playable[index].uri = data.uri ?? null;
      if (typeof data.durationMs === "number") playable[index].durationMs = data.durationMs;
      if (data.imageUrl) playable[index].image = data.imageUrl;
    } catch {
      playable[index].uri = null;
    }
    setQueueAndPlay(playable, index);
  };

  const isTrackPlaying = (track: LfmTrack) =>
    currentTrack?.name === track.name &&
    currentTrack?.artist === lfmArtistName(track.artist) &&
    isPlaying;

  const handleAddToPlaylist = async (track: LfmTrack) => {
    const artist = lfmArtistName(track.artist);
    const key = `${track.name}::${artist}`;
    setResolvingAddKey(key);
    try {
      const resolved = await resolveTrackForPlaylist(track.name, artist);
      if (resolved) setModalTrack(resolved);
    } finally {
      setResolvingAddKey(null);
    }
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
                {/* Track suggestions */}
                {suggestions.filter((s) => s.type === "track").length > 0 && (
                  <div>
                    <p className="text-zinc-600 text-xs font-medium px-4 pt-3 pb-1 uppercase tracking-wider">Tracks</p>
                    {suggestions
                      .filter((s) => s.type === "track")
                      .map((s, i) => {
                        const key = `${s.name}::${s.sub}`;
                        const isLoading = playingKey === key;
                        return (
                          <button
                            key={`track-${i}`}
                            onClick={() => handleSuggestionPlay(s)}
                            className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-800 transition-colors text-left group"
                          >
                            <div className="relative w-10 h-10 shrink-0">
                              {s.image ? (
                                <Image src={s.image} alt={s.name} fill unoptimized sizes="40px" className="rounded-lg object-cover" />
                              ) : (
                                <div className="w-10 h-10 bg-zinc-700 rounded-lg flex items-center justify-center">
                                  <Music size={14} className="text-zinc-500" />
                                </div>
                              )}
                              {/* Play overlay */}
                              <div className="absolute inset-0 rounded-lg bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                {isLoading ? (
                                  <Loader2 size={14} className="text-white animate-spin" />
                                ) : (
                                  <Play size={14} className="text-white" />
                                )}
                              </div>
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-white text-sm font-medium truncate">{s.name}</p>
                              <p className="text-zinc-400 text-xs truncate">{s.sub}</p>
                            </div>
                            <div className="shrink-0 text-zinc-600 group-hover:text-red-400 transition-colors">
                              {isLoading ? (
                                <Loader2 size={15} className="animate-spin" />
                              ) : (
                                <Play size={15} />
                              )}
                            </div>
                          </button>
                        );
                      })}
                  </div>
                )}

                {/* Artist suggestions */}
                {suggestions.filter((s) => s.type === "artist").length > 0 && (
                  <div className="border-t border-zinc-800">
                    <p className="text-zinc-600 text-xs font-medium px-4 pt-3 pb-1 uppercase tracking-wider">Artists</p>
                    {suggestions
                      .filter((s) => s.type === "artist")
                      .map((s, i) => (
                        <button
                          key={`artist-${i}`}
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

      {/* Full search results */}
      {searched && !loading && (
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
                  <LfmTrackCard
                    key={`${t.name}-${i}`}
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
                artists.map((a, i) => (
                  <LfmArtistCard key={`${a.name}-${i}`} artist={a} onSelect={setSelectedArtist} />
                ))
              )}
            </div>
          )}

          {tab === "album" && (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {albums.length === 0 ? (
                <p className="text-zinc-500 text-sm py-8 col-span-5 text-center">No albums found.</p>
              ) : (
                albums.map((a, i) => (
                  <LfmAlbumCard key={`${a.name}-${i}`} album={a} />
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
                    <LfmTrackCard
                      key={`sim-${t.name}-${i}`}
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

      {resolvingAddKey && (
        <div className="fixed bottom-24 right-4 bg-zinc-900 border border-zinc-700 text-zinc-200 text-xs px-3 py-2 rounded-lg shadow-xl">
          Resolving track for playlist...
        </div>
      )}

      {modalTrack && (
        <AddToPlaylistModal track={modalTrack} onClose={() => setModalTrack(null)} />
      )}

      {selectedArtist && (
        <ArtistDetailSheet artist={selectedArtist} onClose={() => setSelectedArtist(null)} />
      )}
    </div>
  );
}
