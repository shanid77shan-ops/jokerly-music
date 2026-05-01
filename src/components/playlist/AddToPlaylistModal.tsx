"use client";

import { useEffect, useRef, useState } from "react";
import { X, Loader2, Music, ListMusic, AlertCircle } from "lucide-react";
import { SpotifyPlaylist } from "@/types";
import Image from "next/image";

interface PlaylistTrackPayload {
  name: string;
  uri: string;
  image?: string | null;
  artist?: string | null;
}

interface Props {
  track: PlaylistTrackPayload;
  onClose: () => void;
}

// Module-level cache so playlists load instantly on re-open
let playlistCache: SpotifyPlaylist[] | null = null;

export default function AddToPlaylistModal({ track, onClose }: Props) {
  const [playlists, setPlaylists] = useState<SpotifyPlaylist[]>(playlistCache ?? []);
  const [loading, setLoading] = useState(!playlistCache);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState<string | null>(null);
  // IDs of playlists that already contain this track
  const [alreadyIn, setAlreadyIn] = useState<Set<string>>(new Set());
  const [addError, setAddError] = useState<string | null>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Load playlists
    const playlistsPromise = playlistCache
      ? Promise.resolve(playlistCache)
      : fetch("/api/spotify/playlists")
          .then((r) => r.json())
          .then((d) => {
            const items: SpotifyPlaylist[] = d.items ?? [];
            playlistCache = items;
            return items;
          });

    // Check which playlists already have this track
    const containsPromise = fetch(
      `/api/spotify/playlists/contains?uri=${encodeURIComponent(track.uri)}`
    )
      .then((r) => r.json())
      .catch(() => ({ playlistIds: [] }));

    Promise.all([playlistsPromise, containsPromise]).then(([items, containsData]) => {
      setPlaylists(items);
      setAlreadyIn(new Set(containsData.playlistIds ?? []));
      setLoading(false);
    });
  }, [track.uri]);

  const handleBackdrop = (e: React.MouseEvent) => {
    if (e.target === backdropRef.current) onClose();
  };

  const doAdd = async (playlist: SpotifyPlaylist) => {
    if (adding || added.has(playlist.id) || alreadyIn.has(playlist.id)) return;
    setAdding(playlist.id);
    setAddError(null);

    try {
      const res = await fetch(`/api/spotify/playlists/${playlist.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uris: [track.uri],
          trackName: track.name,
          trackImage: track.image ?? null,
          trackArtist: track.artist ?? null,
        }),
      });
      if (!res.ok) {
        if (res.status === 409) {
          // Already in playlist — update UI silently
          setAlreadyIn((prev) => new Set(prev).add(playlist.id));
          return;
        }
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Failed (${res.status})`);
      }
      setAdded((prev) => new Set(prev).add(playlist.id));
      // Notify playlist views to refresh immediately
      window.dispatchEvent(new CustomEvent("playlist-updated", { detail: { playlistId: playlist.id } }));
      setTimeout(onClose, 500);
    } catch (e) {
      setAddError("Could not add track. Please try again.");
    } finally {
      setAdding(null);
    }
  };

  const handlePlaylistClick = (playlist: SpotifyPlaylist) => {
    if (adding || added.has(playlist.id) || alreadyIn.has(playlist.id)) return;
    doAdd(playlist);
  };

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdrop}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)" }}
    >
      <div
        className="w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl border border-white/[0.08] flex flex-col"
        style={{ background: "var(--surface)", maxHeight: "80vh" }}
      >
        {/* Drag handle (mobile) */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-white/20" />
        </div>

        {/* Header — track info */}
        <div className="flex items-center gap-3 px-4 pt-3 pb-4 border-b border-white/[0.06]">
          <div className="relative w-12 h-12 shrink-0 rounded-xl overflow-hidden"
            style={{ background: "var(--card)" }}>
            {track.image ? (
              <Image src={track.image} alt={track.name} fill unoptimized sizes="48px" className="object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Music size={18} className="text-white/20" />
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-white/30 mb-0.5">Add to playlist</p>
            <p className="text-white font-semibold text-sm truncate leading-tight">{track.name}</p>
            {track.artist && (
              <p className="text-white/40 text-xs truncate mt-0.5">{track.artist}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="shrink-0 p-2 rounded-xl text-white/30 hover:text-white hover:bg-white/[0.08] transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Error banner */}
        {addError && (
          <div className="mx-3 mt-2 rounded-xl border border-[#E8282B]/25 bg-[#E8282B]/8 px-3 py-2 flex items-center gap-2">
            <AlertCircle size={13} className="text-[#E8282B] shrink-0" />
            <p className="text-white/60 text-xs flex-1">{addError}</p>
            <button onClick={() => setAddError(null)} className="text-white/25 hover:text-white shrink-0"><X size={12} /></button>
          </div>
        )}

        {/* Duplicate confirm banner removed — duplicates are blocked */}

        {/* Playlist list */}
        <div className="px-2 py-2 flex-1 overflow-y-auto min-h-0 space-y-0.5">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <Loader2 size={22} className="animate-spin text-[#E8282B]/60" />
              <p className="text-white/25 text-xs">Loading playlists…</p>
            </div>
          ) : playlists.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2">
              <ListMusic size={28} className="text-white/15" />
              <p className="text-white/30 text-sm">No playlists yet</p>
            </div>
          ) : (
            playlists.map((pl) => {
              const isAdded = added.has(pl.id);
              const isAdding = adding === pl.id;
              const isDuplicate = alreadyIn.has(pl.id) || isAdded;
              return (
                <button
                  key={pl.id}
                  onClick={() => handlePlaylistClick(pl)}
                  disabled={isDuplicate || !!adding}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-left transition-all border ${
                    isDuplicate
                      ? "opacity-50 border-transparent cursor-not-allowed"
                      : "hover:bg-white/[0.05] border-transparent"
                  }`}
                >
                  {/* Playlist cover */}
                  <div className="w-9 h-9 rounded-xl shrink-0 flex items-center justify-center border border-white/[0.07]"
                    style={{ background: "var(--card-raised)" }}>
                    {pl.images?.[0]?.url ? (
                      <div className="relative w-9 h-9 rounded-xl overflow-hidden">
                        <Image src={pl.images[0].url} alt={pl.name} fill unoptimized sizes="36px" className="object-cover" />
                      </div>
                    ) : (
                      <ListMusic size={15} className="text-white/25" />
                    )}
                  </div>

                  <span className="flex-1 text-sm font-medium truncate text-white">
                    {pl.name}
                  </span>

                  {/* Right badge */}
                  {isDuplicate ? (
                    <span className="text-[10px] font-semibold text-white/40 bg-white/[0.07] border border-white/10 px-2 py-0.5 rounded-full shrink-0">
                      In playlist
                    </span>
                  ) : isAdding ? (
                    <Loader2 size={16} className="animate-spin text-[#E8282B]/50 shrink-0" />
                  ) : null}
                </button>
              );
            })
          )}
        </div>

        <div className="h-3 sm:h-1" />
      </div>
    </div>
  );
}
