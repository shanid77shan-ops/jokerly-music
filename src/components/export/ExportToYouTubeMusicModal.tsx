"use client";

import { useState } from "react";
import { X, Loader2, Copy, Check } from "lucide-react";
import { useToastStore } from "@/store/toast";

interface Track {
  name: string;
  artist: string;
}

interface Props {
  title: string; // "Playlist Name" or "Artist Name"
  tracks: Track[];
  onClose: () => void;
}

type Step = "cookies" | "confirm" | "exporting" | "success";

export default function ExportToYouTubeMusicModal({ title, tracks, onClose }: Props) {
  const [step, setStep] = useState<Step>("cookies");
  const [cookieString, setCookieString] = useState("");
  const [playlistName, setPlaylistName] = useState(title);
  const [description, setDescription] = useState("");
  const [privacy, setPrivacy] = useState<"PUBLIC" | "PRIVATE" | "UNLISTED">("PRIVATE");
  const [exporting, setExporting] = useState(false);
  const [result, setResult] = useState<{ addedCount: number; warnings: string[] } | null>(null);
  const [copied, setCopied] = useState(false);
  const { toast } = useToastStore();

  const handleContinue = () => {
    if (!cookieString.trim()) {
      toast("Please paste your YouTube Music cookies");
      return;
    }
    setStep("confirm");
  };

  const handleExport = async () => {
    if (!playlistName.trim()) {
      toast("Please enter a playlist name");
      return;
    }

    setExporting(true);
    setStep("exporting");

    try {
      const tracksToMove = tracks.map((t) => ({
        title: t.name,
        artist: t.artist,
      }));

      const response = await fetch("/api/youtube-music/migrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cookieString,
          playlistName: playlistName.trim(),
          playlistDescription: description.trim(),
          privacy,
          tracksToMove,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Export failed (${response.status})`);
      }

      const data = await response.json();
      setResult({
        addedCount: data.addedTrackCount,
        warnings: data.warnings || [],
      });
      setStep("success");
      toast(`✓ Exported ${data.addedTrackCount} tracks to YouTube Music`);
    } catch (error) {
      toast((error as Error).message || "Export failed");
      setStep("confirm");
    } finally {
      setExporting(false);
    }
  };

  const copyGuideText =
    "1. Go to https://music.youtube.com\n2. Open DevTools (F12)\n3. Go to Application > Cookies\n4. Copy the value of '__Secure-1PAPISID' cookie\n5. Paste it here";

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)" }}
    >
      <div
        className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl border border-white/[0.08] flex flex-col"
        style={{ background: "var(--surface)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/[0.06]">
          <h2 className="text-lg font-semibold text-white">Export to YouTube Music</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-white/[0.08] transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto min-h-0 p-4 space-y-4">
          {step === "cookies" && (
            <>
              <div className="space-y-2">
                <label className="text-sm font-medium text-white/80">
                  YouTube Music Cookies
                </label>
                <p className="text-xs text-white/50 leading-relaxed whitespace-pre-wrap">
                  {copyGuideText}
                </p>
              </div>

              <div className="relative">
                <textarea
                  value={cookieString}
                  onChange={(e) => setCookieString(e.target.value)}
                  placeholder="Paste __Secure-1PAPISID cookie here..."
                  className="w-full px-3 py-2.5 rounded-xl text-sm border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.05] focus:bg-white/[0.08] focus:border-white/[0.15] text-white placeholder-white/25 resize-none focus:outline-none transition-colors"
                  rows={4}
                />
              </div>

              <p className="text-xs text-white/40">
                🔒 Your cookie is only used for this request and not stored.
              </p>
            </>
          )}

          {step === "confirm" && (
            <>
              <div className="space-y-2">
                <label className="text-sm font-medium text-white/80">
                  Playlist Name
                </label>
                <input
                  type="text"
                  value={playlistName}
                  onChange={(e) => setPlaylistName(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl text-sm border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.05] focus:bg-white/[0.08] focus:border-white/[0.15] text-white focus:outline-none transition-colors"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-white/80">
                  Description (optional)
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Add a description..."
                  className="w-full px-3 py-2.5 rounded-xl text-sm border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.05] focus:bg-white/[0.08] focus:border-white/[0.15] text-white placeholder-white/25 resize-none focus:outline-none transition-colors"
                  rows={2}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-white/80">
                  Privacy
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(["PRIVATE", "PUBLIC", "UNLISTED"] as const).map((p) => (
                    <button
                      key={p}
                      onClick={() => setPrivacy(p)}
                      className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                        privacy === p
                          ? "bg-[#E8282B] text-white"
                          : "bg-white/[0.05] text-white/60 hover:bg-white/[0.08]"
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-2">
                <p className="text-xs text-white/50">
                  Will export <span className="font-semibold text-white/70">{tracks.length}</span> tracks
                </p>
              </div>
            </>
          )}

          {step === "exporting" && (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <Loader2 size={32} className="animate-spin text-[#E8282B]/60" />
              <div className="text-center">
                <p className="text-sm font-medium text-white mb-1">Exporting to YouTube Music</p>
                <p className="text-xs text-white/50">This may take a moment...</p>
              </div>
            </div>
          )}

          {step === "success" && result && (
            <>
              <div className="flex flex-col items-center justify-center py-8 gap-3">
                <div className="w-12 h-12 rounded-full bg-[#E8282B]/20 flex items-center justify-center">
                  <Check size={24} className="text-[#E8282B]" />
                </div>
                <div className="text-center">
                  <p className="text-lg font-semibold text-white">Export Complete!</p>
                  <p className="text-sm text-white/60 mt-1">
                    {result.addedCount} of {tracks.length} tracks added
                  </p>
                </div>
              </div>

              {result.warnings.length > 0 && (
                <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3 space-y-1">
                  <p className="text-xs font-semibold text-yellow-600">Issues found:</p>
                  <ul className="text-xs text-yellow-600/80 space-y-0.5">
                    {result.warnings.slice(0, 5).map((w, i) => (
                      <li key={i}>• {w}</li>
                    ))}
                  </ul>
                  {result.warnings.length > 5 && (
                    <p className="text-xs text-yellow-600/60 pt-1">
                      +{result.warnings.length - 5} more issues
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 p-4 border-t border-white/[0.06]">
          {step === "success" ? (
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-xl font-medium bg-[#E8282B] text-white hover:bg-[#E8282B]/90 transition-colors"
            >
              Done
            </button>
          ) : step === "exporting" ? (
            <button
              disabled
              className="flex-1 px-4 py-2.5 rounded-xl font-medium bg-[#E8282B]/50 text-white/50 cursor-not-allowed"
            >
              Exporting...
            </button>
          ) : step === "cookies" ? (
            <>
              <button
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl font-medium text-white/60 hover:bg-white/[0.05] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleContinue}
                className="flex-1 px-4 py-2.5 rounded-xl font-medium bg-[#E8282B] text-white hover:bg-[#E8282B]/90 transition-colors"
              >
                Continue
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setStep("cookies")}
                className="px-4 py-2.5 rounded-xl font-medium text-white/60 hover:bg-white/[0.05] transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleExport}
                disabled={exporting}
                className="flex-1 px-4 py-2.5 rounded-xl font-medium bg-[#E8282B] text-white hover:bg-[#E8282B]/90 disabled:opacity-50 transition-colors"
              >
                {exporting ? "Exporting..." : "Export"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
