"use client";

import { useEffect, useState } from "react";
import { X, Loader2, ExternalLink, Music, Play, Pause, ListPlus, Heart } from "lucide-react";
import Image from "next/image";
import { usePlayerStore, PlayableTrack } from "@/store/player";
import { useLikesStore } from "@/store/likes";
import { SpotifyTrack, trackImage, artistNames } from "@/types/spotify";
import AddToPlaylistModal from "@/components/playlist/AddToPlaylistModal";

interface SpotifyAlbum {
  id: string;
  name: string;
  artists: { id: string; name: string }[];
  images: { url: string }[];
  release_date: string;
  total_tracks: number;
  album_type: string;
  external_urls: { spotify: string };
}

interface Props {
  album: SpotifyAlbum;
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

export default function AlbumSheet({ album, onClose }: Props) {
  const [tracks, setTracks] = useState<SpotifyTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [addModal, setAddModal] = useState<{ name: string; uri: string; image?: string | null; artist?: string | null } | null>(null);
  const { setQueueAndPlay, currentTrack, isPlaying } = usePlayerStore();

  const image = album.images?.[0]?.url;
  const artistStr = album.artists.map((a) => a.name).join(", ");
  const year = album.release_date?.slice(0, 4);

  useEffect(() => {
    fetch(`/api/spotify/album?id=${encodeURIComponent(album.id)}`)
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((d) => setTracks(d.tracks ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [album.id]);

  const handlePlay = (index: number) => {
    setQueueAndPlay(tracks.map(toPlayable), index);
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
          {/* Header */}
          <div className="flex items-center gap-4 p-5 shrink-0">
            <div className="relative w-20 h-20 rounded-2xl overflow-hidden shrink-0 shadow-lg" style={{ background: "var(--card)" }}>
              {image
                ? <Image src={image} alt={album.name} fill unoptimized className="object-cover" sizes="80px" />
                : <div className="w-full h-full flex items-center justify-center"><Music size={24} className="text-white/20" /></div>
              }
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-white/30 mb-1">
                {album.album_type === "single" ? "Single" : "Album"}
              </p>
              <h2 className="text-white font-bold text-lg leading-tight truncate">{album.name}</h2>
              <p className="text-sm text-white/50 truncate mt-0.5">{artistStr}{year ? ` · ${year}` : ""}</p>
              <p className="text-xs text-white/30 mt-0.5">{album.total_tracks} tracks</p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {album.external_urls?.spotify && (
                <a
                  href={album.external_urls.spotify}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="p-2 rounded-xl text-white/40 hover:text-white transition-colors"
                >
                  <ExternalLink size={15} />
                </a>
              )}
              <button onClick={onClose} className="p-2 rounded-xl text-white/40 hover:text-white transition-colors">
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Play all */}
          {tracks.length > 0 && (
            <div className="px-5 pb-3 shrink-0">
              <button
                onClick={() => handlePlay(0)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-bold transition-all active:scale-95"
                style={{ background: "#E8282B" }}
              >
                <Play size={14} fill="white" /> Play all
              </button>
            </div>
          )}

          {/* Track list */}
          <div className="flex-1 overflow-y-auto min-h-0 px-2 py-2 space-y-0.5">
            {loading ? (
              <div className="flex items-center justify-center py-14">
                <Loader2 size={22} className="animate-spin text-[#E8282B]/60" />
              </div>
            ) : tracks.length === 0 ? (
              <div className="flex items-center justify-center py-14">
                <p className="text-sm text-white/30">No tracks found</p>
              </div>
            ) : (
              tracks.map((track, i) => (
                <TrackRow
                  key={track.id ?? i}
                  track={track}
                  rank={i + 1}
                  isCurrentlyPlaying={isPlaying && currentTrack?.uri === track.uri}
                  onPlay={() => handlePlay(i)}
                  onAddToPlaylist={() => setAddModal({
                    name: track.name,
                    uri: track.uri ?? "",
                    image: trackImage(track),
                    artist: artistNames(track),
                  })}
                />
              ))
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
  const { songUris, toggleSong, load: loadLikes } = useLikesStore();
  const isLiked = songUris.has(track.uri ?? "");

  useEffect(() => { loadLikes(); }, [loadLikes]);

  const handleLike = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!track.uri) return;
    toggleSong({ uri: track.uri, name: track.name, image: trackImage(track), artist: artistNames(track) });
  };

  const image = trackImage(track);

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
        {image
          ? <Image src={image} alt={track.name} fill unoptimized className="rounded-xl object-cover" sizes="40px" />
          : <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "var(--card)" }}><Music size={14} className="text-white/20" /></div>
        }
        <div
          className={`absolute inset-0 rounded-xl flex items-center justify-center transition-opacity ${isCurrentlyPlaying ? "opacity-100 bg-black/40" : "opacity-0 group-hover:opacity-100 bg-black/50"}`}
          onClick={(e) => { e.stopPropagation(); onPlay(); }}
        >
          {isCurrentlyPlaying
            ? <Pause size={13} className="text-white" fill="white" />
            : <Play size={13} className="text-white" fill="white" />
          }
        </div>
      </div>

      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium truncate leading-tight ${isCurrentlyPlaying ? "text-[#E8282B]" : "text-white"}`}>{track.name}</p>
        <p className="text-xs text-white/40 truncate mt-0.5">{artistNames(track)}</p>
      </div>

      <button onClick={handleLike} title={isLiked ? "Unlike" : "Like"}
        className={`shrink-0 p-1.5 rounded-lg transition-colors ${isLiked ? "text-[#E8282B]" : "text-white/30 hover:text-[#E8282B] hover:bg-[#E8282B]/10"}`}>
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
