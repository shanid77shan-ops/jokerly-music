"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Home, ListMusic } from "lucide-react";
import { usePlayerStore } from "@/store/player";

export default function FloatingNav() {
  const pathname = usePathname();
  const router = useRouter();
  const hasPlayer = usePlayerStore((s) => s.currentTrack !== null);
  const isExpanded = usePlayerStore((s) => s.isPlayerExpanded);

  useEffect(() => {
    router.prefetch("/");
    router.prefetch("/playlists");
  }, [router]);

  const go = (e: React.PointerEvent<HTMLButtonElement> | React.MouseEvent<HTMLButtonElement>, target: "/" | "/playlists") => {
    e.preventDefault();
    e.stopPropagation();
    if (pathname === target) return;
    router.push(target, { scroll: false });
  };

  if (isExpanded) return null;

  return (
    <div className={`fixed left-1/2 -translate-x-1/2 z-50 transition-all duration-300 ${hasPlayer ? "bottom-[88px]" : "bottom-5"}`}>
      <div className="flex items-center gap-1.5 p-1 rounded-full shadow-2xl"
        style={{ background: "rgba(9,3,5,0.95)", backdropFilter: "blur(24px)", boxShadow: "0 4px 24px rgba(0,0,0,0.6)" }}>
        <button type="button"
          onPointerDown={(e) => go(e, "/")}
          onClick={(e) => e.preventDefault()}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-full font-semibold text-base transition-all duration-200 ${
            pathname === "/"
              ? "btn-red text-white"
              : "text-white/50 hover:text-white hover:bg-white/[0.08]"
          }`}>
          <Home size={18} />
          <span>Home</span>
        </button>

        <button type="button"
          onPointerDown={(e) => go(e, "/playlists")}
          onClick={(e) => e.preventDefault()}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-full font-semibold text-base transition-all duration-200 ${
            pathname === "/playlists"
              ? "btn-red text-white"
              : "text-white/50 hover:text-white hover:bg-white/[0.08]"
          }`}>
          <ListMusic size={18} />
          <span>Playlists</span>
        </button>
      </div>
    </div>
  );
}
