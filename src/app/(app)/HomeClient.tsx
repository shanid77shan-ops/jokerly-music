"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { PinnedAlbum, PinnedPlaylist } from "@/types";
import Link from "next/link";
import { Pin, Search, Loader2, Music, Mic2, Play, ListPlus, RefreshCw, Sparkles, SlidersHorizontal, UserCircle2, X } from "lucide-react";
import PinnedPlaylistSection from "@/components/home/PinnedPlaylistSection";
import PersonalizeSheet, { FavoriteArtist } from "@/components/home/PersonalizeSheet";
import ArtistSheet from "@/components/music/ArtistSheet";
import AlbumSheet from "@/components/music/AlbumSheet";
import { SpotifyTrack, SpotifyArtist, SpotifyAlbum, trackImage, artistImage, artistNames } from "@/types/spotify";
import { usePlayerStore, PlayableTrack } from "@/store/player";
import Image from "next/image";
import AddToPlaylistModal from "@/components/playlist/AddToPlaylistModal";
import { LANGUAGES } from "@/lib/languages";
import ListeningWaveform from "@/components/ui/ListeningWaveform";

interface Suggestion {
  type: "track" | "artist" | "album";
  name: string;
  sub: string;
  image: string | null;
  id: string;
  uri?: string;
  durationMs?: number;
  album?: SpotifyAlbum;
}

type SuggestionFilter = "all" | "track" | "artist" | "album";

interface PinnedArtist {
  id: string;
  artist_id: string;
  artist_name: string;
  artist_image: string;
}

interface RecentTrack {
  id: number;
  track_uri: string;
  track_name: string;
  track_artist: string;
  track_image: string | null;
  played_at: string;
}

