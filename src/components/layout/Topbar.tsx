"use client";

import { signOut, useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import Image from "next/image";
import { X, User, Settings } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";

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
            className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-[#E8282B] hover:bg-[#E8282B]/10 transition-colors text-sm font-medium"
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
  const router = useRouter();
  const sessionError = (session as { error?: string } | null)?.error;

  useEffect(() => {
    setMounted(true);
    router.prefetch("/");
  }, [router]);

  const go = (e: React.PointerEvent<HTMLButtonElement> | React.MouseEvent<HTMLButtonElement>, target: "/") => {
    e.preventDefault();
    e.stopPropagation();
    if (pathname === target) return;
    router.push(target, { scroll: false });
  };
  if (!mounted) return null;

  return (
    <>
      {sessionError && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-[#E8282B] text-white text-sm px-4 py-2.5 flex items-center justify-between gap-3">
          <span>Your Spotify session expired. Please sign back in.</span>
          <button onClick={() => signOut({ callbackUrl: "/login" })}
            className="shrink-0 bg-white text-[#E8282B] font-semibold text-xs px-3 py-1.5 rounded-lg">
            Sign out
          </button>
        </div>
      )}
      <header className={`sticky z-30 shrink-0 ${sessionError ? "top-10" : "top-0"}`}
        style={{ background: "rgba(9,3,5,0.95)", backdropFilter: "blur(24px)" }}>
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between gap-4">

          {/* Logo */}
          <button type="button"
            onPointerDown={(e) => go(e, "/")}
            onClick={(e) => e.preventDefault()}
            className="flex items-center gap-2.5 shrink-0">
            <Image src="/icon-96.png" alt="Jokerly" width={34} height={34} className="rounded-xl" />
            <span className="text-[#E8282B] font-bold text-lg tracking-tight">Jokerly</span>
          </button>

          {/* Right side */}
          <div className="flex items-center gap-2">
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
