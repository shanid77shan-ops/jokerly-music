"use client";

import { SpotifyArtist, artistImage } from "@/types/spotify";
import { Mic2 } from "lucide-react";
import Image from "next/image";

interface Props {
  artist: SpotifyArtist;
  onSelect?: (artist: SpotifyArtist) => void;
  compact?: boolean;
}

export default function SpotifyArtistCard({ artist, onSelect, compact = false }: Props) {
  const image = artistImage(artist);
  const avatarSize = compact ? "w-16 h-16" : "w-20 h-20";
  const imageSizes = compact ? "64px" : "80px";
  const iconSize = compact ? 22 : 28;

  return (
    <div
      onClick={() => onSelect?.(artist)}
      className={`flex flex-col items-center ${compact ? "gap-2.5 p-3" : "gap-3 p-4"} rounded-2xl border transition-all duration-200 group ${
        onSelect ? "cursor-pointer hover:scale-[1.02]" : ""
      }`}
      style={{ background: "var(--card)", borderColor: "var(--border)" }}
    >
      <div className={`relative shrink-0 ${avatarSize}`}>
        {image ? (
          <Image src={image} alt={artist.name} fill unoptimized className="rounded-full object-cover ring-2 ring-white/10 group-hover:ring-[#E8282B]/40 transition-all" sizes={imageSizes} />
        ) : (
          <div className={`${avatarSize} rounded-full bg-white/[0.06] flex items-center justify-center ring-2 ring-white/[0.06]`}>
            <Mic2 size={iconSize} className="text-white/25" />
          </div>
        )}
      </div>

      <div className="text-center w-full">
        <p className={`text-white font-semibold truncate group-hover:text-[#E8282B] transition-colors ${compact ? "text-[13px]" : "text-sm"}`}>
          {artist.name}
        </p>
        {artist.followers?.total != null && (
          <p className={`text-white/35 mt-0.5 ${compact ? "text-[11px]" : "text-xs"}`}>
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
