import { pushHistoryEntry } from "@/lib/back-history";

type BackCloser = () => void;

const closers: BackCloser[] = [];

export function registerBackCloser(close: BackCloser): () => void {
  closers.push(close);
  pushHistoryEntry();
  return () => {
    const index = closers.lastIndexOf(close);
    if (index >= 0) closers.splice(index, 1);
  };
}

/** Close the topmost overlay/sheet (playlist, artist, modal, etc.). */
export function closeTopBackLayer(): boolean {
  if (closers.length === 0) return false;
  const close = closers[closers.length - 1];
  close();
  return true;
}

export function hasBackLayers(): boolean {
  return closers.length > 0;
}
