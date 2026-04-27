"use client";

import { useEffect, useState } from "react";

const cache = new Map<string, string | null>();
let queue: (() => void)[] = [];
let active = 0;
const MAX_CONCURRENT = 4;

function runQueue() {
  while (active < MAX_CONCURRENT && queue.length > 0) {
    const next = queue.shift()!;
    active++;
    next();
  }
}

export function useSpotifyImage(
  name: string,
  artist: string,
  override?: string | null
): string | null {
  const [img, setImg] = useState<string | null>(override ?? null);

  useEffect(() => {
    if (override) { setImg(override); return; }
    const key = `${name.toLowerCase()}::${artist.toLowerCase()}`;
    if (cache.has(key)) { setImg(cache.get(key)!); return; }

    let cancelled = false;
    const run = () => {
      fetch(`/api/spotify/resolve?track=${encodeURIComponent(name)}&artist=${encodeURIComponent(artist)}`)
        .then((r) => r.json())
        .then((d) => {
          const url: string | null = d.imageUrl ?? null;
          cache.set(key, url);
          if (!cancelled) setImg(url);
        })
        .catch(() => { cache.set(key, null); })
        .finally(() => { active = Math.max(0, active - 1); runQueue(); });
    };
    queue.push(run);
    runQueue();

    return () => { cancelled = true; };
  }, [name, artist, override]);

  return img;
}
