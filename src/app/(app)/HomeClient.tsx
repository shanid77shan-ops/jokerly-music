"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { PinnedPlaylist } from "@/types";
import Link from "next/link";
import { Pin, Search, Loader2, Music, Mic2, Play, ListPlus, Languages, ExternalLink } from "lucide-react";
import PinnedPlaylistSection from "@/components/home/PinnedPlaylistSection";
import { SpotifyTrack, SpotifyArtist, trackImage, artistImage, artistNames } from "@/types/spotify";
import { usePlayerStore, PlayableTrack } from "@/store/player";
import Image from "next/image";
import AddToPlaylistModal from "@/components/playlist/AddToPlaylistModal";
import { getLanguage } from "@/lib/languages";

interface Suggestion {
  type: "track" | "artist";
  name: string;
  sub: string;
  image: string | null;
  id: string;
  uri?: string;
  durationMs?: number;
}

interface FeedSection {
  langId: string;
  label: string;
  emoji: string;
  tracks: SpotifyTrack[];
  artists: SpotifyArtist[];
}

const suggestCache = new Map<string, Suggestion[]>();

function toPlayableFromSuggestion(s: Suggestion): PlayableTrack {
  return { name: s.name, artist: s.sub, image: s.image ?? undefined, uri: s.uri ?? null, durationMs: s.durationMs };
}

function toPlayableFromTrack(t: SpotifyTrack): PlayableTrack {
  return {
    name: t.name,
    artist: artistNames(t),
    image: trackImage(t) ?? undefined,
    uri: t.uri,
    durationMs: t.duration_ms,
  };
}

