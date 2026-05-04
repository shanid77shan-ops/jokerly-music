"use client";

import { useEffect, useState } from "react";
import { SpotifyArtist, SpotifyTrack, artistImage, trackImage, artistNames } from "@/types/spotify";
import { X, Loader2, ExternalLink, Music, Play, Pause, ListPlus, Pin, Heart } from "lucide-react";
import Image from "next/image";
import { usePlayerStore, PlayableTrack } from "@/store/player";
import { useLikesStore } from "@/store/likes";
import AddToPlaylistModal from "@/components/playlist/AddToPlaylistModal";

interface Props {
  artist: SpotifyArtist;
  onClose: () => void;
}

function toPlayable(t: SpotifyTrack): PlayableTrack {
  return {
    name: t.name,
    artist: artistNames(t),
    image: t.album?.images?.[0]?.url,
    uri: t.uri,
    durationMs: t.duration_ms,
  };
}

export default function ArtistSheet({ artist, onClose }: Props) {
  const [info, setInfo] = useState<SpotifyArtist | null>(null);
  const [topTracks, setTopTracks] = useState<SpotifyTrack[]>([]);
  const [moreTracks, setMoreTracks] = useState<SpotifyTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [addModal, setAddModal] = useState<{ name: string; uri: string; image?: string | null; artist?: string | null } | null>(null);
  const [isPinned, setIsPinned] = useState(false);
  const [pinning, setPinning] = useState(false);
  const { setQueueAndPlay, currentTrack, isPlaying } = usePlayerStore();
  const { load: loadLikes, artistIds, toggleArtist } = useLikesStore();
  const isLiked = artistIds.has(artist.id);

  useEffect(() => {
    loadLikes();
  }, [loadLikes]);

  useEffect(() => {
    fetch("/api/pinned-artists")
      .then((r) => r.json())
      .then((data: { artist_id: string }[]) => {
        setIsPinned(Array.isArray(data) && data.some((a) => a.artist_id === artist.id));
      })
      .catch(() => {});
  }, [artist.id]);

  useEffect(() => {
    fetch(`/api/spotify/artist?id=${encodeURIComponent(artist.id)}&name=${encodeURIComponent(artist.name)}`)
      .then((r) => r.ok ? r.json() : Promise.reject(r.status))
      .then((d) => {
        setInfo(d.info ?? null);
        setTopTracks(d.topTracks ?? []);
        setMoreTracks(d.moreTracks ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [artist.id]);

  const allTracks = [...topTracks, ...moreTracks];
  const displayArtist = info ?? artist;
  const image = artistImage(displayArtist);

  const togglePin = async () => {
    setPinning(true);
    try {
      if (isPinned) {
        const res = await fetch("/api/pinned-artists", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ artist_id: displayArtist.id }),
        });
        if (res.ok) {
          setIsPinned(false);
          window.dispatchEvent(new CustomEvent("pinned-artists-updated"));
        }
      } else {
        const res = await fetch("/api/pinned-artists", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            artist_id: displayArtist.id,
            artist_name: displayArtist.name,
            artist_image: image ?? "",
          }),
        });
        if (res.ok) {
          setIsPinned(true);
          window.dispatchEvent(new CustomEvent("pinned-artists-updated"));
        }
      }
    } finally {
      setPinning(false);
    }
  };

  const handleLikeArtist = () => {
    toggleArtist({
      id: displayArtist.id,
      name: displayArtist.name,
      image: image ?? null,
    });
  };

  const handlePlay = (track: SpotifyTrack) => {
    const index = allTracks.findIndex((t) => t.id === track.id);
    if (index === -1) return;
    setQueueAndPlay(allTracks.map(toPlayable), index);
  };

  return (
    <>
      <div
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center"
        style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)" }}
      >
        <div
          className="w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl border border-white/[0.08] flex flex-col"
          style={{ background: "var(--surface)", maxHeight: "min(88vh, calc(100vh - 24px))" }}
        >
          {/* Hero */}
          <div className="relative shrink-0">
            {image ? (
              <div className="relative w-full h-44 sm:h-52 overflow-hidden">
                <Image src={image} alt={displayArtist.name} fill unoptimized className="object-cover object-top" sizes="512px" />
                <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.1) 0%, var(--surface) 100%)" }} />
              </div>
            ) : (
              <div className="w-full h-28 flex items-center justify-center" style={{ background: "var(--card)" }}>
                <Music size={40} className="text-white/10" />
              </div>
            )}

            {/* Close + external + like + pin */}
            <div className="absolute top-3 right-3 flex items-center gap-1">
              <a
                href={displayArtist.external_urls?.spotify}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="p-2 rounded-xl text-white/60 hover:text-white transition-colors"
                style={{ background: "rgba(0,0,0,0.45)" }}
              >
                <ExternalLink size={15} />
              </a>
              <button
                onClick={handleLikeArtist}
                title={isLiked ? "Unlike artist" : "Like artist"}
                className="p-2 rounded-xl transition-colors"
                style={{
                  background: isLiked ? "rgba(232,40,43,0.55)" : "rgba(0,0,0,0.45)",
                  color: isLiked ? "#fff" : "rgba(255,255,255,0.6)",
                }}
              >
                <Heart size={15} fill={isLiked ? "white" : "none"} />
              </button>
              <button
                onClick={togglePin}
                disabled={pinning}
                title={isPinned ? "Unpin artist" : "Pin to home"}
                className="p-2 rounded-xl transition-colors disabled:opacity-50"
                style={{
                  background: isPinned ? "rgba(232,40,43,0.55)" : "rgba(0,0,0,0.45)",
                  color: isPinned ? "#fff" : "rgba(255,255,255,0.6)",
                }}
              >
                {pinning ? <Loader2 size={15} className="animate-spin" /> : <Pin size={15} />}
              </button>
              <button
                onClick={onClose}
                className="p-2 rounded-xl text-white/60 hover:text-white transition-colors"
                style={{ background: "rgba(0,0,0,0.45)" }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Artist info overlay */}
            <div className="absolute bottom-0 left-0 right-0 px-5 pb-4">
              <h2 className="text-2xl font-bold text-white leading-tight drop-shadow">{displayArtist.name}</h2>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {displayArtist.followers?.total != null && (
                  <span className="text-xs text-white/50">
                    {displayArtist.followers.total.toLocaleString()} followers
                  </span>
                )}
                {displayArtist.genres?.slice(0, 3).map((g) => (
                  <span key={g} className="text-[10px] px-2 py-0.5 rounded-full capitalize text-white/50 border border-white/10"
                    style={{ background: "rgba(255,255,255,0.06)" }}>
                    {g}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Track list */}
          <div className="flex-1 overflow-y-auto min-h-0 px-2 py-3 space-y-0.5">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-14 gap-3">
                <Loader2 size={24} className="animate-spin text-[#E8282B]/60" />
                <p className="text-xs text-white/25">Loading tracks…</p>
              </div>
            ) : allTracks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-14 gap-2">
                <Music size={32} className="text-white/10" />
                <p className="text-sm text-white/30">No tracks found</p>
              </div>
            ) : (
              <>
                {topTracks.length > 0 && (
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-white/25 px-3 pb-1 pt-1">
                    Top Tracks
                  </p>
                )}
                {topTracks.map((track, i) => (
                  <TrackRow
                    key={track.id}
                    track={track}
                    rank={i + 1}
                    isCurrentlyPlaying={isPlaying && currentTrack?.uri === track.uri}
                    onPlay={() => handlePlay(track)}
                    onAddToPlaylist={() => setAddModal({
                      name: track.name,
                      uri: track.uri ?? "",
                      image: trackImage(track),
                      artist: artistNames(track),
                    })}
                  />
                ))}
                {moreTracks.length > 0 && (
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-white/25 px-3 pb-1 pt-3">
                    More Songs
                  </p>
                )}
                {moreTracks.map((track, i) => (
                  <TrackRow
                    key={track.id}
                    track={track}
                    rank={topTracks.length + i + 1}
                    isCurrentlyPlaying={isPlaying && currentTrack?.uri === track.uri}
                    onPlay={() => handlePlay(track)}
                    onAddToPlaylist={() => setAddModal({
                      name: track.name,
                      uri: track.uri ?? "",
                      image: trackImage(track),
                      artist: artistNames(track),
                    })}
                  />
                ))}
              </>
            )}
          </div>
        </div>
      </div>

      {addModal && <AddToPlaylistModal track={addModal} onClose={() => setAddModal(null)} />}
    </>
  );
}

