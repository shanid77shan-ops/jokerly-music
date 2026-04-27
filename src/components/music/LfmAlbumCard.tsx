import { LfmAlbum, lfmImage } from "@/lib/lastfm";
import { Disc3 } from "lucide-react";
import Image from "next/image";

interface Props {
  album: LfmAlbum;
}

export default function LfmAlbumCard({ album }: Props) {
  const image = lfmImage(album.image, "extralarge");

  return (
    <a
      href={album.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex flex-col gap-2 p-3 rounded-xl hover:bg-zinc-800/60 transition-colors group"
    >
      <div className="relative w-full aspect-square">
        {image ? (
          <Image
            src={image}
            alt={album.name}
            fill
            className="rounded-lg object-cover"
            sizes="160px"
          />
        ) : (
          <div className="w-full h-full rounded-lg bg-zinc-800 flex items-center justify-center">
            <Disc3 size={32} className="text-zinc-600" />
          </div>
        )}
      </div>
      <div>
        <p className="text-white text-sm font-medium truncate group-hover:text-green-400 transition-colors">
          {album.name}
        </p>
        <p className="text-zinc-400 text-xs truncate">{album.artist}</p>
      </div>
    </a>
  );
}
