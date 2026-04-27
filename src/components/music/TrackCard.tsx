"use client";

import { SpotifyTrack } from "@/types";
import { usePlayerStore } from "@/store/player";
import { Play, Pause } from "lucide-react";
import Image from "next/image";

interface Props {
  track: SpotifyTrack;
  onAddToPlaylist?: (track: SpotifyTrack) => void;
}

function msToMin(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export default function TrackCard({ track, onAddToPlaylist }: Props) {
  const { currentTrack, isPlaying, setTrack, togglePlay } = usePlayerStore();
  const isActive = currentTrack?.id === track.id;

  const handlePlay = () => {
    if (isActive) togglePlay();
    else setTrack(track);
  };

  return (
    <div className="flex items-center gap-3 p-3 rounded-xl hover:bg-zinc-800/60 group transition-colors">
      <div className="relative shrink-0">
        <Image
          src={track.album.images[1]?.url ?? track.album.images[0]?.url}
          alt={track.album.name}
          width={48}
          height={48}
          className="rounded-lg object-cover"
        />
        <button
          onClick={handlePlay}
          className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
        >
          {isActive && isPlaying ? (
            <Pause size={20} className="text-white" />
          ) : (
            <Play size={20} className="text-white" />
          )}
        </button>
      </div>

      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium truncate ${isActive ? "text-green-400" : "text-white"}`}>
          {track.name}
        </p>
        <p className="text-xs text-zinc-400 truncate">
          {track.artists.map((a) => a.name).join(", ")} · {track.album.name}
        </p>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <span className="text-xs text-zinc-500">{msToMin(track.duration_ms)}</span>
        {onAddToPlaylist && (
          <button
            onClick={() => onAddToPlaylist(track)}
            className="text-xs text-zinc-400 hover:text-green-400 px-2 py-1 rounded-lg hover:bg-zinc-700 transition-colors opacity-0 group-hover:opacity-100"
          >
            + Playlist
          </button>
        )}
        {!track.preview_url && (
          <span className="text-xs text-zinc-600">No preview</span>
        )}
      </div>
    </div>
  );
}