function TrackRow({ track, rank, isCurrentlyPlaying, onPlay, onAddToPlaylist }: {
  track: SpotifyTrack;
  rank: number;
  isCurrentlyPlaying: boolean;
  onPlay: () => void;
  onAddToPlaylist: () => void;
}) {
  const image = trackImage(track);
  const artist = artistNames(track);
  const { songUris, toggleSong, load: loadLikes } = useLikesStore();
  const isLiked = songUris.has(track.uri ?? "");

  useEffect(() => { loadLikes(); }, [loadLikes]);

  const handleLike = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!track.uri) return;
    toggleSong({ uri: track.uri, name: track.name, image: trackImage(track), artist: artistNames(track) });
  };

  return (
    <div
      onClick={onPlay}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-2xl group cursor-pointer transition-all border ${
        isCurrentlyPlaying
          ? "bg-[#E8282B]/10 border-[#E8282B]/20"
          : "hover:bg-white/[0.05] border-transparent hover:border-white/[0.06]"
      }`}
    >
      <span className={`text-xs w-5 text-right shrink-0 tabular-nums font-medium ${isCurrentlyPlaying ? "text-[#E8282B]" : "text-white/25"}`}>
        {rank}
      </span>

      <div className="relative shrink-0 w-10 h-10">
        {image ? (
          <Image src={image} alt={track.name} fill unoptimized className="rounded-xl object-cover" sizes="40px" />
        ) : (
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "var(--card)" }}>
            <Music size={14} className="text-white/20" />
          </div>
        )}
        <div
          className={`absolute inset-0 rounded-xl flex items-center justify-center transition-opacity ${
            isCurrentlyPlaying ? "opacity-100 bg-black/40" : "opacity-0 group-hover:opacity-100 bg-black/50"
          }`}
          onClick={(e) => { e.stopPropagation(); onPlay(); }}
        >
          {isCurrentlyPlaying
            ? <Pause size={13} className="text-white" fill="white" />
            : <Play size={13} className="text-white" fill="white" />
          }
        </div>
      </div>

      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium truncate leading-tight ${isCurrentlyPlaying ? "text-[#E8282B]" : "text-white"}`}>
          {track.name}
        </p>
        <p className="text-xs text-white/40 truncate mt-0.5">{artist}</p>
      </div>

      <button
        onClick={handleLike}
        title={isLiked ? "Unlike" : "Like"}
        className={`shrink-0 p-1.5 rounded-lg transition-colors sm:opacity-0 sm:group-hover:opacity-100 ${
          isLiked ? "text-[#E8282B] opacity-100" : "text-white/30 hover:text-[#E8282B] hover:bg-[#E8282B]/10"
        }`}
      >
        <Heart size={13} fill={isLiked ? "currentColor" : "none"} />
      </button>

      <button
        onClick={(e) => { e.stopPropagation(); onAddToPlaylist(); }}
        className="shrink-0 p-1.5 rounded-lg text-[#E8282B]/50 hover:text-[#E8282B] hover:bg-[#E8282B]/10 transition-colors sm:opacity-0 sm:group-hover:opacity-100"
      >
        <ListPlus size={14} />
      </button>
    </div>
  );
}
