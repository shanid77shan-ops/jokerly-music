"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, ListMusic } from "lucide-react";

export default function FloatingNav() {
  const pathname = usePathname();

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3">
      <Link
        href="/"
        className={`flex items-center gap-2 px-5 py-3 rounded-full font-semibold text-sm shadow-2xl transition-all duration-200 ${
          pathname === "/"
            ? "bg-red-500 text-white shadow-red-500/40 scale-105"
            : "bg-zinc-900 text-zinc-300 hover:bg-zinc-800 hover:text-white border border-zinc-700 shadow-black/60"
        }`}
      >
        <Home size={18} />
        <span>Home</span>
      </Link>

      <Link
        href="/playlists"
        className={`flex items-center gap-2 px-5 py-3 rounded-full font-semibold text-sm shadow-2xl transition-all duration-200 ${
          pathname === "/playlists"
            ? "bg-red-500 text-white shadow-red-500/40 scale-105"
            : "bg-zinc-900 text-zinc-300 hover:bg-zinc-800 hover:text-white border border-zinc-700 shadow-black/60"
        }`}
      >
        <ListMusic size={18} />
        <span>Playlists</span>
      </Link>
    </div>
  );
}
