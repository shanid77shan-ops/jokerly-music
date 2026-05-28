"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2, Copy, X } from "lucide-react";

export type TransferResult =
  | { type: "success"; title: string; message: string; url?: string | null }
  | { type: "error"; title: string; message: string; details?: string; needsReauth?: boolean };

interface Props {
  result: TransferResult;
  onClose: () => void;
  onReauthorize?: () => void;
}

export default function TransferResultDialog({ result, onClose, onReauthorize }: Props) {
  const [copied, setCopied] = useState(false);
  const isSuccess = result.type === "success";
  const details = result.type === "error" ? result.details || result.message : "";
  const errorText = result.type === "error" ? `${result.title} ${result.message} ${details}`.toLowerCase() : "";
  const looksLikeSpotifyPermissionError =
    errorText.includes("spotify") &&
    (errorText.includes("permission") ||
      errorText.includes("token") ||
      errorText.includes("401") ||
      errorText.includes("unauthorized") ||
      errorText.includes("continue with spotify"));
  const canReauthorize = result.type === "error" && onReauthorize && (result.needsReauth || looksLikeSpotifyPermissionError);

  const copyDetails = async () => {
    await navigator.clipboard.writeText(details);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div
      className="fixed inset-0 z-[220] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.72)", backdropFilter: "blur(8px)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-sm rounded-3xl border border-white/[0.08] p-5 shadow-2xl shadow-black/70"
        style={{ background: "var(--surface)" }}
      >
        <div className="flex items-start gap-3">
          <div
            className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl"
            style={{ background: isSuccess ? "rgba(34,197,94,0.14)" : "rgba(232,40,43,0.14)" }}
          >
            {isSuccess ? (
              <CheckCircle2 size={22} className="text-green-400" />
            ) : (
              <AlertCircle size={22} className="text-[#E8282B]" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-base font-bold text-white">{result.title}</p>
            <p className="mt-1 text-sm leading-relaxed text-white/55">{result.message}</p>
          </div>
          <button onClick={onClose} className="rounded-xl p-1.5 text-white/30 transition-colors hover:bg-white/[0.07] hover:text-white">
            <X size={16} />
          </button>
        </div>

        {result.type === "error" && (
          <div className="mt-4 space-y-3">
            <div className="max-h-32 overflow-auto rounded-2xl border border-white/[0.06] bg-black/20 p-3">
              <p className="whitespace-pre-wrap break-words text-xs leading-relaxed text-white/45">{details}</p>
            </div>
            <button
              onClick={copyDetails}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/[0.08] px-4 py-2.5 text-sm font-semibold text-white/70 transition-colors hover:bg-white/[0.06]"
            >
              <Copy size={14} />
              {copied ? "Copied" : "Copy error"}
            </button>
          </div>
        )}

        <div className="mt-5 flex gap-2">
          {result.type === "success" && result.url && (
            <button
              onClick={() => window.open(result.url || "", "_blank", "noopener,noreferrer")}
              className="flex-1 rounded-2xl bg-[#1DB954] px-4 py-2.5 text-sm font-bold text-black transition-opacity hover:opacity-90"
            >
              Open Spotify
            </button>
          )}
          {canReauthorize && (
            <button
              onClick={onReauthorize}
              className="flex-1 rounded-2xl bg-[#1DB954] px-4 py-2.5 text-sm font-bold text-black transition-opacity hover:opacity-90"
            >
              Continue with Spotify
            </button>
          )}
          <button
            onClick={onClose}
            className={`${(result.type === "success" && result.url) || canReauthorize ? "flex-1" : "w-full"} rounded-2xl bg-[#E8282B] px-4 py-2.5 text-sm font-bold text-white transition-opacity hover:opacity-90`}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
