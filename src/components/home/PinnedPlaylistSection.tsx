"use client";

import { useState, useCallback, useEffect } from "react";
import Image from "next/image";
import { Pin, Music, Play, Loader2, PlayCircle, GripVertical, ListPlus, Trash, ArrowLeft, ListMusic, FolderInput } from "lucide-react";
import {
  DndContext, closestCenter, PointerSensor, TouchSensor,
  useSensor, useSensors, DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, verticalListSortingStrategy,
  useSortable, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { PinnedPlaylist } from "@/types";
import { usePlayerStore, PlayableTrack } from "@/store/player";
import { useToastStore } from "@/store/toast";
import AddToPlaylistModal from "@/components/playlist/AddToPlaylistModal";
import AddFromPlaylistModal from "@/components/playlist/AddFromPlaylistModal";

interface PlaylistTrack {
  id: string;
  track_uri: string;
  track_name: string;
  track_image?: string | null;
  track_artist?: string | null;
  added_at: string;
  position: number;
}

interface Props {
  pinned: PinnedPlaylist[];
}

// ── Cover art ──────────────────────────────────────────────────────────────
function CoverArt({ tracks, imageUrl, name, size = 130 }: { tracks?: PlaylistTrack[]; imageUrl?: string | null; name: string; size?: number }) {
  const imgs = [...new Set(
    (tracks ?? []).map((t) => t.track_image).filter(Boolean) as string[]
  )].slice(0, 4);

  if (imgs.length >= 2) {
    const cells = [...imgs, ...Array(4).fill(null)].slice(0, 4);
    return (
      <div className="w-full h-full overflow-hidden grid grid-cols-2">
        {cells.map((img, i) => (
          <div key={i} className="relative" style={{ background: "var(--surface)" }}>
            {img && <Image src={img} alt="" fill unoptimized sizes={`${size / 2}px`} className="object-cover" />}
          </div>
        ))}
      </div>
    );
  }
  if (imageUrl) {
    return <Image src={imageUrl} alt={name} fill unoptimized className="object-cover" sizes={`${size}px`} />;
  }
  return (
    <div className="w-full h-full flex items-center justify-center" style={{ background: "var(--surface)" }}>
      <ListMusic size={size / 4} style={{ color: "var(--text-muted)", opacity: 0.4 }} />
    </div>
  );
}

// ── Sortable track row ─────────────────────────────────────────────────────
function SortableTrackRow({
  track, index, playlistId, onPlay, onRemove, onAddToPlaylist, removingKey,
}: {
  track: PlaylistTrack; index: number; playlistId: string;
  onPlay: () => void; onRemove: () => void; onAddToPlaylist: () => void; removingKey: string | null;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: track.id });
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const isCurrentlyPlaying = isPlaying && !!currentTrack?.uri && currentTrack.uri === track.track_uri;

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    position: "relative",
    zIndex: isDragging ? 10 : undefined,
  };

  const rmKey = `${playlistId}::${track.id}`;

  return (
    <div ref={setNodeRef} style={style}
      className="flex items-center gap-2 px-3 py-2.5 group transition-colors cursor-pointer hover:bg-white/[0.03]"
      onClick={onPlay}
    >
      <button {...attributes} {...listeners} onClick={(e) => e.stopPropagation()}
        className="shrink-0 p-1 rounded cursor-grab active:cursor-grabbing text-white/20 hover:text-white/50 transition-colors touch-none">
        <GripVertical size={14} />
      </button>
      <div className="w-5 shrink-0 flex items-center justify-center">
        {isCurrentlyPlaying ? (
          <div className="flex items-end gap-px h-4">
            <span className="eq-bar" /><span className="eq-bar" /><span className="eq-bar" />
          </div>
        ) : (
          <>
            <span className="text-xs tabular-nums group-hover:hidden" style={{ color: "var(--text-muted)" }}>{index + 1}</span>
            <Play size={12} fill="currentColor" className="hidden group-hover:block text-[#E8282B]" />
          </>
        )}
      </div>
      <div className="relative w-9 h-9 rounded-lg shrink-0 overflow-hidden" style={{ background: "var(--card)" }}>
        {track.track_image ? (
          <Image src={track.track_image} alt={track.track_name} fill unoptimized sizes="36px" className="object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Music size={12} style={{ color: "var(--text-muted)" }} />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium truncate leading-tight ${isCurrentlyPlaying ? "text-[#E8282B]" : "text-white"}`}>{track.track_name}</p>
        {track.track_artist && (
          <p className="text-xs truncate mt-0.5" style={{ color: "var(--text-muted)" }}>{track.track_artist}</p>
        )}
      </div>
      <button onClick={(e) => { e.stopPropagation(); onAddToPlaylist(); }}
        className="shrink-0 p-1.5 rounded-lg transition-all text-[#E8282B]/50 hover:text-[#E8282B] hover:bg-[#E8282B]/10 sm:opacity-0 sm:group-hover:opacity-100">
        <ListPlus size={13} />
      </button>
      <button onClick={(e) => { e.stopPropagation(); onRemove(); }}
        disabled={removingKey === rmKey}
        className="shrink-0 p-1.5 rounded-lg transition-all hover:bg-red-500/10 hover:text-red-400 disabled:opacity-40 sm:opacity-0 sm:group-hover:opacity-100"
        style={{ color: "rgba(255,255,255,0.25)" }}>
        {removingKey === rmKey ? <Loader2 size={12} className="animate-spin" /> : <Trash size={12} />}
      </button>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────
export default function PinnedPlaylistSection({ pinned }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tracksMap, setTracksMap] = useState<Record<string, PlaylistTrack[]>>({});
  const [loading, setLoading] = useState<string | null>(null);
  const [removingTrack, setRemovingTrack] = useState<string | null>(null);
  const [addModal, setAddModal] = useState<{ name: string; uri: string; image?: string | null; artist?: string | null } | null>(null);
  const [addFromPlaylist, setAddFromPlaylist] = useState(false);
  const { setQueueAndPlay, isPlayerReady } = usePlayerStore();
  const { toast } = useToastStore();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } })
  );

  // Prefetch all pinned playlist tracks for cover art
  useEffect(() => {
    if (!pinned.length) return;
    const controller = new AbortController();
    const prefetch = async () => {
      for (const pl of pinned) {
        if (controller.signal.aborted) break;
        try {
          const res = await fetch(`/api/spotify/playlists/${encodeURIComponent(pl.playlist_id)}`, { signal: controller.signal });
          if (!res.ok) continue;
          const data = await res.json();
          setTracksMap((prev) => prev[pl.playlist_id] ? prev : { ...prev, [pl.playlist_id]: data.items ?? [] });
        } catch { /* ignore */ }
      }
    };
    prefetch();
    return () => controller.abort();
  }, [pinned]);

  useEffect(() => {
    const handler = (e: Event) => {
      const { playlistId } = (e as CustomEvent<{ playlistId: string }>).detail;
      if (selectedId === playlistId) fetchTracks(playlistId);
      else setTracksMap((prev) => { const n = { ...prev }; delete n[playlistId]; return n; });
    };
    window.addEventListener("playlist-updated", handler);
    return () => window.removeEventListener("playlist-updated", handler);
  }, [selectedId]);

  const fetchTracks = useCallback(async (id: string) => {
    setLoading(id);
    try {
      const res = await fetch(`/api/spotify/playlists/${encodeURIComponent(id)}?_t=${Date.now()}`);
      if (!res.ok) throw new Error("Failed to load tracks");
      const data = await res.json();
      setTracksMap((prev) => ({ ...prev, [id]: data.items ?? [] }));
    } catch (e) {
      toast((e as Error).message ?? "Could not load playlist tracks");
    } finally {
      setLoading(null);
    }
  }, [toast]);

  const openPlaylist = (id: string) => {
    setSelectedId(id);
    fetchTracks(id);
  };

  const playAll = useCallback((playlistId: string, startIndex = 0) => {
    const list = tracksMap[playlistId] ?? [];
    if (!list.length) return;
    const queue: PlayableTrack[] = list.map((t) => ({
      name: t.track_name, artist: t.track_artist ?? "", image: t.track_image ?? undefined, uri: t.track_uri,
    }));
    setQueueAndPlay(queue, startIndex);
  }, [tracksMap, setQueueAndPlay]);

  const removeTrack = async (playlistId: string, trackId: string) => {
    const key = `${playlistId}::${trackId}`;
    setRemovingTrack(key);
    try {
      const res = await fetch(`/api/spotify/playlists/${playlistId}/tracks`, {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackId }),
      });
      if (!res.ok) throw new Error("Failed to remove track");
      setTracksMap((prev) => ({ ...prev, [playlistId]: (prev[playlistId] ?? []).filter((t) => t.id !== trackId) }));
    } catch (e) {
      toast((e as Error).message ?? "Could not remove track");
    } finally {
      setRemovingTrack(null);
    }
  };

  const handleDragEnd = (event: DragEndEvent, playlistId: string) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const tracks = tracksMap[playlistId] ?? [];
    const oldIdx = tracks.findIndex((t) => t.id === active.id);
    const newIdx = tracks.findIndex((t) => t.id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    const reordered = arrayMove(tracks, oldIdx, newIdx);
    setTracksMap((prev) => ({ ...prev, [playlistId]: reordered }));
    fetch(`/api/spotify/playlists/${playlistId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order: reordered.map((t) => t.id) }),
    }).catch(() => toast("Could not save order"));
  };

  if (pinned.length === 0) {
    return (
      <div className="rounded-2xl p-5 text-center border" style={{ background: "var(--card)", borderColor: "rgba(255,255,255,0.06)" }}>
        <Pin size={20} className="mx-auto mb-2 opacity-20" style={{ color: "var(--text-muted)" }} />
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>No pinned playlists yet.</p>
        <p className="text-xs mt-0.5 opacity-60" style={{ color: "var(--text-muted)" }}>Pin playlists from the Playlists page.</p>
      </div>
    );
  }

  // ── Detail view ──────────────────────────────────────────────────────────
  const selectedPl = pinned.find((p) => p.playlist_id === selectedId);
  if (selectedId && selectedPl) {
    const tracks = tracksMap[selectedId] ?? [];
    const isLoadingTracks = loading === selectedId;

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={() => { setSelectedId(null); setAddFromPlaylist(false); }}
            className="flex items-center gap-1.5 text-sm font-medium transition-colors"
            style={{ color: "rgba(255,255,255,0.55)" }}>
            <ArrowLeft size={16} /> Back
          </button>
          <div className="flex-1" />
          <button onClick={() => setAddFromPlaylist(true)}
            title="Add tracks from another playlist"
            className="p-2 rounded-xl hover:bg-white/[0.07] transition-colors"
            style={{ color: "rgba(255,255,255,0.4)" }}>
            <FolderInput size={15} />
          </button>
        </div>

        <div className="flex items-end gap-4">
          <div className="relative w-24 h-24 rounded-2xl overflow-hidden shrink-0 shadow-xl">
            <CoverArt tracks={tracks} imageUrl={selectedPl.playlist_image || null} name={selectedPl.playlist_name} size={96} />
          </div>
          <div className="flex-1 min-w-0 pb-1">
            <p className="text-white text-lg font-bold truncate">{selectedPl.playlist_name}</p>
            <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>{tracks.length} tracks · Pinned</p>
          </div>
        </div>

        {tracks.length > 0 && (
          <button onClick={() => playAll(selectedId, 0)} disabled={!isPlayerReady}
            className="flex items-center gap-2 px-5 py-2.5 rounded-2xl text-white font-bold text-sm transition-all active:scale-95 disabled:opacity-40"
            style={{ background: "#E8282B", boxShadow: "0 4px 16px rgba(232,40,43,0.35)" }}>
            <PlayCircle size={16} /> Play all
          </button>
        )}

        <div className="rounded-2xl overflow-hidden border" style={{ background: "var(--card)", borderColor: "rgba(255,255,255,0.06)" }}>
          {isLoadingTracks ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={20} className="animate-spin" style={{ color: "rgba(255,255,255,0.2)" }} />
            </div>
          ) : tracks.length === 0 ? (
            <p className="text-center py-12 text-sm" style={{ color: "var(--text-muted)" }}>No tracks yet.</p>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => handleDragEnd(e, selectedId)}>
              <SortableContext items={tracks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                <div>
                  {tracks.map((track, i) => (
                    <SortableTrackRow key={track.id} track={track} index={i} playlistId={selectedId}
                      onPlay={() => playAll(selectedId, i)}
                      onRemove={() => removeTrack(selectedId, track.id)}
                      onAddToPlaylist={() => setAddModal({ name: track.track_name, uri: track.track_uri, image: track.track_image, artist: track.track_artist })}
                      removingKey={removingTrack} />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>

        {addModal && <AddToPlaylistModal track={addModal} onClose={() => setAddModal(null)} />}
        {addFromPlaylist && selectedPl && (
          <AddFromPlaylistModal
            targetPlaylistId={selectedPl.playlist_id}
            targetPlaylistName={selectedPl.playlist_name}
            onClose={() => setAddFromPlaylist(false)}
            onTracksAdded={() => fetchTracks(selectedPl.playlist_id)}
          />
        )}
      </div>
    );
  }

  // ── Grid view ────────────────────────────────────────────────────────────
  return (
    <>
      <div className="grid grid-cols-5 gap-1.5">
        {pinned.map((pl) => {
          const tracks = tracksMap[pl.playlist_id];
          return (
            <div key={pl.id}
              onClick={() => openPlaylist(pl.playlist_id)}
              className="rounded-lg overflow-hidden border cursor-pointer transition-all duration-200 active:scale-[0.97] hover:border-white/[0.12]"
              style={{ background: "var(--card)", borderColor: "rgba(255,255,255,0.07)" }}
            >
              <div className="relative aspect-square w-full overflow-hidden" style={{ background: "var(--surface)" }}>
                <CoverArt tracks={tracks} imageUrl={pl.playlist_image || null} name={pl.playlist_name} size={80} />
                <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-[#E8282B] border border-black/20 shadow" />
              </div>
              <div className="px-1 py-1">
                <p className="text-white text-[9px] font-semibold truncate leading-tight">{pl.playlist_name}</p>
              </div>
            </div>
          );
        })}
      </div>

      {addModal && <AddToPlaylistModal track={addModal} onClose={() => setAddModal(null)} />}
    </>
  );
}
