"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { X } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISSED_KEY = "jokerly-install-dismissed";

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [show, setShow] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    // Don't show if already dismissed or already installed (standalone mode)
    if (
      localStorage.getItem(DISMISSED_KEY) ||
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true
    ) {
      return;
    }

    // iOS Safari — no beforeinstallprompt, show manual guide
    const ios =
      /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as Window & { MSStream?: unknown }).MSStream;
    if (ios) {
      setIsIos(true);
      setShow(true);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShow(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const dismiss = () => {
    setShow(false);
    localStorage.setItem(DISMISSED_KEY, "1");
  };

  const install = async () => {
    if (!deferredPrompt) return;
    setInstalling(true);
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setShow(false);
    } else {
      setInstalling(false);
    }
    setDeferredPrompt(null);
  };

  if (!show) return null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-[200] px-4 pb-6 pt-2 pointer-events-none"
      style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
    >
      <div
        className="pointer-events-auto mx-auto max-w-sm rounded-3xl border border-white/[0.09] p-4 shadow-2xl flex items-center gap-3"
        style={{ background: "rgba(21,6,8,0.97)", backdropFilter: "blur(28px)" }}
      >
        {/* Icon */}
        <div className="relative w-12 h-12 rounded-2xl overflow-hidden shrink-0 shadow-lg">
          <Image src="/icon-192.png" alt="Jokerly" fill sizes="48px" className="object-cover" />
        </div>

        {/* Text */}
        <div className="flex-1 min-w-0">
          <p className="text-white font-bold text-sm leading-tight">Install Jokerly</p>
          {isIos ? (
            <p className="text-white/45 text-xs mt-0.5 leading-snug">
              Tap <span className="text-white/70">Share</span> then{" "}
              <span className="text-white/70">&ldquo;Add to Home Screen&rdquo;</span>
            </p>
          ) : (
            <p className="text-white/45 text-xs mt-0.5">Add to your home screen</p>
          )}
        </div>

        {/* Actions */}
        {!isIos && (
          <button
            onClick={install}
            disabled={installing}
            className="shrink-0 px-3.5 py-2 rounded-xl text-white text-xs font-bold transition-all active:scale-95 disabled:opacity-50"
            style={{ background: "#E8282B", boxShadow: "0 2px 12px rgba(232,40,43,0.40)" }}
          >
            {installing ? "…" : "Install"}
          </button>
        )}

        <button
          onClick={dismiss}
          className="shrink-0 p-1.5 rounded-xl text-white/30 hover:text-white hover:bg-white/[0.08] transition-colors"
        >
          <X size={15} />
        </button>
      </div>
    </div>
  );
}
