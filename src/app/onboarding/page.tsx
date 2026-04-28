"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LANGUAGES } from "@/lib/languages";
import { Check, Music2, Loader2 } from "lucide-react";

export default function OnboardingPage() {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set(["english"]));
  const [saving, setSaving] = useState(false);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  };

  const handleContinue = async () => {
    if (selected.size === 0) return;
    setSaving(true);
    try {
      await fetch("/api/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ languages: Array.from(selected) }),
      });
      router.push("/");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-red-500/10 mb-4">
            <Music2 size={28} className="text-red-400" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">What languages do you vibe with?</h1>
          <p className="text-zinc-400 text-sm">Pick one or more — we&apos;ll personalize your music feed.</p>
        </div>

        {/* Language grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          {LANGUAGES.map((lang) => {
            const isSelected = selected.has(lang.id);
            return (
              <button
                key={lang.id}
                onClick={() => toggle(lang.id)}
                className={`relative flex flex-col items-center gap-2 rounded-2xl border px-4 py-5 transition-all duration-150 ${
                  isSelected
                    ? "border-red-500 bg-red-500/10 shadow-lg shadow-red-500/10"
                    : "border-zinc-800 bg-zinc-900 hover:border-zinc-600 hover:bg-zinc-800"
                }`}
              >
                {isSelected && (
                  <span className="absolute top-2.5 right-2.5 w-5 h-5 rounded-full bg-red-500 flex items-center justify-center">
                    <Check size={11} className="text-white" strokeWidth={3} />
                  </span>
                )}
                <span className="text-3xl">{lang.emoji}</span>
                <span className={`text-sm font-medium ${isSelected ? "text-white" : "text-zinc-400"}`}>
                  {lang.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* CTA */}
        <div className="flex flex-col items-center gap-3">
          <button
            onClick={handleContinue}
            disabled={selected.size === 0 || saving}
            className="w-full sm:w-auto sm:min-w-[220px] bg-red-500 hover:bg-red-400 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-sm px-8 py-3.5 rounded-2xl transition-colors flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : null}
            {saving ? "Saving…" : `Continue with ${selected.size} language${selected.size !== 1 ? "s" : ""}`}
          </button>
          <p className="text-zinc-600 text-xs">You can change this anytime from the home page.</p>
        </div>
      </div>
    </div>
  );
}
