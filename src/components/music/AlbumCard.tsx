import { SpotifyAlbum } from "@/types";
import Image from "next/image";
import Link from "next/link";

interface Props {
  album: SpotifyAlbum;
}

export default function AlbumCard({ album }: Props) {
  const image = album.images[0]?.url;

  return (
    <Link
      href={album.external_urls.spotify}
      target="_blank"
      rel="noopener noreferrer"
      className="flex flex-col gap-2 p-3 rounded-xl hover:bg-zinc-800/60 transition-colors group"
    >
      {image && (
        <Image
          src={image}
          alt={album.name}
          width={160}
          height={160}
          className="rounded-lg object-cover w-40 h-40"
        />
      )}
      <div>
        <p className="text-white text-sm font-medium truncate group-hover:text-green-400 transition-colors">
          {album.name}
        </p>
        <p className="text-zinc-400 text-xs truncate">
          {album.artists.map((a) => a.name).join(", ")}
        </p>
        <p className="text-zinc-600 text-xs">{album.release_date.slice(0, 4)}</p>
      </div>
    </Link>
  );
}
