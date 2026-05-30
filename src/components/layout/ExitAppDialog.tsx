"use client";

interface Props {
  open: boolean;
  onCancel: () => void;
  onExit: () => void;
}

export default function ExitAppDialog({ open, onCancel, onExit }: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div
        className="w-full max-w-sm rounded-2xl border border-white/10 p-5 shadow-2xl"
        style={{ background: "var(--surface)" }}
        role="dialog"
        aria-labelledby="exit-app-title"
        aria-modal="true"
      >
        <h2 id="exit-app-title" className="text-lg font-semibold text-white">
          Exit JKMuusic?
        </h2>
        <p className="mt-2 text-sm text-white/55">
          Do you want to leave the app?
        </p>
        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium text-white/80 bg-white/10 hover:bg-white/15 transition-colors"
          >
            Stay
          </button>
          <button
            type="button"
            onClick={onExit}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors"
            style={{ background: "#E8282B" }}
          >
            Exit
          </button>
        </div>
      </div>
    </div>
  );
}
