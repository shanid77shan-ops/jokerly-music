"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Mic2, Plus, Search, Users, X } from "lucide-react";
import Image from "next/image";
import { formatMixDescription } from "@/lib/playlist-meta";
import { SpotifyPlaylist } from "@/types";
import { SpotifyArtist, artistImage } from "@/types/spotify";
import { useToastStore } from "@/store/toast";
import { useBackHandler } from "@/hooks/useBackHandler";

interface SelectedArtist {
  id: string;
  name: string;
  image?: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (playlist: SpotifyPlaylist, addedCount: number) => void;
}

export default function CreateMultiArtistPlaylistSheet({ open, onClose, onCreated }: Props) {
  useBackHandler(open, onClose);

  const [name, setName] = useState("");
  const [artistQuery, setArtistQuery] = useState("");
  const [artistResults, setArtistResults] = useState<SpotifyArtist[]>([]);
  const [selectedArtists, setSelectedArtists] = useState<SelectedArtist[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const { toast } = useToastStore();

  const reset = () => {
    setName("");
    setArtistQuery("");
    setArtistResults([]);
    setSelectedArtists([]);
    setSearching(false);
    setSaving(false);
  };

  useEffect(() => {
    if (!open) {
      reset();
      return;
    }
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    clearTimeout(searchTimer.current);
    const query = artistQuery.trim();
    const selectedIds = new Set(selectedArtists.map((artist) => artist.id));

    if (query.length < 2) {
      if (selectedArtists.length === 0) {
        setArtistResults([]);
        setSearching(false);
        return;
      }

      setSearching(true);
      searchTimer.current = setTimeout(async () => {
        try {
          const ids = selectedArtists.map((artist) => artist.id).join(",");
          const res = await fetch(
            `/api/spotify/artist/related?ids=${encodeURIComponent(ids)}&exclude=${encodeURIComponent(ids)}`
          );
          const data = (await res.json().catch(() => ({}))) as { artists?: SpotifyArtist[]; error?: string };
          if (!res.ok) throw new Error(data.error ?? "Could not load related artists");
          setArtistResults((data.artists ?? []).filter((artist) => !selectedIds.has(artist.id)));
        } catch (e) {
          toast((e as Error).message ?? "Could not load artists");
          setArtistResults([]);
        } finally {
          setSearching(false);
        }
      }, 250);

      return () => clearTimeout(searchTimer.current);
    }

    setSearching(true);
    searchTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/spotify/search?q=${encodeURIComponent(query)}&type=artist&limit=10`
        );
        const data = (await res.json().catch(() => ({}))) as { artists?: SpotifyArtist[]; error?: string };
        if (!res.ok) throw new Error(data.error ?? "Could not search artists");
        setArtistResults((data.artists ?? []).filter((artist) => !selectedIds.has(artist.id)));
      } catch (e) {
        toast((e as Error).message ?? "Could not load artists");
        setArtistResults([]);
      } finally {
        setSearching(false);
      }
    }, 250);

    return () => clearTimeout(searchTimer.current);
  }, [artistQuery, open, selectedArtists, toast]);

  const addArtist = (artist: SpotifyArtist) => {
    setSelectedArtists((prev) => {
      if (prev.find((item) => item.id === artist.id)) return prev;
      return [...prev, { id: artist.id, name: artist.name, image: artist.images?.[0]?.url ?? null }];
    });
    setArtistQuery("");
    toast(`Added [${artist.name}]`);
  };

  const removeArtist = (artistId: string) => {
    setSelectedArtists((prev) => prev.filter((artist) => artist.id !== artistId));
  };

  const createPlaylist = async () => {
    if (!name.trim() || selectedArtists.length === 0) return;
    setSaving(true);
    try {
      const res = await fetch("/api/spotify/playlists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: formatMixDescription(
            selectedArtists.map((artist) => ({ id: artist.id, name: artist.name }))
          ),
          selectedArtists: selectedArtists.map((artist) => ({ id: artist.id, name: artist.name })),
        }),
      });
      const created = (await res.json().catch(() => ({}))) as SpotifyPlaylist & {
        addedCount?: number;
        error?: string;
      };
      if (!res.ok) throw new Error(created.error ?? "Failed to create playlist");

      const addedCount = created.addedCount ?? created.tracks?.total ?? 0;
      onCreated({ ...created, tracks: { total: addedCount } }, addedCount);
      toast(
        addedCount > 0
          ? `Created "${name.trim()}" with ${addedCount} tracks`
          : `Created "${name.trim()}" but no tracks were found`
      );
      onClose();
    } catch (e) {
      toast((e as Error).message ?? "Could not create playlist");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  const showEmptyResults =
    !searching && artistResults.length === 0 && (artistQuery.trim().length >= 2 || selectedArtists.length > 0);

  return (
    <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      <div
        className="relative w-full sm:max-w-md max-h-[90vh] flex flex-col rounded-t-3xl sm:rounded-3xl border border-white/[0.08] shadow-2xl overflow-hidden"
        style={{ background: "var(--surface)" }}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
          <div>
            <h2 className="text-white font-bold text-base">Mix artists</h2>
            <p className="text-white/40 text-xs mt-0.5">Pick artists, name your playlist, get a mixed tracklist</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-white/[0.08] text-white/50 hover:text-white transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-4 space-y-4">
          <div
            className="rounded-xl border px-4 py-3 space-y-2"
            style={{ background: "var(--card)", borderColor: "rgba(255,255,255,0.08)" }}
          >
            <label className="text-[11px] font-medium text-white/45">Playlist name</label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My mix"
              className="w-full bg-transparent text-white placeholder-white/25 text-sm focus:outline-none"
            />
            {selectedArtists.length > 0 && (
              <p className="text-xs text-white/50 truncate pt-0.5 border-t border-white/[0.06]">
                <span className="text-white/35">Artists · </span>
                {selectedArtists.map((artist) => artist.name).join(", ")}
              </p>
            )}
          </div>

          {selectedArtists.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] font-medium text-white/50 flex items-center gap-1.5">
                <Users size={12} /> Selected ({selectedArtists.length})
              </p>
              <div className="flex flex-wrap gap-2">
                {selectedArtists.map((artist) => (
                  <span
                    key={artist.id}
                    className="inline-flex items-center gap-1.5 rounded-full border border-[#E8282B]/25 bg-[#E8282B]/10 px-2.5 py-1 text-xs text-white"
                  >
                    <span>{artist.name}</span>
                    <button
                      type="button"
                      onClick={() => removeArtist(artist.id)}
                      className="rounded-full text-white/45 hover:text-white"
                      aria-label={`Remove ${artist.name}`}
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
            <input
              type="text"
              value={artistQuery}
              onChange={(e) => setArtistQuery(e.target.value)}
              placeholder={
                selectedArtists.length > 0
                  ? "Search another artist…"
                  : "Search an artist to start…"
              }
              className="w-full pl-9 pr-4 py-3 rounded-2xl border border-white/[0.08] text-white placeholder-white/25 text-sm focus:outline-none focus:ring-1 focus:ring-[#E8282B]/50 transition-all"
              style={{ background: "var(--card)" }}
              autoComplete="off"
            />
            {searching && (
              <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-white/30" />
            )}
          </div>

          {selectedArtists.length > 0 && !artistQuery.trim() && (
            <p className="text-[11px] text-white/35 -mt-2">
              Suggested related artists — or search to add anyone
            </p>
          )}

          {selectedArtists.length > 0 && artistQuery.trim().length >= 2 && (
            <p className="text-[11px] text-white/35 -mt-2">
              Artist search results
            </p>
          )}

          {artistResults.length > 0 && (
            <div className="rounded-2xl border border-white/[0.07] overflow-hidden" style={{ background: "var(--card)" }}>
              {artistResults.map((artist) => {
                const already = selectedArtists.some((item) => item.id === artist.id);
                return (
                  <button
                    key={artist.id}
                    type="button"
                    onClick={() => !already && addArtist(artist)}
                    disabled={already}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 border-b border-white/[0.04] last:border-0 text-left transition-colors ${
                      already ? "opacity-50 cursor-default" : "hover:bg-white/[0.05]"
                    }`}
                  >
                    <div className="relative w-9 h-9 rounded-full overflow-hidden shrink-0 bg-white/[0.07]">
                      {artistImage(artist) ? (
                        <Image
                          src={artistImage(artist)!}
                          alt={artist.name}
                          fill
                          unoptimized
                          sizes="36px"
                          className="object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Mic2 size={14} className="text-white/25" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-medium truncate">{artist.name}</p>
                      {artist.genres?.[0] && (
                        <p className="text-white/30 text-xs truncate">{artist.genres[0]}</p>
                      )}
                    </div>
                    {already ? (
                      <Check size={15} className="text-[#E8282B] shrink-0" />
                    ) : (
                      <Plus size={15} className="text-white/30 shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {showEmptyResults && (
            <p className="text-center text-white/30 text-sm py-4">
              {artistQuery.trim().length >= 2 ? "No artists found" : "No related suggestions — search to add more"}
            </p>
          )}

          {selectedArtists.length === 0 && artistQuery.trim().length < 2 && (
            <p className="text-center text-white/25 text-xs py-2">
              Type at least 2 characters to search artists
            </p>
          )}
        </div>

        <div
          className="px-5 pt-3 shrink-0 border-t border-white/[0.06]"
          style={{ paddingBottom: "max(24px, calc(env(safe-area-inset-bottom) + 12px))" }}
        >
          <button
            type="button"
            onClick={() => void createPlaylist()}
            disabled={saving || !name.trim() || selectedArtists.length === 0}
            className="w-full py-3.5 rounded-2xl bg-[#E8282B] hover:bg-[#c0201f] disabled:opacity-40 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors"
          >
            {saving ? (
              <>
                <Loader2 size={16} className="animate-spin" /> Creating…
              </>
            ) : (
              <>
                <Check size={16} /> Create mix
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
