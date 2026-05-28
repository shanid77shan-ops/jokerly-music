"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Mic2, Plus, Search, Users, X } from "lucide-react";
import Image from "next/image";
import type { MixArtist } from "@/lib/playlist-meta";
import { mixArtistsNeedResolve, resolveMixArtistsClient } from "@/lib/resolve-mix-artists";
import { SpotifyArtist, artistImage } from "@/types/spotify";
import { useToastStore } from "@/store/toast";

interface Props {
  open: boolean;
  playlistId: string;
  playlistName: string;
  initialArtists: MixArtist[];
  onClose: () => void;
  onSaved: (artists: MixArtist[], description: string, addedCount: number, removedCount: number) => void;
}

export default function EditMixArtistsSheet({
  open,
  playlistId,
  playlistName,
  initialArtists,
  onClose,
  onSaved,
}: Props) {
  const [artistQuery, setArtistQuery] = useState("");
  const [artistResults, setArtistResults] = useState<SpotifyArtist[]>([]);
  const [selectedArtists, setSelectedArtists] = useState<MixArtist[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resolving, setResolving] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const loadGenRef = useRef(0);
  const initialArtistsRef = useRef(initialArtists);
  initialArtistsRef.current = initialArtists;
  const { toast } = useToastStore();

  useEffect(() => {
    if (!open) {
      setArtistQuery("");
      setArtistResults([]);
      setSelectedArtists([]);
      setSearching(false);
      setSaving(false);
      setResolving(false);
      return;
    }

    document.body.style.overflow = "hidden";
    const gen = ++loadGenRef.current;

    const loadArtists = async () => {
      setResolving(true);
      try {
        const res = await fetch(`/api/spotify/playlists/${playlistId}/artists`, { cache: "no-store" });
        const data = (await res.json().catch(() => ({}))) as { artists?: MixArtist[]; error?: string };
        if (!res.ok) throw new Error(data.error ?? "Could not load artists");
        const fromApi = data.artists?.length ? data.artists : initialArtistsRef.current;
        const resolved = await resolveMixArtistsClient(fromApi);
        if (loadGenRef.current === gen) setSelectedArtists(resolved);
      } catch (e) {
        if (loadGenRef.current === gen) {
          const fallback = await resolveMixArtistsClient(initialArtistsRef.current);
          setSelectedArtists(fallback);
          toast((e as Error).message ?? "Could not load artists");
        }
      } finally {
        if (loadGenRef.current === gen) setResolving(false);
      }
    };

    void loadArtists();
    return () => {
      document.body.style.overflow = "";
    };
  }, [open, playlistId, toast]);

  useEffect(() => {
    if (!open || resolving) return;

    clearTimeout(searchTimer.current);
    const query = artistQuery.trim();
    const selectedIds = new Set(selectedArtists.map((artist) => artist.id).filter(Boolean));

    if (query.length < 2) {
      if (selectedArtists.length === 0) {
        setArtistResults([]);
        setSearching(false);
        return;
      }

      setSearching(true);
      searchTimer.current = setTimeout(async () => {
        try {
          const ids = selectedArtists.map((artist) => artist.id).filter(Boolean).join(",");
          if (!ids) {
            setArtistResults([]);
            return;
          }
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
  }, [artistQuery, open, resolving, selectedArtists, toast]);

  const addArtist = (artist: SpotifyArtist) => {
    setSelectedArtists((prev) => {
      if (prev.find((item) => item.id === artist.id)) return prev;
      return [...prev, { id: artist.id, name: artist.name }];
    });
    setArtistQuery("");
    toast(`Added ${artist.name}`);
  };

  const removeArtist = (key: string) => {
    const next = selectedArtists.filter((artist) => (artist.id || artist.name) !== key);
    setSelectedArtists(next);
    if (next.length === 0) {
      void saveArtists([]);
    }
  };

  const saveArtists = async (artistsOverride?: MixArtist[]) => {
    const toPersist = artistsOverride ?? selectedArtists;

    setSaving(true);
    try {
      let toSave = toPersist;
      if (toSave.length > 0 && mixArtistsNeedResolve(toSave)) {
        toSave = await resolveMixArtistsClient(toSave);
        setSelectedArtists(toSave);
      }
      if (toSave.some((artist) => !artist.id?.trim())) {
        toast("Some artists could not be resolved — remove and re-add them from search");
        return;
      }

      const res = await fetch(`/api/spotify/playlists/${playlistId}/artists`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selectedArtists: toSave.map((artist) => ({ id: artist.id, name: artist.name })),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        artists?: MixArtist[];
        description?: string;
        addedCount?: number;
        removedCount?: number;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Could not update artists");

      onSaved(
        data.artists ?? toSave,
        data.description ?? "",
        data.addedCount ?? 0,
        data.removedCount ?? 0
      );

      const parts: string[] = [];
      if ((data.addedCount ?? 0) > 0) parts.push(`${data.addedCount} tracks added`);
      if ((data.removedCount ?? 0) > 0) parts.push(`${data.removedCount} tracks removed`);
      if (toSave.length === 0) {
        toast(parts.length > 0 ? parts.join(", ") : "Mix artists cleared");
      } else {
        toast(parts.length > 0 ? parts.join(", ") : "Artists updated");
      }
      onClose();
    } catch (e) {
      toast((e as Error).message ?? "Could not update artists");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  const showEmptyResults =
    !searching &&
    !resolving &&
    artistResults.length === 0 &&
    (artistQuery.trim().length >= 2 || selectedArtists.length > 0);

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
            <h2 className="text-white font-bold text-base">Edit artists</h2>
            <p className="text-white/40 text-xs mt-0.5 truncate">{playlistName}</p>
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
          {resolving ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 size={20} className="animate-spin text-white/30" />
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <p className="text-[11px] font-medium text-white/50 flex items-center gap-1.5">
                  <Users size={12} /> Artists ({selectedArtists.length})
                </p>
                {selectedArtists.length === 0 ? (
                  <p className="text-sm text-white/35">No artists yet — search to add</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {selectedArtists.map((artist) => (
                      <span
                        key={artist.id || artist.name}
                        className="inline-flex items-center gap-1.5 rounded-full border border-[#E8282B]/25 bg-[#E8282B]/10 px-2.5 py-1 text-xs text-white"
                      >
                        <span>{artist.name}</span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            removeArtist(artist.id || artist.name);
                          }}
                          className="p-0.5 rounded-full text-white/45 hover:text-white hover:bg-white/10"
                          aria-label={`Remove ${artist.name}`}
                        >
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
                <input
                  type="text"
                  value={artistQuery}
                  onChange={(e) => setArtistQuery(e.target.value)}
                  placeholder="Search artist to add…"
                  className="w-full pl-9 pr-4 py-3 rounded-2xl border border-white/[0.08] text-white placeholder-white/25 text-sm focus:outline-none focus:ring-1 focus:ring-[#E8282B]/50 transition-all"
                  style={{ background: "var(--card)" }}
                  autoComplete="off"
                />
                {searching && (
                  <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-white/30" />
                )}
              </div>

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
            </>
          )}
        </div>

        <div
          className="px-5 pt-3 shrink-0 border-t border-white/[0.06]"
          style={{ paddingBottom: "max(24px, calc(env(safe-area-inset-bottom) + 12px))" }}
        >
          <button
            type="button"
            onClick={() => void saveArtists()}
            disabled={saving || resolving}
            className="w-full py-3.5 rounded-2xl bg-[#E8282B] hover:bg-[#c0201f] disabled:opacity-40 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors"
          >
            {saving ? (
              <>
                <Loader2 size={16} className="animate-spin" /> Saving…
              </>
            ) : (
              <>
                <Check size={16} /> Save artists
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
