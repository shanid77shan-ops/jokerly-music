import { SpotifyArtist } from "@/types";
import Image from "next/image";
import Link from "next/link";

interface Props {
  artist: SpotifyArtist;
}

export default function ArtistCard({ artist }: Props) {
  const image = artist.images?.[0]?.url;

  return (
    <Link
      href={artist.external_urls.spotify}
      target="_blank"
      rel="noopener noreferrer"
      className="flex flex-col items-center gap-2 p-4 rounded-xl hover:bg-zinc-800/60 transition-colors group"
    >
      {image ? (
        <Image
          src={image}
          alt={artist.name}
          width={96}
          height={96}
          className="rounded-full object-cover w-24 h-24"
        />
      ) : (
        <div className="w-24 h-24 rounded-full bg-zinc-700 flex items-center justify-center text-3xl">
          🎤
        </div>
      )}
      <span className="text-white text-sm font-medium text-center truncate w-full group-hover:text-green-400 transition-colors">
        {artist.name}
      </span>
      {artist.followers && (
        <span className="text-zinc-500 text-xs">
          {artist.followers.total.toLocaleString()} followers
        </span>
      )}
    </Link>
  );
}
