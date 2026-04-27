"use client";

import { LfmArtist, lfmImage } from "@/lib/lastfm";
import { Mic2, ExternalLink } from "lucide-react";
import Image from "next/image";

interface Props {
  artist: LfmArtist;
  onSelect?: (artist: LfmArtist) => void;
}

export default function LfmArtistCard({ artist, onSelect }: Props) {
  const image = lfmImage(artist.image, "extralarge");

  return (
    <div
      onClick={() => onSelect?.(artist)}
      className={`flex flex-col items-center gap-2 p-4 rounded-xl transition-colors group ${
        onSelect ? "cursor-pointer hover:bg-zinc-800/60" : "hover:bg-zinc-800/60"
      }`}
    >
      <div className="relative w-20 h-20 shrink-0">
        {image ? (
          <Image
            src={image}
            alt={artist.name}
            fill
            className="rounded-full object-cover"
            sizes="80px"
          />
        ) : (
          <div className="w-20 h-20 rounded-full bg-zinc-800 flex items-center justify-center">
            <Mic2 size={28} className="text-zinc-600" />
          </div>
        )}
      </div>

      <div className="text-center w-full">
        <p className="text-white text-sm font-medium truncate group-hover:text-green-400 transition-colors">
          {artist.name}
        </p>
        {artist.listeners && (
          <p className="text-zinc-500 text-xs">
            {Number(artist.listeners).toLocaleString()} listeners
          </p>
        )}
      </div>

      <a
        href={artist.url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="text-zinc-600 hover:text-zinc-400 transition-colors"
        title="Open on Last.fm"
      >
        <ExternalLink size={12} />
      </a>
    </div>
  );
}
