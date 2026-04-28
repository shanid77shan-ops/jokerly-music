"use client";

import { SpotifyArtist, artistImage } from "@/types/spotify";
import { Mic2 } from "lucide-react";
import Image from "next/image";

interface Props {
  artist: SpotifyArtist;
  onSelect?: (artist: SpotifyArtist) => void;
}

export default function SpotifyArtistCard({ artist, onSelect }: Props) {
  const image = artistImage(artist);

  return (
    <div
      onClick={() => onSelect?.(artist)}
      className={`flex flex-col items-center gap-3 p-4 rounded-2xl border transition-all duration-200 group ${
        onSelect ? "cursor-pointer hover:scale-[1.02]" : ""
      }`}
      style={{ background: "var(--card)", borderColor: "var(--border)" }}
    >
      <div className="relative w-20 h-20 shrink-0">
        {image ? (
          <Image src={image} alt={artist.name} fill unoptimized className="rounded-full object-cover ring-2 ring-white/10 group-hover:ring-[#f0a500]/40 transition-all" sizes="80px" />
        ) : (
          <div className="w-20 h-20 rounded-full bg-white/[0.06] flex items-center justify-center ring-2 ring-white/[0.06]">
            <Mic2 size={28} className="text-white/25" />
          </div>
        )}
      </div>

      <div className="text-center w-full">
        <p className="text-white text-sm font-semibold truncate group-hover:text-[#f0a500] transition-colors">
          {artist.name}
        </p>
        {artist.followers?.total != null && (
          <p className="text-white/35 text-xs mt-0.5">
            {artist.followers.total >= 1_000_000
              ? `${(artist.followers.total / 1_000_000).toFixed(1)}M`
              : artist.followers.total >= 1_000
              ? `${(artist.followers.total / 1_000).toFixed(0)}K`
              : artist.followers.total} fans
          </p>
        )}
      </div>
    </div>
  );
}
