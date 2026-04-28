"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { PinnedPlaylist } from "@/types";
import Link from "next/link";
import { Pin, Search, Loader2, Music, Mic2, Play } from "lucide-react";
import PinnedPlaylistSection from "@/components/home/PinnedPlaylistSection";
import { SpotifyTrack, SpotifyArtist, trackImage, artistImage, artistNames } from "@/types/spotify";
import { usePlayerStore, PlayableTrack } from "@/store/player";
import Image from "next/image";

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

function toPlayable(s: Suggestion): PlayableTrack {
  return { name: s.name, artist: s.sub, image: s.image ?? undefined, uri: s.uri ?? null, durationMs: s.durationMs };
}

export default function HomeClient() {
  const { data: session } = useSession();
  const router = useRouter();
  const [pinned, setPinned] = useState<PinnedPlaylist[]>([]);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [playingKey, setPlayingKey] = useState<string | null>(null);

  const suggestTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestBoxRef = useRef<HTMLDivElement>(null);

  const { setQueueAndPlay } = usePlayerStore();
  const firstName = session?.user?.name?.split(" ")[0] ?? "there";

  useEffect(() => {
    fetch("/api/pinned")
      .then((r) => r.json())
      .then((data) => setPinned(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  // Debounced suggestions
  useEffect(() => {
    clearTimeout(suggestTimer.current);
    if (query.trim().length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

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
          type: "artist", name: a.name, sub: a.followers?.total != null ? `${a.followers.total.toLocaleString()} followers` : "Artist", image: artistImage(a) ?? null, id: a.id,
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

  // Close on outside click
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
    setQueueAndPlay([toPlayable(s)], 0);
    setPlayingKey(null);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-white mb-1">Good evening, {firstName} 👋</h2>
        <p className="text-zinc-400">What do you want to listen to?</p>
      </div>

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
                      <button
                        key={s.id}
                        onClick={() => handleSuggestionClick(s)}
                        className="w-full flex items-center gap-3 px-3 py-2 hover:bg-zinc-800 transition-colors group text-left"
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
                            {playingKey === s.id ? <Loader2 size={13} className="text-white animate-spin" /> : <Play size={13} className="text-white" />}
                          </div>
                        </div>
                        <div className="min-w-0">
                          <p className="text-white text-sm font-medium truncate">{s.name}</p>
                          <p className="text-zinc-400 text-xs truncate">{s.sub}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {suggestions.filter((s) => s.type === "artist").length > 0 && (
                  <div className="border-t border-zinc-800">
                    <p className="text-zinc-600 text-xs font-medium px-4 pt-3 pb-1 uppercase tracking-wider">Artists</p>
                    {suggestions.filter((s) => s.type === "artist").map((s) => (
                      <button
                        key={s.id}
                        onClick={() => handleSuggestionClick(s)}
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
                  <button onClick={handleSearch} className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
                    See all results for &ldquo;{query}&rdquo; →
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

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
    </div>
  );
}
