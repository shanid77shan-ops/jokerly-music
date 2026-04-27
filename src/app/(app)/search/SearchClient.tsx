"use client";

import { useState, useCallback } from "react";
import { Search, Loader2 } from "lucide-react";
import LfmTrackCard from "@/components/music/LfmTrackCard";
import LfmArtistCard from "@/components/music/LfmArtistCard";
import LfmAlbumCard from "@/components/music/LfmAlbumCard";
import { LfmTrack, LfmArtist, LfmAlbum } from "@/lib/lastfm";
import ArtistDetailSheet from "@/components/music/ArtistDetailSheet";

type Tab = "track" | "artist" | "album";

const TABS: { label: string; value: Tab }[] = [
  { label: "Tracks", value: "track" },
  { label: "Artists", value: "artist" },
  { label: "Albums", value: "album" },
];

export default function SearchClient() {
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<Tab>("track");
  const [tracks, setTracks] = useState<LfmTrack[]>([]);
  const [artists, setArtists] = useState<LfmArtist[]>([]);
  const [albums, setAlbums] = useState<LfmAlbum[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [selectedArtist, setSelectedArtist] = useState<LfmArtist | null>(null);
  const [similarSeed, setSimilarSeed] = useState<LfmTrack | null>(null);
  const [similarTracks, setSimilarTracks] = useState<LfmTrack[]>([]);
  const [loadingSimilar, setLoadingSimilar] = useState(false);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;
    setLoading(true);
    setSearched(true);
    setSimilarSeed(null);
    setSimilarTracks([]);
    try {
      const res = await fetch(
        `/api/lastfm/search?q=${encodeURIComponent(query)}&type=all`
      );
      const data = await res.json();
      setTracks(data.tracks ?? []);
      setArtists(data.artists ?? []);
      setAlbums(data.albums ?? []);
    } finally {
      setLoading(false);
    }
  }, [query]);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSearch();
  };

  const handleGetSimilar = async (track: LfmTrack) => {
    setSimilarSeed(track);
    setLoadingSimilar(true);
    const artistName = typeof track.artist === "string" ? track.artist : track.artist.name;
    const res = await fetch(
      `/api/lastfm/recommendations?track=${encodeURIComponent(track.name)}&artist=${encodeURIComponent(artistName)}`
    );
    const data = await res.json();
    setSimilarTracks(data.tracks ?? []);
    setLoadingSimilar(false);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-white mb-1">Search</h2>
        <p className="text-zinc-400">Find tracks, artists & albums via Last.fm</p>
      </div>

      <div className="relative">
        <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Search for music, artists, albums, movies..."
          className="w-full bg-zinc-800 text-white placeholder-zinc-500 rounded-xl pl-12 pr-28 py-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 transition"
        />
        <button
          onClick={handleSearch}
          disabled={loading || !query.trim()}
          className="absolute right-3 top-1/2 -translate-y-1/2 bg-green-500 hover:bg-green-400 disabled:opacity-40 text-black font-semibold text-sm px-4 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : "Search"}
        </button>
      </div>

      {searched && !loading && (
        <>
          <div className="flex gap-2">
            {TABS.map((t) => (
              <button
                key={t.value}
                onClick={() => setTab(t.value)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  tab === t.value
                    ? "bg-white text-black"
                    : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === "track" && (
            <div className="space-y-1">
              {tracks.length === 0 ? (
                <p className="text-zinc-500 text-sm py-8 text-center">No tracks found.</p>
              ) : (
                tracks.map((t, i) => (
                  <LfmTrackCard
                    key={`${t.name}-${i}`}
                    track={t}
                    rank={i + 1}
                    onGetSimilar={handleGetSimilar}
                  />
                ))
              )}
            </div>
          )}

          {tab === "artist" && (
            <div className="grid grid-cols-4 gap-2">
              {artists.length === 0 ? (
                <p className="text-zinc-500 text-sm py-8 col-span-4 text-center">No artists found.</p>
              ) : (
                artists.map((a, i) => (
                  <LfmArtistCard
                    key={`${a.name}-${i}`}
                    artist={a}
                    onSelect={setSelectedArtist}
                  />
                ))
              )}
            </div>
          )}

          {tab === "album" && (
            <div className="grid grid-cols-5 gap-3">
              {albums.length === 0 ? (
                <p className="text-zinc-500 text-sm py-8 col-span-5 text-center">No albums found.</p>
              ) : (
                albums.map((a, i) => (
                  <LfmAlbumCard key={`${a.name}-${i}`} album={a} />
                ))
              )}
            </div>
          )}

          {similarSeed && (
            <div className="mt-6 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-white font-semibold">
                  Similar to <span className="text-green-400">{similarSeed.name}</span>
                </h3>
                <button
                  onClick={() => { setSimilarSeed(null); setSimilarTracks([]); }}
                  className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  Clear
                </button>
              </div>
              {loadingSimilar ? (
                <div className="flex justify-center py-8">
                  <Loader2 size={24} className="animate-spin text-zinc-500" />
                </div>
              ) : (
                <div className="space-y-1">
                  {similarTracks.map((t, i) => (
                    <LfmTrackCard key={`sim-${t.name}-${i}`} track={t} rank={i + 1} onGetSimilar={handleGetSimilar} />
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {selectedArtist && (
        <ArtistDetailSheet artist={selectedArtist} onClose={() => setSelectedArtist(null)} />
      )}
    </div>
  );
}
