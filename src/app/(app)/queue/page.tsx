"use client";

import { usePlayerStore } from "@/store/player";
import { Music } from "lucide-react";

export default function QueuePage() {
  const { queue, queueIndex } = usePlayerStore();

  return (
    <div className="w-full space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-white mb-1">Queue</h2>
        <p className="text-zinc-400">{queue.length} track{queue.length !== 1 ? "s" : ""} in queue</p>
      </div>

      {queue.length === 0 ? (
        <div className="text-center py-20 text-zinc-500">
          <Music size={48} className="mx-auto mb-4 opacity-30" />
          <p>Queue is empty. Play something to get started.</p>
        </div>
      ) : (
        <div className="space-y-1">
          {queue.map((track, i) => (
            <div
              key={`${track.uri ?? track.name}-${i}`}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${
                i === queueIndex
                  ? "bg-red-500/10 border border-red-500/20"
                  : "hover:bg-zinc-800/60"
              }`}
            >
              <span className={`text-xs w-5 text-right shrink-0 ${i === queueIndex ? "text-red-400" : "text-zinc-600"}`}>
                {i + 1}
              </span>
              {track.image ? (
                <img src={track.image} alt={track.name} className="w-9 h-9 rounded-md object-cover shrink-0" />
              ) : (
                <div className="w-9 h-9 rounded-md bg-zinc-800 flex items-center justify-center shrink-0">
                  <Music size={14} className="text-zinc-600" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium truncate ${i === queueIndex ? "text-red-400" : "text-white"}`}>
                  {track.name}
                </p>
                <p className="text-xs text-zinc-400 truncate">{track.artist}</p>
              </div>
              {i === queueIndex && (
                <span className="text-xs text-red-400 shrink-0 font-medium">Now Playing</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
