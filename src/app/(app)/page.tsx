import { auth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PinnedPlaylist } from "@/types";
import Link from "next/link";
import Image from "next/image";
import { Pin } from "lucide-react";

export default async function HomePage() {
  const session = await auth();
  const firstName = session?.user?.name?.split(" ")[0] ?? "there";
  const supabase = await createClient();

  let pinned: PinnedPlaylist[] = [];
  if (session?.spotifyId) {
    const { data } = await supabase
      .from("pinned_playlists")
      .select("*")
      .eq("user_id", session.spotifyId)
      .order("pinned_at", { ascending: false })
      .limit(6);
    pinned = (data ?? []) as PinnedPlaylist[];
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-white mb-1">Good evening, {firstName} 👋</h2>
        <p className="text-zinc-400">Welcome to Jokerly. Search for anything.</p>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-white font-semibold flex items-center gap-2">
            <Pin size={16} className="text-red-400" /> Pinned Playlists
          </h3>
          <Link href="/pinned" className="text-xs text-zinc-400 hover:text-white transition-colors">
            View all
          </Link>
        </div>

        {pinned.length === 0 ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 text-zinc-500 text-sm">
            No pinned playlists yet. Pin playlists from the Playlists page.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {pinned.map((pl) => (
              <div
                key={pl.id}
                className="rounded-xl border border-zinc-800 bg-zinc-900/60 hover:bg-zinc-800 transition-colors p-3 flex items-center gap-3"
              >
                {pl.playlist_image ? (
                  <Image
                    src={pl.playlist_image}
                    alt={pl.playlist_name}
                    width={44}
                    height={44}
                    className="rounded-lg object-cover"
                  />
                ) : (
                  <div className="w-11 h-11 rounded-lg bg-zinc-800 flex items-center justify-center">
                    <Pin size={16} className="text-zinc-500" />
                  </div>
                )}
                <p className="text-sm text-white truncate">{pl.playlist_name}</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
