"use client";

import { useEffect, useState } from "react";
import { LfmArtist, LfmArtistInfo, LfmTrack, lfmImage } from "@/lib/lastfm";
import { X, Loader2, ExternalLink } from "lucide-react";
import Image from "next/image";
import LfmTrackCard from "./LfmTrackCard";
import LfmArtistCard from "./LfmArtistCard";

interface Props {
  artist: LfmArtist;
  onClose: () => void;
}

export default function ArtistDetailSheet({ artist, onClose }: Props) {
  const [info, setInfo] = useState<LfmArtistInfo | null>(null);
  const [topTracks, setTopTracks] = useState<LfmTrack[]>([]);
  const [similar, setSimilar] = useState<LfmArtist[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/lastfm/artist?name=${encodeURIComponent(artist.name)}`)
      .then((r) => r.json())
      .then((d) => {
        setInfo(d.info);
        setTopTracks(d.topTracks ?? []);
        setSimilar(d.similar ?? []);
      })
      .finally(() => setLoading(false));
  }, [artist.name]);

  const image = lfmImage(info?.image ?? artist.image, "extralarge");
  const bio = info?.bio?.summary?.replace(/<[^>]+>/g, "").split("Read more")[0].trim();

  return (
    <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col border border-zinc-800 shadow-2xl">
        <div className="flex items-start gap-4 p-5 border-b border-zinc-800 shrink-0">
          <div className="relative w-16 h-16 shrink-0">
            {image ? (
              <Image src={image} alt={artist.name} fill className="rounded-full object-cover" sizes="64px" />
            ) : (
              <div className="w-16 h-16 rounded-full bg-zinc-800" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold text-white">{artist.name}</h2>
            {info?.stats && (
              <p className="text-zinc-400 text-sm">
                {Number(info.stats.listeners).toLocaleString()} listeners ·{" "}
                {Number(info.stats.playcount).toLocaleString()} plays
              </p>
            )}
            {info?.tags?.tag && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {info.tags.tag.slice(0, 4).map((tag) => (
                  <span key={tag.name} className="text-xs bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full">
                    {tag.name}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <a
              href={artist.url}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
              title="Open on Last.fm"
            >
              <ExternalLink size={16} />
            </a>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-6">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 size={28} className="animate-spin text-zinc-500" />
            </div>
          ) : (
            <>
              {bio && (
                <section>
                  <h3 className="text-white font-semibold mb-2">About</h3>
                  <p className="text-zinc-400 text-sm leading-relaxed line-clamp-4">{bio}</p>
                </section>
              )}

              {topTracks.length > 0 && (
                <section>
                  <h3 className="text-white font-semibold mb-2">Top Tracks</h3>
                  <div className="space-y-1">
                    {topTracks.map((t, i) => (
                      <LfmTrackCard key={`${t.name}-${i}`} track={t} rank={i + 1} />
                    ))}
                  </div>
                </section>
              )}

              {similar.length > 0 && (
                <section>
                  <h3 className="text-white font-semibold mb-2">Similar Artists</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {similar.map((a, i) => (
                      <LfmArtistCard key={`${a.name}-${i}`} artist={a} />
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
