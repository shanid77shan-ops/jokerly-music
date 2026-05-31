"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Home, ListMusic, Heart, Download } from "lucide-react";
import { usePlayerStore } from "@/store/player";

type NavTarget = "/" | "/playlists" | "/liked" | "/downloaded";

export default function FloatingNav() {
  const pathname = usePathname();
  const router = useRouter();
  const hasPlayer = usePlayerStore((s) => s.currentTrack !== null);
  const isExpanded = usePlayerStore((s) => s.isPlayerExpanded);

  useEffect(() => {
    router.prefetch("/");
    router.prefetch("/playlists");
    router.prefetch("/liked");
    router.prefetch("/downloaded");
  }, [router]);

  const go = (e: React.PointerEvent<HTMLButtonElement> | React.MouseEvent<HTMLButtonElement>, target: NavTarget) => {
    e.preventDefault();
    e.stopPropagation();
    if (pathname === target) return;
    router.push(target, { scroll: false });
  };

  const bottomClass = hasPlayer ? "bottom-[104px]" : "bottom-[5.5rem]";

  if (isExpanded) return null;

  const btn = (target: NavTarget, icon: React.ReactNode, label: string) => (
    <button
      type="button"
      onPointerDown={(e) => go(e, target)}
      onClick={(e) => e.preventDefault()}
      className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-2.5 rounded-full font-semibold text-xs sm:text-sm transition-all duration-200 ${
        pathname === target
          ? "btn-red text-white"
          : "text-white/50 hover:text-white hover:bg-white/[0.08]"
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );

  return (
    <div
      className={`fixed left-1/2 -translate-x-1/2 z-[55] transition-all duration-300 pointer-events-none ${bottomClass}`}
    >
      <nav
        className="pointer-events-auto flex items-center gap-0.5 sm:gap-1 p-1 sm:p-1.5 rounded-full border border-white/12"
        style={{
          background: "rgba(9,3,5,0.92)",
          backdropFilter: "blur(28px)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.04)",
        }}
        aria-label="Main navigation"
      >
        {btn("/", <Home size={17} />, "Home")}
        {btn("/playlists", <ListMusic size={17} />, "Playlist")}
        {btn("/downloaded", <Download size={17} />, "Downloads")}
        {btn("/liked", <Heart size={17} />, "Liked")}
      </nav>
    </div>
  );
}
