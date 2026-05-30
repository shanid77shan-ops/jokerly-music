"use client";

import { useEffect } from "react";
import { registerBackCloser } from "@/store/back-stack";

/** Register phone/TWA back to close this overlay before leaving the page or exiting the app. */
export function useBackHandler(active: boolean, onClose: () => void) {
  useEffect(() => {
    if (!active) return;
    return registerBackCloser(onClose);
  }, [active, onClose]);
}
