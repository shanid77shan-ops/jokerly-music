"use client";

import { useEffect, useState } from "react";
import { Pin, Loader2 } from "lucide-react";
import { PinnedPlaylist } from "@/types";
import Image from "next/image";

export default function PinnedClient() {
  const [pinned, setPinned] = useState<PinnedPlaylist[]>([]);
  const [loading, setLoading] = useState(true);
  const [unpinning, setUnpinning] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const res = await fetch("/api/pinned");
    const data = await res.json();
    setPinned(data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const unpin = async (playlistId: string) => {
    setUnpinning(playlistId);
    await fetch("/api/pinned", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playlist_id: playlistId }),
    });
    setPinned((prev) => prev.filter((p) => p.playlist_id !== playlistId));
    setUnpinning(null);
  };

  return (
    <div className="w-full space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-white flex items-center gap-2">
          <Pin size={28} className="text-red-400" /> Pinned Playlists
        </h2>
        <p className="text-zinc-400 mt-1">Your quick-access playlists</p>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 bg-zinc-800/50 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : pinned.length === 0 ? (
        <div className="text-center py-20 text-zinc-500">
          <Pin size={48} className="mx-auto mb-4 opacity-30" />
          <p>No pinned playlists yet.</p>
          <p className="text-sm mt-1">Pin playlists from the Playlists page.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {pinned.map((pl) => (
            <div
              key={pl.id}
              className="flex items-center gap-4 p-3 rounded-xl bg-zinc-800/40 hover:bg-zinc-800 transition-colors group"
            >
              {pl.playlist_image ? (
                <Image
                  src={pl.playlist_image}
                  alt={pl.playlist_name}
                  width={52}
                  height={52}
                  className="rounded-lg object-cover shrink-0"
                />
              ) : (
                <div className="w-[52px] h-[52px] rounded-lg bg-zinc-700 flex items-center justify-center shrink-0">
                  <Pin size={20} className="text-zinc-500" />
                </div>
              )}

              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-medium truncate">{pl.playlist_name}</p>
                <p className="text-zinc-500 text-xs">
                  Pinned {new Date(pl.pinned_at).toLocaleDateString()}
                </p>
              </div>

              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => unpin(pl.playlist_id)}
                  disabled={unpinning === pl.playlist_id}
                  className="p-2 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-zinc-700 transition-colors"
                  title="Unpin"
                >
                  {unpinning === pl.playlist_id ? (
                    <Loader2 size={15} className="animate-spin" />
                  ) : (
                    <Pin size={15} />
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
