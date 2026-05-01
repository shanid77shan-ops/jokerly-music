"use client";

import { useEffect } from "react";

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    // Disable PWA SW for now: it can serve stale bundles/navigation responses,
    // which causes route-tap behavior to differ from in-page interactions.
    navigator.serviceWorker.getRegistrations()
      .then((regs) => Promise.all(regs.map((reg) => reg.unregister())))
      .catch(() => {});

    if ("caches" in window) {
      caches.keys()
        .then((keys) => Promise.all(keys.filter((k) => k.startsWith("jokerly-")).map((k) => caches.delete(k))))
        .catch(() => {});
    }
  }, []);

  return null;
}
