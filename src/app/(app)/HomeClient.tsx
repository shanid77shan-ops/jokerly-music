"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { PinnedPlaylist } from "@/types";
import Link from "next/link";
import { Pin, Loader2, Music, Mic2, Play, ListPlus, Languages, ExternalLink } from "lucide-react";
import PinnedPlaylistSection from "@/components/home/PinnedPlaylistSection";
import { SpotifyTrack, SpotifyArtist, trackImage, artistImage, artistNames } from "@/types/spotify";
import { usePlayerStore, PlayableTrack } from "@/store/player";
import Image from "next/image";
import AddToPlaylistModal from "@/components/playlist/AddToPlaylistModal";
import { getLanguage } from "@/lib/languages";

interface FeedSection {
  langId: string;
  label: string;
  emoji: string;
  tracks: SpotifyTrack[];
  artists: SpotifyArtist[];
}

function toPlayableFromTrack(t: SpotifyTrack): PlayableTrack {
  return {
    name: t.name,
    artist: artistNames(t),
    image: trackImage(t) ?? undefined,
    uri: t.uri,
    durationMs: t.duration_ms,
  };
}

export default function HomeClient() {
  const router = useRouter();

  // Preferences
  const [langs, setLangs] = useState<string[] | null>(null);
  const [prefsChecked, setPrefsChecked] = useState(false);

  // Feed
  const [feedSections, setFeedSections] = useState<FeedSection[]>([]);
  const [feedLoading, setFeedLoading] = useState(false);

  // Pinned
  const [pinned, setPinned] = useState<PinnedPlaylist[]>([]);

  // Modal
  const [modalTrack, setModalTrack] = useState<{ name: string; uri: string; image?: string | null; artist?: string | null } | null>(null);

  const { setQueueAndPlay } = usePlayerStore();

  // 1. Check language preferences
  useEffect(() => {
    fetch("/api/preferences")
      .then((r) => r.json())
      .then((data) => { setLangs(data.languages ?? []); setPrefsChecked(true); })
      .catch(() => { setLangs([]); setPrefsChecked(true); });
  }, []);

  // 2. Redirect to onboarding if no prefs
  useEffect(() => {
    if (prefsChecked && langs !== null && langs.length === 0) {
      router.push("/onboarding");
    }
  }, [prefsChecked, langs, router]);

  // 3. Fetch language feed
  const fetchFeed = useCallback((langList: string[]) => {
    if (!langList.length) return;
    setFeedLoading(true);
    fetch(`/api/spotify/language-feed?langs=${langList.join(",")}`)
      .then((r) => r.json())
      .then((data) => setFeedSections(data.sections ?? []))
      .catch(() => {})
      .finally(() => setFeedLoading(false));
  }, []);

  useEffect(() => {
    if (langs && langs.length > 0) fetchFeed(langs);
  }, [langs, fetchFeed]);

  // 4. Pinned playlists
  useEffect(() => {
    fetch("/api/pinned")
      .then((r) => r.json())
      .then((data) => setPinned(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  const playSection = (section: FeedSection, index: number) => {
    setQueueAndPlay(section.tracks.map(toPlayableFromTrack), index);
  };

  if (!prefsChecked) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 size={28} className="animate-spin text-zinc-600" />
      </div>
    );
  }

  return (
    <div className="space-y-8">

      {/* Pinned playlists — top */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-white font-semibold flex items-center gap-2">
            <Pin size={16} className="text-red-400" /> Pinned Playlists
          </h3>
          <Link href="/pinned" className="text-xs text-zinc-400 hover:text-white transition-colors">
            View all
          </Link>
        </div>
        <PinnedPlaylistSection pinned={pinned} />
      </section>

      {/* Language tags */}
      {langs && langs.length > 0 && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 flex-wrap">
            {langs.map((id) => {
              const l = getLanguage(id);
              return l ? (
                <span key={id} className="text-xs bg-zinc-900 border border-zinc-800 text-zinc-300 px-2.5 py-1 rounded-full">
                  {l.emoji} {l.label}
                </span>
              ) : null;
            })}
          </div>
          <Link
            href="/onboarding"
            className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-white transition-colors shrink-0 ml-3"
          >
            <Languages size={13} />
            Edit
          </Link>
        </div>
      )}

      {/* Language feed */}
      {feedLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="text-center">
            <Loader2 size={28} className="animate-spin text-zinc-600 mx-auto mb-3" />
            <p className="text-zinc-600 text-sm">Loading your music feed…</p>
          </div>
        </div>
      ) : (
        feedSections.map((section) => (
          <section key={section.langId} className="space-y-4">
            <h3 className="text-white font-semibold text-lg">
              {section.emoji} {section.label} Picks
            </h3>

            {section.tracks.length > 0 && (
              <div>
                <p className="text-zinc-500 text-xs uppercase tracking-wider mb-2 font-medium">Tracks</p>
                <div className="space-y-1">
                  {section.tracks.slice(0, 6).map((track, i) => (
                    <div
                      key={track.id}
                      className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-zinc-900 transition-colors group"
                    >
                      <span className="text-zinc-600 text-xs w-5 text-right shrink-0 tabular-nums">{i + 1}</span>
                      <div className="relative w-9 h-9 shrink-0">
                        {trackImage(track) ? (
                          <Image src={trackImage(track)!} alt={track.name} fill unoptimized sizes="36px" className="rounded-md object-cover" />
                        ) : (
                          <div className="w-9 h-9 bg-zinc-800 rounded-md flex items-center justify-center">
                            <Music size={13} className="text-zinc-600" />
                          </div>
                        )}
                        <button
                          onClick={() => playSection(section, i)}
                          className="absolute inset-0 rounded-md bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Play size={13} className="text-white" />
                        </button>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-medium truncate">{track.name}</p>
                        <p className="text-zinc-400 text-xs truncate">{artistNames(track)}</p>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <button
                          onClick={() => track.uri && setModalTrack({ name: track.name, uri: track.uri, image: trackImage(track), artist: artistNames(track) })}
                          className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-700 transition-colors"
                          title="Add to playlist"
                        >
                          <ListPlus size={14} />
                        </button>
                        {track.external_urls?.spotify && (
                          <a
                            href={track.external_urls.spotify}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-700 transition-colors"
                            title="Open on Spotify"
                          >
                            <ExternalLink size={14} />
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {section.artists.length > 0 && (
              <div>
                <p className="text-zinc-500 text-xs uppercase tracking-wider mb-3 font-medium">Artists</p>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                  {section.artists.slice(0, 6).map((artist) => (
                    <button
                      key={artist.id}
                      onClick={() => router.push(`/search?q=${encodeURIComponent(artist.name)}`)}
                      className="flex flex-col items-center gap-2 group"
                    >
                      <div className="relative w-full aspect-square rounded-full overflow-hidden bg-zinc-800">
                        {artistImage(artist) ? (
                          <Image src={artistImage(artist)!} alt={artist.name} fill unoptimized sizes="80px" className="object-cover group-hover:scale-105 transition-transform duration-200" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Mic2 size={20} className="text-zinc-600" />
                          </div>
                        )}
                      </div>
                      <p className="text-xs text-zinc-400 group-hover:text-white transition-colors text-center truncate w-full">{artist.name}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>
        ))
      )}

      {modalTrack && (
        <AddToPlaylistModal track={modalTrack} onClose={() => setModalTrack(null)} />
      )}
    </div>
  );
}
