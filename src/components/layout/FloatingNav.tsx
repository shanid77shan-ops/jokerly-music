"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, ListMusic } from "lucide-react";
import { usePlayerStore } from "@/store/player";

export default function FloatingNav() {
  const pathname = usePathname();
  const hasPlayer = usePlayerStore((s) => s.currentTrack !== null);
  const isExpanded = usePlayerStore((s) => s.isPlayerExpanded);

  if (isExpanded) return null;

  return (
    <div className={`fixed left-1/2 -translate-x-1/2 z-50 transition-all duration-300 ${hasPlayer ? "bottom-[88px]" : "bottom-5"}`}>
      <div className="flex items-center gap-1.5 p-1 rounded-full border border-[#c0392b]/[0.22] shadow-2xl shadow-black/70"
        style={{ background: "rgba(10,6,24,0.95)", backdropFilter: "blur(24px)" }}>
        <Link href="/"
          className={`flex items-center gap-2 px-4 py-2.5 rounded-full font-semibold text-sm transition-all duration-200 ${
            pathname === "/"
              ? "bg-[#c0392b] text-white shadow-lg shadow-[#c0392b]/30"
              : "text-white/50 hover:text-white hover:bg-white/[0.08]"
          }`}>
          <Home size={16} />
          <span>Home</span>
        </Link>

        <Link href="/playlists"
          className={`flex items-center gap-2 px-4 py-2.5 rounded-full font-semibold text-sm transition-all duration-200 ${
            pathname === "/playlists"
              ? "bg-[#c0392b] text-white shadow-lg shadow-[#c0392b]/30"
              : "text-white/50 hover:text-white hover:bg-white/[0.08]"
          }`}>
          <ListMusic size={16} />
          <span>Playlists</span>
        </Link>
      </div>
    </div>
  );
}
