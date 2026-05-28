"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, ListPlus, Music, Play, RefreshCw } from "lucide-react";
import Image from "next/image";
import AddToPlaylistModal from "@/components/playlist/AddToPlaylistModal";
import { PlayableTrack, usePlayerStore } from "@/store/player";
import { SpotifyTrack, artistNames, trackImage } from "@/types/spotify";
import { spotifyTrackIdFromUri } from "@/lib/spotify-track-id";

const INITIAL_LIMIT = 15;
const MORE_LIMIT = 10;
const MAX_EXCLUDE_IDS = 80;

interface Props {
  track: PlayableTrack;
  variant?: "sheet" | "embedded";
}

function normalizeItem(item: SpotifyTrack): SpotifyTrack | null {
  const id = item?.id ?? spotifyTrackIdFromUri(item?.uri) ?? null;
  const uri = item?.uri ?? (id ? `spotify:track:${id}` : null);
  if (!id || !uri || !item?.name) return null;
  const artists =
    item.artists?.length > 0
      ? item.artists
      : [{ id: "unknown", name: "Unknown Artist", external_urls: { spotify: "" } }];
  const album = item.album ?? {
    id: "unknown",
    name: "",
    images: [],
    external_urls: { spotify: "" },
    release_date: "",
    album_type: "album",
  };
  return {
    ...item,
    id,
    uri,
    artists,
    album,
    duration_ms: item.duration_ms ?? 0,
    external_urls: item.external_urls ?? { spotify: `https://open.spotify.com/track/${id}` },
    preview_url: item.preview_url ?? null,
  };
}

function toPlayable(t: SpotifyTrack): PlayableTrack {
  return {
    name: t.name,
    artist: artistNames(t),
    image: trackImage(t),
    uri: t.uri,
    durationMs: t.duration_ms,
  };
}

