"use client";

import { useEffect, useState } from "react";
import { ListMusic, Plus, Pencil, Pin, Loader2, X, Check, Trash2, ChevronDown, Music, Play, Trash, PlayCircle, GripVertical, ListPlus } from "lucide-react";
import {
  DndContext, closestCenter, PointerSensor, TouchSensor,
  useSensor, useSensors, DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, verticalListSortingStrategy,
  useSortable, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { SpotifyPlaylist } from "@/types";
import Image from "next/image";
import { useToastStore } from "@/store/toast";
import { usePlayerStore, PlayableTrack } from "@/store/player";
import AddToPlaylistModal from "@/components/playlist/AddToPlaylistModal";

interface EditState { id: string; name: string; description: string; }
interface PinnedRow { playlist_id: string; }
interface PlaylistTrack { id: string; track_uri: string; track_name: string; track_image?: string | null; track_artist?: string | null; added_at: string; position: number; }

// ── Sortable track row ──────────────────────────────────────────────────────
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
        title="Remove from this playlist"
        className="shrink-0 p-1.5 rounded-lg transition-all hover:bg-red-500/10 hover:text-red-400 disabled:opacity-40 sm:opacity-0 sm:group-hover:opacity-100"
        style={{ color: "rgba(255,255,255,0.25)" }}
      >
        {removingKey === rmKey ? <Loader2 size={12} className="animate-spin" /> : <Trash size={12} />}
      </button>
    </div>
  );
}

