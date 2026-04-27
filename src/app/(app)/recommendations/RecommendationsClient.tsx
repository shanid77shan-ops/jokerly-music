"use client";

import { useEffect, useState } from "react";
import { Sparkles, RefreshCw, Music } from "lucide-react";
import LfmTrackCard from "@/components/music/LfmTrackCard";
import { LfmTrack } from "@/lib/lastfm";

const GENRE_TAGS = ["pop", "rock", "hip-hop", "electronic", "jazz", "classical", "indie", "r&b"];

export default function RecommendationsClient() {
  const [tracks, setTracks] = useState<LfmTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [similarSeed, setSimilarSeed] = useState<{ name: string; artist: string } | null>(null);

  const fetchCharts = async () => {
    setLoading(true);
    setSimilarSeed(null);
    setSelectedTag(null);
    try {
      const res = await fetch("/api/lastfm/recommendations");
      const data = await res.json();
      setTracks(data.tracks ?? []);
    } finally {
      setLoading(false);
    }
  };

  const fetchByTag = async (tag: string) => {
    setLoading(true);
    setSelectedTag(tag);
    setSimilarSeed(null);
    try {
      const res = await fetch(`/api/lastfm/search?q=${encodeURIComponent(tag)}&type=track&limit=30`);
      const data = await res.json();
      setTracks(data.tracks ?? []);
    } finally {
      setLoading(false);
    }
  };

  const fetchSimilar = async (track: LfmTrack) => {
    const artistName = typeof track.artist === "string" ? track.artist : track.artist.name;
    setLoading(true);
    setSimilarSeed({ name: track.name, artist: artistName });
    setSelectedTag(null);
    try {
      const res = await fetch(
        `/api/lastfm/recommendations?track=${encodeURIComponent(track.name)}&artist=${encodeURIComponent(artistName)}`
      );
      const data = await res.json();
      setTracks(data.tracks ?? []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchCharts(); }, []);

  return (
    <div className="w-full space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-white flex items-center gap-2">
            <Sparkles className="text-purple-400" size={28} /> For You
          </h2>
          <p className="text-zinc-400 mt-1">
            {similarSeed
              ? `Tracks similar to "${similarSeed.name}" by ${similarSeed.artist}`
              : selectedTag
              ? `Top "${selectedTag}" tracks`
              : "Global top tracks right now"}
          </p>
        </div>
        <button
          onClick={fetchCharts}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-sm text-white transition-colors disabled:opacity-50"
        >
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          Charts
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {GENRE_TAGS.map((tag) => (
          <button
            key={tag}
            onClick={() => fetchByTag(tag)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium capitalize transition-colors ${
              selectedTag === tag
                ? "bg-purple-500 text-white"
                : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
            }`}
          >
            {tag}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="h-16 bg-zinc-800/50 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : tracks.length === 0 ? (
        <div className="text-center py-20 text-zinc-500">
          <Music size={48} className="mx-auto mb-4 opacity-30" />
          <p>No tracks found.</p>
        </div>
      ) : (
        <div className="space-y-1">
          {tracks.map((track, i) => (
            <LfmTrackCard
              key={`${track.name}-${i}`}
              track={track}
              rank={i + 1}
              onGetSimilar={fetchSimilar}
            />
          ))}
        </div>
      )}
    </div>
  );
}
