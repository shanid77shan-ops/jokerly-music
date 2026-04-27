"use client";

import { LfmTrack, lfmImage, lfmArtistName } from "@/lib/lastfm";
import { Music, ExternalLink, Sparkles, Play, Pause } from "lucide-react";
import Image from "next/image";

interface Props {
  track: LfmTrack;
  onGetSimilar?: (track: LfmTrack) => void;
  onPlay?: (track: LfmTrack) => void;
  onAddToPlaylist?: (track: LfmTrack) => void;
  isCurrentlyPlaying?: boolean;
  rank?: number;
}

export default function LfmTrackCard({ track, onGetSimilar, onPlay, onAddToPlaylist, isCurrentlyPlaying, rank }: Props) {
  const image = lfmImage(track.image, "large");
  const artist = lfmArtistName(track.artist);

  const handleRowClick = (e: React.MouseEvent) => {
    // Don't fire if clicking a button or link inside the row
    if ((e.target as HTMLElement).closest("button, a")) return;
    onPlay?.(track);
  };

  return (
    <div
      className={`flex items-center gap-3 p-3 rounded-xl group transition-colors ${
        onPlay ? "cursor-pointer" : ""
      } ${
        isCurrentlyPlaying ? "bg-red-500/10 border border-red-500/20" : "hover:bg-zinc-800/60"
      }`}
      onClick={handleRowClick}
    >
      {rank !== undefined && (
        <span className={`text-xs w-5 text-right shrink-0 ${isCurrentlyPlaying ? "text-red-400" : "text-zinc-600"}`}>
          {rank}
        </span>
      )}

      <div className="relative shrink-0 w-12 h-12">
        {image ? (
          <Image src={image} alt={track.name} fill unoptimized className="rounded-lg object-cover" sizes="48px" />
        ) : (
          <div className="w-12 h-12 rounded-lg bg-zinc-800 flex items-center justify-center">
            <Music size={18} className="text-zinc-600" />
          </div>
        )}
        {onPlay && (
          <div
            className={`absolute inset-0 rounded-lg flex items-center justify-center transition-opacity ${
              isCurrentlyPlaying ? "opacity-100 bg-black/40" : "opacity-0 group-hover:opacity-100 bg-black/50"
            }`}
            onClick={(e) => { e.stopPropagation(); onPlay(track); }}
          >
            {isCurrentlyPlaying ? (
              <Pause size={16} className="text-white" />
            ) : (
              <Play size={16} className="text-white" />
            )}
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium truncate ${isCurrentlyPlaying ? "text-red-400" : "text-white"}`}>
          {track.name}
        </p>
        <p className="text-xs text-zinc-400 truncate">{artist}</p>
        {track.listeners && (
          <p className="text-xs text-zinc-600">
            {Number(track.listeners).toLocaleString()} listeners
          </p>
        )}
      </div>

      <div className="flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity shrink-0">
        {onGetSimilar && (
          <button
            onClick={() => onGetSimilar(track)}
            title="Find similar tracks"
            className="flex items-center gap-1 text-xs text-zinc-400 hover:text-purple-400 px-2 py-1.5 rounded-lg hover:bg-zinc-700 transition-colors"
          >
            <Sparkles size={13} />
            Similar
          </button>
        )}
        {onAddToPlaylist && (
          <button
            onClick={() => onAddToPlaylist(track)}
            title="Add to playlist"
            className="flex items-center gap-1 text-xs text-zinc-400 hover:text-red-400 px-2 py-1.5 rounded-lg hover:bg-zinc-700 transition-colors"
          >
            + Playlist
          </button>
        )}
        <a
          href={track.url}
          target="_blank"
          rel="noopener noreferrer"
          className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors"
          title="Open on Last.fm"
        >
          <ExternalLink size={14} />
        </a>
      </div>
    </div>
  );
}
