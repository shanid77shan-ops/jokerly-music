"use client";

import { useEffect, useState } from "react";
import { ListMusic, Plus, Pencil, Pin, Loader2, X, Check, Trash2, ChevronDown, Music, Play, Trash } from "lucide-react";
import { SpotifyPlaylist } from "@/types";
import Image from "next/image";
import { useToastStore } from "@/store/toast";
import { usePlayerStore, PlayableTrack } from "@/store/player";

interface EditState { id: string; name: string; description: string; }
interface PinnedRow { playlist_id: string; }
interface PlaylistTrack { track_uri: string; track_name: string; added_at: string; }

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
      artist: "",
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
        <div>
          <h2 className="text-3xl font-bold text-white flex items-center gap-2">
            <ListMusic size={28} /> Playlists
          </h2>
          <p className="text-zinc-400 mt-1">Create, edit and pin your playlists</p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500 hover:bg-red-400 text-black font-semibold text-sm transition-colors"
        >
          <Plus size={16} /> New Playlist
        </button>
      </div>

      {creating && (
        <div className="bg-zinc-800 rounded-2xl p-5 space-y-3 border border-zinc-700">
          <h3 className="text-white font-semibold">Create new playlist</h3>
          <input
            autoFocus value={newName} onChange={(e) => setNewName(e.target.value)}
            placeholder="Playlist name"
            className="w-full bg-zinc-700 text-white placeholder-zinc-400 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
          />
          <input
            value={newDesc} onChange={(e) => setNewDesc(e.target.value)}
            placeholder="Description (optional)"
            className="w-full bg-zinc-700 text-white placeholder-zinc-400 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
          />
          <div className="flex gap-2">
            <button onClick={createPlaylist} disabled={saving || !newName.trim()}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500 hover:bg-red-400 disabled:opacity-50 text-black font-semibold text-sm">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Create
            </button>
            <button onClick={() => { setCreating(false); setNewName(""); setNewDesc(""); }}
              className="px-4 py-2 rounded-xl bg-zinc-700 hover:bg-zinc-600 text-white text-sm">
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 bg-zinc-800/50 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : playlists.length === 0 ? (
        <div className="text-center py-20 text-zinc-500">
          <ListMusic size={48} className="mx-auto mb-4 opacity-30" />
          <p>No playlists yet. Create your first one!</p>
        </div>
      ) : (
        <div className="space-y-2">
          {playlists.map((pl) => {
            const isDeleting = deleting.has(pl.id);
            const isExpanded = expandedId === pl.id;
            const tracks = tracksMap[pl.id] ?? [];

            return (
              <div key={pl.id} className={`rounded-xl overflow-hidden border transition-colors ${isExpanded ? "border-zinc-600 bg-zinc-800/60" : "border-transparent bg-zinc-800/40 hover:bg-zinc-800"} ${isDeleting ? "opacity-50 pointer-events-none" : ""}`}>
                {/* Playlist header row */}
                <div className="flex items-center gap-3 p-3">
                  <button onClick={() => toggleExpand(pl)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                    {pl.images?.[0]?.url ? (
                      <Image src={pl.images[0].url} alt={pl.name} width={44} height={44} className="rounded-lg object-cover shrink-0" />
                    ) : (
                      <div className="w-11 h-11 rounded-lg bg-zinc-700 flex items-center justify-center shrink-0">
                        <ListMusic size={18} className="text-zinc-500" />
                      </div>
                    )}

                    {edit?.id === pl.id ? null : (
                      <div className="min-w-0 flex-1">
                        <p className="text-white text-sm font-medium truncate">{pl.name}</p>
                        <p className="text-zinc-400 text-xs">{pl.tracks?.total ?? 0} tracks</p>
                      </div>
                    )}

                    <ChevronDown
                      size={16}
                      className={`text-zinc-500 shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                    />
                  </button>

                  {edit?.id === pl.id && (
                    <div className="flex flex-1 gap-2">
                      <input autoFocus value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                        className="flex-1 bg-zinc-700 text-white rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-500" />
                      <input value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })}
                        placeholder="Description"
                        className="flex-1 bg-zinc-700 text-white placeholder-zinc-400 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-500" />
                      <button onClick={saveEdit} disabled={saving}
                        className="px-3 py-1.5 rounded-lg bg-red-500 hover:bg-red-400 text-black text-sm font-medium">
                        {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                      </button>
                      <button onClick={() => setEdit(null)}
                        className="px-3 py-1.5 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-white text-sm">
                        <X size={14} />
                      </button>
                    </div>
                  )}

                  <div className="flex items-center gap-0.5 shrink-0">
                    <button onClick={(e) => { e.stopPropagation(); setEdit({ id: pl.id, name: pl.name, description: pl.description ?? "" }); }}
                      className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-700 transition-colors" title="Edit">
                      <Pencil size={14} />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); togglePin(pl); }} disabled={pinning === pl.id}
                      className={`p-1.5 rounded-lg transition-colors ${pinned.has(pl.id) ? "text-red-400 bg-zinc-700" : "text-zinc-500 hover:text-white hover:bg-zinc-700"}`}
                      title={pinned.has(pl.id) ? "Unpin" : "Pin"}>
                      {pinning === pl.id ? <Loader2 size={14} className="animate-spin" /> : <Pin size={14} />}
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); removePlaylist(pl.id); }} disabled={isDeleting}
                      className="p-1.5 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-zinc-700 transition-colors disabled:opacity-50" title="Delete">
                      {isDeleting ? <Loader2 size={14} className="animate-spin text-red-400" /> : <Trash2 size={14} />}
                    </button>
                  </div>
                </div>

                {/* Tracks dropdown */}
                {isExpanded && (
                  <div className="border-t border-zinc-700/60 pb-2">
                    {loadingTracks === pl.id ? (
                      <div className="flex justify-center py-6">
                        <Loader2 size={20} className="animate-spin text-zinc-500" />
                      </div>
                    ) : tracks.length === 0 ? (
                      <p className="text-zinc-500 text-sm text-center py-6">No tracks in this playlist yet.</p>
                    ) : (
                      tracks.map((t, i) => {
                        const rmKey = `${pl.id}::${t.track_uri}`;
                        return (
                          <div key={t.track_uri} className="flex items-center gap-2.5 px-3 py-2 hover:bg-zinc-700/50 group transition-colors">
                            <span className="text-zinc-600 text-xs w-4 text-right shrink-0">{i + 1}</span>
                            <div className="w-8 h-8 rounded-md bg-zinc-700 flex items-center justify-center shrink-0">
                              <Music size={12} className="text-zinc-500" />
                            </div>
                            <p className="text-white text-xs font-medium truncate flex-1">{t.track_name}</p>
                            <div className="flex items-center gap-0.5 shrink-0">
                              <button
                                onClick={() => playTrack(tracks, i)}
                                className="p-1.5 rounded-md text-zinc-500 hover:text-white hover:bg-zinc-600 transition-colors"
                                title="Play"
                              >
                                <Play size={12} />
                              </button>
                              <button
                                onClick={() => removeTrack(pl.id, t.track_uri)}
                                disabled={removingTrack === rmKey}
                                className="p-1.5 rounded-md text-zinc-500 hover:text-red-400 hover:bg-zinc-600 transition-colors disabled:opacity-40"
                                title="Remove"
                              >
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
