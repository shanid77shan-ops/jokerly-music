"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LANGUAGES } from "@/lib/languages";
import { Check, Music2, Loader2, ArrowLeft } from "lucide-react";

export default function OnboardingPage() {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set(["english"]));
  const [saving, setSaving] = useState(false);
  const [hasExisting, setHasExisting] = useState(false);

  // Pre-fill with existing prefs if editing
  useEffect(() => {
    fetch("/api/preferences")
      .then((r) => r.json())
      .then((d) => {
        if (d.languages?.length) {
          setSelected(new Set(d.languages));
          setHasExisting(true);
        }
      })
      .catch(() => {});
  }, []);

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
    <div className="min-h-screen bg-black flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-2xl">
        {/* Back button — only shown when editing existing prefs */}
        {hasExisting && (
          <button
            onClick={() => router.back()}
            className="flex items-center gap-1.5 text-zinc-400 hover:text-white transition-colors text-sm mb-6"
          >
            <ArrowLeft size={16} />
            Back
          </button>
        )}

        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-red-500/10 mb-3">
            <Music2 size={24} className="text-red-400" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-1.5">
            {hasExisting ? "Update your language preferences" : "What languages do you vibe with?"}
          </h1>
          <p className="text-zinc-400 text-sm">Pick one or more — we&apos;ll personalize your music feed.</p>
        </div>

        {/* Language grid — smaller cards */}
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mb-7">
          {LANGUAGES.map((lang) => {
            const isSelected = selected.has(lang.id);
            return (
              <button
                key={lang.id}
                onClick={() => toggle(lang.id)}
                className={`relative flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 transition-all duration-150 ${
                  isSelected
                    ? "border-red-500 bg-red-500/10"
                    : "border-zinc-800 bg-zinc-900 hover:border-zinc-600 hover:bg-zinc-800"
                }`}
              >
                {isSelected && (
                  <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-red-500 flex items-center justify-center">
                    <Check size={9} className="text-white" strokeWidth={3} />
                  </span>
                )}
                <span className="text-2xl">{lang.emoji}</span>
                <span className={`text-xs font-medium leading-tight text-center ${isSelected ? "text-white" : "text-zinc-400"}`}>
                  {lang.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* CTA */}
        <div className="flex flex-col items-center gap-2.5">
          <button
            onClick={handleContinue}
            disabled={selected.size === 0 || saving}
            className="w-full sm:w-auto sm:min-w-[200px] bg-red-500 hover:bg-red-400 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-sm px-8 py-3 rounded-2xl transition-colors flex items-center justify-center gap-2"
          >
            {saving && <Loader2 size={15} className="animate-spin" />}
            {saving ? "Saving…" : `Continue with ${selected.size} language${selected.size !== 1 ? "s" : ""}`}
          </button>
          <p className="text-zinc-600 text-xs">You can change this anytime from the home page.</p>
        </div>
      </div>
    </div>
  );
}