interface IdentifiedMatch {
  title: string;
  artist: string;
  uri: string | null;
  imageUrl: string | null;
  durationMs: number | null;
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
  const sessionError = (session as { error?: string } | null)?.error;
  const isSessionHealthy = !!session?.accessToken && !sessionError;
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
  const [pinnedLoading, setPinnedLoading] = useState(true);
  const [forYouTracks, setForYouTracks] = useState<SpotifyTrack[]>(hasFreshCache ? homeCache!.forYouTracks : []);
  const [forYouLoading, setForYouLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showPersonalize, setShowPersonalize] = useState(false);

  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestionFilter, setSuggestionFilter] = useState<SuggestionFilter>("all");
  const [playingKey, setPlayingKey] = useState<string | null>(null);
  const [modalTrack, setModalTrack] = useState<{ name: string; uri: string; image?: string | null; artist?: string | null } | null>(null);
  const [selectedArtist, setSelectedArtist] = useState<SpotifyArtist | null>(null);
  const [selectedAlbum, setSelectedAlbum] = useState<{ id: string; name: string; images: { url: string }[]; release_date: string; artists: { id: string; name: string; external_urls: { spotify: string } }[]; external_urls: { spotify: string }; total_tracks: number; album_type: string; uri: string } | null>(null);
  const [pinnedArtists, setPinnedArtists] = useState<PinnedArtist[]>([]);
  const [pinnedAlbums, setPinnedAlbums] = useState<PinnedAlbum[]>([]);
  const [recentlyPlayed, setRecentlyPlayed] = useState<RecentTrack[]>([]);

  const [listening, setListening] = useState(false);
  const [identifying, setIdentifying] = useState(false);
  const [identifyError, setIdentifyError] = useState<string | null>(null);
  const [identifiedMatch, setIdentifiedMatch] = useState<IdentifiedMatch | null>(null);

  const suggestTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestBoxRef = useRef<HTMLDivElement>(null);
  const { setQueueAndPlay } = usePlayerStore();

  const fetchPinnedPlaylists = useCallback(async () => {
    setPinnedLoading(true);
    try {
      const res = await fetch("/api/pinned", { cache: "no-store" });
      if (!res.ok) {
        setPinned([]);
        return;
      }
      const data = await res.json();
      const safeData = Array.isArray(data) ? data : [];
      setPinned(safeData);
      if (homeCache) homeCache.pinned = safeData;
    } catch {
      setPinned([]);
    } finally {
      setPinnedLoading(false);
    }
  }, []);

  const fetchPinnedAlbums = useCallback(async () => {
    try {
      const res = await fetch("/api/pinned-albums", { cache: "no-store" });
      if (!res.ok) {
        setPinnedAlbums([]);
        return;
      }
      const data = await res.json();
      setPinnedAlbums(Array.isArray(data) ? data : []);
    } catch {
      setPinnedAlbums([]);
    }
  }, []);

  // Always fetch pinned playlists, pinned artists + recently played on mount
  useEffect(() => {
    if (!isSessionHealthy) {
      setPinnedLoading(false);
      setPinned([]);
      setPinnedArtists([]);
      setPinnedAlbums([]);
      return;
    }
    fetchPinnedPlaylists();
    fetchPinnedAlbums();

    fetch("/api/pinned-artists")
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setPinnedArtists(data); })
      .catch(() => {});

    fetch("/api/recently-played")
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d.data)) setRecentlyPlayed(d.data); })
      .catch(() => {});
  }, [fetchPinnedAlbums, fetchPinnedPlaylists, isSessionHealthy]);

  // Initial load (prefs only — pinned is always fetched above)
  useEffect(() => {
    if (hasFreshCache) return;
    fetch("/api/preferences").then((r) => r.json()).catch(() => ({ languages: [], favoriteArtists: [] }))
      .then((prefsData) => {
        const newLangs: string[] = prefsData.languages ?? [];
        const newArtists: FavoriteArtist[] = prefsData.favoriteArtists ?? [];
        setLangs(newLangs);
        setFavoriteArtists(newArtists);
        setPrefsChecked(true);
        homeCache = { langs: newLangs, favoriteArtists: newArtists, pinned: homeCache?.pinned ?? [], feedSections: homeCache?.feedSections ?? [], forYouTracks: homeCache?.forYouTracks ?? [], ts: homeCache?.ts ?? 0 };
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (prefsChecked && langs !== null && langs.length === 0) router.push("/onboarding");
  }, [prefsChecked, langs, router]);

  // Language feed
  const fetchFeed = useCallback((langList: string[], bust = false) => {
    if (!isSessionHealthy) return;
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
  }, [isSessionHealthy]);

  useEffect(() => {
    if (langs && langs.length > 0 && !hasFreshCache) fetchFeed(langs);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [langs, fetchFeed]);

  // For You — recommendations based on favorite artists
  const fetchForYou = useCallback((artists: FavoriteArtist[], bust = false) => {
    if (!isSessionHealthy) return;
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
  }, [isSessionHealthy]);

  useEffect(() => {
    if (favoriteArtists.length > 0 && !hasFreshCache) fetchForYou(favoriteArtists);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [favoriteArtists, fetchForYou]);

  // Sync pinned artists when ArtistSheet fires the event
  useEffect(() => {
    if (!isSessionHealthy) return;
    const handler = () => {
      fetch("/api/pinned-artists")
        .then((r) => r.json())
        .then((data) => { if (Array.isArray(data)) setPinnedArtists(data); })
        .catch(() => {});
    };
    window.addEventListener("pinned-artists-updated", handler);
    return () => window.removeEventListener("pinned-artists-updated", handler);
  }, [isSessionHealthy]);

  // Sync pinned playlists when playlist page toggles pin state
  useEffect(() => {
    if (!isSessionHealthy) return;
    const handler = () => {
      fetchPinnedPlaylists();
    };
    window.addEventListener("pinned-playlists-updated", handler);
    return () => window.removeEventListener("pinned-playlists-updated", handler);
  }, [fetchPinnedPlaylists, isSessionHealthy]);

  useEffect(() => {
    if (!isSessionHealthy) return;
    const handler = () => {
      fetchPinnedAlbums();
    };
    window.addEventListener("pinned-albums-updated", handler);
    return () => window.removeEventListener("pinned-albums-updated", handler);
  }, [fetchPinnedAlbums, isSessionHealthy]);

  // Hard refresh — clears all caches then reloads the page
  const handleRefresh = async () => {
    if (!isSessionHealthy) return;
    if (refreshing || feedLoading) return;
    setRefreshing(true);

    // 1. Clear module-level caches
    homeCache = null;
    suggestCache.clear();

    // 2. Clear all service worker caches
    if (typeof caches !== "undefined") {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      } catch { /* ignore */ }
    }

    // 3. Hard reload — bypasses browser disk cache
    window.location.reload();
  };

  const toggleArtistPin = async (artist: SpotifyArtist) => {
    const alreadyPinned = pinnedArtists.some((pa) => pa.artist_id === artist.id);
    const img = artistImage(artist) ?? "";
    if (alreadyPinned) {
      const res = await fetch("/api/pinned-artists", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artist_id: artist.id }),
      });
      if (res.ok) setPinnedArtists((prev) => prev.filter((pa) => pa.artist_id !== artist.id));
    } else {
      const res = await fetch("/api/pinned-artists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artist_id: artist.id, artist_name: artist.name, artist_image: img }),
      });
      if (res.ok) {
        const data = await res.json();
        setPinnedArtists((prev) => [data, ...prev]);
      } else {
        console.error("Pin failed:", await res.text());
      }
    }
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
    if (query.trim().length < 2) { setSuggestions([]); setShowSuggestions(false); setSuggestionFilter("all"); return; }
    const key = query.trim().toLowerCase();
    const cached = suggestCache.get(key);
    if (cached) { setSuggestions(cached); setShowSuggestions(true); setSuggestionFilter("all"); return; }
    setSuggestionsLoading(true);
    setShowSuggestions(true); // show dropdown with spinner immediately
    setSuggestionFilter("all");
    const token = session?.accessToken as string | undefined;
    suggestTimer.current = setTimeout(async () => {
      if (!token) { setSuggestionsLoading(false); return; }
      try {
        const spotifySearch = async (type: string, limit: number) => {
          const res = await fetch(
            `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=${type}&limit=${limit}`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          return res.ok ? res.json() : { tracks: { items: [] }, artists: { items: [] }, albums: { items: [] } };
        };
        const [tracksRes, artistsRes, albumsRes] = await Promise.allSettled([
          spotifySearch("track", 5),
          spotifySearch("artist", 3),
          spotifySearch("album", 4),
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
        const albumSugs: Suggestion[] = albumsRes.status === "fulfilled"
          ? (albumsRes.value.albums?.items ?? []).slice(0, 4).map((a: SpotifyAlbum) => ({
              type: "album" as const,
              name: a.name,
              sub: Array.isArray(a.artists) ? a.artists.map((ar) => ar.name).join(", ") : "Album",
              image: Array.isArray(a.images) ? (a.images[0]?.url ?? null) : null,
              id: a.id,
              album: a,
            }))
          : [];
        const combined = [...trackSugs, ...artistSugs, ...albumSugs];
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

  useEffect(() => {
    return () => {
      if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
      if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
    };
  }, []);

  const handleIdentifySong = async () => {
    if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setIdentifyError("Microphone is not supported in this browser");
      return;
    }
    if (listening || identifying) return;
    setIdentifyError(null);
    setIdentifiedMatch(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const chunks: Blob[] = [];
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => { if (event.data.size > 0) chunks.push(event.data); };
      recorder.onerror = () => { setListening(false); setIdentifying(false); setIdentifyError("Microphone recording failed"); };
      recorder.onstop = async () => {
        try {
          setListening(false);
          const audioBlob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
          if (!audioBlob.size) { setIdentifyError("No audio captured"); return; }
          setIdentifying(true);
          const form = new FormData();
          form.append("audio", audioBlob, "clip.webm");
          const res = await fetch("/api/spotify/identify", { method: "POST", body: form });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) { setIdentifyError(data.error ?? "Could not identify song"); return; }
          const match = data.match as IdentifiedMatch | undefined;
          if (!match) { setIdentifyError("No match found"); return; }
          setIdentifiedMatch(match);
          setQuery(`${match.title} ${match.artist}`.trim());
        } finally {
          setIdentifying(false);
          if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
          recorderRef.current = null;
        }
      };
      recorder.start();
      setListening(true);
      window.setTimeout(() => { if (recorder.state !== "inactive") recorder.stop(); }, 9000);
    } catch {
      setIdentifyError("Microphone permission denied");
      setListening(false);
      if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
    }
  };

  const handleSearch = () => {
    if (!query.trim()) return;
    setShowSuggestions(false);
    router.push(`/search?q=${encodeURIComponent(query.trim())}`);
  };

  const handleSuggestionClick = (s: Suggestion) => {
    if (s.type === "artist") { setQuery(s.name); setShowSuggestions(false); router.push(`/search?q=${encodeURIComponent(s.name)}`); return; }
    if (s.type === "album" && s.album) {
      setShowSuggestions(false);
      setSelectedAlbum(s.album);
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

  const isRefreshBusy = refreshing || feedLoading;
  const visibleSuggestions = suggestions.filter((s) => suggestionFilter === "all" || s.type === suggestionFilter);

  return (
    <div className="space-y-8">

      {/* Search bar */}
      <div className="relative">
        <button
          type="button"
          onClick={handleIdentifySong}
          disabled={listening || identifying}
          title="Identify song"
          className="absolute left-2.5 top-1/2 -translate-y-1/2 z-10 h-8 w-8 rounded-lg flex items-center justify-center text-white/45 hover:text-white hover:bg-white/[0.06] transition-colors disabled:opacity-50"
        >
          {listening ? <ListeningWaveform /> : identifying ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
        </button>
        <input
          ref={inputRef} type="text" value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); if (e.key === "Escape") setShowSuggestions(false); }}
          onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
          placeholder="Search tracks, artists, albums…"
          className="w-full border border-white/[0.08] text-white placeholder-white/25 rounded-2xl pl-11 pr-24 py-3.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#E8282B]/60 focus:border-[#E8282B]/40 transition-all"
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
                <div className="px-3 pt-3 pb-2 border-b border-white/[0.06]">
                  <div className="flex gap-2 overflow-x-auto scrollbar-hide">
                    {([
                      { value: "all", label: "All" },
                      { value: "track", label: "Songs" },
                      { value: "artist", label: "Artists" },
                      { value: "album", label: "Albums" },
                    ] as const).map((item) => (
                      <button
                        key={item.value}
                        onClick={() => setSuggestionFilter(item.value)}
                        className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                          suggestionFilter === item.value
                            ? "bg-white text-black"
                            : "bg-white/[0.06] text-white/65 hover:text-white hover:bg-white/[0.10]"
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>

                {visibleSuggestions.filter((s) => s.type === "track").length > 0 && (
                  <div>
                    <p className="text-white/25 text-[10px] font-semibold px-4 pt-3 pb-1 uppercase tracking-widest">Tracks</p>
                    {visibleSuggestions.filter((s) => s.type === "track").map((s) => (
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
                          className="shrink-0 p-1.5 rounded-lg text-[#E8282B]/60 hover:text-[#E8282B] hover:bg-[#E8282B]/10 transition-colors opacity-0 group-hover:opacity-100" title="Add to playlist">
                          <ListPlus size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {visibleSuggestions.filter((s) => s.type === "artist").length > 0 && (
                  <div className="border-t border-white/[0.06]">
                    <p className="text-white/25 text-[10px] font-semibold px-4 pt-3 pb-1 uppercase tracking-widest">Artists</p>
                    {visibleSuggestions.filter((s) => s.type === "artist").map((s) => (
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
                {visibleSuggestions.filter((s) => s.type === "album").length > 0 && (
                  <div className="border-t border-white/[0.06]">
                    <p className="text-white/25 text-[10px] font-semibold px-4 pt-3 pb-1 uppercase tracking-widest">Albums</p>
                    {visibleSuggestions.filter((s) => s.type === "album").map((s) => (
                      <button key={s.id} onClick={() => handleSuggestionClick(s)} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.05] transition-colors text-left">
                        <div className="relative w-9 h-9 shrink-0">
                          {s.image ? <Image src={s.image} alt={s.name} fill unoptimized sizes="36px" className="rounded-lg object-cover" /> : <div className="w-9 h-9 bg-white/[0.06] rounded-lg flex items-center justify-center"><Music size={13} className="text-white/25" /></div>}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-white text-sm font-medium truncate">{s.name}</p>
                          <p className="text-white/35 text-xs truncate">{s.sub || "Album"}</p>
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

      {(identifyError || listening || identifying || identifiedMatch) && (
        <div className="rounded-2xl border border-white/[0.08] px-4 py-3" style={{ background: "var(--card)" }}>
          {listening && (
            <p className="text-sm text-zinc-200 flex items-center gap-2">
              <ListeningWaveform className="text-[#E8282B]" />
              Listening... hold your phone near the music source.
            </p>
          )}
          {identifying && <p className="text-sm text-zinc-200">Identifying song...</p>}
          {identifyError && <p className="text-sm text-red-400">{identifyError}</p>}
          {identifiedMatch && !identifyError && !listening && !identifying && (
            <p className="text-sm text-zinc-200">
              Found: <span className="font-semibold text-white">{identifiedMatch.title}</span> by {identifiedMatch.artist}
            </p>
          )}
        </div>
      )}

      {/* Recently Played */}
      {recentlyPlayed.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-white font-bold text-base">Recently Played</h3>
          <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide">
            {recentlyPlayed.map((t) => (
              <button
                key={t.id}
                onClick={() => setQueueAndPlay([{ name: t.track_name, artist: t.track_artist, image: t.track_image ?? undefined, uri: t.track_uri }], 0)}
                className="flex flex-col items-center gap-2 shrink-0 group"
                style={{ width: 72 }}
              >
                <div className="relative w-16 h-16 rounded-2xl overflow-hidden ring-2 ring-white/[0.05] group-hover:ring-[#E8282B]/40 transition-all">
                  {t.track_image
                    ? <Image src={t.track_image} alt={t.track_name} fill unoptimized sizes="64px" className="object-cover group-hover:scale-105 transition-transform duration-300" />
                    : <div className="w-full h-full flex items-center justify-center" style={{ background: "var(--card)" }}><Music size={18} className="text-white/20" /></div>
                  }
                </div>
                <p className="text-[10px] text-white/45 group-hover:text-white transition-colors text-center truncate w-full leading-tight">{t.track_name}</p>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Pinned Playlists */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-white font-bold text-base flex items-center gap-2">
            <Pin size={14} className="text-[#E8282B]" /> Pinned
          </h3>
          <Link href="/pinned" className="text-xs text-white/30 hover:text-white transition-colors">View all</Link>
        </div>
        {pinnedLoading ? <PinnedSkeleton /> : <PinnedPlaylistSection pinned={pinned} />}
      </section>

      {/* Pinned Artists */}
      {pinnedArtists.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-white font-bold text-base flex items-center gap-2">
            <UserCircle2 size={14} className="text-[#E8282B]" /> Pinned Artists
          </h3>
          <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide">
            {pinnedArtists.map((pa) => (
              <button
                key={pa.id}
                onClick={() => setSelectedArtist({ id: pa.artist_id, name: pa.artist_name, images: pa.artist_image ? [{ url: pa.artist_image }] : [], followers: { total: 0 }, genres: [], external_urls: { spotify: "" }, popularity: 0, type: "artist", uri: "" } as SpotifyArtist)}
                className="flex flex-col items-center gap-1.5 shrink-0 group"
                style={{ width: 72 }}
              >
                <div className="relative w-16 h-16 rounded-full overflow-hidden bg-white/[0.06] ring-2 ring-white/[0.05] group-hover:ring-[#E8282B]/40 transition-all">
                  {pa.artist_image ? (
                    <Image src={pa.artist_image} alt={pa.artist_name} fill unoptimized sizes="64px" className="object-cover group-hover:scale-105 transition-transform duration-300" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Mic2 size={18} className="text-white/20" />
                    </div>
                  )}
                  <span className="absolute top-0 right-0 w-2.5 h-2.5 rounded-full bg-[#E8282B] border border-black/20 shadow" />
                </div>
                <p className="text-[10px] text-white/45 group-hover:text-white transition-colors text-center truncate w-full leading-tight">{pa.artist_name}</p>
              </button>
            ))}
          </div>
        </section>
      )}

      {pinnedAlbums.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-white font-bold text-base flex items-center gap-2">
            <Music size={14} className="text-[#E8282B]" /> Pinned Albums
          </h3>
          <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide">
            {pinnedAlbums.map((album) => (
              <button
                key={album.id}
                onClick={() => setSelectedAlbum({
                  id: album.album_id,
                  name: album.album_name,
                  images: album.album_image ? [{ url: album.album_image }] : [],
                  release_date: "",
                  artists: [{ id: album.album_id, name: album.artist_name, external_urls: { spotify: "" } }],
                  external_urls: { spotify: "" },
                  total_tracks: 0,
                  album_type: "album",
                  uri: "",
                })}
                className="flex flex-col items-center gap-1.5 shrink-0 group"
                style={{ width: 76 }}
              >
                <div className="relative w-16 h-16 rounded-2xl overflow-hidden bg-white/[0.06] ring-2 ring-white/[0.05] group-hover:ring-[#E8282B]/40 transition-all">
                  {album.album_image ? (
                    <Image src={album.album_image} alt={album.album_name} fill unoptimized sizes="64px" className="object-cover group-hover:scale-105 transition-transform duration-300" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Music size={18} className="text-white/20" />
                    </div>
                  )}
                  <span className="absolute top-0 right-0 w-2.5 h-2.5 rounded-full bg-[#E8282B] border border-black/20 shadow" />
                </div>
                <p className="text-[10px] text-white/45 group-hover:text-white transition-colors text-center truncate w-full leading-tight">{album.album_name}</p>
                <p className="text-[9px] text-white/25 text-center truncate w-full leading-tight">{album.artist_name}</p>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Action buttons */}
      {langs && langs.length > 0 && (
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 shrink-0 ml-auto">
            {/* Personalize */}
            <button onClick={() => setShowPersonalize(true)}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border border-white/[0.10] text-white/50 hover:text-white hover:border-[#E8282B]/40 transition-all"
              style={{ background: "var(--card)" }}>
              <SlidersHorizontal size={12} /> Edit
            </button>
            {/* Refresh */}
            <button onClick={handleRefresh} disabled={isRefreshBusy} title="Refresh feed"
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border border-white/[0.10] text-white/50 hover:text-white hover:border-[#E8282B]/40 transition-all disabled:opacity-40"
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
            <Sparkles size={15} className="text-[#E8282B]" /> For You
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
                    className="p-1.5 rounded-lg text-[#E8282B]/60 hover:text-[#E8282B] hover:bg-[#E8282B]/10 transition-colors opacity-0 group-hover:opacity-100 shrink-0">
                    <ListPlus size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Picks section hidden by request */}

      {/* No favourite artists CTA */}
      {!forYouLoading && forYouTracks.length === 0 && favoriteArtists.length === 0 && feedSections.length > 0 && (
        <div className="rounded-2xl border border-white/[0.07] p-4 flex items-center gap-3"
          style={{ background: "var(--card)" }}>
          <Sparkles size={22} className="text-[#E8282B]/60 shrink-0" />
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
      {selectedAlbum && <AlbumSheet album={selectedAlbum} onClose={() => setSelectedAlbum(null)} />}

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
