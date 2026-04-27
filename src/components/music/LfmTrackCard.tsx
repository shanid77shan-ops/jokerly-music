"use client";

import { LfmTrack, lfmImage, lfmArtistName } from "@/lib/lastfm";
import { Music, ExternalLink, Sparkles, Play, Pause, ListPlus } from "lucide-react";
import Image from "next/image";
import { useSpotifyImage } from "@/hooks/useSpotifyImage";

interface Props {
  track: LfmTrack;
  onGetSimilar?: (track: LfmTrack) => void;
  onPlay?: (track: LfmTrack) => void;
  onAddToPlaylist?: (track: LfmTrack) => void;
  isCurrentlyPlaying?: boolean;
  rank?: number;
  imageOverride?: string | null;
}

export default function LfmTrackCard({ track, onGetSimilar, onPlay, onAddToPlaylist, isCurrentlyPlaying, rank, imageOverride }: Props) {
  const artist = lfmArtistName(track.artist);
  const lfmImg = lfmImage(track.image, "large");
  const image = useSpotifyImage(track.name, artist, imageOverride ?? lfmImg);

  const handleRowClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button, a")) return;
    onPlay?.(track);
  };

  return (
    <div
      className={`flex items-center gap-2.5 px-2 py-1.5 rounded-lg group transition-colors ${
        onPlay ? "cursor-pointer" : ""
      } ${
        isCurrentlyPlaying ? "bg-red-500/10 border border-red-500/20" : "hover:bg-zinc-800/60"
      }`}
      onClick={handleRowClick}
    >
      {rank !== undefined && (
        <span className={`text-xs w-4 text-right shrink-0 ${isCurrentlyPlaying ? "text-red-400" : "text-zinc-600"}`}>
          {rank}
        </span>
      )}

      <div className="relative shrink-0 w-9 h-9">
        {image ? (
          <Image src={image} alt={track.name} fill unoptimized className="rounded-md object-cover" sizes="36px" />
        ) : (
          <div className="w-9 h-9 rounded-md bg-zinc-800 flex items-center justify-center">
            <Music size={14} className="text-zinc-600" />
          </div>
        )}
        {onPlay && (
          <div
            className={`absolute inset-0 rounded-md flex items-center justify-center transition-opacity ${
              isCurrentlyPlaying ? "opacity-100 bg-black/40" : "opacity-0 group-hover:opacity-100 bg-black/50"
            }`}
            onClick={(e) => { e.stopPropagation(); onPlay(track); }}
          >
            {isCurrentlyPlaying ? <Pause size={14} className="text-white" /> : <Play size={14} className="text-white" />}
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className={`text-xs font-medium truncate ${isCurrentlyPlaying ? "text-red-400" : "text-white"}`}>
          {track.name}
        </p>
        <p className="text-[11px] text-zinc-400 truncate">{artist}</p>
      </div>

      <div className="flex items-center gap-0.5 shrink-0">
        {onAddToPlaylist && (
          <button
            onClick={(e) => { e.stopPropagation(); onAddToPlaylist(track); }}
            title="Add to playlist"
            className="p-1.5 rounded-md text-zinc-400 hover:text-red-400 hover:bg-zinc-700 transition-colors"
          >
            <ListPlus size={15} />
          </button>
        )}
        {onGetSimilar && (
          <button
            onClick={(e) => { e.stopPropagation(); onGetSimilar(track); }}
            title="Find similar tracks"
            className="p-1.5 rounded-md text-zinc-400 hover:text-purple-400 hover:bg-zinc-700 transition-colors"
          >
            <Sparkles size={13} />
          </button>
        )}
        <a
          href={track.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors"
          title="Open on Last.fm"
        >
          <ExternalLink size={12} />
        </a>
      </div>
    </div>
  );
}
