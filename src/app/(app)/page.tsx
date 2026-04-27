import { auth } from "@/lib/auth";
import { getTopTracks, getTopArtists } from "@/lib/lastfm";
import LfmTrackCard from "@/components/music/LfmTrackCard";
import LfmArtistCard from "@/components/music/LfmArtistCard";
import Link from "next/link";
import { Sparkles, Search, Home, ListMusic } from "lucide-react";

export default async function HomePage() {
  const session = await auth();

  const [topTracks, topArtists] = await Promise.allSettled([
    getTopTracks(10),
    getTopArtists(8),
  ]);

  const tracks = topTracks.status === "fulfilled" ? topTracks.value : [];
  const artists = topArtists.status === "fulfilled" ? topArtists.value : [];

  const firstName = session?.user?.name?.split(" ")[0] ?? "there";

  return (
    <div className="space-y-10">
      <div>
        <h2 className="text-3xl font-bold text-white mb-1">Good evening, {firstName} 👋</h2>
        <p className="text-zinc-400">Here's what's trending on Last.fm right now.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link
          href="/"
          className="flex items-center gap-3 p-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 transition-colors"
        >
          <Home size={24} className="text-red-400" />
          <span className="font-semibold">Home</span>
        </Link>
        <Link
          href="/playlists"
          className="flex items-center gap-3 p-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 transition-colors"
        >
          <ListMusic size={24} className="text-purple-400" />
          <span className="font-semibold">Playlists</span>
        </Link>
      </div>

      {tracks.length > 0 && (
        <section>
          <h3 className="text-xl font-bold text-white mb-4">🔥 Global top tracks</h3>
          <div className="space-y-1">
            {tracks.map((track, i) => (
              <LfmTrackCard key={`${track.name}-${i}`} track={track} rank={i + 1} />
            ))}
          </div>
        </section>
      )}

      {artists.length > 0 && (
        <section>
          <h3 className="text-xl font-bold text-white mb-4">🎤 Top artists this week</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {artists.map((artist, i) => (
              <LfmArtistCard key={`${artist.name}-${i}`} artist={artist} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
