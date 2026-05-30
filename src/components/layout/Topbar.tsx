"use client";

import { signIn, signOut, useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import Image from "next/image";
import { X, User, Settings, Bell, Loader2, RefreshCw } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { APP_NAME, APP_TAGLINE } from "@/lib/branding";
import { SPOTIFY_SCOPES } from "@/lib/spotify-scopes";
import { useBackHandler } from "@/hooks/useBackHandler";

function SettingsModal({ onClose }: { onClose: () => void }) {
  const { data: session } = useSession();
  const [notifBusy, setNotifBusy] = useState(false);
  const [notifEnabled, setNotifEnabled] = useState(false);
  const [notifMessage, setNotifMessage] = useState<string | null>(null);

  const reconnectSpotify = () => {
    void signIn(
      "spotify",
      { callbackUrl: window.location.href },
      { scope: SPOTIFY_SCOPES, show_dialog: "true" }
    );
  };

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    fetch("/api/push/subscribe")
      .then((r) => r.json())
      .then((d) => {
        if (d?.subscribed) {
          setNotifEnabled(true);
          fetch("/api/push/artist-drops", { method: "POST" }).catch(() => {});
        }
      })
      .catch(() => {});
  }, []);

  const urlBase64ToUint8Array = (base64String: string) => {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const rawData = atob(base64);
    return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
  };

  const enableNotifications = async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setNotifMessage("Push notifications are not supported on this device.");
      return;
    }

    setNotifBusy(true);
    setNotifMessage(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setNotifMessage("Notification permission was not granted.");
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      const keyRes = await fetch("/api/push/public-key");
      const keyData = await keyRes.json();
      if (!keyRes.ok || !keyData?.publicKey) {
        setNotifMessage("Push is not configured yet.");
        return;
      }

      const existing = await reg.pushManager.getSubscription();
      const subscription =
        existing ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(keyData.publicKey),
        }));

      const saveRes = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription),
      });

      if (!saveRes.ok) {
        setNotifMessage("Failed to save push subscription.");
        return;
      }

      setNotifEnabled(true);
      setNotifMessage("Notifications enabled.");

      await fetch("/api/push/test", { method: "POST" }).catch(() => {});
      await fetch("/api/push/artist-drops", { method: "POST" }).catch(() => {});
    } catch {
      setNotifMessage("Could not enable notifications.");
    } finally {
      setNotifBusy(false);
    }
  };

  const sendTestNotification = async () => {
    setNotifBusy(true);
    setNotifMessage(null);
    try {
      const res = await fetch("/api/push/test", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotifMessage(data?.error ?? "Test notification failed.");
        return;
      }
      setNotifMessage("Test notification sent.");
    } catch {
      setNotifMessage("Test notification failed.");
    } finally {
      setNotifBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="rounded-3xl w-full max-w-sm border border-white/[0.09] shadow-2xl shadow-black/60 overflow-hidden"
        style={{ background: "var(--surface)" }}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.07]">
          <h2 className="text-white font-semibold">Account</h2>
          <button onClick={onClose} className="p-1.5 rounded-xl text-white/40 hover:text-white hover:bg-white/[0.07] transition-colors">
            <X size={16} />
          </button>
        </div>
        <div className="p-5 space-y-5">
          <div className="flex items-center gap-3">
            {session?.user?.image ? (
              <Image src={session.user.image} alt={session.user.name ?? "User"} width={48} height={48} className="rounded-full ring-2 ring-white/10" />
            ) : (
              <div className="w-12 h-12 rounded-full bg-white/[0.07] flex items-center justify-center">
                <User size={20} className="text-white/40" />
              </div>
            )}
            <div>
              <p className="text-white font-semibold text-sm">{session?.user?.name}</p>
              <p className="text-white/40 text-xs mt-0.5">{session?.user?.email}</p>
            </div>
          </div>
          <div className="h-px bg-white/[0.06]" />
          <div className="rounded-2xl border border-[#1DB954]/20 p-3" style={{ background: "rgba(29,185,84,0.06)" }}>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-white text-sm font-medium">Spotify permissions</p>
                <p className="text-white/40 text-xs mt-0.5">Refresh access for playlist and liked transfers.</p>
              </div>
              <button
                onClick={reconnectSpotify}
                className="shrink-0 flex items-center gap-1.5 rounded-xl bg-[#1DB954] px-3 py-1.5 text-xs font-bold text-black transition-opacity hover:opacity-90"
              >
                <RefreshCw size={13} />
                Reconnect
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-white/[0.08] p-3" style={{ background: "rgba(255,255,255,0.03)" }}>
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-white text-sm font-medium flex items-center gap-1.5">
                  <Bell size={14} className="text-[#E8282B]" /> Release Alerts
                </p>
                <p className="text-white/40 text-xs mt-0.5">Get notified when liked artists drop new tracks.</p>
              </div>
              <button
                onClick={enableNotifications}
                disabled={notifBusy || notifEnabled}
                className="shrink-0 text-xs px-3 py-1.5 rounded-xl border border-white/[0.12] text-white/80 hover:text-white hover:border-[#E8282B]/50 transition-colors disabled:opacity-50"
              >
                {notifBusy ? <Loader2 size={13} className="animate-spin" /> : notifEnabled ? "Enabled" : "Enable"}
              </button>
            </div>
            {notifEnabled && (
              <button
                onClick={sendTestNotification}
                disabled={notifBusy}
                className="mt-2 text-xs text-[#E8282B] hover:text-[#ff6264] transition-colors"
              >
                Send test notification
              </button>
            )}
            {notifMessage && <p className="text-xs text-white/50 mt-2">{notifMessage}</p>}
          </div>

          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-[#E8282B] hover:bg-[#E8282B]/10 transition-colors text-sm font-medium"
          >
            <X size={15} />
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Topbar() {
  const { data: session } = useSession();
  const [showSettings, setShowSettings] = useState(false);
  const [mounted, setMounted] = useState(false);

  useBackHandler(showSettings, () => setShowSettings(false));
  const pathname = usePathname();
  const router = useRouter();
  const sessionError = (session as { error?: string } | null)?.error;

  useEffect(() => {
    const timer = window.setTimeout(() => setMounted(true), 0);
    router.prefetch("/");
    return () => window.clearTimeout(timer);
  }, [router]);

  useEffect(() => {
    if (!session?.spotifyId) return;
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "granted") return;

    fetch("/api/push/subscribe")
      .then((r) => r.json())
      .then((d) => {
        if (d?.subscribed) {
          fetch("/api/push/artist-drops", { method: "POST" }).catch(() => {});
        }
      })
      .catch(() => {});
  }, [session?.spotifyId]);

  const go = (e: React.PointerEvent<HTMLButtonElement> | React.MouseEvent<HTMLButtonElement>, target: "/") => {
    e.preventDefault();
    e.stopPropagation();
    if (pathname === target) return;
    router.push(target, { scroll: false });
  };
  if (!mounted) return null;

  return (
    <>
      {sessionError && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-[#E8282B] text-white text-sm px-4 py-2.5 flex items-center justify-between gap-3">
          <span>Your Spotify session expired. Please sign back in.</span>
          <button onClick={() => signOut({ callbackUrl: "/login" })}
            className="shrink-0 bg-white text-[#E8282B] font-semibold text-xs px-3 py-1.5 rounded-lg">
            Sign out
          </button>
        </div>
      )}
      <header className={`sticky z-30 shrink-0 ${sessionError ? "top-10" : "top-0"}`}
        style={{ background: "rgba(9,3,5,0.95)", backdropFilter: "blur(24px)" }}>
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between gap-4">

          {/* Logo */}
          <button type="button"
            onPointerDown={(e) => go(e, "/")}
            onClick={(e) => e.preventDefault()}
            className="flex items-center gap-2.5 shrink-0">
            <Image src="/icon-96.png" alt={APP_NAME} width={34} height={34} className="rounded-xl" />
            <div className="flex flex-col items-start leading-tight">
              <span className="text-[#E8282B] font-bold text-base tracking-tight">{APP_NAME}</span>
              <span className="text-[10px] text-white/40 font-medium">{APP_TAGLINE}</span>
            </div>
          </button>

          {/* Right side */}
          <div className="flex items-center gap-2">
            <button onClick={() => setShowSettings(true)}
              className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-full hover:bg-white/[0.07] transition-colors">
              {session?.user?.image ? (
                <Image src={session.user.image} alt={session.user.name ?? ""} width={26} height={26} className="rounded-full ring-1 ring-white/20" />
              ) : (
                <div className="w-7 h-7 rounded-full bg-white/[0.07] flex items-center justify-center">
                  <User size={14} className="text-white/40" />
                </div>
              )}
              <Settings size={14} className="text-white/30" />
            </button>
          </div>
        </div>
      </header>

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </>
  );
}
