"use client";

import { useEffect, useState } from "react";
import { Sparkles, RefreshCw, Music } from "lucide-react";
import LfmTrackCard from "@/components/music/LfmTrackCard";
import AddToPlaylistModal from "@/components/playlist/AddToPlaylistModal";
import { LfmTrack, lfmArtistName, lfmImage } from "@/lib/lastfm";
import { usePlayerStore, PlayableTrack } from "@/store/player";

const GENRE_TAGS = ["pop", "rock", "hip-hop", "electronic", "jazz", "classical", "indie", "r&b"];

function toPlayable(t: LfmTrack): PlayableTrack {
  return {
    name: t.name,
    artist: lfmArtistName(t.artist),
    image: lfmImage(t.image, "large") ?? undefined,
    lfmUrl: t.url,
  };
}

export default function RecommendationsClient() {
  const [tracks, setTracks] = useState<LfmTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [similarSeed, setSimilarSeed] = useState<{ name: string; artist: string } | null>(null);
  const [resolvingAdd, setResolvingAdd] = useState(false);
  const [modalTrack, setModalTrack] = useState<{ name: string; uri: string } | null>(null);

  const { setQueueAndPlay, currentTrack, isPlaying } = usePlayerStore();

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
    const artistName = lfmArtistName(track.artist);
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

  const handlePlay = async (track: LfmTrack) => {
    const index = tracks.findIndex(
      (t) => t.name === track.name && lfmArtistName(t.artist) === lfmArtistName(track.artist)
    );
    if (index === -1) return;

    const playable = tracks.map(toPlayable);

    try {
      const res = await fetch(
        `/api/spotify/resolve?track=${encodeURIComponent(track.name)}&artist=${encodeURIComponent(lfmArtistName(track.artist))}`
      );
      const data = await res.json();
      playable[index].uri = data.uri ?? null;
      if (typeof data.durationMs === "number") playable[index].durationMs = data.durationMs;
      if (data.imageUrl) playable[index].image = data.imageUrl;
    } catch {
      playable[index].uri = null;
    }

    setQueueAndPlay(playable, index);
  };

  const isTrackPlaying = (track: LfmTrack) =>
    currentTrack?.name === track.name &&
    currentTrack?.artist === lfmArtistName(track.artist) &&
    isPlaying;

  const handleAddToPlaylist = async (track: LfmTrack) => {
    const artist = lfmArtistName(track.artist);
    setResolvingAdd(true);
    try {
      const res = await fetch(
        `/api/spotify/resolve?track=${encodeURIComponent(track.name)}&artist=${encodeURIComponent(artist)}`
      );
      const data = await res.json();
      if (!data.uri) return;
      setModalTrack({ name: track.name, uri: data.uri });
    } finally {
      setResolvingAdd(false);
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
              selectedTag === tag ? "bg-purple-500 text-white" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
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
              onPlay={handlePlay}
              onAddToPlaylist={handleAddToPlaylist}
              isCurrentlyPlaying={isTrackPlaying(track)}
            />
          ))}
        </div>
      )}

      {resolvingAdd && (
        <div className="fixed bottom-24 right-4 bg-zinc-900 border border-zinc-700 text-zinc-200 text-xs px-3 py-2 rounded-lg shadow-xl">
          Resolving track for playlist...
        </div>
      )}

      {modalTrack && (
        <AddToPlaylistModal track={modalTrack} onClose={() => setModalTrack(null)} />
      )}
    </div>
  );
}
