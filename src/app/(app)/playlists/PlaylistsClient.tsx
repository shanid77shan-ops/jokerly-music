"use client";

import { useEffect, useState } from "react";
import { ListMusic, Plus, Pencil, Pin, Loader2, X, Check, Trash2, Music, Play, Trash, PlayCircle, GripVertical, ListPlus, ArrowLeft, FolderInput, UserCircle2, Mic2, Heart, Share2 } from "lucide-react";
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
import AddFromPlaylistModal from "@/components/playlist/AddFromPlaylistModal";
import ExportToYouTubeMusicModal from "@/components/export/ExportToYouTubeMusicModal";
import ArtistSheet from "@/components/music/ArtistSheet";
import { SpotifyArtist } from "@/types/spotify";
import { useLikesStore } from "@/store/likes";

interface EditState { id: string; name: string; description: string; }
interface PinnedRow { playlist_id: string; }
interface PlaylistTrack { id: string; track_uri: string; track_name: string; track_image?: string | null; track_artist?: string | null; added_at: string; position: number; }
interface PinnedArtist { id: string; artist_id: string; artist_name: string; artist_image: string; }

// ── Sortable track row ──────────────────────────────────────────────────────
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
  const { load: loadLikes, songUris, toggleSong } = useLikesStore();
  const isLiked = songUris.has(track.track_uri);
  useEffect(() => { loadLikes(); }, [loadLikes]);

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
      <button
        onClick={(e) => { e.stopPropagation(); toggleSong({ uri: track.track_uri, name: track.track_name, image: track.track_image ?? null, artist: track.track_artist ?? null }); }}
        title={isLiked ? "Unlike" : "Like"}
        className={`shrink-0 p-1.5 rounded-lg transition-all ${isLiked ? "text-[#E8282B]" : "text-white/25 hover:text-[#E8282B] hover:bg-[#E8282B]/10 sm:opacity-0 sm:group-hover:opacity-100"}`}
      >
        <Heart size={12} fill={isLiked ? "currentColor" : "none"} />
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

