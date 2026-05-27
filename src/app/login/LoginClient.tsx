"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";
import { Loader2, LogIn } from "lucide-react";
import Image from "next/image";
import { SPOTIFY_SCOPES } from "@/lib/spotify-scopes";

export default function LoginClient() {
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setLoading(true);
    await signIn(
      "spotify",
      { callbackUrl: `${window.location.origin}/` },
      { scope: SPOTIFY_SCOPES }
    );
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4" style={{ background: "#080406" }}>
      {/* Background glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full blur-3xl" style={{ background: "radial-gradient(ellipse, rgba(232,40,43,0.18) 0%, transparent 70%)" }} />
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] rounded-full blur-3xl" style={{ background: "rgba(232,40,43,0.06)" }} />
      </div>

      <div className="relative w-full max-w-sm text-center space-y-8">
        {/* Logo */}
        <div className="space-y-3">
          <div className="flex items-center justify-center">
            <Image src="/logo.png" alt="Jokerly" width={80} height={80} className="rounded-2xl" unoptimized />
          </div>
          <h1 className="text-5xl font-bold text-white tracking-tight">Jokerly</h1>
          <p className="text-base" style={{ color: "rgba(255,255,255,0.45)" }}>Your personal music universe</p>
        </div>

        {/* Features */}
        <div className="grid grid-cols-2 gap-3 text-left">
          {[
            { icon: "🔍", label: "Search tracks & artists" },
            { icon: "✨", label: "Personalised picks" },
            { icon: "🎵", label: "Create playlists" },
            { icon: "📌", label: "Pin your favourites" },
          ].map(({ icon, label }) => (
            <div key={label} className="flex items-center gap-2 rounded-xl px-3 py-2.5" style={{ background: "#161014", border: "1px solid rgba(255,255,255,0.06)" }}>
              <span className="text-base">{icon}</span>
              <span className="text-xs font-medium" style={{ color: "rgba(255,255,255,0.75)" }}>{label}</span>
            </div>
          ))}
        </div>

        {/* Login button */}
        <button
          onClick={handleLogin}
          disabled={loading}
          className="w-full flex items-center justify-center gap-3 disabled:opacity-60 text-white font-bold py-4 rounded-2xl transition-all duration-200 text-base active:scale-[0.98]"
          style={{ background: "#E8282B", boxShadow: "0 8px 32px rgba(232,40,43,0.40)" }}
          onMouseEnter={e => (e.currentTarget.style.background = "#F03336")}
          onMouseLeave={e => (e.currentTarget.style.background = "#E8282B")}
        >
          {loading ? <Loader2 size={20} className="animate-spin" /> : <LogIn size={20} />}
          {loading ? "Connecting..." : "Sign in"}
        </button>

        <p className="text-xs" style={{ color: "rgba(255,255,255,0.22)" }}>
          Powered by Last.fm ·{" "}
          <a href="/privacy" className="underline hover:text-white/40">
            Privacy
          </a>
        </p>
      </div>
    </div>
  );
}
