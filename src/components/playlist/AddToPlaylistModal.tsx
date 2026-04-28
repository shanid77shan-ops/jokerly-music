"use client";

import { useEffect, useState } from "react";
import { X, Check, Loader2 } from "lucide-react";
import { SpotifyPlaylist } from "@/types";

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

export default function AddToPlaylistModal({ track, onClose }: Props) {
  const [playlists, setPlaylists] = useState<SpotifyPlaylist[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState<string | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch("/api/spotify/playlists")
      .then((r) => r.json())
      .then((d) => setPlaylists(d.items ?? []))
      .finally(() => setLoading(false));
  }, []);

  const addToPlaylist = async (playlist: SpotifyPlaylist) => {
    setAdding(playlist.id);
    await fetch(`/api/spotify/playlists/${playlist.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uris: [track.uri], trackName: track.name, trackImage: track.image ?? null, trackArtist: track.artist ?? null }),
    });
    setAdded((prev) => new Set(prev).add(playlist.id));
    setAdding(null);
    setTimeout(onClose, 700);
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 rounded-2xl w-full max-w-md shadow-2xl border border-zinc-800">
        <div className="flex items-center justify-between p-5 border-b border-zinc-800">
          <div>
            <h3 className="text-white font-semibold">Add to playlist</h3>
            <p className="text-zinc-400 text-xs mt-0.5 truncate">{track.name}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-3 max-h-80 overflow-y-auto space-y-1">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 size={24} className="animate-spin text-zinc-500" />
            </div>
          ) : playlists.length === 0 ? (
            <p className="text-zinc-500 text-sm text-center py-8">No playlists found.</p>
          ) : (
            playlists.map((pl) => (
              <button
                key={pl.id}
                onClick={() => addToPlaylist(pl)}
                disabled={!!adding || added.has(pl.id)}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-zinc-800 text-left transition-colors disabled:opacity-60"
              >
                <span className="text-white text-sm truncate">{pl.name}</span>
                {added.has(pl.id) ? (
                  <Check size={16} className="text-red-400 shrink-0" />
                ) : adding === pl.id ? (
                  <Loader2 size={16} className="animate-spin text-zinc-400 shrink-0" />
                ) : null}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
