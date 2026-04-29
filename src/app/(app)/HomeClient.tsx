"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { PinnedPlaylist } from "@/types";
import Link from "next/link";
import { Pin, Search, Loader2, Music, Mic2, Play, ListPlus, RefreshCw, Sparkles, SlidersHorizontal } from "lucide-react";
import PinnedPlaylistSection from "@/components/home/PinnedPlaylistSection";
import PersonalizeSheet, { FavoriteArtist } from "@/components/home/PersonalizeSheet";
import ArtistSheet from "@/components/music/ArtistSheet";
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

// Module-level home cache
interface HomeCache {
  langs: string[];
  favoriteArtists: FavoriteArtist[];
  pinned: PinnedPlaylist[];
  feedSections: FeedSection[];
  forYouTracks: SpotifyTrack[];
  ts: number;
}
let homeCache: HomeCache | null = null;
const HOME_CACHE_TTL = 5 * 60 * 1000;

function toPlayableFromSuggestion(s: Suggestion): PlayableTrack {
  return { name: s.name, artist: s.sub, image: s.image ?? undefined, uri: s.uri ?? null, durationMs: s.durationMs };
}
function toPlayableFromTrack(t: SpotifyTrack): PlayableTrack {
  return { name: t.name, artist: artistNames(t), image: trackImage(t) ?? undefined, uri: t.uri, durationMs: t.duration_ms };
}

// Skeletons
function SkeletonLine({ w = "w-full", h = "h-3" }: { w?: string; h?: string }) {
  return <div className={`${w} ${h} rounded-full bg-white/[0.05] animate-pulse`} />;
}
function TrackRowSkeleton() {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <div className="w-5 h-3 rounded bg-white/[0.05] animate-pulse shrink-0" />
      <div className="w-10 h-10 rounded-xl bg-white/[0.05] animate-pulse shrink-0" />
      <div className="flex-1 space-y-1.5"><SkeletonLine w="w-2/3" /><SkeletonLine w="w-1/3" h="h-2" /></div>
    </div>
  );
}
function ArtistCircleSkeleton() {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="w-full aspect-square rounded-full bg-white/[0.05] animate-pulse" />
      <SkeletonLine w="w-3/4" h="h-2" />
    </div>
  );
}
function FeedSkeleton() {
  return (
    <div className="space-y-8">
      {[0, 1].map((i) => (
        <div key={i} className="space-y-3">
          <SkeletonLine w="w-36" h="h-5" />
          <div className="rounded-2xl border border-white/[0.06] overflow-hidden" style={{ background: "var(--card)" }}>
            {[0,1,2,3,4].map((j) => <TrackRowSkeleton key={j} />)}
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
            {[0,1,2,3,4,5].map((j) => <ArtistCircleSkeleton key={j} />)}
          </div>
        </div>
      ))}
    </div>
  );
}
function PinnedSkeleton() {
  return (
    <div className="space-y-2">
      {[0,1,2].map((i) => (
        <div key={i} className="rounded-2xl border border-white/[0.06] p-3 flex items-center gap-3" style={{ background: "var(--card)" }}>
          <div className="w-11 h-11 rounded-xl bg-white/[0.05] animate-pulse shrink-0" />
          <SkeletonLine w="w-40" h="h-4" />
        </div>
      ))}
    </div>
  );
}

