"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Search, ListMusic, Sparkles, Pin, Heart } from "lucide-react";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/", icon: Home, label: "Home" },
  { href: "/search", icon: Search, label: "Search" },
  { href: "/recommendations", icon: Sparkles, label: "For You" },
  { href: "/playlists", icon: ListMusic, label: "Playlists" },
  { href: "/liked", icon: Heart, label: "Liked" },
  { href: "/pinned", icon: Pin, label: "Pinned" },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-60 bg-black border-r border-zinc-900 flex flex-col h-full shrink-0">
      <div className="p-6 border-b border-zinc-900">
        <h1 className="text-2xl font-bold tracking-tight">
          <span className="text-red-500">🎵</span>{" "}
          <span className="text-white">Jokerly</span>
        </h1>
      </div>

      <nav className="flex flex-col gap-1 px-3 pt-3">
        {nav.map(({ href, icon: Icon, label }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
              pathname === href
                ? "bg-red-500/20 text-red-400 border border-red-500/30"
                : "text-zinc-400 hover:text-white hover:bg-zinc-900"
            )}
          >
            <Icon size={20} className={pathname === href ? "text-red-400" : ""} />
            {label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
