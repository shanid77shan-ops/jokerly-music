"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { usePlayerStore } from "@/store/player";
import { isHomePath } from "@/lib/home-paths";

/** Push a history entry so Android/TWA back does not immediately close the app. */
function pushHistoryEntry() {
  window.history.pushState({ jkmBack: true }, "", window.location.href);
}

function closePlayerOverlays(): boolean {
  const { isQueueOpen, isPlayerExpanded } = usePlayerStore.getState();
  if (isQueueOpen) {
    usePlayerStore.setState({ isQueueOpen: false });
    return true;
  }
  if (isPlayerExpanded) {
    usePlayerStore.setState({ isPlayerExpanded: false });
    return true;
  }
  return false;
}

/**
 * Hardware back (TWA / PWA): close overlays first, then previous route.
 * Only exit the app from the home page with nothing open.
 */
export default function BackNavigationHandler() {
  const pathname = usePathname();
  const router = useRouter();
  const stackRef = useRef<string[]>([]);
  const skipStackSyncRef = useRef(false);
  const isFirstPathRef = useRef(true);

  useEffect(() => {
    if (skipStackSyncRef.current) {
      skipStackSyncRef.current = false;
      return;
    }
    const stack = stackRef.current;
    if (stack.length === 0) {
      stackRef.current = [pathname];
      return;
    }
    if (stack[stack.length - 1] !== pathname) {
      stack.push(pathname);
    }
  }, [pathname]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isHomePath(pathname)) return;

    if (isFirstPathRef.current) {
      isFirstPathRef.current = false;
    }

    // Non-home routes get a history entry so hardware back does not close the TWA.
    pushHistoryEntry();
  }, [pathname]);

  useEffect(() => {
    return usePlayerStore.subscribe((state, prev) => {
      const openedQueue = !prev.isQueueOpen && state.isQueueOpen;
      const openedPlayer = !prev.isPlayerExpanded && state.isPlayerExpanded;
      if (openedQueue || openedPlayer) {
        pushHistoryEntry();
      }
    });
  }, []);

  useEffect(() => {
    const onPopState = () => {
      if (closePlayerOverlays()) {
        pushHistoryEntry();
        return;
      }

      const urlPath = window.location.pathname;
      const stack = stackRef.current;

      if (urlPath !== pathname) {
        while (stack.length > 1 && stack[stack.length - 1] !== urlPath) {
          stack.pop();
        }
        if (stack[stack.length - 1] !== urlPath) {
          stack.push(urlPath);
        }
        skipStackSyncRef.current = true;
        return;
      }

      if (stack.length > 1) {
        stack.pop();
        const previous = stack[stack.length - 1];
        skipStackSyncRef.current = true;
        router.push(previous);
        pushHistoryEntry();
        return;
      }

      if (!isHomePath(pathname)) {
        skipStackSyncRef.current = true;
        stackRef.current = ["/"];
        router.push("/");
        pushHistoryEntry();
      }
    };

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [pathname, router]);

  return null;
}
