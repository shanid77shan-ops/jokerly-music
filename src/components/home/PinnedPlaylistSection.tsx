"use client";

import { useState, useCallback, useEffect } from "react";
import Image from "next/image";
import { Pin, ChevronDown, Music, Play, Loader2, PlayCircle, GripVertical, ListPlus, Trash } from "lucide-react";
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

// ── Sortable track row ─────────────────────────────────────────────────────
function SortableTrackRow({
  track, index, playlistId, onPlay, onRemove, onAddToPlaylist, removingKey,
}: {
  track: PlaylistTrack;
  index: number;
  playlistId: string;
  onPlay: () => void;
  onRemove: () => void;
  onAddToPlaylist: () => void;
  removingKey: string | null;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: track.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    position: "relative",
    zIndex: isDragging ? 10 : undefined,
  };

  const rmKey = `${playlistId}::${track.id}`;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 px-2 py-2.5 group transition-colors cursor-pointer"
      onClick={onPlay}
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        onClick={(e) => e.stopPropagation()}
        className="shrink-0 p-1 rounded cursor-grab active:cursor-grabbing text-white/20 hover:text-white/50 transition-colors touch-none"
        title="Drag to reorder"
      >
        <GripVertical size={14} />
      </button>

      {/* Track number / play indicator */}
      <div className="w-5 shrink-0 flex items-center justify-center">
        <span className="text-xs tabular-nums group-hover:hidden" style={{ color: "var(--text-muted)" }}>{index + 1}</span>
        <Play size={12} fill="currentColor" className="hidden group-hover:block text-[#E8282B]" />
      </div>

      {/* Album art */}
      <div className="relative w-9 h-9 rounded-lg shrink-0 overflow-hidden" style={{ background: "var(--card)" }}>
        {track.track_image ? (
          <Image src={track.track_image} alt={track.track_name} fill unoptimized sizes="36px" className="object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Music size={12} style={{ color: "var(--text-muted)" }} />
          </div>
        )}
      </div>

      {/* Track info */}
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-medium truncate leading-tight">{track.track_name}</p>
        {track.track_artist && (
          <p className="text-xs truncate mt-0.5" style={{ color: "var(--text-muted)" }}>{track.track_artist}</p>
        )}
      </div>

      {/* Add to another playlist */}
      <button
        onClick={(e) => { e.stopPropagation(); onAddToPlaylist(); }}
        title="Add to playlist"
        className="shrink-0 p-1.5 rounded-lg transition-all text-[#E8282B]/50 hover:text-[#E8282B] hover:bg-[#E8282B]/10 sm:opacity-0 sm:group-hover:opacity-100"
      >
        <ListPlus size={13} />
      </button>

      {/* Remove */}
      <button
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        disabled={removingKey === rmKey}
        title="Remove from playlist"
        className="shrink-0 p-1.5 rounded-lg transition-all hover:bg-red-500/10 hover:text-red-400 disabled:opacity-40 sm:opacity-0 sm:group-hover:opacity-100"
        style={{ color: "rgba(255,255,255,0.25)" }}
      >
        {removingKey === rmKey ? <Loader2 size={12} className="animate-spin" /> : <Trash size={12} />}
      </button>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────
export default function PinnedPlaylistSection({ pinned }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [tracksMap, setTracksMap] = useState<Record<string, PlaylistTrack[]>>({});
  const [loading, setLoading] = useState<string | null>(null);
  const [removingTrack, setRemovingTrack] = useState<string | null>(null);
  const [addModal, setAddModal] = useState<{ name: string; uri: string; image?: string | null; artist?: string | null } | null>(null);
  const { setQueueAndPlay, isPlayerReady } = usePlayerStore();
  const { toast } = useToastStore();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } })
  );

  // Listen for tracks added via AddToPlaylistModal and refresh immediately
  useEffect(() => {
    const handler = (e: Event) => {
      const { playlistId } = (e as CustomEvent<{ playlistId: string }>).detail;
      if (expanded === playlistId) {
        // Playlist is open — refetch live
        fetch(`/api/spotify/playlists/${encodeURIComponent(playlistId)}?_t=${Date.now()}`)
          .then((r) => r.ok ? r.json() : null)
          .then((data) => {
            if (data) setTracksMap((prev) => ({ ...prev, [playlistId]: data.items ?? [] }));
          })
          .catch(() => {});
      } else {
        // Clear stale cache so next expand fetches fresh
        setTracksMap((prev) => { const n = { ...prev }; delete n[playlistId]; return n; });
      }
    };
    window.addEventListener("playlist-updated", handler);
    return () => window.removeEventListener("playlist-updated", handler);
  }, [expanded]);

  // Prefetch all pinned playlist tracks in background
  useEffect(() => {
    if (!pinned.length) return;
    const controller = new AbortController();
    const prefetch = async () => {
      for (const pl of pinned) {
        if (controller.signal.aborted) break;
        try {
          const res = await fetch(
            `/api/spotify/playlists/${encodeURIComponent(pl.playlist_id)}?_t=${Date.now()}`,
            { signal: controller.signal }
          );
          if (!res.ok) continue;
          const data = await res.json();
          setTracksMap((prev) => prev[pl.playlist_id] ? prev : { ...prev, [pl.playlist_id]: data.items ?? [] });
        } catch { /* ignore abort / errors */ }
      }
    };
    prefetch();
    return () => controller.abort();
  }, [pinned]);

  const toggle = useCallback(
    async (playlistId: string) => {
      if (expanded === playlistId) { setExpanded(null); return; }
      setExpanded(playlistId);
      // Always refetch on expand for freshness
      setLoading(playlistId);
      try {
        const res = await fetch(`/api/spotify/playlists/${encodeURIComponent(playlistId)}?_t=${Date.now()}`);
        if (!res.ok) throw new Error("Failed to load tracks");
        const data = await res.json();
        setTracksMap((prev) => ({ ...prev, [playlistId]: data.items ?? [] }));
      } catch (e) {
        toast((e as Error).message ?? "Could not load playlist tracks");
        setTracksMap((prev) => ({ ...prev, [playlistId]: [] }));
      } finally {
        setLoading(null);
      }
    },
    [expanded, toast]
  );

  const playAll = useCallback(
    (playlistId: string, startIndex = 0) => {
      const list = tracksMap[playlistId] ?? [];
      if (!list.length) return;
      const queue: PlayableTrack[] = list.map((t) => ({
        name: t.track_name,
        artist: t.track_artist ?? "",
        image: t.track_image ?? undefined,
        uri: t.track_uri,
      }));
      setQueueAndPlay(queue, startIndex);
    },
    [tracksMap, setQueueAndPlay]
  );

  const removeTrack = async (playlistId: string, trackId: string) => {
    const key = `${playlistId}::${trackId}`;
    setRemovingTrack(key);
    try {
      const res = await fetch(`/api/spotify/playlists/${playlistId}/tracks`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackId }),
      });
      if (!res.ok) throw new Error("Failed to remove track");
      setTracksMap((prev) => ({
        ...prev,
        [playlistId]: (prev[playlistId] ?? []).filter((t) => t.id !== trackId),
      }));
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
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
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

  return (
    <>
      <div className="space-y-3">
        {pinned.map((pl) => {
          const isOpen = expanded === pl.playlist_id;
          const isLoading = loading === pl.playlist_id;
          const list = tracksMap[pl.playlist_id] ?? [];

          return (
            <div
              key={pl.id}
              className="rounded-2xl overflow-hidden border transition-all duration-200"
              style={{
                background: "var(--card)",
                borderColor: isOpen ? "rgba(239,68,68,0.22)" : "rgba(255,255,255,0.06)",
              }}
            >
              {/* ── Header row ── */}
              <div
                className="flex items-center gap-3 px-3 py-3 cursor-pointer transition-colors"
                style={{ background: "transparent" }}
                onClick={() => toggle(pl.playlist_id)}
                onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.025)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
              >
                <div className="relative shrink-0">
                  {(() => {
                    const imgs = [...new Set(
                      (tracksMap[pl.playlist_id] ?? []).map((t) => t.track_image).filter(Boolean) as string[]
                    )].slice(0, 4);
                    if (imgs.length >= 2) {
                      const cells = [...imgs, ...Array(4).fill(null)].slice(0, 4);
                      return (
                        <div className="w-12 h-12 rounded-xl overflow-hidden grid grid-cols-2 shrink-0">
                          {cells.map((img, i) => (
                            <div key={i} className="relative w-6 h-6" style={{ background: "var(--surface)" }}>
                              {img && <Image src={img} alt="" fill unoptimized sizes="24px" className="object-cover" />}
                            </div>
                          ))}
                        </div>
                      );
                    }
                    if (pl.playlist_image) {
                      return <Image src={pl.playlist_image} alt={pl.playlist_name} width={48} height={48} unoptimized className="rounded-xl object-cover w-12 h-12" />;
                    }
                    return (
                      <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: "var(--surface)" }}>
                        <Pin size={18} style={{ color: "var(--text-muted)" }} />
                      </div>
                    );
                  })()}
                  <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-[#E8282B] border-2" style={{ borderColor: "var(--card)" }} />
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-semibold truncate leading-tight">{pl.playlist_name}</p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                    {isLoading ? "Loading…" : list.length > 0 ? `${list.length} tracks` : isOpen ? "No tracks" : "Tap to expand"}
                  </p>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {isOpen && list.length > 0 && (
                    <button
                      onClick={(e) => { e.stopPropagation(); playAll(pl.playlist_id, 0); }}
                      disabled={!isPlayerReady}
                      title="Play all"
                      className="p-1.5 rounded-xl transition-colors disabled:opacity-40"
                      style={{ color: "#E8282B" }}
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
                    <p className="text-center py-8 text-sm" style={{ color: "var(--text-muted)" }}>No tracks yet.</p>
                  ) : (
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragEnd={(e) => handleDragEnd(e, pl.playlist_id)}
                    >
                      <SortableContext items={list.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                        <div>
                          {list.map((track, i) => (
                            <SortableTrackRow
                              key={track.id}
                              track={track}
                              index={i}
                              playlistId={pl.playlist_id}
                              onPlay={() => playAll(pl.playlist_id, i)}
                              onRemove={() => removeTrack(pl.playlist_id, track.id)}
                              onAddToPlaylist={() => setAddModal({ name: track.track_name, uri: track.track_uri, image: track.track_image, artist: track.track_artist })}
                              removingKey={removingTrack}
                            />
                          ))}
                        </div>
                      </SortableContext>
                    </DndContext>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {addModal && (
        <AddToPlaylistModal track={addModal} onClose={() => setAddModal(null)} />
      )}
    </>
  );
}
