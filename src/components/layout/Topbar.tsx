"use client";

import { signOut, useSession } from "next-auth/react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sun, Moon, Settings, X, User, Search } from "lucide-react";

const navLinks = [
  { href: "/search", label: "Search", icon: Search },
];

function SettingsModal({ onClose }: { onClose: () => void }) {
  const { data: session } = useSession();

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 rounded-2xl w-full max-w-sm border border-zinc-800 shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-zinc-800">
          <h2 className="text-white font-semibold text-lg">Settings</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors">
            <X size={18} />
          </button>
        </div>
        <div className="p-5 space-y-5">
          <div className="flex items-center gap-3">
            {session?.user?.image ? (
              <Image src={session.user.image} alt={session.user.name ?? "User"} width={48} height={48} className="rounded-full" />
            ) : (
              <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center">
                <User size={20} className="text-zinc-400" />
              </div>
            )}
            <div>
              <p className="text-white font-medium">{session?.user?.name}</p>
              <p className="text-zinc-400 text-sm">{session?.user?.email}</p>
            </div>
          </div>
          <div className="h-px bg-zinc-800" />
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-red-400 hover:bg-red-500/10 transition-colors text-sm font-medium"
          >
            <X size={16} />
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Topbar() {
  const { data: session } = useSession();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const pathname = usePathname();
  const sessionError = (session as { error?: string } | null)?.error;

  useEffect(() => setMounted(true), []);

  return (
    <>
      {sessionError && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-red-600 text-white text-sm px-4 py-2.5 flex items-center justify-between gap-3">
          <span>Your Spotify session has expired. Please sign out and sign back in.</span>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="shrink-0 bg-white text-red-600 font-semibold text-xs px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
          >
            Sign out
          </button>
        </div>
      )}
      <header className={`sticky z-30 bg-black/90 backdrop-blur border-b border-zinc-900 shrink-0 ${sessionError ? "top-10" : "top-0"}`}>
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <span className="text-red-500 text-xl">🎵</span>
            <span className="text-white font-bold text-lg tracking-tight">Jokerly</span>
          </Link>

          {/* Nav links — hidden on small screens */}
          <nav className="hidden md:flex items-center gap-1">
            {navLinks.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  pathname === href
                    ? "text-red-400 bg-red-500/10"
                    : "text-zinc-400 hover:text-white hover:bg-zinc-900"
                }`}
              >
                <Icon size={15} />
                {label}
              </Link>
            ))}
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-1.5">
            {session?.user?.image && (
              <Image src={session.user.image} alt={session.user.name ?? ""} width={28} height={28} className="rounded-full hidden sm:block" />
            )}
            <span className="text-zinc-300 text-sm font-medium hidden lg:block">{session?.user?.name}</span>

            {mounted && (
              <button
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                className="p-2 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-zinc-900 transition-colors"
                title={theme === "dark" ? "Light mode" : "Dark mode"}
              >
                {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
              </button>
            )}

            <button
              onClick={() => setShowSettings(true)}
              className="p-2 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-zinc-900 transition-colors"
              title="Settings"
            >
              <Settings size={17} />
            </button>
          </div>
        </div>

        {/* Mobile nav row */}
        <div className="md:hidden flex items-center gap-1 px-4 pb-2 overflow-x-auto">
          {navLinks.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                pathname === href
                  ? "text-red-400 bg-red-500/10 border border-red-500/30"
                  : "text-zinc-400 hover:text-white bg-zinc-900"
              }`}
            >
              <Icon size={13} />
              {label}
            </Link>
          ))}
        </div>
      </header>

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </>
  );
}
