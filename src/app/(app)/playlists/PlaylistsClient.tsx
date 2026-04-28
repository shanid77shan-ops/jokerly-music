"use client";

import { useEffect, useState } from "react";
import { ListMusic, Plus, Pencil, Pin, Loader2, X, Check, Trash2, ChevronDown, Music, Play, Trash } from "lucide-react";
import { SpotifyPlaylist } from "@/types";
import Image from "next/image";
import { useToastStore } from "@/store/toast";
import { usePlayerStore, PlayableTrack } from "@/store/player";

interface EditState { id: string; name: string; description: string; }
interface PinnedRow { playlist_id: string; }
interface PlaylistTrack { track_uri: string; track_name: string; track_image?: string | null; track_artist?: string | null; added_at: string; }

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
  const { toast } = useToastStore();
  const { setQueueAndPlay } = usePlayerStore();

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

  const fetchTracks = async (id: string) => {
    if (tracksMap[id]) return;
    setLoadingTracks(id);
    try {
      const res = await fetch(`/api/spotify/playlists/${id}`);
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

  const removeTrack = async (playlistId: string, trackUri: string) => {
    const key = `${playlistId}::${trackUri}`;
    setRemovingTrack(key);
    try {
      const res = await fetch(`/api/spotify/playlists/${playlistId}/tracks`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uri: trackUri }),
      });
      if (!res.ok) throw new Error("Failed to remove track");
      setTracksMap((prev) => ({
        ...prev,
        [playlistId]: (prev[playlistId] ?? []).filter((t) => t.track_uri !== trackUri),
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
    <div className="w-full space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
          <ListMusic size={22} className="text-[#ff2d55]" /> Playlists
        </h2>
        <button onClick={() => setCreating(true)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-2xl bg-[#ff2d55] hover:bg-[#ff4466] text-white font-semibold text-sm transition-colors shadow-lg shadow-[#ff2d55]/20">
          <Plus size={15} /> New
        </button>
      </div>

      {creating && (
        <div className="rounded-2xl p-5 space-y-3 border border-white/[0.09]" style={{ background: "var(--card)" }}>
          <h3 className="text-white font-semibold text-sm">New playlist</h3>
          <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Playlist name"
            className="w-full border border-white/[0.08] text-white placeholder-white/25 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#ff2d55]/50 transition-all"
            style={{ background: "var(--surface)" }} />
          <input value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="Description (optional)"
            className="w-full border border-white/[0.08] text-white placeholder-white/25 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#ff2d55]/50 transition-all"
            style={{ background: "var(--surface)" }} />
          <div className="flex gap-2">
            <button onClick={createPlaylist} disabled={saving || !newName.trim()}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#ff2d55] hover:bg-[#ff4466] disabled:opacity-40 text-white font-semibold text-sm transition-colors">
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Create
            </button>
            <button onClick={() => { setCreating(false); setNewName(""); setNewDesc(""); }}
              className="px-4 py-2 rounded-xl border border-white/[0.08] text-white/50 hover:text-white text-sm transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-[68px] rounded-2xl border border-white/[0.06] animate-pulse" style={{ background: "var(--card)" }} />
          ))}
        </div>
      ) : playlists.length === 0 ? (
        <div className="text-center py-20 text-white/20">
          <ListMusic size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">No playlists yet. Create your first one!</p>
        </div>
      ) : (
        <div className="space-y-2">
          {playlists.map((pl) => {
            const isDeleting = deleting.has(pl.id);
            const isExpanded = expandedId === pl.id;
            const tracks = tracksMap[pl.id] ?? [];
            const coverUrl = pl.images?.[0]?.url ?? tracksMap[pl.id]?.find((t) => t.track_image)?.track_image ?? null;

            return (
              <div key={pl.id} className={`rounded-2xl overflow-hidden border transition-all duration-200 ${isExpanded ? "border-white/[0.1]" : "border-white/[0.06] hover:border-white/[0.09]"} ${isDeleting ? "opacity-40 pointer-events-none" : ""}`}
                style={{ background: "var(--card)" }}>
                {/* Playlist header */}
                <div className="flex items-center gap-3 p-3">
                  <button onClick={() => toggleExpand(pl)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                    {coverUrl ? (
                      <Image src={coverUrl} alt={pl.name} width={44} height={44} unoptimized className="rounded-xl object-cover shrink-0" />
                    ) : (
                      <div className="w-11 h-11 rounded-xl bg-white/[0.06] flex items-center justify-center shrink-0">
                        <ListMusic size={17} className="text-white/25" />
                      </div>
                    )}

                    {edit?.id !== pl.id && (
                      <div className="min-w-0 flex-1">
                        <p className="text-white text-sm font-semibold truncate">{pl.name}</p>
                        <p className="text-white/30 text-xs">{pl.tracks?.total ?? 0} tracks</p>
                      </div>
                    )}
                    <ChevronDown size={15} className={`text-white/25 shrink-0 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} />
                  </button>

                  {edit?.id === pl.id && (
                    <div className="flex flex-1 gap-2">
                      <input autoFocus value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                        className="flex-1 border border-white/[0.08] text-white rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#ff2d55]/50"
                        style={{ background: "var(--surface)" }} />
                      <input value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} placeholder="Description"
                        className="flex-1 border border-white/[0.08] text-white placeholder-white/25 rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#ff2d55]/50"
                        style={{ background: "var(--surface)" }} />
                      <button onClick={saveEdit} disabled={saving}
                        className="px-3 py-1.5 rounded-xl bg-[#ff2d55] hover:bg-[#ff4466] text-white text-sm font-medium">
                        {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                      </button>
                      <button onClick={() => setEdit(null)}
                        className="px-3 py-1.5 rounded-xl border border-white/[0.08] text-white/50 hover:text-white text-sm">
                        <X size={13} />
                      </button>
                    </div>
                  )}

                  <div className="flex items-center gap-0.5 shrink-0">
                    <button onClick={(e) => { e.stopPropagation(); setEdit({ id: pl.id, name: pl.name, description: pl.description ?? "" }); }}
                      className="p-1.5 rounded-xl text-white/25 hover:text-white hover:bg-white/[0.07] transition-colors" title="Edit">
                      <Pencil size={13} />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); togglePin(pl); }} disabled={pinning === pl.id}
                      className={`p-1.5 rounded-xl transition-colors ${pinned.has(pl.id) ? "text-[#ff2d55] bg-[#ff2d55]/10" : "text-white/25 hover:text-white hover:bg-white/[0.07]"}`}
                      title={pinned.has(pl.id) ? "Unpin" : "Pin"}>
                      {pinning === pl.id ? <Loader2 size={13} className="animate-spin" /> : <Pin size={13} />}
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); removePlaylist(pl.id); }} disabled={isDeleting}
                      className="p-1.5 rounded-xl text-white/25 hover:text-[#ff2d55] hover:bg-[#ff2d55]/10 transition-colors disabled:opacity-40" title="Delete">
                      {isDeleting ? <Loader2 size={13} className="animate-spin text-[#ff2d55]" /> : <Trash2 size={13} />}
                    </button>
                  </div>
                </div>

                {/* Track list */}
                {isExpanded && (
                  <div className="border-t border-white/[0.06]">
                    {loadingTracks === pl.id ? (
                      <div className="flex justify-center py-6">
                        <Loader2 size={18} className="animate-spin text-white/20" />
                      </div>
                    ) : tracks.length === 0 ? (
                      <p className="text-white/25 text-sm text-center py-6">No tracks yet.</p>
                    ) : (
                      tracks.map((t, i) => {
                        const rmKey = `${pl.id}::${t.track_uri}`;
                        return (
                          <div key={t.track_uri} className="flex items-center gap-2.5 px-3 py-2.5 hover:bg-white/[0.04] group transition-colors border-b border-white/[0.03] last:border-0">
                            <span className="text-white/20 text-xs w-4 text-right shrink-0 tabular-nums">{i + 1}</span>
                            <div className="relative w-9 h-9 rounded-xl shrink-0 overflow-hidden bg-white/[0.06]">
                              {t.track_image ? (
                                <Image src={t.track_image} alt={t.track_name} fill unoptimized sizes="36px" className="object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <Music size={12} className="text-white/20" />
                                </div>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-white text-sm font-medium truncate">{t.track_name}</p>
                              {t.track_artist && <p className="text-white/30 text-xs truncate">{t.track_artist}</p>}
                            </div>
                            <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button onClick={() => playTrack(tracks, i)}
                                className="p-1.5 rounded-xl text-white/40 hover:text-white hover:bg-white/[0.07] transition-colors" title="Play">
                                <Play size={13} fill="currentColor" />
                              </button>
                              <button onClick={() => removeTrack(pl.id, t.track_uri)} disabled={removingTrack === rmKey}
                                className="p-1.5 rounded-xl text-white/25 hover:text-[#ff2d55] hover:bg-[#ff2d55]/10 transition-colors disabled:opacity-40" title="Remove">
                                {removingTrack === rmKey ? <Loader2 size={12} className="animate-spin" /> : <Trash size={12} />}
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
