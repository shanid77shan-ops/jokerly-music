"use client";

import { useEffect, useRef, useState } from "react";
import { X, Loader2, Music, ListMusic, ArrowLeft, Plus, Check, AlertCircle } from "lucide-react";
import { SpotifyPlaylist } from "@/types";
import Image from "next/image";
import { useBackHandler } from "@/hooks/useBackHandler";

interface PlaylistTrack {
  id: string;
  track_uri: string;
  track_name: string;
  track_image?: string | null;
  track_artist?: string | null;
  position: number;
}

interface Props {
  targetPlaylistId: string;
  targetPlaylistName: string;
  onClose: () => void;
  onTracksAdded?: () => void;
}

let playlistCache: SpotifyPlaylist[] | null = null;

export default function AddFromPlaylistModal({ targetPlaylistId, targetPlaylistName, onClose, onTracksAdded }: Props) {
  useBackHandler(true, onClose);

  const [playlists, setPlaylists] = useState<SpotifyPlaylist[]>(playlistCache ?? []);
  const [loadingPlaylists, setLoadingPlaylists] = useState(true);
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [sourceTracks, setSourceTracks] = useState<PlaylistTrack[]>([]);
  const [loadingTracks, setLoadingTracks] = useState(false);
  const [adding, setAdding] = useState<Set<string>>(new Set());
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (playlistCache) {
      setPlaylists(playlistCache.filter((p) => p.id !== targetPlaylistId));
      setLoadingPlaylists(false);
    }
    fetch("/api/spotify/playlists", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        const items: SpotifyPlaylist[] = d.items ?? [];
        playlistCache = items;
        setPlaylists(items.filter((p) => p.id !== targetPlaylistId));
      })
      .catch(() => {})
      .finally(() => setLoadingPlaylists(false));
  }, [targetPlaylistId]);

  const openSource = async (id: string) => {
    setSourceId(id);
    setLoadingTracks(true);
    setAdded(new Set());
    setError(null);
    try {
      const res = await fetch(`/api/spotify/playlists/${encodeURIComponent(id)}?_t=${Date.now()}`);
      if (!res.ok) throw new Error("Failed to load tracks");
      const data = await res.json();
      setSourceTracks(data.items ?? []);
    } catch {
      setError("Could not load tracks. Try again.");
      setSourceId(null);
    } finally {
      setLoadingTracks(false);
    }
  };

  const addTrack = async (track: PlaylistTrack) => {
    if (adding.has(track.id) || added.has(track.id)) return;
    setAdding((prev) => new Set(prev).add(track.id));
    setError(null);
    try {
      const res = await fetch(`/api/spotify/playlists/${targetPlaylistId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uris: [track.track_uri],
          trackName: track.track_name,
          trackImage: track.track_image ?? null,
          trackArtist: track.track_artist ?? null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Failed (${res.status})`);
      }
      const body = await res.json().catch(() => ({}));
      setAdded((prev) => new Set(prev).add(track.id));
      if (!body.alreadyExists) {
        window.dispatchEvent(new CustomEvent("playlist-updated", { detail: { playlistId: targetPlaylistId } }));
        onTracksAdded?.();
      }
    } catch {
      setError("Could not add track. Please try again.");
    } finally {
      setAdding((prev) => { const s = new Set(prev); s.delete(track.id); return s; });
    }
  };

  const sourceName = playlists.find((p) => p.id === sourceId)?.name ?? "";

  return (
    <div
      ref={backdropRef}
      onClick={(e) => { if (e.target === backdropRef.current) onClose(); }}
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)" }}
    >
      <div
        className="w-full max-w-md rounded-3xl overflow-hidden shadow-2xl border border-white/[0.08] flex flex-col"
        style={{ background: "var(--surface)", maxHeight: "min(82vh, calc(100vh - 32px))" }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 pt-4 pb-4 border-b border-white/[0.06]">
          {sourceId ? (
            <button
              onClick={() => { setSourceId(null); setSourceTracks([]); setAdded(new Set()); }}
              className="shrink-0 p-2 rounded-xl text-white/30 hover:text-white hover:bg-white/[0.08] transition-colors"
            >
              <ArrowLeft size={16} />
            </button>
          ) : (
            <div className="w-10 h-10 shrink-0 rounded-xl flex items-center justify-center" style={{ background: "var(--card)" }}>
              <ListMusic size={18} className="text-[#E8282B]/70" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-white/30 mb-0.5">
              {sourceId ? "Select tracks to add" : "Add from playlist"}
            </p>
            <p className="text-white font-semibold text-sm truncate leading-tight">
              {sourceId ? sourceName : `→ ${targetPlaylistName}`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 p-2 rounded-xl text-white/30 hover:text-white hover:bg-white/[0.08] transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Error banner */}
        {error && (
          <div className="mx-3 mt-2 rounded-xl border border-[#E8282B]/25 bg-[#E8282B]/8 px-3 py-2 flex items-center gap-2">
            <AlertCircle size={13} className="text-[#E8282B] shrink-0" />
            <p className="text-white/60 text-xs flex-1">{error}</p>
            <button onClick={() => setError(null)} className="text-white/25 hover:text-white shrink-0"><X size={12} /></button>
          </div>
        )}

        {/* Body */}
        <div className="px-2 py-2 flex-1 overflow-y-auto min-h-0 space-y-0.5">
          {!sourceId ? (
            // Playlist picker
            loadingPlaylists ? (
              <div className="flex flex-col items-center justify-center py-10 gap-3">
                <Loader2 size={22} className="animate-spin text-[#E8282B]/60" />
                <p className="text-white/25 text-xs">Loading playlists…</p>
              </div>
            ) : playlists.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <ListMusic size={28} className="text-white/15" />
                <p className="text-white/30 text-sm">No other playlists</p>
              </div>
            ) : (
              playlists.map((pl) => (
                <button
                  key={pl.id}
                  onClick={() => openSource(pl.id)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-left hover:bg-white/[0.05] border border-transparent transition-all"
                >
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
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate text-white">{pl.name}</p>
                    <p className="text-[11px] text-white/30 mt-0.5">{pl.tracks?.total ?? 0} tracks</p>
                  </div>
                </button>
              ))
            )
          ) : (
            // Track list from source playlist
            loadingTracks ? (
              <div className="flex flex-col items-center justify-center py-10 gap-3">
                <Loader2 size={22} className="animate-spin text-[#E8282B]/60" />
                <p className="text-white/25 text-xs">Loading tracks…</p>
              </div>
            ) : sourceTracks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <Music size={28} className="text-white/15" />
                <p className="text-white/30 text-sm">No tracks in this playlist</p>
              </div>
            ) : (
              sourceTracks.map((track) => {
                const isAdding = adding.has(track.id);
                const isAdded = added.has(track.id);
                return (
                  <div key={track.id} className="flex items-center gap-3 px-3 py-2.5 rounded-2xl hover:bg-white/[0.04] transition-colors">
                    <div className="relative w-9 h-9 rounded-lg shrink-0 overflow-hidden" style={{ background: "var(--card)" }}>
                      {track.track_image ? (
                        <Image src={track.track_image} alt={track.track_name} fill unoptimized sizes="36px" className="object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Music size={12} className="text-white/20" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate text-white leading-tight">{track.track_name}</p>
                      {track.track_artist && (
                        <p className="text-[11px] text-white/35 truncate mt-0.5">{track.track_artist}</p>
                      )}
                    </div>
                    <button
                      onClick={() => addTrack(track)}
                      disabled={isAdding || isAdded}
                      className={`shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-all ${
                        isAdded
                          ? "bg-white/[0.07] text-white/40"
                          : "bg-[#E8282B]/15 text-[#E8282B] hover:bg-[#E8282B]/25"
                      } disabled:cursor-default`}
                    >
                      {isAdding ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : isAdded ? (
                        <Check size={13} />
                      ) : (
                        <Plus size={13} />
                      )}
                    </button>
                  </div>
                );
              })
            )
          )}
        </div>
      </div>
    </div>
  );
}
