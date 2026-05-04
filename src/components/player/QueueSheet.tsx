"use client";

import { useEffect, useRef } from "react";
import { usePlayerStore } from "@/store/player";
import { ChevronDown, Music, Trash2, Play, Pause } from "lucide-react";
import Image from "next/image";

interface Props {
  onPlayIndex: (index: number) => void;
}

export default function QueueSheet({ onPlayIndex }: Props) {
  const { queue, queueIndex, isPlaying, currentTrack, removeFromQueue } = usePlayerStore();
  const activeRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  return (
    <div
      className="fixed inset-0 z-[55] flex flex-col"
      style={{ background: "rgba(6,4,16,0.97)", backdropFilter: "blur(28px)" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
        <div>
          <h2 className="text-white font-bold text-lg">Queue</h2>
          <p className="text-xs text-white/30 mt-0.5">{queue.length} track{queue.length !== 1 ? "s" : ""}</p>
        </div>
        <button
          onClick={() => usePlayerStore.setState({ isQueueOpen: false })}
          className="p-2 rounded-xl text-white/40 hover:text-white hover:bg-white/[0.08] transition-colors"
        >
          <ChevronDown size={20} />
        </button>
      </div>

      {/* Track list */}
      <div className="flex-1 overflow-y-auto px-3 pb-6 space-y-0.5">
        {queue.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3">
            <Music size={32} className="text-white/10" />
            <p className="text-sm text-white/30">Queue is empty</p>
          </div>
        ) : (
          queue.map((track, i) => {
            const isCurrent = i === queueIndex;
            const isCurrentlyPlaying = isCurrent && isPlaying;
            const image = track.image;

            return (
              <div
                key={`${track.uri ?? track.name}-${i}`}
                ref={isCurrent ? activeRef : null}
                onClick={() => { onPlayIndex(i); usePlayerStore.setState({ isQueueOpen: false }); }}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-2xl cursor-pointer transition-all border group ${
                  isCurrent
                    ? "bg-[#E8282B]/10 border-[#E8282B]/20"
                    : "border-transparent hover:bg-white/[0.05] hover:border-white/[0.06]"
                }`}
              >
                <span className={`text-xs w-5 text-right shrink-0 tabular-nums font-medium ${isCurrent ? "text-[#E8282B]" : "text-white/25"}`}>
                  {i + 1}
                </span>

                <div className="relative shrink-0 w-10 h-10">
                  {image ? (
                    <Image src={image} alt={track.name} fill unoptimized className="rounded-xl object-cover" sizes="40px" />
                  ) : (
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "var(--card)" }}>
                      <Music size={14} className="text-white/20" />
                    </div>
                  )}
                  <div className={`absolute inset-0 rounded-xl flex items-center justify-center bg-black/50 transition-opacity ${isCurrent ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
                    {isCurrentlyPlaying
                      ? <Pause size={12} fill="white" className="text-white" />
                      : <Play size={12} fill="white" className="text-white" />
                    }
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium truncate leading-tight ${isCurrent ? "text-[#E8282B]" : "text-white"}`}>
                    {track.name}
                  </p>
                  <p className="text-xs text-white/40 truncate mt-0.5">{track.artist}</p>
                </div>

                <button
                  onClick={(e) => { e.stopPropagation(); removeFromQueue(i); }}
                  className="shrink-0 p-1.5 rounded-lg text-white/20 hover:text-red-400 hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
