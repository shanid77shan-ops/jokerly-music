"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";
import { Loader2, Music2 } from "lucide-react";

export default function LoginClient() {
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setLoading(true);
    await signIn("spotify", { callbackUrl: "/" });
  };

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center px-4">
      {/* Background glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-red-500/10 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm text-center space-y-8">
        {/* Logo */}
        <div className="space-y-3">
          <div className="flex items-center justify-center">
            <div className="w-16 h-16 rounded-2xl bg-red-500/20 border border-red-500/30 flex items-center justify-center">
              <Music2 size={32} className="text-red-400" />
            </div>
          </div>
          <h1 className="text-5xl font-bold text-white tracking-tight">Jokerly</h1>
          <p className="text-zinc-400 text-base">Your personal music universe</p>
        </div>

        {/* Features */}
        <div className="grid grid-cols-2 gap-3 text-left">
          {[
            { icon: "🔍", label: "Search tracks & artists" },
            { icon: "✨", label: "Personalised picks" },
            { icon: "🎵", label: "Create playlists" },
            { icon: "📌", label: "Pin your favourites" },
          ].map(({ icon, label }) => (
            <div key={label} className="flex items-center gap-2 bg-zinc-900 rounded-xl px-3 py-2.5 border border-zinc-800">
              <span className="text-base">{icon}</span>
              <span className="text-zinc-300 text-xs font-medium">{label}</span>
            </div>
          ))}
        </div>

        {/* Login button */}
        <button
          onClick={handleLogin}
          disabled={loading}
          className="w-full flex items-center justify-center gap-3 bg-red-500 hover:bg-red-400 active:bg-red-600 disabled:opacity-60 text-white font-bold py-4 rounded-2xl transition-all duration-200 text-base shadow-lg shadow-red-500/30"
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

        <p className="text-zinc-600 text-xs">
          Powered by Spotify & Last.fm
        </p>
      </div>
    </div>
  );
}
