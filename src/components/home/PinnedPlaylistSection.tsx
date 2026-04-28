"use client";

import { useState, useCallback } from "react";
import Image from "next/image";
import { Pin, ChevronDown, Music, Play, Loader2, PlayCircle } from "lucide-react";
import { PinnedPlaylist } from "@/types";
import { usePlayerStore, PlayableTrack } from "@/store/player";
import { useToastStore } from "@/store/toast";

interface PlaylistTrack {
  track_uri: string;
  track_name: string;
  track_image?: string | null;
  track_artist?: string | null;
  added_at: string;
}

interface Props {
  pinned: PinnedPlaylist[];
}

export default function PinnedPlaylistSection({ pinned }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [tracks, setTracks] = useState<Record<string, PlaylistTrack[]>>({});
  const [loading, setLoading] = useState<string | null>(null);
  const { setQueueAndPlay, isPlayerReady } = usePlayerStore();
  const { toast } = useToastStore();

  const toggle = useCallback(
    async (playlistId: string) => {
      if (expanded === playlistId) {
        setExpanded(null);
        return;
      }
      setExpanded(playlistId);
      if (tracks[playlistId]) return;

      setLoading(playlistId);
      try {
        const res = await fetch(`/api/spotify/playlists/${encodeURIComponent(playlistId)}`);
        if (!res.ok) throw new Error("Failed to load tracks");
        const data = await res.json();
        setTracks((prev) => ({ ...prev, [playlistId]: data.items ?? [] }));
      } catch (e) {
        toast((e as Error).message ?? "Could not load playlist tracks");
        setTracks((prev) => ({ ...prev, [playlistId]: [] }));
      } finally {
        setLoading(null);
      }
    },
    [expanded, tracks, toast]
  );

  const playAll = useCallback(
    (playlistId: string, startIndex = 0) => {
      const list = tracks[playlistId] ?? [];
      if (!list.length) return;
      const queue: PlayableTrack[] = list.map((t) => ({
        name: t.track_name,
        artist: t.track_artist ?? "",
        image: t.track_image ?? undefined,
        uri: t.track_uri,
      }));
      setQueueAndPlay(queue, startIndex);
    },
    [tracks, setQueueAndPlay]
  );

  if (pinned.length === 0) {
    return (
      <div className="rounded-2xl p-5 text-center border" style={{ background: "var(--card)", borderColor: "rgba(255,255,255,0.06)" }}>
        <Pin size={20} className="mx-auto mb-2 opacity-20" style={{ color: "var(--text-muted)" }} />
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>No pinned playlists yet.</p>
        <p className="text-xs mt-0.5 opacity-60" style={{ color: "var(--text-muted)" }}>Pin playlists from the Playlists page.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {pinned.map((pl) => {
        const isOpen = expanded === pl.playlist_id;
        const isLoading = loading === pl.playlist_id;
        const list = tracks[pl.playlist_id] ?? [];

        return (
          <div
            key={pl.id}
            className="rounded-2xl overflow-hidden border transition-all duration-200"
            style={{
              background: "var(--card)",
              borderColor: isOpen ? "rgba(10,132,255,0.22)" : "rgba(255,255,255,0.06)",
            }}
          >
            {/* ── Header row — entire row is clickable ── */}
            <div
              className="flex items-center gap-3 px-3 py-3 cursor-pointer transition-colors"
              style={{ background: "transparent" }}
              onClick={() => toggle(pl.playlist_id)}
              onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.025)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
            >
              {/* Cover art */}
              <div className="relative shrink-0 w-12 h-12">
                {pl.playlist_image ? (
                  <Image
                    src={pl.playlist_image}
                    alt={pl.playlist_name}
                    fill
                    unoptimized
                    sizes="48px"
                    className="rounded-xl object-cover"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: "var(--surface)" }}>
                    <Pin size={18} style={{ color: "var(--text-muted)" }} />
                  </div>
                )}
                {/* Pinned dot */}
                <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-[#0a84ff] border-2"
                  style={{ borderColor: "var(--card)" }} />
              </div>

              {/* Name + meta */}
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-semibold truncate leading-tight">{pl.playlist_name}</p>
                <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                  {isLoading ? "Loading…" : list.length > 0 ? `${list.length} tracks` : isOpen ? "No tracks" : "Tap to expand"}
                </p>
              </div>

              {/* Right: play all (when open) + chevron */}
              <div className="flex items-center gap-1 shrink-0">
                {isOpen && list.length > 0 && (
                  <button
                    onClick={(e) => { e.stopPropagation(); playAll(pl.playlist_id, 0); }}
                    disabled={!isPlayerReady}
                    title="Play all"
                    className="p-1.5 rounded-xl transition-colors disabled:opacity-40"
                    style={{ color: "#0a84ff" }}
                  >
                    <PlayCircle size={17} />
                  </button>
                )}
                {isLoading ? (
                  <Loader2 size={15} className="animate-spin" style={{ color: "var(--text-muted)" }} />
                ) : (
                  <div className="pointer-events-none" style={{ color: "rgba(255,255,255,0.25)" }}>
                    <ChevronDown size={15} className={`transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
                  </div>
                )}
              </div>
            </div>

            {/* ── Track list ── */}
            {isOpen && !isLoading && (
              <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)", background: "var(--surface)" }}>
                {list.length === 0 ? (
                  <p className="text-center py-8 text-sm" style={{ color: "var(--text-muted)" }}>No tracks in this playlist yet.</p>
                ) : (
                  <div>
                    {list.map((track, i) => (
                      <div
                        key={track.track_uri}
                        className="flex items-center gap-2.5 px-3 py-2.5 group cursor-pointer transition-colors"
                        style={{ borderBottom: i < list.length - 1 ? "1px solid rgba(255,255,255,0.03)" : "none" }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "var(--card)"; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
                        onClick={() => playAll(pl.playlist_id, i)}
                      >
                        {/* Number / play indicator */}
                        <div className="w-5 shrink-0 flex items-center justify-center">
                          <span className="text-xs tabular-nums group-hover:hidden" style={{ color: "var(--text-muted)" }}>{i + 1}</span>
                          <Play size={12} fill="currentColor" className="hidden group-hover:block text-[#0a84ff]" />
                        </div>

                        {/* Album art */}
                        <div className="relative w-9 h-9 rounded-lg shrink-0 overflow-hidden" style={{ background: "var(--card)" }}>
                          {track.track_image ? (
                            <Image
                              src={track.track_image}
                              alt={track.track_name}
                              fill
                              unoptimized
                              sizes="36px"
                              className="object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Music size={12} style={{ color: "var(--text-muted)" }} />
                            </div>
                          )}
                        </div>

                        {/* Name + artist */}
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-sm font-medium truncate leading-tight">{track.track_name}</p>
                          {track.track_artist && (
                            <p className="text-xs truncate mt-0.5" style={{ color: "var(--text-muted)" }}>{track.track_artist}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