export default function SimilarMusicSection({ track, variant = "sheet" }: Props) {
  const embedded = variant === "embedded";
  const [similarTracks, setSimilarTracks] = useState<SpotifyTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [empty, setEmpty] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [rateLimited, setRateLimited] = useState(false);
  const [modalTrack, setModalTrack] = useState<{
    uri: string;
    name: string;
    image?: string | null;
    artist?: string | null;
  } | null>(null);
  const refreshSeedRef = useRef(0);
  const shownIdsRef = useRef<Set<string>>(new Set());
  const trackKeyRef = useRef("");
  const fetchGenRef = useRef(0);
  const playingRef = useRef(false);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const hasMoreRef = useRef(true);
  const { setQueueAndPlay, currentTrack, isPlaying } = usePlayerStore();

  const fetchTracks = useCallback(
    async (mode: "initial" | "more" | "refresh") => {
      const generation = ++fetchGenRef.current;
      const limit = mode === "initial" || mode === "refresh" ? INITIAL_LIMIT : MORE_LIMIT;

      if (!track.name?.trim()) {
        setSimilarTracks([]);
        setEmpty(true);
        hasMoreRef.current = false;
        return;
      }
      const artistLabel = track.artist?.trim() || "Unknown Artist";

      if (mode === "refresh") {
        refreshSeedRef.current += 1;
        setRefreshing(true);
        setEmpty(false);
        setSessionExpired(false);
        setRateLimited(false);
      } else if (mode === "more") {
        if (!hasMoreRef.current || loadingMore || loading) return;
        setLoadingMore(true);
      } else {
        refreshSeedRef.current = 0;
        setLoading(true);
        setEmpty(false);
        setSessionExpired(false);
        setRateLimited(false);
      }

      try {
        const params = new URLSearchParams({
          limit: String(limit),
          refresh: String(refreshSeedRef.current),
        });
        const trackId = spotifyTrackIdFromUri(track.uri);
        if (trackId) params.set("trackId", trackId);
        if (track.uri) params.set("trackUri", track.uri);
        params.set("track", track.name);
        params.set("artist", artistLabel);

        const exclude = Array.from(shownIdsRef.current).slice(-MAX_EXCLUDE_IDS);
        if (exclude.length > 0) params.set("exclude", exclude.join(","));

        const res = await fetch(`/api/spotify/recommendations?${params}`, {
          cache: "no-store",
          credentials: "same-origin",
        });
        if (generation !== fetchGenRef.current) return;

        const data = (await res.json().catch(() => ({}))) as {
          tracks?: SpotifyTrack[];
          error?: string;
          rateLimited?: boolean;
        };

        if (res.status === 429 || data.rateLimited) {
          setRateLimited(true);
        }

        if (!res.ok) {
          const expired =
            res.status === 401 ||
            data.error === "Token expired, please re-login" ||
            data.error === "Unauthorized";
          if (expired) setSessionExpired(true);
          if (mode === "initial" || mode === "refresh") {
            setSimilarTracks([]);
            setEmpty(true);
          }
          hasMoreRef.current = false;
          return;
        }

        const currentUri = track.uri ?? "";
        const currentId = spotifyTrackIdFromUri(track.uri);
        const filterItems = (raw: SpotifyTrack[]) =>
          raw
            .map(normalizeItem)
            .filter((item): item is SpotifyTrack => {
              if (!item) return false;
              if (currentUri && item.uri === currentUri) return false;
              if (currentId && item.id === currentId) return false;
              if (shownIdsRef.current.has(item.id)) return false;
              return true;
            });

        const items = filterItems(data.tracks ?? []);

        for (const item of items) shownIdsRef.current.add(item.id);

        if (generation !== fetchGenRef.current) return;

        if (mode === "initial" || mode === "refresh") {
          if (items.length > 0) {
            setSimilarTracks(items);
            setEmpty(false);
          } else if (mode === "refresh") {
            setEmpty(similarTracks.length === 0);
          } else {
            setSimilarTracks([]);
            setEmpty(true);
          }
        } else {
          setSimilarTracks((prev) => {
            const seen = new Set(prev.map((t) => t.id));
            const added = items.filter((t) => !seen.has(t.id));
            return [...prev, ...added];
          });
          if (items.length === 0) hasMoreRef.current = false;
        }

        hasMoreRef.current = items.length >= (mode === "more" ? 1 : 3);
      } catch {
        if (generation !== fetchGenRef.current) return;
        if (mode === "initial" || mode === "refresh") {
          setSimilarTracks([]);
          setEmpty(true);
        }
        hasMoreRef.current = false;
      } finally {
        if (generation !== fetchGenRef.current) return;
        setLoading(false);
        setLoadingMore(false);
        setRefreshing(false);
      }
    },
    [track.artist, track.name, track.uri, loading, loadingMore, similarTracks.length]
  );

  useEffect(() => {
    return () => {
      fetchGenRef.current += 1;
    };
  }, []);

  useEffect(() => {
    const key = `${track.uri ?? ""}::${track.name}::${track.artist}`;
    const timer = window.setTimeout(() => {
      if (trackKeyRef.current === key) return;
      trackKeyRef.current = key;
      shownIdsRef.current = new Set();
      refreshSeedRef.current = 0;
      hasMoreRef.current = true;
      void fetchTracks("initial");
    }, 400);
    return () => window.clearTimeout(timer);
  }, [track.artist, track.name, track.uri, fetchTracks]);

  useEffect(() => {
    const node = loadMoreRef.current;
    if (!node || empty || loading) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void fetchTracks("more");
      },
      { rootMargin: "120px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [empty, loading, fetchTracks, similarTracks.length]);

  const handleRefresh = () => {
    if (refreshing || loading) return;
    void fetchTracks("refresh");
  };

  const handleAddToPlaylist = (item: SpotifyTrack) => {
    if (!item.uri) return;
    setModalTrack({
      uri: item.uri,
      name: item.name,
      image: trackImage(item) ?? null,
      artist: artistNames(item),
    });
  };

  const playSimilar = async (picked: SpotifyTrack) => {
    if (playingRef.current) return;
    const playables = similarTracks.map(toPlayable).filter((item) => item.uri);
    if (playables.length === 0) return;

    playingRef.current = true;
    try {
      const index = playables.findIndex(
        (item) => item.uri === picked.uri || item.name === picked.name
      );
      await setQueueAndPlay(playables, index >= 0 ? index : 0);
    } finally {
      window.setTimeout(() => {
        playingRef.current = false;
      }, 300);
    }
  };

  const isPlayingTrack = (item: SpotifyTrack) =>
    isPlaying &&
    currentTrack?.uri === item.uri &&
    currentTrack?.name === item.name;

  const busy = loading || refreshing;

  const trackRows = similarTracks.map((item, index) => {
    const image = trackImage(item);
    const active = isPlayingTrack(item);
    return (
      <div
        key={item.id}
        role="button"
        tabIndex={0}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("button")) return;
          void playSimilar(item);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            if ((e.target as HTMLElement).closest("button")) return;
            e.preventDefault();
            void playSimilar(item);
          }
        }}
        className={`w-full flex items-center gap-3 text-left transition-colors cursor-pointer ${
          embedded ? "px-1 py-2.5" : "px-4 py-3.5 border-b last:border-b-0"
        } ${
          active
            ? embedded
              ? "text-[#E8282B]"
              : "bg-[#E8282B]/12 border-[#E8282B]/15"
            : embedded
              ? "hover:bg-white/[0.04] rounded-xl"
              : "border-white/[0.05] hover:bg-white/[0.04]"
        }`}
      >
        <span
          className={`text-xs w-5 text-right shrink-0 tabular-nums font-medium ${
            active ? "text-[#E8282B]" : "text-white/25"
          }`}
        >
          {index + 1}
        </span>
        <div
          className={`relative rounded-xl overflow-hidden shrink-0 bg-white/[0.06] ${
            embedded ? "w-10 h-10" : "w-12 h-12"
          }`}
        >
          {image ? (
            <Image
              src={image}
              alt={item.name}
              fill
              unoptimized
              sizes={embedded ? "40px" : "48px"}
              className="object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Music size={16} className="text-white/20" />
            </div>
          )}
          <div
            className={`absolute inset-0 flex items-center justify-center bg-black/50 transition-opacity ${
              active ? "opacity-100" : "opacity-0"
            }`}
          >
            <Play size={12} fill="white" className="text-white ml-0.5" />
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <p
            className={`text-sm font-semibold truncate leading-tight ${
              active ? "text-[#E8282B]" : "text-white"
            }`}
          >
            {item.name}
          </p>
          <p className="text-xs text-white/40 truncate mt-0.5">{artistNames(item)}</p>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleAddToPlaylist(item);
          }}
          title="Add to playlist"
          aria-label={`Add ${item.name} to playlist`}
          className="shrink-0 p-2 rounded-xl text-[#E8282B]/60 hover:text-[#E8282B] hover:bg-[#E8282B]/10 transition-colors"
        >
          <ListPlus size={embedded ? 16 : 17} />
        </button>
      </div>
    );
  });

  const playlistModal = modalTrack ? (
    <AddToPlaylistModal track={modalTrack} onClose={() => setModalTrack(null)} />
  ) : null;

  if (embedded) {
    return (
      <>
        <section className="shrink-0 pt-2 border-t border-white/[0.06]">
          <div className="flex items-center justify-between gap-2 mb-2 px-1">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/30">
              Similar
            </p>
            <button
              type="button"
              onClick={handleRefresh}
              disabled={busy}
              aria-label="Refresh similar tracks"
              title="Refresh"
              className="p-2 rounded-xl text-white/40 hover:text-white hover:bg-white/[0.06] disabled:opacity-40 transition-colors"
            >
              {refreshing ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <RefreshCw size={16} />
              )}
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={20} className="animate-spin text-white/25" />
            </div>
          ) : empty ? (
            <div className="flex flex-col items-center justify-center py-8 gap-3 px-2">
              <p className="text-sm text-white/35 text-center">
                {sessionExpired
                  ? "Session expired. Sign in again to load similar tracks."
                  : rateLimited
                    ? "Spotify rate limit reached. Wait a moment, then try again."
                    : "No similar tracks found"}
              </p>
              {sessionExpired ? (
                <a
                  href="/login"
                  className="text-xs font-semibold px-3 py-2 rounded-xl bg-[#E8282B] text-white hover:opacity-90 transition-opacity"
                >
                  Sign in
                </a>
              ) : (
                <button
                  type="button"
                  onClick={() => void fetchTracks("initial")}
                  disabled={busy}
                  className="text-xs font-semibold px-3 py-2 rounded-xl bg-white/[0.08] text-white/70 hover:text-white transition-colors"
                >
                  Try again
                </button>
              )}
            </div>
          ) : (
            <>
              <div>{trackRows}</div>
              <div ref={loadMoreRef} className="h-6 flex items-center justify-center py-2">
                {loadingMore && <Loader2 size={16} className="animate-spin text-white/20" />}
              </div>
            </>
          )}
        </section>
        {playlistModal}
      </>
    );
  }

  return (
    <>
      <section className="flex flex-col min-h-0 flex-1">
        <div
          className="flex-1 min-h-[280px] rounded-2xl border overflow-hidden flex flex-col"
          style={{ background: "var(--card)", borderColor: "rgba(255,255,255,0.08)" }}
        >
          {loading ? (
            <div className="flex-1 flex items-center justify-center py-16">
              <Loader2 size={22} className="animate-spin text-white/25" />
            </div>
          ) : empty ? (
            <div className="flex-1 flex flex-col items-center justify-center py-16 px-4 gap-2">
              <Music size={28} className="text-white/15" />
              <p className="text-sm text-white/35 text-center">
                {sessionExpired
                  ? "Session expired. Sign in again."
                  : rateLimited
                    ? "Rate limit reached. Try again shortly."
                    : "No similar tracks found"}
              </p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              {trackRows}
              <div ref={loadMoreRef} className="h-8 flex items-center justify-center">
                {loadingMore && <Loader2 size={16} className="animate-spin text-white/20" />}
              </div>
            </div>
          )}

          <div className="shrink-0 p-3 border-t border-white/[0.06] flex justify-center">
            <button
              type="button"
              onClick={handleRefresh}
              disabled={busy}
              aria-label="Refresh similar tracks"
              title="Refresh"
              className="p-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.10] disabled:opacity-40 text-white/80 hover:text-white transition-colors"
            >
              {refreshing ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <RefreshCw size={18} />
              )}
            </button>
          </div>
        </div>
      </section>
      {playlistModal}
    </>
  );
}
