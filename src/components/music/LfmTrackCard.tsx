"use client";

import { LfmTrack, lfmImage, lfmArtistName } from "@/lib/lastfm";
import { Music, ExternalLink, Sparkles } from "lucide-react";
import Image from "next/image";

interface Props {
  track: LfmTrack;
  onGetSimilar?: (track: LfmTrack) => void;
  rank?: number;
}

export default function LfmTrackCard({ track, onGetSimilar, rank }: Props) {
  const image = lfmImage(track.image, "large");
  const artist = lfmArtistName(track.artist);

  return (
    <div className="flex items-center gap-3 p-3 rounded-xl hover:bg-zinc-800/60 group transition-colors">
      {rank !== undefined && (
        <span className="text-zinc-600 text-xs w-5 text-right shrink-0">{rank}</span>
      )}

      <div className="relative shrink-0 w-12 h-12">
        {image ? (
          <Image
            src={image}
            alt={track.name}
            fill
            className="rounded-lg object-cover"
            sizes="48px"
          />
        ) : (
          <div className="w-12 h-12 rounded-lg bg-zinc-800 flex items-center justify-center">
            <Music size={18} className="text-zinc-600" />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <a
          href={track.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-medium text-white hover:text-green-400 transition-colors truncate block"
        >
          {track.name}
        </a>
        <p className="text-xs text-zinc-400 truncate">{artist}</p>
        {track.listeners && (
          <p className="text-xs text-zinc-600">
            {Number(track.listeners).toLocaleString()} listeners
          </p>
        )}
      </div>

      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
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