// ── Cover art: 2x2 grid or single image ─────────────────────────────────────
function CoverArt({ tracks, imageUrl, name, size = 160 }: { tracks?: PlaylistTrack[]; imageUrl?: string | null; name: string; size?: number }) {
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

// ── Main component ──────────────────────────────────────────────────────────
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tracksMap, setTracksMap] = useState<Record<string, PlaylistTrack[]>>({});
  const [loadingTracks, setLoadingTracks] = useState<string | null>(null);
  const [removingTrack, setRemovingTrack] = useState<string | null>(null);
  const [addModal, setAddModal] = useState<{ name: string; uri: string; image?: string | null; artist?: string | null } | null>(null);
  const [addFromPlaylist, setAddFromPlaylist] = useState(false);
  const [exportModal, setExportModal] = useState(false);
  const [pinnedArtists, setPinnedArtists] = useState<PinnedArtist[]>([]);
  const [selectedArtist, setSelectedArtist] = useState<SpotifyArtist | null>(null);
  const { toast } = useToastStore();
  const { setQueueAndPlay } = usePlayerStore();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } })
  );

  const selectedPlaylist = playlists.find((p) => p.id === selectedId) ?? null;

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

  const load = async () => {
    setLoading(true);
    try {
      const [plRes, pinRes] = await Promise.all([
        fetch("/api/spotify/playlists", { cache: "no-store" }),
        fetch("/api/pinned", { cache: "no-store" }),
      ]);
      if (!plRes.ok) throw new Error("Failed to load playlists");
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

  useEffect(() => {
    const fetchPinnedArtists = () =>
      fetch("/api/pinned-artists").then((r) => r.json()).then((d) => { if (Array.isArray(d)) setPinnedArtists(d); }).catch(() => {});
    fetchPinnedArtists();
    window.addEventListener("pinned-artists-updated", fetchPinnedArtists);
    return () => window.removeEventListener("pinned-artists-updated", fetchPinnedArtists);
  }, []);

  useEffect(() => {
    if (playlists.length === 0) return;
    playlists.forEach((pl) => {
      if (tracksMap[pl.id]) return;
      fetch(`/api/spotify/playlists/${pl.id}`)
        .then((r) => r.json())
        .then((data) => setTracksMap((prev) => ({ ...prev, [pl.id]: data.items ?? [] })))
        .catch(() => {});
    });
  }, [playlists]);

  useEffect(() => {
    const handler = (e: Event) => {
      const { playlistId } = (e as CustomEvent<{ playlistId: string }>).detail;
      setPlaylists((prev) => prev.map((p) =>
        p.id === playlistId ? { ...p, tracks: { total: (p.tracks?.total ?? 0) + 1 } } : p
      ));
      if (selectedId === playlistId) fetchTracks(playlistId);
      else setTracksMap((prev) => { const n = { ...prev }; delete n[playlistId]; return n; });
    };
    window.addEventListener("playlist-updated", handler);
    return () => window.removeEventListener("playlist-updated", handler);
  }, [selectedId]);

  const fetchTracks = async (id: string) => {
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

  const openPlaylist = (pl: SpotifyPlaylist) => {
    setSelectedId(pl.id);
    fetchTracks(pl.id);
  };

  const playTrack = (tracks: PlaylistTrack[], index: number) => {
    const queue: PlayableTrack[] = tracks.map((t) => ({
      name: t.track_name, artist: t.track_artist ?? "", image: t.track_image ?? undefined, uri: t.track_uri,
    }));
    setQueueAndPlay(queue, index);
  };

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
      setPlaylists((prev) => prev.map((p) =>
        p.id === playlistId ? { ...p, tracks: { total: Math.max(0, (p.tracks?.total ?? 1) - 1) } } : p
      ));
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
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), description: newDesc.trim() }),
      });
      if (!res.ok) throw new Error("Failed to create playlist");
      const created = (await res.json()) as SpotifyPlaylist;

      setPlaylists((prev) => [created, ...prev.filter((p) => p.id !== created.id)]);
      setTracksMap((prev) => ({ ...prev, [created.id]: prev[created.id] ?? [] }));
      setNewName(""); setNewDesc(""); setCreating(false);
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
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: edit.name, description: edit.description }),
      });
      if (!res.ok) throw new Error("Failed to save changes");
      // Update in place — no full reload needed, no skeleton flash.
      setPlaylists((prev) => prev.map((p) =>
        p.id === edit.id ? { ...p, name: edit.name, description: edit.description } : p
      ));
      setEdit(null);
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
        await fetch("/api/pinned", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ playlist_id: pl.id }) });
        setPinned((prev) => { const s = new Set(prev); s.delete(pl.id); return s; });
        window.dispatchEvent(new CustomEvent("pinned-playlists-updated"));
      } else {
        await fetch("/api/pinned", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ playlist_id: pl.id, playlist_name: pl.name, playlist_image: pl.images?.[0]?.url ?? "" }) });
        setPinned((prev) => new Set(prev).add(pl.id));
        window.dispatchEvent(new CustomEvent("pinned-playlists-updated"));
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
      if (selectedId === playlistId) setSelectedId(null);
    } catch (e) {
      toast((e as Error).message ?? "Could not delete playlist");
    } finally {
      setDeleting((prev) => { const s = new Set(prev); s.delete(playlistId); return s; });
    }
  };

  // ── Detail view ─────────────────────────────────────────────────────────
  if (selectedId && selectedPlaylist) {
    const pl = selectedPlaylist;
    const isPinned = pinned.has(pl.id);
    const tracks = tracksMap[pl.id] ?? [];
    const isLoadingTracks = loadingTracks === pl.id;

    return (
      <div className="w-full space-y-4">
        {/* Back + actions header */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => { setSelectedId(null); setEdit(null); setAddFromPlaylist(false); }}
            className="flex items-center gap-1.5 text-sm font-medium transition-colors"
            style={{ color: "rgba(255,255,255,0.55)" }}
          >
            <ArrowLeft size={16} /> Back
          </button>
          <div className="flex-1" />
          <button onClick={() => setAddFromPlaylist(true)}
            title="Add tracks from another playlist"
            className="p-2 rounded-xl hover:bg-white/[0.07] transition-colors" style={{ color: "rgba(255,255,255,0.4)" }}>
            <FolderInput size={15} />
          </button>
          <button onClick={() => setExportModal(true)}
            title="Export to YouTube Music"
            className="p-2 rounded-xl hover:bg-white/[0.07] transition-colors" style={{ color: "rgba(255,255,255,0.4)" }}>
            <Share2 size={15} />
          </button>
          <button onClick={() => setEdit({ id: pl.id, name: pl.name, description: pl.description ?? "" })}
            className="p-2 rounded-xl hover:bg-white/[0.07] transition-colors" style={{ color: "rgba(255,255,255,0.4)" }}>
            <Pencil size={15} />
          </button>
          <button onClick={() => togglePin(pl)} disabled={pinning === pl.id}
            className="p-2 rounded-xl transition-colors"
            style={{ color: isPinned ? "#E8282B" : "rgba(255,255,255,0.4)", background: isPinned ? "rgba(232,40,43,0.10)" : "transparent" }}>
            {pinning === pl.id ? <Loader2 size={15} className="animate-spin" /> : <Pin size={15} />}
          </button>
          <button onClick={() => removePlaylist(pl.id)} disabled={deleting.has(pl.id)}
            className="p-2 rounded-xl hover:bg-red-500/10 hover:text-red-400 transition-colors disabled:opacity-40"
            style={{ color: "rgba(255,255,255,0.4)" }}>
            {deleting.has(pl.id) ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
          </button>
        </div>

        {/* Cover + meta */}
        <div className="flex items-end gap-4">
          <div className="relative w-28 h-28 rounded-2xl overflow-hidden shrink-0 shadow-xl">
            <CoverArt tracks={tracks} imageUrl={pl.images?.[0]?.url} name={pl.name} size={112} />
          </div>
          <div className="flex-1 min-w-0 pb-1">
            {edit?.id === pl.id ? (
              <div className="space-y-2">
                <input autoFocus value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                  className="w-full border text-white rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:border-[#E8282B]/60"
                  style={{ background: "var(--card)", borderColor: "rgba(255,255,255,0.08)" }} />
                <div className="flex gap-2">
                  <button onClick={saveEdit} disabled={saving}
                    className="px-3 py-1.5 rounded-xl bg-[#E8282B] text-white text-sm font-medium">
                    {saving ? <Loader2 size={12} className="animate-spin" /> : "Save"}
                  </button>
                  <button onClick={() => setEdit(null)}
                    className="px-3 py-1.5 rounded-xl text-sm border"
                    style={{ borderColor: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.45)" }}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <p className="text-white text-xl font-bold truncate">{pl.name}</p>
                <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>
                  {tracks.length} tracks{isPinned ? " · Pinned" : ""}
                </p>
              </>
            )}
          </div>
        </div>

        {/* Play all */}
        {tracks.length > 0 && (
          <button
            onClick={() => playTrack(tracks, 0)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-2xl text-white font-bold text-sm transition-all active:scale-95 shadow-lg"
            style={{ background: "#E8282B", boxShadow: "0 4px 16px rgba(232,40,43,0.35)" }}
          >
            <PlayCircle size={16} /> Play all
          </button>
        )}

        {/* Track list */}
        <div className="rounded-2xl overflow-hidden border" style={{ background: "var(--card)", borderColor: "rgba(255,255,255,0.06)" }}>
          {isLoadingTracks ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={20} className="animate-spin" style={{ color: "rgba(255,255,255,0.2)" }} />
            </div>
          ) : tracks.length === 0 ? (
            <p className="text-center py-12 text-sm" style={{ color: "var(--text-muted)" }}>No tracks yet. Add songs from Search.</p>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => handleDragEnd(e, pl.id)}>
              <SortableContext items={tracks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                <div>
                  {tracks.map((t, i) => (
                    <SortableTrackRow key={t.id} track={t} index={i} playlistId={pl.id}
                      onPlay={() => playTrack(tracks, i)}
                      onRemove={() => removeTrack(pl.id, t.id)}
                      onAddToPlaylist={() => setAddModal({ name: t.track_name, uri: t.track_uri, image: t.track_image, artist: t.track_artist })}
                      removingKey={removingTrack} />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>

        {addModal && <AddToPlaylistModal track={addModal} onClose={() => setAddModal(null)} />}
        {addFromPlaylist && selectedPlaylist && (
          <AddFromPlaylistModal
            targetPlaylistId={selectedPlaylist.id}
            targetPlaylistName={selectedPlaylist.name}
            onClose={() => setAddFromPlaylist(false)}
            onTracksAdded={() => fetchTracks(selectedPlaylist.id)}
          />
        )}
        {exportModal && (
          <ExportToYouTubeMusicModal
            title={pl.name}
            tracks={tracks.map((t) => ({ name: t.track_name, artist: t.track_artist || "" }))}
            onClose={() => setExportModal(false)}
          />
        )}
      </div>
    );
  }

  // ── Grid view ────────────────────────────────────────────────────────────
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
          <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)}
            placeholder="Playlist name"
            className="w-full border text-white placeholder-white/25 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#E8282B]/60 transition-all"
            style={{ background: "var(--card)", borderColor: "rgba(255,255,255,0.08)" }} />
          <input value={newDesc} onChange={(e) => setNewDesc(e.target.value)}
            placeholder="Description (optional)"
            className="w-full border text-white placeholder-white/25 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#E8282B]/60 transition-all"
            style={{ background: "var(--card)", borderColor: "rgba(255,255,255,0.08)" }} />
          <div className="flex gap-2">
            <button onClick={createPlaylist} disabled={saving || !newName.trim()}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#E8282B] hover:bg-[#c0201f] disabled:opacity-40 text-white font-semibold text-sm transition-colors">
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Create
            </button>
            <button onClick={() => { setCreating(false); setNewName(""); setNewDesc(""); }}
              className="px-4 py-2 rounded-xl text-sm transition-colors"
              style={{ border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.45)" }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Skeleton */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-2xl overflow-hidden animate-pulse border border-white/[0.05]" style={{ background: "var(--card)" }}>
              <div className="aspect-square" style={{ background: "var(--surface)" }} />
              <div className="p-3 space-y-2">
                <div className="h-3 rounded-full w-3/4" style={{ background: "rgba(255,255,255,0.07)" }} />
                <div className="h-2.5 rounded-full w-1/2" style={{ background: "rgba(255,255,255,0.04)" }} />
              </div>
            </div>
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
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-4 gap-2">
          {playlists.map((pl) => {
            const isPinned = pinned.has(pl.id);
            const isDeleting = deleting.has(pl.id);
            const tracks = tracksMap[pl.id];

            return (
              <div
                key={pl.id}
                onClick={() => !isDeleting && openPlaylist(pl)}
                className={`rounded-lg overflow-hidden border cursor-pointer transition-all duration-200 active:scale-[0.97] ${isDeleting ? "opacity-40 pointer-events-none" : "hover:border-white/[0.12]"}`}
                style={{ background: "var(--card)", borderColor: "rgba(255,255,255,0.07)" }}
              >
                {/* Cover art square */}
                <div className="relative aspect-square w-full overflow-hidden" style={{ background: "var(--surface)" }}>
                  <CoverArt tracks={tracks} imageUrl={pl.images?.[0]?.url} name={pl.name} size={90} />
                  {isPinned && (
                    <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-[#E8282B] border border-black/20 shadow" />
                  )}
                  {/* Play overlay */}
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity" style={{ background: "rgba(0,0,0,0.35)" }}>
                    <div className="w-6 h-6 rounded-full bg-[#E8282B] flex items-center justify-center shadow-lg">
                      <Play size={10} fill="white" className="text-white ml-0.5" />
                    </div>
                  </div>
                </div>

                {/* Info */}
                <div className="p-1.5">
                  <p className="text-white text-[10px] font-semibold truncate leading-tight">{pl.name}</p>
                  <p className="text-[9px] mt-0.5 truncate" style={{ color: "var(--text-muted)" }}>
                    {pl.tracks?.total ?? 0} tracks
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pinned Artists */}
      {pinnedArtists.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-white font-bold text-base flex items-center gap-2">
            <UserCircle2 size={14} className="text-[#E8282B]" /> Pinned Artists
          </h3>
          <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide">
            {pinnedArtists.map((pa) => (
              <button
                key={pa.id}
                onClick={() => setSelectedArtist({ id: pa.artist_id, name: pa.artist_name, images: pa.artist_image ? [{ url: pa.artist_image }] : [], followers: { total: 0 }, genres: [], external_urls: { spotify: "" }, popularity: 0, type: "artist", uri: "" } as SpotifyArtist)}
                className="flex flex-col items-center gap-1.5 shrink-0 group"
                style={{ width: 72 }}
              >
                <div className="relative w-16 h-16 rounded-full overflow-hidden bg-white/[0.06] ring-2 ring-white/[0.05] group-hover:ring-[#E8282B]/40 transition-all">
                  {pa.artist_image ? (
                    <Image src={pa.artist_image} alt={pa.artist_name} fill unoptimized sizes="64px" className="object-cover group-hover:scale-105 transition-transform duration-300" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Mic2 size={18} className="text-white/20" />
                    </div>
                  )}
                  <span className="absolute top-0 right-0 w-2.5 h-2.5 rounded-full bg-[#E8282B] border border-black/20 shadow" />
                </div>
                <p className="text-[10px] text-white/45 group-hover:text-white transition-colors text-center truncate w-full leading-tight">{pa.artist_name}</p>
              </button>
            ))}
          </div>
        </section>
      )}

      {addModal && <AddToPlaylistModal track={addModal} onClose={() => setAddModal(null)} />}
      {selectedArtist && <ArtistSheet artist={selectedArtist} onClose={() => setSelectedArtist(null)} />}
    </div>
  );
}
