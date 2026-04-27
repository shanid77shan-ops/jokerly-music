"use client";

import { usePlayerStore } from "@/store/player";
import { Play, Pause, Square, ExternalLink } from "lucide-react";
import Image from "next/image";

function msToMin(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export default function PlayerBar() {
  const { currentTrack, isPlaying, togglePlay, stop } = usePlayerStore();

  if (!currentTrack) return null;

  const image = currentTrack.album.images[0]?.url;

  return (
    <div className="h-20 bg-zinc-900 border-t border-zinc-800 flex items-center px-4 gap-4 shrink-0">
      {image && (
        <Image
          src={image}
          alt={currentTrack.album.name}
          width={56}
          height={56}
          className="rounded object-cover"
        />
      )}

      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-medium truncate">{currentTrack.name}</p>
        <p className="text-zinc-400 text-xs truncate">
          {currentTrack.artists.map((a) => a.name).join(", ")}
        </p>
        <p className="text-zinc-600 text-xs">{msToMin(currentTrack.duration_ms)}</p>
      </div>

      <div className="flex items-center gap-2">
        {!currentTrack.preview_url && (
          <span className="text-zinc-500 text-xs mr-2">No preview</span>
        )}
        <button
          onClick={togglePlay}
          disabled={!currentTrack.preview_url}
          className="p-2 rounded-full bg-green-500 hover:bg-green-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {isPlaying ? <Pause size={18} className="text-black" /> : <Play size={18} className="text-black" />}
        </button>
        <button
          onClick={stop}
          className="p-2 rounded-full bg-zinc-700 hover:bg-zinc-600 transition-colors"
        >
          <Square size={18} className="text-white" />
        </button>
        <a
          href={currentTrack.external_urls.spotify}
          target="_blank"
          rel="noopener noreferrer"
          className="p-2 rounded-full bg-zinc-700 hover:bg-zinc-600 transition-colors"
          title="Open in Spotify"
        >
          <ExternalLink size={18} className="text-white" />
        </a>
      </div>
    </div>
  );
}
