"use client";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import Image from "next/image";
import { APP_NAME, APP_TAGLINE } from "@/lib/branding";
import { SPOTIFY_SIGN_IN_OPTIONS } from "@/lib/spotify-auth-client";

function loginErrorMessage(code: string | null): string | null {
  if (!code) return null;
  if (code === "Configuration") {
    return "Server auth is not configured. In Vercel, set AUTH_SECRET, SPOTIFY_CLIENT_ID, and SPOTIFY_CLIENT_SECRET, then redeploy.";
  }
  if (code === "AccessDenied") {
    return "Spotify denied access. Add your email in Spotify Developer → User Management (Development mode), then try again.";
  }
  return `Sign-in failed (${code}). Try again or use Switch account in settings.`;
}

export default function LoginClient() {
  const searchParams = useSearchParams();
  const authError = useMemo(
    () => loginErrorMessage(searchParams.get("error")),
    [searchParams]
  );
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setLoading(true);
    await signIn("spotify", { callbackUrl: `${window.location.origin}/` }, SPOTIFY_SIGN_IN_OPTIONS);
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
            <Image src="/logo.png" alt={APP_NAME} width={80} height={80} className="rounded-2xl" unoptimized />
          </div>
          <h1 className="text-5xl font-bold text-white tracking-tight">{APP_NAME}</h1>
          <p className="text-base" style={{ color: "rgba(255,255,255,0.45)" }}>{APP_TAGLINE}</p>
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

        {authError ? (
          <div
            className="rounded-xl px-4 py-3 text-left text-xs leading-relaxed border border-red-500/30"
            style={{ background: "rgba(232,40,43,0.12)", color: "rgba(255,200,200,0.95)" }}
          >
            {authError}
          </div>
        ) : null}

        {/* Login button */}
        <button
          onClick={handleLogin}
          disabled={loading}
          className="w-full flex items-center justify-center gap-3 disabled:opacity-60 text-white font-bold py-4 rounded-2xl transition-all duration-200 text-base active:scale-[0.98]"
          style={{ background: "#E8282B", boxShadow: "0 8px 32px rgba(232,40,43,0.40)" }}
          onMouseEnter={e => (e.currentTarget.style.background = "#F03336")}
          onMouseLeave={e => (e.currentTarget.style.background = "#E8282B")}
        >
          {loading ? (
            <Loader2 size={20} className="animate-spin" />
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
            </svg>
          )}
          {loading ? "Connecting..." : "Continue with Spotify"}
        </button>

        <p className="text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.35)" }}>
          Each person signs in with their own Spotify account. Playlists, likes, and pins are saved per account.
        </p>
        <p className="text-xs" style={{ color: "rgba(255,255,255,0.22)" }}>
          Powered by Spotify & Last.fm
        </p>
      </div>
    </div>
  );
}