export default function HomeClient() {
  const router = useRouter();

  // Preferences state
  const [langs, setLangs] = useState<string[] | null>(null); // null = loading
  const [prefsChecked, setPrefsChecked] = useState(false);

  // Feed state
  const [feedSections, setFeedSections] = useState<FeedSection[]>([]);
  const [feedLoading, setFeedLoading] = useState(false);

  // Pinned
  const [pinned, setPinned] = useState<PinnedPlaylist[]>([]);

  // Search
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [playingKey, setPlayingKey] = useState<string | null>(null);
  const [modalTrack, setModalTrack] = useState<{ name: string; uri: string } | null>(null);

  const suggestTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestBoxRef = useRef<HTMLDivElement>(null);

  const { setQueueAndPlay } = usePlayerStore();

  // 1. Check language preferences
  useEffect(() => {
    fetch("/api/preferences")
      .then((r) => r.json())
      .then((data) => {
        setLangs(data.languages ?? []);
        setPrefsChecked(true);
      })
      .catch(() => { setLangs([]); setPrefsChecked(true); });
  }, []);

  // 2. Redirect to onboarding if no prefs set
  useEffect(() => {
    if (prefsChecked && langs !== null && langs.length === 0) {
      router.push("/onboarding");
    }
  }, [prefsChecked, langs, router]);

  // 3. Fetch language feed once prefs are loaded
  const fetchFeed = useCallback((langList: string[]) => {
    if (!langList.length) return;
    setFeedLoading(true);
    fetch(`/api/spotify/language-feed?langs=${langList.join(",")}`)
      .then((r) => r.json())
      .then((data) => setFeedSections(data.sections ?? []))
      .catch(() => {})
      .finally(() => setFeedLoading(false));
  }, []);

  useEffect(() => {
    if (langs && langs.length > 0) fetchFeed(langs);
  }, [langs, fetchFeed]);

  // 4. Pinned playlists
  useEffect(() => {
    fetch("/api/pinned")
      .then((r) => r.json())
      .then((data) => setPinned(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  // 5. Debounced search suggestions
  useEffect(() => {
    clearTimeout(suggestTimer.current);
    if (query.trim().length < 2) { setSuggestions([]); setShowSuggestions(false); return; }

    const key = query.trim().toLowerCase();
    const cached = suggestCache.get(key);
    if (cached) { setSuggestions(cached); setShowSuggestions(true); return; }

    setSuggestionsLoading(true);
    suggestTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/spotify/search?q=${encodeURIComponent(query)}&type=all&limit=8`);
        const data = await res.json();
        const trackSugs: Suggestion[] = (data.tracks ?? []).slice(0, 5).map((t: SpotifyTrack) => ({
          type: "track", name: t.name, sub: artistNames(t), image: trackImage(t) ?? null, id: t.id, uri: t.uri, durationMs: t.duration_ms,
        }));
        const artistSugs: Suggestion[] = (data.artists ?? []).slice(0, 3).map((a: SpotifyArtist) => ({
          type: "artist", name: a.name, sub: a.followers?.total != null ? `${a.followers.total.toLocaleString()} followers` : "Artist",
          image: artistImage(a) ?? null, id: a.id,
        }));
        const combined = [...trackSugs, ...artistSugs];
        suggestCache.set(key, combined);
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

  // Close suggestions on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!inputRef.current?.contains(e.target as Node) && !suggestBoxRef.current?.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSearch = () => {
    if (!query.trim()) return;
    setShowSuggestions(false);
    router.push(`/search?q=${encodeURIComponent(query.trim())}`);
  };

  const handleSuggestionClick = (s: Suggestion) => {
    if (s.type === "artist") {
      setQuery(s.name);
      setShowSuggestions(false);
      router.push(`/search?q=${encodeURIComponent(s.name)}`);
      return;
    }
    setPlayingKey(s.id);
    setShowSuggestions(false);
    setQueueAndPlay([toPlayableFromSuggestion(s)], 0);
    setPlayingKey(null);
  };

  const playSection = (section: FeedSection, index: number) => {
    setQueueAndPlay(section.tracks.map(toPlayableFromTrack), index);
  };

  // Show spinner while checking prefs
  if (!prefsChecked) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 size={28} className="animate-spin text-zinc-600" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Search bar */}
      <div className="relative">
        <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none z-10" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); if (e.key === "Escape") setShowSuggestions(false); }}
          onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
          placeholder="Search tracks, artists, albums..."
          className="w-full bg-zinc-900 border border-zinc-800 text-white placeholder-zinc-500 rounded-2xl pl-11 pr-28 py-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition"
          autoComplete="off"
        />
        <button
          onClick={handleSearch}
          disabled={!query.trim()}
          className="absolute right-3 top-1/2 -translate-y-1/2 bg-red-500 hover:bg-red-400 disabled:opacity-40 text-black font-semibold text-sm px-4 py-1.5 rounded-xl transition-colors"
        >
          Search
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
                    {suggestions.filter((s) => s.type === "track").map((s) => (
                      <div key={s.id} className="flex items-center gap-2 px-3 py-2 hover:bg-zinc-800 transition-colors group">
                        <button onClick={() => handleSuggestionClick(s)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                          <div className="relative w-9 h-9 shrink-0">
                            {s.image ? (
                              <Image src={s.image} alt={s.name} fill unoptimized sizes="36px" className="rounded-md object-cover" />
                            ) : (
                              <div className="w-9 h-9 bg-zinc-700 rounded-md flex items-center justify-center"><Music size={13} className="text-zinc-500" /></div>
                            )}
                            <div className="absolute inset-0 rounded-md bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                              {playingKey === s.id ? <Loader2 size={13} className="text-white animate-spin" /> : <Play size={13} className="text-white" />}
                            </div>
                          </div>
                          <div className="min-w-0">
                            <p className="text-white text-sm font-medium truncate">{s.name}</p>
                            <p className="text-zinc-400 text-xs truncate">{s.sub}</p>
                          </div>
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); if (s.uri) setModalTrack({ name: s.name, uri: s.uri }); }}
                          className="shrink-0 p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-700 transition-colors opacity-0 group-hover:opacity-100"
                          title="Add to playlist"
                        >
                          <ListPlus size={15} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {suggestions.filter((s) => s.type === "artist").length > 0 && (
                  <div className="border-t border-zinc-800">
                    <p className="text-zinc-600 text-xs font-medium px-4 pt-3 pb-1 uppercase tracking-wider">Artists</p>
                    {suggestions.filter((s) => s.type === "artist").map((s) => (
                      <button key={s.id} onClick={() => handleSuggestionClick(s)}
                        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-800 transition-colors text-left">
                        <div className="relative w-10 h-10 shrink-0">
                          {s.image ? (
                            <Image src={s.image} alt={s.name} fill unoptimized sizes="40px" className="rounded-full object-cover" />
                          ) : (
                            <div className="w-10 h-10 bg-zinc-700 rounded-full flex items-center justify-center"><Mic2 size={14} className="text-zinc-500" /></div>
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
                  <button onClick={handleSearch} className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
                    See all results for &ldquo;{query}&rdquo; →
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Language feed header */}
      {langs && langs.length > 0 && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 flex-wrap">
            {langs.map((id) => {
              const l = getLanguage(id);
              return l ? (
                <span key={id} className="text-xs bg-zinc-900 border border-zinc-800 text-zinc-300 px-2.5 py-1 rounded-full">
                  {l.emoji} {l.label}
                </span>
              ) : null;
            })}
          </div>
          <Link
            href="/onboarding"
            className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-white transition-colors shrink-0 ml-3"
          >
            <Languages size={13} />
            Edit
          </Link>
        </div>
      )}

      {/* Language feed sections */}
      {feedLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="text-center">
            <Loader2 size={28} className="animate-spin text-zinc-600 mx-auto mb-3" />
            <p className="text-zinc-600 text-sm">Loading your music feed…</p>
          </div>
        </div>
      ) : (
        feedSections.map((section) => (
          <section key={section.langId} className="space-y-4">
            <h3 className="text-white font-semibold text-lg">
              {section.emoji} {section.label} Picks
            </h3>

            {/* Tracks horizontal scroll */}
            {section.tracks.length > 0 && (
              <div>
                <p className="text-zinc-500 text-xs uppercase tracking-wider mb-2 font-medium">Tracks</p>
                <div className="space-y-1">
                  {section.tracks.slice(0, 6).map((track, i) => (
                    <div
                      key={track.id}
                      className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-zinc-900 transition-colors group"
                    >
                      <span className="text-zinc-600 text-xs w-5 text-right shrink-0 tabular-nums">{i + 1}</span>
                      <div className="relative w-9 h-9 shrink-0">
                        {trackImage(track) ? (
                          <Image src={trackImage(track)!} alt={track.name} fill unoptimized sizes="36px" className="rounded-md object-cover" />
                        ) : (
                          <div className="w-9 h-9 bg-zinc-800 rounded-md flex items-center justify-center">
                            <Music size={13} className="text-zinc-600" />
                          </div>
                        )}
                        <button
                          onClick={() => playSection(section, i)}
                          className="absolute inset-0 rounded-md bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Play size={13} className="text-white" />
                        </button>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-medium truncate">{track.name}</p>
                        <p className="text-zinc-400 text-xs truncate">{artistNames(track)}</p>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <button
                          onClick={() => track.uri && setModalTrack({ name: track.name, uri: track.uri })}
                          className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-700 transition-colors"
                          title="Add to playlist"
                        >
                          <ListPlus size={14} />
                        </button>
                        {track.external_urls?.spotify && (
                          <a
                            href={track.external_urls.spotify}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-700 transition-colors"
                            title="Open on Spotify"
                          >
                            <ExternalLink size={14} />
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Artists grid */}
            {section.artists.length > 0 && (
              <div>
                <p className="text-zinc-500 text-xs uppercase tracking-wider mb-3 font-medium">Artists</p>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                  {section.artists.slice(0, 6).map((artist) => (
                    <button
                      key={artist.id}
                      onClick={() => router.push(`/search?q=${encodeURIComponent(artist.name)}`)}
                      className="flex flex-col items-center gap-2 group"
                    >
                      <div className="relative w-full aspect-square rounded-full overflow-hidden bg-zinc-800">
                        {artistImage(artist) ? (
                          <Image src={artistImage(artist)!} alt={artist.name} fill unoptimized sizes="80px" className="object-cover group-hover:scale-105 transition-transform duration-200" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Mic2 size={20} className="text-zinc-600" />
                          </div>
                        )}
                      </div>
                      <p className="text-xs text-zinc-400 group-hover:text-white transition-colors text-center truncate w-full">{artist.name}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>
        ))
      )}

      {/* Pinned playlists */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-white font-semibold flex items-center gap-2">
            <Pin size={16} className="text-red-400" /> Pinned Playlists
          </h3>
          <Link href="/pinned" className="text-xs text-zinc-400 hover:text-white transition-colors">
            View all
          </Link>
        </div>
        <PinnedPlaylistSection pinned={pinned} />
      </section>

      {modalTrack && (
        <AddToPlaylistModal track={modalTrack} onClose={() => setModalTrack(null)} />
      )}
    </div>
  );
}
