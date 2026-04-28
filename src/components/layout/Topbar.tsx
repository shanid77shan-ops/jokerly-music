"use client";

import { signOut, useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { X, User, Settings, Search } from "lucide-react";
import { usePathname } from "next/navigation";

function SettingsModal({ onClose }: { onClose: () => void }) {
  const { data: session } = useSession();

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="rounded-3xl w-full max-w-sm border border-white/[0.09] shadow-2xl shadow-black/60 overflow-hidden"
        style={{ background: "var(--surface)" }}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.07]">
          <h2 className="text-white font-semibold">Account</h2>
          <button onClick={onClose} className="p-1.5 rounded-xl text-white/40 hover:text-white hover:bg-white/[0.07] transition-colors">
            <X size={16} />
          </button>
        </div>
        <div className="p-5 space-y-5">
          <div className="flex items-center gap-3">
            {session?.user?.image ? (
              <Image src={session.user.image} alt={session.user.name ?? "User"} width={48} height={48} className="rounded-full ring-2 ring-white/10" />
            ) : (
              <div className="w-12 h-12 rounded-full bg-white/[0.07] flex items-center justify-center">
                <User size={20} className="text-white/40" />
              </div>
            )}
            <div>
              <p className="text-white font-semibold text-sm">{session?.user?.name}</p>
              <p className="text-white/40 text-xs mt-0.5">{session?.user?.email}</p>
            </div>
          </div>
          <div className="h-px bg-white/[0.06]" />
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-[#c0392b] hover:bg-[#c0392b]/10 transition-colors text-sm font-medium"
          >
            <X size={15} />
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Topbar() {
  const { data: session } = useSession();
  const [showSettings, setShowSettings] = useState(false);
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();
  const sessionError = (session as { error?: string } | null)?.error;

  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return (
    <>
      {sessionError && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-[#c0392b] text-white text-sm px-4 py-2.5 flex items-center justify-between gap-3">
          <span>Your Spotify session expired. Please sign back in.</span>
          <button onClick={() => signOut({ callbackUrl: "/login" })}
            className="shrink-0 bg-white text-[#c0392b] font-semibold text-xs px-3 py-1.5 rounded-lg">
            Sign out
          </button>
        </div>
      )}
      <header className={`sticky z-30 shrink-0 ${sessionError ? "top-10" : "top-0"}`}
        style={{ background: "rgba(7,5,18,0.92)", backdropFilter: "blur(24px)", borderBottom: "1px solid rgba(147,51,234,0.12)" }}>
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between gap-4">

          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <Image src="/icon-48.png" alt="Jokerly" width={26} height={26} className="rounded-lg" />
            <span className="text-white font-bold text-base tracking-tight">Jokerly</span>
          </Link>

          {/* Right side */}
          <div className="flex items-center gap-2">
            <Link href="/search"
              className={`p-2 rounded-xl transition-colors ${pathname === "/search" ? "text-[#c0392b] bg-[#c0392b]/10" : "text-white/40 hover:text-white hover:bg-white/[0.07]"}`}
              title="Search">
              <Search size={17} />
            </Link>

            <button onClick={() => setShowSettings(true)}
              className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-full hover:bg-white/[0.07] transition-colors">
              {session?.user?.image ? (
                <Image src={session.user.image} alt={session.user.name ?? ""} width={26} height={26} className="rounded-full ring-1 ring-white/20" />
              ) : (
                <div className="w-7 h-7 rounded-full bg-white/[0.07] flex items-center justify-center">
                  <User size={14} className="text-white/40" />
                </div>
              )}
              <Settings size={14} className="text-white/30" />
            </button>
          </div>
        </div>
      </header>

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </>
  );
}
