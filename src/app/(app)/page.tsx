import { auth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PinnedPlaylist } from "@/types";
import Link from "next/link";
import { Pin } from "lucide-react";
import PinnedPlaylistSection from "@/components/home/PinnedPlaylistSection";

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

        <PinnedPlaylistSection pinned={pinned} />
      </section>
    </div>
  );
}
