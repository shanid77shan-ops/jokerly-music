"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { usePlayerStore } from "@/store/player";
import { closeTopBackLayer, hasBackLayers } from "@/store/back-stack";
import { isHomePath } from "@/lib/home-paths";
import { pushHistoryEntry } from "@/lib/back-history";
import ExitAppDialog from "@/components/layout/ExitAppDialog";

function closePlayerOverlays(): boolean {
  const { isQueueOpen, isPlayerExpanded, isPlaying } = usePlayerStore.getState();
  if (isQueueOpen) {
    usePlayerStore.setState({ isQueueOpen: false });
    void usePlayerStore.getState().maintainPlayback(isPlaying);
    return true;
  }
  if (isPlayerExpanded) {
    usePlayerStore.setState({ isPlayerExpanded: false });
    void usePlayerStore.getState().maintainPlayback(isPlaying);
    return true;
  }
  return false;
}

/**
 * Hardware back (TWA / PWA): sheets/modals → player overlays → previous route → exit confirm on home.
 */
export default function BackNavigationHandler() {
  const pathname = usePathname();
  const router = useRouter();
  const stackRef = useRef<string[]>([]);
  const skipStackSyncRef = useRef(false);
  const allowAppExitRef = useRef(false);
  const [showExitDialog, setShowExitDialog] = useState(false);

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
    if (!isHomePath(pathname)) {
      pushHistoryEntry();
      return;
    }
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

  const stayInApp = useCallback(() => {
    pushHistoryEntry();
  }, []);

  const handlePopState = useCallback(() => {
    if (allowAppExitRef.current) {
      allowAppExitRef.current = false;
      setShowExitDialog(false);
      return;
    }

    if (closeTopBackLayer()) {
      stayInApp();
      return;
    }

    if (closePlayerOverlays()) {
      stayInApp();
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
      setShowExitDialog(false);
      return;
    }

    if (stack.length > 1) {
      const wasPlaying = usePlayerStore.getState().isPlaying;
      stack.pop();
      const previous = stack[stack.length - 1];
      skipStackSyncRef.current = true;
      setShowExitDialog(false);
      router.push(previous);
      stayInApp();
      window.setTimeout(() => {
        void usePlayerStore.getState().maintainPlayback(wasPlaying);
      }, 80);
      return;
    }

    if (!isHomePath(pathname)) {
      const wasPlaying = usePlayerStore.getState().isPlaying;
      skipStackSyncRef.current = true;
      stackRef.current = ["/"];
      setShowExitDialog(false);
      router.push("/");
      stayInApp();
      window.setTimeout(() => {
        void usePlayerStore.getState().maintainPlayback(wasPlaying);
      }, 80);
      return;
    }

    if (hasBackLayers()) {
      stayInApp();
      return;
    }

    setShowExitDialog(true);
    stayInApp();
  }, [pathname, router, stayInApp]);

  useEffect(() => {
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [handlePopState]);

  const cancelExit = useCallback(() => {
    setShowExitDialog(false);
    stayInApp();
  }, [stayInApp]);

  const confirmExit = useCallback(() => {
    setShowExitDialog(false);
    allowAppExitRef.current = true;
    window.history.back();
    window.setTimeout(() => {
      allowAppExitRef.current = true;
      window.history.back();
    }, 50);
  }, []);

  return (
    <ExitAppDialog
      open={showExitDialog}
      onCancel={cancelExit}
      onExit={confirmExit}
    />
  );
}
