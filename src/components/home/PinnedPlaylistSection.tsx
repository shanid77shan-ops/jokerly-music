"use client";

import { useState, useCallback } from "react";
import Image from "next/image";
import { Pin, ChevronDown, ChevronUp, Music2, Play, Loader2 } from "lucide-react";
import { PinnedPlaylist } from "@/types";
import { usePlayerStore, PlayableTrack } from "@/store/player";
import { useToastStore } from "@/store/toast";

interface PlaylistTrack {
  track_uri: string;
  track_name: string;
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
    [expanded, tracks]
  );

  const playAll = useCallback(
    (playlistId: string, startIndex = 0) => {
      const list = tracks[playlistId] ?? [];
      if (!list.length || !isPlayerReady) return;
      const queue: PlayableTrack[] = list.map((t) => ({
        name: t.track_name,
        artist: "",
        uri: t.track_uri,
      }));
      setQueueAndPlay(queue, startIndex);
    },
    [tracks, isPlayerReady, setQueueAndPlay]
  );

  if (pinned.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 text-zinc-500 text-sm">
        No pinned playlists yet. Pin playlists from the Playlists page.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {pinned.map((pl) => {
        const isOpen = expanded === pl.playlist_id;
        const isLoading = loading === pl.playlist_id;
        const list = tracks[pl.playlist_id];

        return (
          <div
            key={pl.id}
            className="rounded-xl border border-zinc-800 bg-zinc-900/60 overflow-hidden"
          >
            {/* Header row */}
            <button
              onClick={() => toggle(pl.playlist_id)}
              className="w-full flex items-center gap-3 p-3 hover:bg-zinc-800/60 transition-colors text-left"
            >
              {pl.playlist_image ? (
                <Image
                  src={pl.playlist_image}
                  alt={pl.playlist_name}
                  width={44}
                  height={44}
                  className="rounded-lg object-cover shrink-0"
                />
              ) : (
                <div className="w-11 h-11 rounded-lg bg-zinc-800 flex items-center justify-center shrink-0">
                  <Pin size={16} className="text-zinc-500" />
                </div>
              )}
              <span className="flex-1 text-sm text-white font-medium truncate">
                {pl.playlist_name}
              </span>
              {isLoading ? (
                <Loader2 size={16} className="text-zinc-400 animate-spin shrink-0" />
              ) : isOpen ? (
                <ChevronUp size={16} className="text-zinc-400 shrink-0" />
              ) : (
                <ChevronDown size={16} className="text-zinc-400 shrink-0" />
              )}
            </button>

            {/* Dropdown track list */}
            {isOpen && !isLoading && (
              <div className="border-t border-zinc-800">
                {!list || list.length === 0 ? (
                  <div className="px-4 py-5 text-zinc-500 text-sm flex items-center gap-2">
                    <Music2 size={15} />
                    No tracks in this playlist yet.
                  </div>
                ) : (
                  <>
                    {/* Play all button */}
                    <div className="px-3 py-2 flex items-center justify-between border-b border-zinc-800/60">
                      <span className="text-xs text-zinc-500">{list.length} track{list.length !== 1 ? "s" : ""}</span>
                      <button
                        onClick={() => playAll(pl.playlist_id, 0)}
                        disabled={!isPlayerReady}
                        className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        <Play size={12} fill="currentColor" />
                        Play all
                      </button>
                    </div>

                    {/* Track rows */}
                    <ul className="max-h-60 overflow-y-auto divide-y divide-zinc-800/40">
                      {list.map((track, i) => (
                        <li key={track.track_uri}>
                          <button
                            onClick={() => playAll(pl.playlist_id, i)}
                            disabled={!isPlayerReady}
                            className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-zinc-800/50 transition-colors text-left group disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            <span className="w-5 text-center text-xs text-zinc-600 group-hover:hidden shrink-0">
                              {i + 1}
                            </span>
                            <Play
                              size={11}
                              fill="currentColor"
                              className="w-5 hidden group-hover:block text-red-400 shrink-0"
                            />
                            <span className="flex-1 text-sm text-zinc-200 truncate">
                              {track.track_name}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
