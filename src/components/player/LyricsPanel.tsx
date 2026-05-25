"use client";

import { useEffect, useRef, useState } from "react";
import { PlayableTrack } from "@/store/player";
import { Loader2, MicVocal } from "lucide-react";

interface LrcLine { timeMs: number; text: string; }

interface Props {
  track: PlayableTrack;
  progressMs: number;
  fullscreen?: boolean;
}

export default function LyricsPanel({ track, progressMs, fullscreen }: Props) {
  const [syncedLines, setSyncedLines] = useState<LrcLine[] | null>(null);
  const [plainText, setPlainText] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const activeRef = useRef<HTMLParagraphElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setLoading(true);
    setNotFound(false);
    setSyncedLines(null);
    setPlainText(null);

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
        if (!response.ok || data.notFound) {
          setNotFound(true);
          return;
        }
        if (data.syncedLines?.length) setSyncedLines(data.syncedLines);
        else if (data.plainText) setPlainText(data.plainText);
        else setNotFound(true);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [track.name, track.artist]);

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

  return (
    <div
      ref={containerRef}
      className={`overflow-y-auto rounded-2xl px-4 py-3 space-y-3 scrollbar-hide ${fullscreen ? "flex-1 h-0" : "max-h-56"}`}
      style={{ background: fullscreen ? "transparent" : "var(--card)" }}
    >
      {loading && (
        <div className="flex flex-col items-center justify-center py-8 gap-2">
          <Loader2 size={18} className="animate-spin text-white/30" />
          <p className="text-[11px] text-white/25">Loading lyrics in English…</p>
        </div>
      )}

      {!loading && notFound && (
        <div className="flex flex-col items-center justify-center py-8 gap-2">
          <MicVocal size={24} className="text-white/15" />
          <p className="text-xs text-white/30">No lyrics found</p>
        </div>
      )}

      {!loading && syncedLines && syncedLines.map((line, i) => (
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
        <pre className={`whitespace-pre-wrap font-sans leading-relaxed ${fullscreen ? "text-white/75 text-base" : "text-white/60 text-sm"}`}>
          {plainText}
        </pre>
      )}
    </div>
  );
}