export default function HomeClient() {
  const router = useRouter();
  const { data: session } = useSession();
  // Require non-empty feedSections so a failed/empty feed load never poisons the cache
  const hasFreshCache =
    homeCache !== null &&
    Date.now() - homeCache.ts < HOME_CACHE_TTL &&
    homeCache.feedSections.length > 0;

  const [langs, setLangs] = useState<string[] | null>(hasFreshCache ? homeCache!.langs : null);
  const [favoriteArtists, setFavoriteArtists] = useState<FavoriteArtist[]>(hasFreshCache ? homeCache!.favoriteArtists : []);
  const [prefsChecked, setPrefsChecked] = useState(hasFreshCache);
  const [feedSections, setFeedSections] = useState<FeedSection[]>(hasFreshCache ? homeCache!.feedSections : []);
  const [feedLoading, setFeedLoading] = useState(!hasFreshCache);
  const [pinned, setPinned] = useState<PinnedPlaylist[]>(hasFreshCache ? homeCache!.pinned : []);
  const [pinnedLoading, setPinnedLoading] = useState(!hasFreshCache);
  const [forYouTracks, setForYouTracks] = useState<SpotifyTrack[]>(hasFreshCache ? homeCache!.forYouTracks : []);
  const [forYouLoading, setForYouLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showPersonalize, setShowPersonalize] = useState(false);

  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [playingKey, setPlayingKey] = useState<string | null>(null);
  const [modalTrack, setModalTrack] = useState<{ name: string; uri: string; image?: string | null; artist?: string | null } | null>(null);
  const [selectedArtist, setSelectedArtist] = useState<SpotifyArtist | null>(null);

  const suggestTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestBoxRef = useRef<HTMLDivElement>(null);
  const { setQueueAndPlay } = usePlayerStore();

  // Initial load
  useEffect(() => {
    if (hasFreshCache) return;
    Promise.all([
      fetch("/api/preferences").then((r) => r.json()).catch(() => ({ languages: [], favoriteArtists: [] })),
      fetch("/api/pinned").then((r) => r.json()).catch(() => []),
    ]).then(([prefsData, pinnedData]) => {
      const newLangs: string[] = prefsData.languages ?? [];
      const newArtists: FavoriteArtist[] = prefsData.favoriteArtists ?? [];
      const newPinned: PinnedPlaylist[] = Array.isArray(pinnedData) ? pinnedData : [];
      setLangs(newLangs);
      setFavoriteArtists(newArtists);
      setPrefsChecked(true);
      setPinned(newPinned);
      setPinnedLoading(false);
      homeCache = { langs: newLangs, favoriteArtists: newArtists, pinned: newPinned, feedSections: homeCache?.feedSections ?? [], forYouTracks: homeCache?.forYouTracks ?? [], ts: homeCache?.ts ?? 0 };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (prefsChecked && langs !== null && langs.length === 0) router.push("/onboarding");
  }, [prefsChecked, langs, router]);

  // Language feed
  const fetchFeed = useCallback((langList: string[], bust = false) => {
    if (!langList.length) return;
    setFeedLoading(true);
    if (bust) setFeedSections([]); // clear stale content immediately
    const url = `/api/spotify/language-feed?langs=${langList.join(",")}${bust ? `&r=${Date.now()}` : ""}`;
    fetch(url, bust ? { cache: "no-store" } : {})
      .then((r) => r.json())
      .then((data) => {
        const sections: FeedSection[] = data.sections ?? [];
        setFeedSections(sections);
        // Only mark cache as fresh when we actually got content — ts:0 means hasFreshCache will
        // be false on the next mount so an empty load doesn't block future retries.
        homeCache = {
          ...(homeCache ?? { langs: langList, favoriteArtists: [], pinned: [], forYouTracks: [], ts: 0 }),
          feedSections: sections,
          ts: sections.length > 0 ? Date.now() : 0,
        };
      })
      .catch(() => {})
      .finally(() => setFeedLoading(false));
  }, []);

  useEffect(() => {
    if (langs && langs.length > 0 && !hasFreshCache) fetchFeed(langs);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [langs, fetchFeed]);

  // For You — recommendations based on favorite artists
  const fetchForYou = useCallback((artists: FavoriteArtist[], bust = false) => {
    if (!artists.length) return;
    setForYouLoading(true);
    if (bust) setForYouTracks([]);
    const ids = artists.map((a) => a.id).join(",");
    fetch(`/api/spotify/for-you?artists=${ids}`, bust ? { cache: "no-store" } : {})
      .then((r) => r.json())
      .then((data) => {
        const tracks: SpotifyTrack[] = data.tracks ?? [];
        setForYouTracks(tracks);
        if (homeCache) homeCache.forYouTracks = tracks;
      })
      .catch(() => {})
      .finally(() => setForYouLoading(false));
  }, []);

  useEffect(() => {
    if (favoriteArtists.length > 0 && !hasFreshCache) fetchForYou(favoriteArtists);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [favoriteArtists, fetchForYou]);

  // Refresh everything
  const handleRefresh = () => {
    if (refreshing || feedLoading) return;
    setRefreshing(true);
    homeCache = null;
    const currentLangs = langs ?? [];
    Promise.all([
      currentLangs.length ? new Promise<void>((res) => {
        setFeedLoading(true);
        fetch(`/api/spotify/language-feed?langs=${currentLangs.join(",")}&r=${Date.now()}`, { cache: "no-store" })
          .then((r) => r.json())
          .then((data) => { setFeedSections(data.sections ?? []); })
          .catch(() => {})
          .finally(() => { setFeedLoading(false); res(); });
      }) : Promise.resolve(),
      favoriteArtists.length ? new Promise<void>((res) => {
        setForYouLoading(true);
        fetch(`/api/spotify/for-you?artists=${favoriteArtists.map((a) => a.id).join(",")}&r=${Date.now()}`, { cache: "no-store" })
          .then((r) => r.json())
          .then((data) => { setForYouTracks(data.tracks ?? []); })
          .catch(() => {})
          .finally(() => { setForYouLoading(false); res(); });
      }) : Promise.resolve(),
    ]).finally(() => {
      homeCache = { langs: langs ?? [], favoriteArtists, pinned, feedSections, forYouTracks, ts: Date.now() };
      setRefreshing(false);
    });
  };

  // Save from personalize sheet
  const handlePersonalizeSave = (newLangs: string[], newArtists: FavoriteArtist[]) => {
    setLangs(newLangs);
    setFavoriteArtists(newArtists);
    homeCache = null;
    fetchFeed(newLangs, true);
    if (newArtists.length) fetchForYou(newArtists, true);
    else setForYouTracks([]);
  };

  // Suggestions
  useEffect(() => {
    clearTimeout(suggestTimer.current);
    if (query.trim().length < 2) { setSuggestions([]); setShowSuggestions(false); return; }
    const key = query.trim().toLowerCase();
    const cached = suggestCache.get(key);
    if (cached) { setSuggestions(cached); setShowSuggestions(true); return; }
    setSuggestionsLoading(true);
    setShowSuggestions(true); // show dropdown with spinner immediately
    const token = session?.accessToken as string | undefined;
    suggestTimer.current = setTimeout(async () => {
      if (!token) { setSuggestionsLoading(false); return; }
      try {
        const spotifySearch = async (type: string, limit: number) => {
          const res = await fetch(
            `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=${type}&limit=${limit}`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          return res.ok ? res.json() : { tracks: { items: [] }, artists: { items: [] } };
        };
        const [tracksRes, artistsRes] = await Promise.allSettled([
          spotifySearch("track", 5),
          spotifySearch("artist", 3),
        ]);
        const trackSugs: Suggestion[] = tracksRes.status === "fulfilled"
          ? (tracksRes.value.tracks?.items ?? []).slice(0, 5).map((t: SpotifyTrack) => ({
              type: "track" as const, name: t.name, sub: artistNames(t), image: trackImage(t) ?? null, id: t.id, uri: t.uri, durationMs: t.duration_ms,
            }))
          : [];
        const artistSugs: Suggestion[] = artistsRes.status === "fulfilled"
          ? (artistsRes.value.artists?.items ?? []).slice(0, 3).map((a: SpotifyArtist) => ({
              type: "artist" as const, name: a.name, sub: a.followers?.total != null ? `${a.followers.total.toLocaleString()} followers` : "Artist",
              image: artistImage(a) ?? null, id: a.id,
            }))
          : [];
        const combined = [...trackSugs, ...artistSugs];
        // Only cache non-empty results — never persist failures
        if (combined.length > 0) suggestCache.set(key, combined);
        setSuggestions(combined);
        setShowSuggestions(combined.length > 0);
      } catch { setSuggestions([]); setShowSuggestions(false); } finally { setSuggestionsLoading(false); }
    }, 200);
    return () => clearTimeout(suggestTimer.current);
  }, [query, session?.accessToken]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!inputRef.current?.contains(e.target as Node) && !suggestBoxRef.current?.contains(e.target as Node))
        setShowSuggestions(false);
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
    if (s.type === "artist") { setQuery(s.name); setShowSuggestions(false); router.push(`/search?q=${encodeURIComponent(s.name)}`); return; }
    setPlayingKey(s.id);
    setShowSuggestions(false);
    setQueueAndPlay([toPlayableFromSuggestion(s)], 0);
    setPlayingKey(null);
  };

  const playSection = (section: FeedSection, index: number) => {
    setQueueAndPlay(section.tracks.map(toPlayableFromTrack), index);
  };

  const isRefreshBusy = refreshing || feedLoading;

  return (
    <div className="space-y-8">

      {/* Search bar */}
      <div className="relative">
        <Search size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none z-10" />
        <input
          ref={inputRef} type="text" value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); if (e.key === "Escape") setShowSuggestions(false); }}
          onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
          placeholder="Search tracks, artists, albums…"
          className="w-full border border-white/[0.08] text-white placeholder-white/25 rounded-2xl pl-11 pr-24 py-3.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#ef4444]/60 focus:border-[#ef4444]/40 transition-all"
          style={{ background: "var(--card)" }} autoComplete="off"
        />
        <button onClick={handleSearch} disabled={!query.trim()}
          className="btn-red absolute right-2.5 top-1/2 -translate-y-1/2 disabled:opacity-30 text-white font-semibold text-xs px-4 py-2 rounded-xl">
          Search
        </button>

        {showSuggestions && (suggestions.length > 0 || suggestionsLoading) && (
          <div ref={suggestBoxRef} className="absolute top-full left-0 right-0 mt-2 rounded-2xl border border-white/[0.08] shadow-2xl shadow-black/60 z-50 overflow-hidden"
            style={{ background: "var(--surface)" }}>
            {suggestionsLoading && suggestions.length === 0 ? (
              <div className="flex items-center justify-center py-6"><Loader2 size={16} className="animate-spin text-white/30" /></div>
            ) : (
              <>
                {suggestions.filter((s) => s.type === "track").length > 0 && (
                  <div>
                    <p className="text-white/25 text-[10px] font-semibold px-4 pt-3 pb-1 uppercase tracking-widest">Tracks</p>
                    {suggestions.filter((s) => s.type === "track").map((s) => (
                      <div key={s.id} className="flex items-center gap-2 px-3 py-2 hover:bg-white/[0.05] transition-colors group">
                        <button onClick={() => handleSuggestionClick(s)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                          <div className="relative w-9 h-9 shrink-0">
                            {s.image ? <Image src={s.image} alt={s.name} fill unoptimized sizes="36px" className="rounded-lg object-cover" /> : <div className="w-9 h-9 bg-white/[0.06] rounded-lg flex items-center justify-center"><Music size={13} className="text-white/25" /></div>}
                            <div className="absolute inset-0 rounded-lg bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                              {playingKey === s.id ? <Loader2 size={12} className="text-white animate-spin" /> : <Play size={12} className="text-white" fill="white" />}
                            </div>
                          </div>
                          <div className="min-w-0">
                            <p className="text-white text-sm font-medium truncate">{s.name}</p>
                            <p className="text-white/35 text-xs truncate">{s.sub}</p>
                          </div>
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); if (s.uri) setModalTrack({ name: s.name, uri: s.uri, image: s.image, artist: s.sub }); }}
                          className="shrink-0 p-1.5 rounded-lg text-[#ef4444]/60 hover:text-[#ef4444] hover:bg-[#ef4444]/10 transition-colors opacity-0 group-hover:opacity-100" title="Add to playlist">
                          <ListPlus size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {suggestions.filter((s) => s.type === "artist").length > 0 && (
                  <div className="border-t border-white/[0.06]">
                    <p className="text-white/25 text-[10px] font-semibold px-4 pt-3 pb-1 uppercase tracking-widest">Artists</p>
                    {suggestions.filter((s) => s.type === "artist").map((s) => (
                      <button key={s.id} onClick={() => handleSuggestionClick(s)} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.05] transition-colors text-left">
                        <div className="relative w-9 h-9 shrink-0">
                          {s.image ? <Image src={s.image} alt={s.name} fill unoptimized sizes="36px" className="rounded-full object-cover" /> : <div className="w-9 h-9 bg-white/[0.06] rounded-full flex items-center justify-center"><Mic2 size={13} className="text-white/25" /></div>}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-white text-sm font-medium truncate">{s.name}</p>
                          <p className="text-white/35 text-xs truncate">{s.sub}</p>
                        </div>
                        <Search size={12} className="text-white/20 shrink-0" />
                      </button>
                    ))}
                  </div>
                )}
                <div className="border-t border-white/[0.06] px-4 py-2.5">
                  <button onClick={handleSearch} className="text-xs text-white/25 hover:text-white/60 transition-colors">
                    See all results for &ldquo;{query}&rdquo; →
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Pinned */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-white font-bold text-base flex items-center gap-2">
            <Pin size={14} className="text-[#ef4444]" /> Pinned
          </h3>
          <Link href="/pinned" className="text-xs text-white/30 hover:text-white transition-colors">View all</Link>
        </div>
        {pinnedLoading ? <PinnedSkeleton /> : <PinnedPlaylistSection pinned={pinned} />}
      </section>

      {/* Language tags + action buttons */}
      {langs && langs.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap flex-1 min-w-0">
            {langs.map((id) => {
              const l = getLanguage(id);
              return l ? (
                <span key={id} className="text-xs border border-white/[0.08] text-white/50 px-2.5 py-1 rounded-full" style={{ background: "var(--card)" }}>
                  {l.emoji} {l.label}
                </span>
              ) : null;
            })}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Personalize */}
            <button onClick={() => setShowPersonalize(true)}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border border-white/[0.10] text-white/50 hover:text-white hover:border-[#ef4444]/40 transition-all"
              style={{ background: "var(--card)" }}>
              <SlidersHorizontal size={12} /> Edit
            </button>
            {/* Refresh */}
            <button onClick={handleRefresh} disabled={isRefreshBusy} title="Refresh feed"
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border border-white/[0.10] text-white/50 hover:text-white hover:border-[#ef4444]/40 transition-all disabled:opacity-40"
              style={{ background: "var(--card)" }}>
              <RefreshCw size={12} className={isRefreshBusy ? "animate-spin" : ""} />
              {isRefreshBusy ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </div>
      )}

      {/* ── For You section ── */}
      {(forYouTracks.length > 0 || forYouLoading) && (
        <section className="space-y-3">
          <h3 className="text-white font-bold text-base flex items-center gap-2">
            <Sparkles size={15} className="text-[#ef4444]" /> For You
          </h3>
          {forYouLoading ? (
            <div className="rounded-2xl border border-white/[0.06] overflow-hidden" style={{ background: "var(--card)" }}>
              {[0,1,2,3,4].map((j) => <TrackRowSkeleton key={j} />)}
            </div>
          ) : (
            <div className="rounded-2xl border border-white/[0.06] overflow-hidden" style={{ background: "var(--card)" }}>
              {forYouTracks.slice(0, 8).map((track, i) => (
                <div key={track.id}
                  className="flex items-center gap-3 px-3 py-2.5 hover:bg-white/[0.05] transition-colors group border-b border-white/[0.04] last:border-0 cursor-pointer"
                  onClick={() => setQueueAndPlay(forYouTracks.map(toPlayableFromTrack), i)}>
                  <span className="text-white/20 text-xs w-5 text-right shrink-0 tabular-nums">{i + 1}</span>
                  <div className="relative w-10 h-10 shrink-0">
                    {trackImage(track)
                      ? <Image src={trackImage(track)!} alt={track.name} fill unoptimized sizes="40px" className="rounded-xl object-cover" />
                      : <div className="w-10 h-10 bg-white/[0.06] rounded-xl flex items-center justify-center"><Music size={14} className="text-white/20" /></div>}
                    <div className="absolute inset-0 rounded-xl bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <Play size={13} fill="white" className="text-white" />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">{track.name}</p>
                    <p className="text-white/35 text-xs truncate">{artistNames(track)}</p>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); track.uri && setModalTrack({ name: track.name, uri: track.uri, image: trackImage(track), artist: artistNames(track) }); }}
                    className="p-1.5 rounded-lg text-[#ef4444]/60 hover:text-[#ef4444] hover:bg-[#ef4444]/10 transition-colors opacity-0 group-hover:opacity-100 shrink-0">
                    <ListPlus size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ── Language feed ── */}
      {feedLoading ? <FeedSkeleton /> : (
        feedSections.map((section) => (
          <section key={section.langId} className="space-y-4">
            <h3 className="text-white font-bold text-base">{section.emoji} {section.label} Picks</h3>

            {section.tracks.length > 0 && (
              <div className="rounded-2xl border border-white/[0.06] overflow-hidden" style={{ background: "var(--card)" }}>
                {section.tracks.slice(0, 6).map((track, i) => (
                  <div key={track.id}
                    className="flex items-center gap-3 px-3 py-2.5 hover:bg-white/[0.05] transition-colors group border-b border-white/[0.04] last:border-0 cursor-pointer"
                    onClick={() => playSection(section, i)}>
                    <span className="text-white/20 text-xs w-5 text-right shrink-0 tabular-nums">{i + 1}</span>
                    <div className="relative w-10 h-10 shrink-0">
                      {trackImage(track)
                        ? <Image src={trackImage(track)!} alt={track.name} fill unoptimized sizes="40px" className="rounded-xl object-cover" />
                        : <div className="w-10 h-10 bg-white/[0.06] rounded-xl flex items-center justify-center"><Music size={14} className="text-white/20" /></div>}
                      <div className="absolute inset-0 rounded-xl bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <Play size={13} fill="white" className="text-white" />
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-medium truncate">{track.name}</p>
                      <p className="text-white/35 text-xs truncate">{artistNames(track)}</p>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); track.uri && setModalTrack({ name: track.name, uri: track.uri, image: trackImage(track), artist: artistNames(track) }); }}
                      className="p-1.5 rounded-lg text-[#ef4444]/60 hover:text-[#ef4444] hover:bg-[#ef4444]/10 transition-colors opacity-0 group-hover:opacity-100 shrink-0">
                      <ListPlus size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {section.artists.length > 0 && (
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                {section.artists.slice(0, 6).map((artist) => (
                  <button key={artist.id} onClick={() => setSelectedArtist(artist)}
                    className="flex flex-col items-center gap-2 group">
                    <div className="relative w-full aspect-square rounded-full overflow-hidden bg-white/[0.06] ring-2 ring-white/[0.05] group-hover:ring-[#ef4444]/30 transition-all">
                      {artistImage(artist)
                        ? <Image src={artistImage(artist)!} alt={artist.name} fill unoptimized sizes="80px" className="object-cover group-hover:scale-105 transition-transform duration-300" />
                        : <div className="w-full h-full flex items-center justify-center"><Mic2 size={20} className="text-white/20" /></div>}
                    </div>
                    <p className="text-xs text-white/40 group-hover:text-white transition-colors text-center truncate w-full">{artist.name}</p>
                  </button>
                ))}
              </div>
            )}
          </section>
        ))
      )}

      {/* No favourite artists CTA */}
      {!forYouLoading && forYouTracks.length === 0 && favoriteArtists.length === 0 && feedSections.length > 0 && (
        <div className="rounded-2xl border border-white/[0.07] p-4 flex items-center gap-3"
          style={{ background: "var(--card)" }}>
          <Sparkles size={22} className="text-[#ef4444]/60 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-semibold">Personalise your feed</p>
            <p className="text-white/35 text-xs mt-0.5">Add favourite artists for a &ldquo;For You&rdquo; section</p>
          </div>
          <button onClick={() => setShowPersonalize(true)}
            className="btn-red shrink-0 px-3 py-1.5 rounded-xl text-white text-xs font-semibold">
            Add
          </button>
        </div>
      )}

      {modalTrack && <AddToPlaylistModal track={modalTrack} onClose={() => setModalTrack(null)} />}
      {selectedArtist && <ArtistSheet artist={selectedArtist} onClose={() => setSelectedArtist(null)} />}

      {showPersonalize && (
        <PersonalizeSheet
          initialLangs={langs ?? []}
          initialArtists={favoriteArtists}
          onSave={handlePersonalizeSave}
          onClose={() => setShowPersonalize(false)}
        />
      )}
    </div>
  );
}
