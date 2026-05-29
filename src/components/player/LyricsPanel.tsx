"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PlayableTrack } from "@/store/player";
import { LYRIC_TARGET_LANGUAGES } from "@/lib/translate";
import { Languages, Loader2, MicVocal } from "lucide-react";

interface LrcLine {
  timeMs: number;
  text: string;
}

interface Props {
  track: PlayableTrack;
  progressMs: number;
  fullscreen?: boolean;
}

export default function LyricsPanel({ track, progressMs, fullscreen }: Props) {
  const [originalSynced, setOriginalSynced] = useState<LrcLine[] | null>(null);
  const [originalPlain, setOriginalPlain] = useState<string | null>(null);
  const [displaySynced, setDisplaySynced] = useState<LrcLine[] | null>(null);
  const [displayPlain, setDisplayPlain] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [translating, setTranslating] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [translateError, setTranslateError] = useState<string | null>(null);
  const [targetLang, setTargetLang] = useState("en");
  const [showingTranslation, setShowingTranslation] = useState(false);
  const activeRef = useRef<HTMLParagraphElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const resetDisplay = useCallback((synced: LrcLine[] | null, plain: string | null) => {
    setDisplaySynced(synced);
    setDisplayPlain(plain);
    setShowingTranslation(false);
    setTranslateError(null);
  }, []);

  useEffect(() => {
    setLoading(true);
    setNotFound(false);
    setOriginalSynced(null);
    setOriginalPlain(null);
    resetDisplay(null, null);

    const artist = track.artist.split(",")[0].trim();
    const url = `/api/lyrics?artist=${encodeURIComponent(artist)}&track=${encodeURIComponent(track.name)}`;

    fetch(url)
      .then(async (response) => {
        const data = (await response.json().catch(() => ({}))) as {
          syncedLines?: LrcLine[];
          plainText?: string;
          notFound?: boolean;
          error?: string;
        };
        if (!response.ok) {
          setNotFound(true);
          return;
        }
        if (data.notFound || data.error) {
          setNotFound(true);
          return;
        }
        if (data.syncedLines?.length) {
          setOriginalSynced(data.syncedLines);
          resetDisplay(data.syncedLines, null);
        } else if (data.plainText) {
          setOriginalPlain(data.plainText);
          resetDisplay(null, data.plainText);
        } else {
          setNotFound(true);
        }
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [track.name, track.artist, resetDisplay]);

  const handleShowOriginal = () => {
    resetDisplay(originalSynced, originalPlain);
  };

  const handleTranslate = async () => {
    if (!originalSynced?.length && !originalPlain) return;

    setTranslating(true);
    setTranslateError(null);

    try {
      const res = await fetch("/api/lyrics/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          originalSynced?.length
            ? { target: targetLang, lines: originalSynced.map((l) => l.text) }
            : { target: targetLang, plainText: originalPlain }
        ),
      });

      const data = (await res.json().catch(() => ({}))) as {
        lines?: string[];
        plainText?: string;
        error?: string;
      };

      if (!res.ok) {
        setTranslateError(data.error ?? "Translation failed");
        return;
      }

      if (originalSynced?.length && data.lines?.length) {
        setDisplaySynced(
          originalSynced.map((line, i) => ({
            timeMs: line.timeMs,
            text: data.lines?.[i] ?? line.text,
          }))
        );
        setDisplayPlain(null);
      } else if (data.plainText) {
        setDisplayPlain(data.plainText);
        setDisplaySynced(null);
      } else {
        setTranslateError("Translation returned no text");
        return;
      }

      setShowingTranslation(true);
    } catch {
      setTranslateError("Could not translate lyrics");
    } finally {
      setTranslating(false);
    }
  };

  const syncedLines = displaySynced;
  const plainText = displayPlain;

  const activeIdx = syncedLines
    ? syncedLines.reduce((best, line, i) => (line.timeMs <= progressMs ? i : best), -1)
    : -1;

  useEffect(() => {
    if (activeRef.current && containerRef.current) {
      const container = containerRef.current;
      const el = activeRef.current;
      const offset = el.offsetTop - container.offsetHeight / 2 + el.offsetHeight / 2;
      container.scrollTo({ top: offset, behavior: "smooth" });
    }
  }, [activeIdx]);

  const langLabel =
    LYRIC_TARGET_LANGUAGES.find((l) => l.code === targetLang)?.label ?? targetLang;

  return (
    <div className={`flex flex-col min-h-0 ${fullscreen ? "flex-1" : ""}`}>
      {!loading && !notFound && (
        <div
          className={`shrink-0 flex flex-wrap items-center gap-2 mb-2 ${fullscreen ? "px-1" : ""}`}
        >
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <Languages size={14} className="text-white/35 shrink-0" />
            <select
              value={targetLang}
              onChange={(e) => setTargetLang(e.target.value)}
              className="flex-1 min-w-0 text-xs rounded-lg border border-white/[0.08] bg-white/[0.06] text-white px-2 py-1.5 outline-none focus:border-[#E8282B]/40"
              aria-label="Translation language"
            >
              {LYRIC_TARGET_LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code} className="bg-zinc-900">
                  {lang.label}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={() => void handleTranslate()}
            disabled={translating}
            className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg bg-[#E8282B] text-white hover:bg-[#d42225] disabled:opacity-50 transition-colors"
          >
            {translating ? "Translating…" : "Translate"}
          </button>
          {showingTranslation && (
            <button
              type="button"
              onClick={handleShowOriginal}
              className="shrink-0 text-xs font-medium px-2 py-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/[0.06] transition-colors"
            >
              Original
            </button>
          )}
        </div>
      )}

      {showingTranslation && !translateError && (
        <p className={`text-[10px] text-[#E8282B]/80 mb-2 ${fullscreen ? "px-1" : ""}`}>
          Translated to {langLabel}
        </p>
      )}

      {translateError && (
        <p className={`text-[10px] text-red-400/90 mb-2 ${fullscreen ? "px-1" : ""}`}>
          {translateError}
        </p>
      )}

      <div
        ref={containerRef}
        className={`overflow-y-auto rounded-2xl px-4 py-3 space-y-3 scrollbar-hide ${
          fullscreen ? "flex-1 h-0" : "max-h-56"
        }`}
        style={{ background: fullscreen ? "transparent" : "var(--card)" }}
      >
        {loading && (
          <div className="flex flex-col items-center justify-center py-8 gap-2">
            <Loader2 size={18} className="animate-spin text-white/30" />
            <p className="text-[11px] text-white/25">Loading lyrics…</p>
          </div>
        )}

        {!loading && notFound && (
          <div className="flex flex-col items-center justify-center py-8 gap-2">
            <MicVocal size={24} className="text-white/15" />
            <p className="text-xs text-white/30">No lyrics found</p>
          </div>
        )}

        {!loading &&
          syncedLines &&
          syncedLines.map((line, i) => (
            <p
              key={i}
              ref={i === activeIdx ? activeRef : null}
              className={`text-center leading-snug transition-all duration-300 ${
                i === activeIdx
                  ? `font-bold ${fullscreen ? "text-white text-xl" : "text-white text-base"}`
                  : Math.abs(i - activeIdx) <= 2
                    ? `${fullscreen ? "text-white/65 text-base" : "text-white/40 text-sm"}`
                    : `${fullscreen ? "text-white/35 text-sm" : "text-white/20 text-sm"}`
              }`}
            >
              {line.text}
            </p>
          ))}

        {!loading && plainText && (
          <pre
            className={`whitespace-pre-wrap font-sans leading-relaxed ${
              fullscreen ? "text-white/75 text-base" : "text-white/60 text-sm"
            }`}
          >
            {plainText}
          </pre>
        )}
      </div>
    </div>
  );
}