// ── Playlist cover: 2x2 grid if track images available, else single image ──
function PlaylistCover({ pl, tracks }: { pl: SpotifyPlaylist; tracks?: PlaylistTrack[] }) {
  const trackImgs = (tracks ?? []).map((t) => t.track_image).filter(Boolean) as string[];
  const grid = [...new Set(trackImgs)].slice(0, 4);
  const single = pl.images?.[0]?.url ?? null;

  if (grid.length >= 2) {
    const cells = [...grid, ...Array(4).fill(null)].slice(0, 4);
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

  if (single) {
    return (
      <div className="relative shrink-0 w-12 h-12">
        <Image src={single} alt={pl.name} fill unoptimized className="rounded-xl object-cover" sizes="48px" />
      </div>
    );
  }

  return (
    <div className="w-12 h-12 rounded-xl shrink-0 flex items-center justify-center" style={{ background: "var(--surface)" }}>
      <ListMusic size={18} style={{ color: "var(--text-muted)" }} />
    </div>
  );
}


export default function PlaylistsClient() {
  const [playlists, setPlaylists] = useState<SpotifyPlaylist[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [saving, setSaving] = useState(false);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [pinned, setPinned] = useState<Set<string>>(new Set());
  const [pinning, setPinning] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [tracksMap, setTracksMap] = useState<Record<string, PlaylistTrack[]>>({});
  const [loadingTracks, setLoadingTracks] = useState<string | null>(null);
  const [removingTrack, setRemovingTrack] = useState<string | null>(null);
  const [addModal, setAddModal] = useState<{ name: string; uri: string; image?: string | null; artist?: string | null } | null>(null);
  const { toast } = useToastStore();
  const { setQueueAndPlay } = usePlayerStore();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } })
  );

  const handleDragEnd = (event: DragEndEvent, playlistId: string) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const tracks = tracksMap[playlistId] ?? [];
    const oldIdx = tracks.findIndex((t) => t.id === active.id);
    const newIdx = tracks.findIndex((t) => t.id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    const reordered = arrayMove(tracks, oldIdx, newIdx);
    // Optimistic update
    setTracksMap((prev) => ({ ...prev, [playlistId]: reordered }));
    // Persist to server
    fetch(`/api/spotify/playlists/${playlistId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order: reordered.map((t) => t.id) }),
    }).catch(() => toast("Could not save order"));
  };

  const load = async () => {
    setLoading(true);
    try {
      const [plRes, pinRes] = await Promise.all([
        fetch("/api/spotify/playlists"),
        fetch("/api/pinned"),
      ]);
      if (!plRes.ok) throw new Error("Failed to load playlists");
      if (!pinRes.ok) throw new Error("Failed to load pinned state");
      const plData = await plRes.json();
      const pinData = (await pinRes.json()) as PinnedRow[];
      setPlaylists(plData.items ?? []);
      setPinned(new Set(pinData.map((p) => p.playlist_id)));
    } catch (e) {
      toast((e as Error).message ?? "Could not load playlists");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // Eagerly fetch tracks for all playlists so cover art is available immediately
  useEffect(() => {
    if (playlists.length === 0) return;
    playlists.forEach((pl) => {
      if (tracksMap[pl.id]) return; // already loaded
      fetch(`/api/spotify/playlists/${pl.id}`)
        .then((r) => r.json())
        .then((data) => setTracksMap((prev) => ({ ...prev, [pl.id]: data.items ?? [] })))
        .catch(() => {});
    });
  }, [playlists]);

  // Listen for tracks being added via AddToPlaylistModal and refresh immediately
  useEffect(() => {
    const handler = (e: Event) => {
      const { playlistId } = (e as CustomEvent<{ playlistId: string }>).detail;
      // Update track count in header
      setPlaylists((prev) =>
        prev.map((p) =>
          p.id === playlistId ? { ...p, tracks: { total: (p.tracks?.total ?? 0) + 1 } } : p
        )
      );
      // If this playlist is currently expanded, refetch its tracks right away
      if (expandedId === playlistId) {
        fetchTracks(playlistId);
      } else {
        // Clear stale cache so next expand fetches fresh
        setTracksMap((prev) => { const n = { ...prev }; delete n[playlistId]; return n; });
      }
    };
    window.addEventListener("playlist-updated", handler);
    return () => window.removeEventListener("playlist-updated", handler);
  }, [expandedId]);

  const fetchTracks = async (id: string) => {
    // Always refetch on expand — cache-bust so browser never serves stale data
    setLoadingTracks(id);
    try {
      const res = await fetch(`/api/spotify/playlists/${id}?_t=${Date.now()}`);
      const data = await res.json();
      setTracksMap((prev) => ({ ...prev, [id]: data.items ?? [] }));
    } catch {
      setTracksMap((prev) => ({ ...prev, [id]: [] }));
    } finally {
      setLoadingTracks(null);
    }
  };

  const toggleExpand = (pl: SpotifyPlaylist) => {
    if (expandedId === pl.id) {
      setExpandedId(null);
    } else {
      setExpandedId(pl.id);
      fetchTracks(pl.id);
    }
  };

  const playTrack = (tracks: PlaylistTrack[], index: number) => {
    const queue: PlayableTrack[] = tracks.map((t) => ({
      name: t.track_name,
      artist: t.track_artist ?? "",
      image: t.track_image ?? undefined,
      uri: t.track_uri,
    }));
    setQueueAndPlay(queue, index);
  };

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
      setPlaylists((prev) =>
        prev.map((p) =>
          p.id === playlistId
            ? { ...p, tracks: { total: Math.max(0, (p.tracks?.total ?? 1) - 1) } }
            : p
        )
      );
    } catch (e) {
      toast((e as Error).message ?? "Could not remove track");
    } finally {
      setRemovingTrack(null);
    }
  };

  const createPlaylist = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/spotify/playlists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), description: newDesc.trim() }),
      });
      if (!res.ok) throw new Error("Failed to create playlist");
      setNewName(""); setNewDesc(""); setCreating(false);
      await load();
    } catch (e) {
      toast((e as Error).message ?? "Could not create playlist");
    } finally {
      setSaving(false);
    }
  };

  const saveEdit = async () => {
    if (!edit) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/spotify/playlists/${edit.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: edit.name, description: edit.description }),
      });
      if (!res.ok) throw new Error("Failed to save changes");
      setEdit(null);
      await load();
    } catch (e) {
      toast((e as Error).message ?? "Could not save playlist");
    } finally {
      setSaving(false);
    }
  };

  const togglePin = async (pl: SpotifyPlaylist) => {
    setPinning(pl.id);
    try {
      if (pinned.has(pl.id)) {
        const res = await fetch("/api/pinned", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ playlist_id: pl.id }),
        });
        if (!res.ok) throw new Error("Failed to unpin playlist");
        setPinned((prev) => { const s = new Set(prev); s.delete(pl.id); return s; });
      } else {
        const res = await fetch("/api/pinned", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ playlist_id: pl.id, playlist_name: pl.name, playlist_image: pl.images?.[0]?.url ?? "" }),
        });
        if (!res.ok) throw new Error("Failed to pin playlist");
        setPinned((prev) => new Set(prev).add(pl.id));
      }
    } catch (e) {
      toast((e as Error).message ?? "Could not update pin");
    } finally {
      setPinning(null);
    }
  };

  const removePlaylist = async (playlistId: string) => {
    if (!window.confirm("Delete this playlist?")) return;
    setDeleting((prev) => new Set(prev).add(playlistId));
    try {
      const res = await fetch(`/api/spotify/playlists/${playlistId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete playlist");
      setPlaylists((prev) => prev.filter((p) => p.id !== playlistId));
      setPinned((prev) => { const s = new Set(prev); s.delete(playlistId); return s; });
      if (expandedId === playlistId) setExpandedId(null);
    } catch (e) {
      toast((e as Error).message ?? "Could not delete playlist");
    } finally {
      setDeleting((prev) => { const s = new Set(prev); s.delete(playlistId); return s; });
    }
  };

  return (
    <div className="w-full space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">Your Playlists</h2>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
            {playlists.length > 0 ? `${playlists.length} playlist${playlists.length !== 1 ? "s" : ""}` : ""}
          </p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-white font-semibold text-sm transition-all active:scale-95 shadow-lg"
          style={{ background: "#E8282B", boxShadow: "0 4px 16px rgba(232,40,43,0.35)" }}
        >
          <Plus size={15} /> New
        </button>
      </div>

      {/* Create form */}
      {creating && (
        <div className="rounded-2xl p-5 space-y-3 border" style={{ background: "var(--surface)", borderColor: "rgba(240,165,0,0.20)" }}>
          <h3 className="text-white font-semibold text-sm">New playlist</h3>
          <input
            autoFocus value={newName} onChange={(e) => setNewName(e.target.value)}
            placeholder="Playlist name"
            className="w-full border text-white placeholder-white/25 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#E8282B]/60 transition-all"
            style={{ background: "var(--card)", borderColor: "rgba(255,255,255,0.08)" }}
          />
          <input
            value={newDesc} onChange={(e) => setNewDesc(e.target.value)}
            placeholder="Description (optional)"
            className="w-full border text-white placeholder-white/25 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#E8282B]/60 transition-all"
            style={{ background: "var(--card)", borderColor: "rgba(255,255,255,0.08)" }}
          />
          <div className="flex gap-2">
            <button
              onClick={createPlaylist} disabled={saving || !newName.trim()}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#E8282B] hover:bg-[#c0201f] disabled:opacity-40 text-white font-semibold text-sm transition-colors"
            >
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Create
            </button>
            <button
              onClick={() => { setCreating(false); setNewName(""); setNewDesc(""); }}
              className="px-4 py-2 rounded-xl text-sm transition-colors"
              style={{ border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.45)" }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Skeleton */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-[72px] rounded-2xl animate-pulse border border-white/[0.05]" style={{ background: "var(--card)" }} />
          ))}
        </div>
      ) : playlists.length === 0 ? (
        <div className="text-center py-24" style={{ color: "var(--text-muted)" }}>
          <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center" style={{ background: "var(--card)" }}>
            <ListMusic size={28} className="opacity-30" />
          </div>
          <p className="text-sm font-medium">No playlists yet</p>
          <p className="text-xs mt-1 opacity-60">Create your first one above</p>
        </div>
      ) : (
        <div className="space-y-3">
          {playlists.map((pl) => {
            const isDeleting = deleting.has(pl.id);
            const isExpanded = expandedId === pl.id;
            const isPinned = pinned.has(pl.id);
            const tracks = tracksMap[pl.id] ?? [];

            return (
              <div
                key={pl.id}
                className={`rounded-2xl overflow-hidden border transition-all duration-200 ${isDeleting ? "opacity-40 pointer-events-none" : ""}`}
                style={{
                  background: "var(--card)",
                  borderColor: isExpanded ? "rgba(240,165,0,0.22)" : "rgba(255,255,255,0.06)",
                }}
              >
                {/* ── Playlist header row ── */}
                <div
                  className={`flex items-center gap-3 px-3 py-3 group transition-colors ${edit?.id !== pl.id ? "cursor-pointer" : ""}`}
                  style={{ background: "transparent" }}
                  onClick={() => { if (edit?.id !== pl.id) toggleExpand(pl); }}
                  onMouseEnter={(e) => { if (edit?.id !== pl.id) (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.025)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
                >

                  {/* Cover art */}
                  <div className="relative shrink-0">
                    <PlaylistCover pl={pl} tracks={tracksMap[pl.id]} />
                    {isPinned && (
                      <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-[#E8282B] border-2 border-[var(--card)]" />
                    )}
                  </div>

                  {/* Info / edit inline */}
                  {edit?.id === pl.id ? (
                    <div className="flex flex-1 gap-2 min-w-0">
                      <input
                        autoFocus value={edit.name}
                        onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                        className="flex-1 min-w-0 border text-white rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:border-[#E8282B]/60 transition-all"
                        style={{ background: "var(--surface)", borderColor: "rgba(255,255,255,0.08)" }}
                      />
                      <button onClick={saveEdit} disabled={saving}
                        className="shrink-0 px-3 py-1.5 rounded-xl bg-[#E8282B] hover:bg-[#c0201f] text-white text-sm font-medium transition-colors">
                        {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                      </button>
                      <button onClick={() => setEdit(null)}
                        className="shrink-0 px-3 py-1.5 rounded-xl border text-sm transition-colors"
                        style={{ borderColor: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.45)" }}>
                        <X size={13} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-semibold truncate leading-tight">{pl.name}</p>
                      <p className="text-xs mt-0.5 truncate" style={{ color: "var(--text-muted)" }}>
                        {pl.tracks?.total ?? 0} tracks{isPinned ? " · Pinned" : ""}
                      </p>
                    </div>
                  )}

                  {/* Action icons */}
                  <div className="flex items-center gap-0.5 shrink-0">
                    {/* Play all — only when expanded and tracks loaded */}
                    {isExpanded && tracks.length > 0 && (
                      <button
                        onClick={(e) => { e.stopPropagation(); playTrack(tracks, 0); }}
                        title="Play all"
                        className="p-1.5 rounded-xl transition-colors"
                        style={{ color: "#E8282B" }}
                      >
                        <PlayCircle size={17} />
                      </button>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); setEdit({ id: pl.id, name: pl.name, description: pl.description ?? "" }); }}
                      title="Edit"
                      className="p-1.5 rounded-xl transition-colors hover:bg-white/[0.07]"
                      style={{ color: "rgba(255,255,255,0.28)" }}
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); togglePin(pl); }}
                      disabled={pinning === pl.id}
                      title={isPinned ? "Unpin" : "Pin"}
                      className="p-1.5 rounded-xl transition-colors"
                      style={{
                        color: isPinned ? "#E8282B" : "rgba(255,255,255,0.28)",
                        background: isPinned ? "rgba(147,51,234,0.12)" : "transparent",
                      }}
                    >
                      {pinning === pl.id ? <Loader2 size={13} className="animate-spin" /> : <Pin size={13} />}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); removePlaylist(pl.id); }}
                      disabled={isDeleting}
                      title="Delete"
                      className="p-1.5 rounded-xl transition-colors hover:bg-red-500/10 hover:text-red-400 disabled:opacity-40"
                      style={{ color: "rgba(255,255,255,0.22)" }}
                    >
                      {isDeleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                    </button>
                    <div
                      className="p-1.5 rounded-xl ml-0.5 pointer-events-none"
                      style={{ color: "rgba(255,255,255,0.25)" }}
                    >
                      <ChevronDown size={15} className={`transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} />
                    </div>
                  </div>
                </div>

                {/* ── Track list ── */}
                {isExpanded && (
                  <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)", background: "var(--surface)" }}>
                    {loadingTracks === pl.id ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 size={18} className="animate-spin" style={{ color: "rgba(255,255,255,0.20)" }} />
                      </div>
                    ) : tracks.length === 0 ? (
                      <p className="text-center py-8 text-sm" style={{ color: "var(--text-muted)" }}>No tracks yet.</p>
                    ) : (
                      <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={(e) => handleDragEnd(e, pl.id)}
                      >
                        <SortableContext items={tracks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                          <div>
                            {tracks.map((t, i) => (
                              <SortableTrackRow
                                key={t.id}
                                track={t}
                                index={i}
                                playlistId={pl.id}
                                onPlay={() => playTrack(tracks, i)}
                                onRemove={() => removeTrack(pl.id, t.id)}
                                onAddToPlaylist={() => setAddModal({ name: t.track_name, uri: t.track_uri, image: t.track_image, artist: t.track_artist })}
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
      )}

      {addModal && (
        <AddToPlaylistModal track={addModal} onClose={() => setAddModal(null)} />
      )}
    </div>
  );
}
