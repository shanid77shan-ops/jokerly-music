"use client";

import { useEffect } from "react";
import { SpotifyTrack, trackImage, artistNames } from "@/types/spotify";
import { Music, ExternalLink, Sparkles, Play, Pause, ListPlus, Heart } from "lucide-react";
import Image from "next/image";
import { useLikesStore } from "@/store/likes";

interface Props {
  track: SpotifyTrack;
  onGetSimilar?: (track: SpotifyTrack) => void;
  onPlay?: (track: SpotifyTrack) => void;
  onAddToPlaylist?: (track: SpotifyTrack) => void;
  isCurrentlyPlaying?: boolean;
  rank?: number;
}

export default function SpotifyTrackCard({ track, onGetSimilar, onPlay, onAddToPlaylist, isCurrentlyPlaying, rank }: Props) {
  const image = trackImage(track);
  const artist = artistNames(track);
  const { load: loadLikes, songUris, toggleSong } = useLikesStore();
  const isLiked = songUris.has(track.uri ?? "");

  useEffect(() => { loadLikes(); }, [loadLikes]);

  const handleRowClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button, a")) return;
    onPlay?.(track);
  };

  const handleLike = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!track.uri) return;
    toggleSong({ uri: track.uri, name: track.name, image: trackImage(track), artist: artistNames(track) });
  };

  return (
    <div
      className={`flex items-center gap-3 px-3 py-2.5 rounded-2xl group transition-all duration-200 ${
        onPlay ? "cursor-pointer" : ""
      } ${
        isCurrentlyPlaying
          ? "bg-[#E8282B]/10 border border-[#E8282B]/20"
          : "hover:bg-white/[0.05] border border-transparent hover:border-white/[0.07]"
      }`}
      onClick={handleRowClick}
    >
      {rank !== undefined && (
        <span className={`text-xs w-5 text-right shrink-0 tabular-nums font-medium ${isCurrentlyPlaying ? "text-[#E8282B]" : "text-white/25"}`}>
          {rank}
        </span>
      )}

      <div className="relative shrink-0 w-10 h-10">
        {image ? (
          <Image src={image} alt={track.name} fill unoptimized className="rounded-xl object-cover" sizes="40px" />
        ) : (
          <div className="w-10 h-10 rounded-xl bg-white/[0.06] flex items-center justify-center">
            <Music size={15} className="text-white/30" />
          </div>
        )}
        {onPlay && (
          <div
            className={`absolute inset-0 rounded-xl flex items-center justify-center transition-all duration-150 ${
              isCurrentlyPlaying ? "opacity-100 bg-black/40" : "opacity-0 group-hover:opacity-100 bg-black/50"
            }`}
            onClick={(e) => { e.stopPropagation(); onPlay(track); }}
          >
            {isCurrentlyPlaying ? <Pause size={14} className="text-white" fill="white" /> : <Play size={14} className="text-white" fill="white" />}
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium truncate ${isCurrentlyPlaying ? "text-[#E8282B]" : "text-white"}`}>
          {track.name}
        </p>
        <p className="text-xs text-white/40 truncate">{artist}</p>
      </div>

      <div className="flex items-center gap-0.5 shrink-0">
        <button
          onClick={handleLike}
          title={isLiked ? "Unlike" : "Like"}
          className={`p-1.5 rounded-lg transition-colors ${
            isLiked
              ? "text-[#E8282B]"
              : "text-white/25 hover:text-[#E8282B] hover:bg-[#E8282B]/10 sm:opacity-0 sm:group-hover:opacity-100"
          }`}
        >
          <Heart size={14} fill={isLiked ? "currentColor" : "none"} />
        </button>
        {onAddToPlaylist && (
          <button
            onClick={(e) => { e.stopPropagation(); onAddToPlaylist(track); }}
            title="Add to playlist"
            className="p-1.5 rounded-lg text-[#E8282B]/60 hover:text-[#E8282B] hover:bg-[#E8282B]/10 transition-colors"
          >
            <ListPlus size={15} />
          </button>
        )}
        {onGetSimilar && (
          <button
            onClick={(e) => { e.stopPropagation(); onGetSimilar(track); }}
            title="Find similar tracks"
            className="p-1.5 rounded-lg text-white/40 hover:text-violet-400 hover:bg-white/[0.07] transition-colors"
          >
            <Sparkles size={13} />
          </button>
        )}
        <a
          href={track.external_urls.spotify}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="p-1.5 rounded-lg text-white/25 hover:text-white/70 hover:bg-white/[0.07] transition-colors"
          title="Open on Spotify"
        >
          <ExternalLink size={12} />
        </a>
      </div>
    </div>
  );
}
