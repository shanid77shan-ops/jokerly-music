import { SpotifyAlbum, albumImage } from "@/types/spotify";
import { Disc3 } from "lucide-react";
import Image from "next/image";

interface Props {
  album: SpotifyAlbum;
}

export default function SpotifyAlbumCard({ album }: Props) {
  const image = albumImage(album);
  const artists = album.artists.map((a) => a.name).join(", ");

  return (
    <a
      href={album.external_urls.spotify}
      target="_blank"
      rel="noopener noreferrer"
      className="flex flex-col gap-2.5 p-3 rounded-2xl border hover:scale-[1.02] transition-all duration-200 group"
      style={{ background: "var(--card)", borderColor: "var(--border)" }}
    >
      <div className="relative w-full aspect-square">
        {image ? (
          <Image src={image} alt={album.name} fill unoptimized className="rounded-xl object-cover shadow-lg shadow-black/40" sizes="160px" />
        ) : (
          <div className="w-full h-full rounded-xl bg-white/[0.06] flex items-center justify-center">
            <Disc3 size={32} className="text-white/25" />
          </div>
        )}
      </div>
      <div>
        <p className="text-white text-sm font-semibold truncate group-hover:text-[#e53935] transition-colors">
          {album.name}
        </p>
        <p className="text-white/40 text-xs truncate mt-0.5">{artists}</p>
        <p className="text-white/20 text-xs capitalize mt-0.5">
          {album.album_type} · {album.release_date?.slice(0, 4)}
        </p>
      </div>
    </a>
  );
}
