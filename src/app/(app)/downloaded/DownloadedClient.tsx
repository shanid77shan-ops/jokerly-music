"use client";

import { useEffect, useCallback, useState } from "react";
import { Download, Music, Play, PlayCircle, Trash2, Loader2, WifiOff } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useOfflineStore } from "@/store/offline";
import { usePlayerStore, type PlayableTrack } from "@/store/player";
import { useToastStore } from "@/store/toast";

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export default function DownloadedClient() {
  const { toast } = useToastStore();
  const hydrate = useOfflineStore((s) => s.hydrate);
  const refreshTracks = useOfflineStore((s) => s.refreshTracks);
  const hydrated = useOfflineStore((s) => s.hydrated);
  const tracks = useOfflineStore((s) => s.tracks);
  const removeDownload = useOfflineStore((s) => s.removeDownload);
  const clearAllDownloads = useOfflineStore((s) => s.clearAllDownloads);
  const [clearingAll, setClearingAll] = useState(false);
  const { setQueueAndPlay, currentTrack, isPlaying } = usePlayerStore();

  useEffect(() => {
    if (!hydrated) void hydrate();
    else void refreshTracks();
  }, [hydrated, hydrate, refreshTracks]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void refreshTracks();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refreshTracks]);

  const toPlayable = useCallback(
    (): PlayableTrack[] =>
      tracks.map((t) => ({
        name: t.name,
        artist: t.artist,
        image: t.image ?? undefined,
        uri: t.uri,
      })),
    [tracks]
  );

  const playAt = (index: number) => {
    const queue = toPlayable();
    if (!queue.length) return;
    setQueueAndPlay(queue, index);
  };

  const playAll = () => playAt(0);

  const handleRemove = async (uri: string, name: string, artist: string) => {
    await removeDownload(uri, name, artist);
    toast("Removed from downloads", "success");
  };

  if (!hydrated) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 size={24} className="animate-spin text-white/25" />
      </div>
    );
  }

  return (
    <div className="w-full space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <Download size={22} className="text-[#E8282B]" />
            Downloaded
          </h2>
          <p className="text-xs mt-1 flex items-center gap-1.5" style={{ color: "var(--text-muted)" }}>
            <WifiOff size={12} />
            {tracks.length > 0
              ? `${tracks.length} track${tracks.length !== 1 ? "s" : ""} · plays offline (30s preview)`
              : "Save tracks from playlists or the player to listen offline"}
          </p>
        </div>
        {tracks.length > 0 && (
          <button
            type="button"
            onClick={() => void handleDeleteAll()}
            disabled={clearingAll}
            className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border border-red-500/30 text-red-400 hover:bg-red-500/10 disabled:opacity-40 transition-colors"
          >
            {clearingAll ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            Delete all
          </button>
        )}
      </div>

      {tracks.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={playAll}
            className="flex items-center gap-2 px-5 py-2.5 rounded-2xl text-white font-bold text-sm transition-all active:scale-95 shadow-lg"
            style={{ background: "#E8282B", boxShadow: "0 4px 16px rgba(232,40,43,0.35)" }}
          >
            <PlayCircle size={16} /> Play all offline
          </button>
        </div>
      )}

      {tracks.length === 0 ? (
        <div
          className="rounded-2xl border p-8 text-center"
          style={{ background: "var(--card)", borderColor: "rgba(255,255,255,0.08)" }}
        >
          <div
            className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center"
            style={{ background: "var(--surface)" }}
          >
            <Download size={28} className="text-white/20" />
          </div>
          <p className="text-sm font-medium text-white">Nothing downloaded yet</p>
          <p className="text-xs mt-2 max-w-xs mx-auto" style={{ color: "var(--text-muted)" }}>
            Tap the download icon on a song in Playlists or next to Like in the player bar.
          </p>
          <Link
            href="/playlists"
            className="inline-block mt-4 text-sm font-semibold text-[#E8282B] hover:underline"
          >
            Go to Playlists
          </Link>
        </div>
      ) : (
        <div
          className="rounded-2xl overflow-hidden border divide-y divide-white/[0.06]"
          style={{ background: "var(--card)", borderColor: "rgba(255,255,255,0.08)" }}
        >
          {tracks.map((track, index) => {
            const playing =
              isPlaying &&
              !!currentTrack?.uri &&
              currentTrack.uri === track.uri &&
              currentTrack.name === track.name;

            return (
              <div
                key={track.key}
                className="flex items-center gap-3 px-3 py-2.5 group hover:bg-white/[0.03] cursor-pointer transition-colors"
                onClick={() => playAt(index)}
              >
                <div className="relative w-11 h-11 rounded-lg shrink-0 overflow-hidden" style={{ background: "var(--surface)" }}>
                  {track.image ? (
                    <Image src={track.image} alt={track.name} fill unoptimized sizes="44px" className="object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Music size={14} style={{ color: "var(--text-muted)" }} />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium truncate ${playing ? "text-[#E8282B]" : "text-white"}`}>
                    {track.name}
                  </p>
                  <p className="text-xs truncate mt-0.5" style={{ color: "var(--text-muted)" }}>
                    {track.artist || "Unknown artist"} · {formatDate(track.downloadedAt)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    playAt(index);
                  }}
                  className="p-2 rounded-lg text-[#E8282B] hover:bg-[#E8282B]/10 transition-colors"
                  title="Play"
                >
                  <Play size={14} fill="currentColor" />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleRemove(track.uri, track.name, track.artist);
                  }}
                  className="p-2 rounded-lg text-white/25 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  title="Remove download"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
