import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export interface PlayableTrack {
  name: string;
  artist: string;
  image?: string;
  uri?: string | null; // undefined = not yet resolved, null = not found on Spotify
  durationMs?: number;
}

export type RepeatMode = "off" | "all" | "one";

interface PlayerState {
  currentTrack: PlayableTrack | null;
  queue: PlayableTrack[];
  queueIndex: number;
  pendingIndex: number | null;
  isPlaying: boolean;
  isTransitioning: boolean;
  progressMs: number;
  durationMs: number;
  isPlayerReady: boolean;
  sdkError: string | null;
  player: SpotifyPlayer | null;
  deviceId: string | null;
  accessToken: string | null;
  repeatMode: RepeatMode;
  shuffleEnabled: boolean;
  endedToken: number;
  isPlayerExpanded: boolean;

  initializePlayer: (accessToken: string) => Promise<void>;
  setQueueAndPlay: (tracks: PlayableTrack[], index: number) => Promise<void>;
  updateTrackUri: (index: number, uri: string | null, imageUrl?: string | null, durationMs?: number) => void;
  playIndex: (index: number) => void;
  togglePlay: () => void;
  seek: (ratio: number) => void;
  stop: () => void;
  setRepeatMode: (mode: RepeatMode) => Promise<void>;
  toggleShuffle: () => Promise<void>;
  getNextIndex: () => number | null;
  getPrevIndex: () => number | null;
}

interface SpotifyPlayerTrack {
  uri: string;
  name: string;
  duration_ms: number;
  artists: { name: string }[];
  album: { images: { url: string }[] };
}

interface SpotifyPlayerState {
  paused: boolean;
  position: number;
  duration: number;
  track_window: { current_track: SpotifyPlayerTrack };
}

interface SpotifyPlayer {
  addListener: (event: string, cb: (arg?: unknown) => void) => void;
  connect: () => Promise<boolean>;
  disconnect: () => void;
  togglePlay: () => Promise<void>;
  seek: (positionMs: number) => Promise<void>;
  pause: () => Promise<void>;
}

interface SpotifyPlayerCtor {
  Player: new (options: {
    name: string;
    getOAuthToken: (cb: (token: string) => void) => void;
    volume?: number;
  }) => SpotifyPlayer;
}

function getSpotifyCtor(): SpotifyPlayerCtor | null {
  if (typeof window === "undefined") return null;
  return (window as typeof window & { Spotify?: SpotifyPlayerCtor }).Spotify ?? null;
}

// Spotify emits short-lived paused states during track switches.
// Keep UI stable for a brief window right after a play request.
let ignorePausedUntil = 0;

async function loadSpotifySdk(): Promise<SpotifyPlayerCtor | null> {
  const existing = getSpotifyCtor();
  if (existing) return existing;
  if (typeof window === "undefined") return null;

  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error("Spotify SDK timeout")), 10000);
    const win = window as typeof window & {
      onSpotifyWebPlaybackSDKReady?: () => void;
    };
    win.onSpotifyWebPlaybackSDKReady = () => {
      window.clearTimeout(timeout);
      resolve();
    };

    const existingScript = document.querySelector('script[src="https://sdk.scdn.co/spotify-player.js"]');
    if (existingScript) return;

    const script = document.createElement("script");
    script.src = "https://sdk.scdn.co/spotify-player.js";
    script.async = true;
    script.onerror = () => {
      window.clearTimeout(timeout);
      reject(new Error("Failed to load Spotify SDK"));
    };
    document.body.appendChild(script);
  });

  return getSpotifyCtor();
}

function hydrateFromSdkState(state: SpotifyPlayerState | null) {
  if (!state) {
    // A null state fires transiently during device transfers and SDK init.
    // Do NOT reset isPlaying here — the actual stopped/paused state arrives
    // as a non-null state with paused:true which is handled below.
    return;
  }

  const sdkTrack = state.track_window.current_track;
  const prev = usePlayerStore.getState();

  if (state.paused && state.position === 0 && Date.now() < ignorePausedUntil) {
    return;
  }

  // Spotify SDK can emit a transient paused+position=0 state during navigation/device churn.
  // If we were actively playing the same track and were not near the end, ignore it.
  if (state.paused && state.position === 0 && prev.isPlaying && prev.currentTrack?.uri === sdkTrack.uri) {
    const nearEnd = prev.durationMs > 0 && prev.progressMs >= Math.max(0, prev.durationMs - 1500);
    if (!nearEnd) return;
  }

  const { queue } = usePlayerStore.getState();
  const queueIndex = queue.findIndex((item) => item.uri === sdkTrack.uri);
  const currentTrack =
    queueIndex >= 0
      ? queue[queueIndex]
      : {
          name: sdkTrack.name,
          artist: sdkTrack.artists.map((a) => a.name).join(", "),
          image: sdkTrack.album.images?.[0]?.url,
          uri: sdkTrack.uri,
          durationMs: sdkTrack.duration_ms,
        };

  usePlayerStore.setState({
    currentTrack,
    queueIndex: queueIndex >= 0 ? queueIndex : usePlayerStore.getState().queueIndex,
    pendingIndex: null,
    isPlaying: !state.paused,
    isTransitioning: false,
    progressMs: state.position,
    durationMs: state.duration,
  });
}

async function spotifyApi(path: string, accessToken: string, options: RequestInit = {}) {
  const res = await fetch(`https://api.spotify.com/v1${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      ...(options.headers ?? {}),
    },
  });

  if (!res.ok) {
    const details = await res.text().catch(() => "");
    throw new Error(`Spotify API ${res.status}: ${details}`);
  }
}

async function playerApi(action: "play" | "repeat" | "shuffle", body: Record<string, unknown>) {
  const res = await fetch("/api/spotify/player", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...body }),
  });

  if (!res.ok) {
    const details = await res.text().catch(() => "");
    throw new Error(details || `Player API ${res.status}`);
  }
}

export const usePlayerStore = create<PlayerState>()(persist((set, get) => ({
  currentTrack: null,
  queue: [],
  queueIndex: -1,
  pendingIndex: null,
  isPlaying: false,
  isTransitioning: false,
  progressMs: 0,
  durationMs: 0,
  isPlayerReady: false,
  sdkError: null,
  player: null,
  deviceId: null,
  accessToken: null,
  repeatMode: "off",
  shuffleEnabled: false,
  endedToken: 0,
  isPlayerExpanded: false,

  initializePlayer: async (accessToken) => {
    set({ accessToken, sdkError: null });
    if (get().player) return;

    let Spotify: SpotifyPlayerCtor | null = null;
    try {
      Spotify = await loadSpotifySdk();
    } catch (e) {
      set({ sdkError: (e as Error).message ?? "Failed to load Spotify player" });
      return;
    }
    if (!Spotify) {
      set({ sdkError: "Spotify player unavailable" });
      return;
    }

    const player = new Spotify.Player({
      name: "Jokerly Web Player",
      getOAuthToken: (cb) => {
        cb(get().accessToken ?? accessToken);
      },
      volume: 0.8,
    });

    player.addListener("ready", (payload) => {
      const ready = payload as { device_id: string };
      set({ deviceId: ready.device_id, isPlayerReady: true });
      // Do NOT call /me/player with play:false here — it pauses any currently
      // active Spotify session on the user's account. The device_id is already
      // embedded in every subsequent /me/player/play call, which activates this
      // device automatically when the user first plays a track.

      // Recover playback after route hard reloads: if app believed we were
      // playing and we still have a valid queue item, resume it on this device.
      const snapshot = get();
      const idx = snapshot.queueIndex;
      if (snapshot.isPlaying && idx >= 0 && idx < snapshot.queue.length && snapshot.queue[idx]?.uri) {
        Promise.resolve(get().playIndex(idx)).catch(() => {});
      }
    });

    player.addListener("not_ready", () => {
      set({ deviceId: null, isPlayerReady: false });
    });

    player.addListener("player_state_changed", (state) => {
      const previous = get();
      hydrateFromSdkState((state as SpotifyPlayerState | null) ?? null);

      const nextState = (state as SpotifyPlayerState | null) ?? null;
      const currentUri = nextState?.track_window.current_track.uri;
      const likelyEnded =
        previous.isPlaying &&
        previous.durationMs > 0 &&
        previous.progressMs >= Math.max(0, previous.durationMs - 1500) &&
        previous.progressMs > 0 &&
        !!nextState &&
        nextState.paused &&
        nextState.position === 0 &&
        currentUri === previous.currentTrack?.uri;

      if (likelyEnded) {
        set({ endedToken: previous.endedToken + 1 });
      }
    });

    player.addListener("initialization_error", () => {
      set({ isPlayerReady: false, sdkError: "Player failed to initialize. Reload the page." });
    });
    player.addListener("authentication_error", () => {
      set({ isPlayerReady: false, sdkError: "Spotify authentication error. Try signing out and back in." });
    });
    player.addListener("account_error", () => {
      set({ isPlayerReady: false, sdkError: "Spotify Premium is required to use the player." });
    });

    const connected = await player.connect();
    if (connected) {
      set({ player });
    }
  },

  setQueueAndPlay: async (tracks, index) => {
    set({ queue: tracks });
    get().playIndex(index);
  },

  updateTrackUri: (index, uri, imageUrl, durationMs) => {
    const { queue } = get();
    const updated = [...queue];
    updated[index] = {
      ...updated[index],
      uri,
      ...(imageUrl ? { image: imageUrl } : {}),
      ...(durationMs ? { durationMs } : {}),
    };

    const currentTrack = get().currentTrack;
    const queueIndex = get().queueIndex;

    if (queueIndex === index && currentTrack) {
      set({ queue: updated, currentTrack: updated[index] });
      return;
    }

    set({ queue: updated });
  },

  playIndex: async (index) => {
    const { queue, deviceId, currentTrack, isPlaying, isTransitioning } = get();
    if (index < 0 || index >= queue.length) return;
    if (isTransitioning) return;

    const nextTrack = queue[index];
    ignorePausedUntil = Date.now() + 1400;
    const hasActivePlayback = !!currentTrack && isPlaying;
    set({
      pendingIndex: index,
      isTransitioning: true,
      ...(hasActivePlayback
        ? {}
        : {
            queueIndex: index,
            currentTrack: nextTrack,
            isPlaying: true,
            progressMs: 0,
            durationMs: nextTrack.durationMs ?? 0,
          }),
    });

    const uriEntries = queue
      .map((track, queueIndex) => ({ uri: track.uri, queueIndex }))
      .filter((item): item is { uri: string; queueIndex: number } => Boolean(item.uri));

    const targetPosition = uriEntries.findIndex((item) => item.queueIndex === index);
    if (targetPosition === -1 || !deviceId) {
      set({
        pendingIndex: null,
        isTransitioning: false,
        ...(hasActivePlayback
          ? {}
          : { queueIndex: index, currentTrack: queue[index], isPlaying: false, progressMs: 0, durationMs: 0 }),
      });
      return;
    }

    try {
      await playerApi("play", {
        deviceId,
        uris: uriEntries.map((item) => item.uri),
        offset: { position: targetPosition },
        positionMs: 0,
      });
    } catch {
      set({
        pendingIndex: null,
        isTransitioning: false,
        ...(hasActivePlayback ? {} : { isPlaying: false }),
      });
      return;
    }

    set({
      queueIndex: index,
      currentTrack: nextTrack,
      pendingIndex: null,
      isPlaying: true,
      isTransitioning: false,
      progressMs: 0,
      durationMs: nextTrack.durationMs ?? 0,
    });
  },

  togglePlay: async () => {
    const { player } = get();
    if (!player) return;
    await player.togglePlay();
  },

  seek: async (ratio) => {
    const { player, durationMs } = get();
    if (!player || !isFinite(durationMs) || durationMs <= 0) return;
    const target = Math.max(0, Math.min(durationMs, Math.floor(durationMs * ratio)));
    await player.seek(target);
  },

  stop: async () => {
    const { player } = get();
    if (player) {
      await player.pause().catch(() => {});
    }
    set({
      currentTrack: null,
      isPlaying: false,
      isTransitioning: false,
      pendingIndex: null,
      queue: [],
      queueIndex: -1,
      progressMs: 0,
      durationMs: 0,
    });
  },

  setRepeatMode: async (mode) => {
    set({ repeatMode: mode });
    const { deviceId } = get();
    if (!deviceId) return;
    const state = mode === "one" ? "track" : mode === "all" ? "context" : "off";
    await playerApi("repeat", { deviceId, state }).catch(() => {});
  },

  toggleShuffle: async () => {
    const next = !get().shuffleEnabled;
    set({ shuffleEnabled: next });
    const { deviceId } = get();
    if (!deviceId) return;
    await playerApi("shuffle", { deviceId, state: next }).catch(() => {});
  },

  getNextIndex: () => {
    const { queue, queueIndex, repeatMode, shuffleEnabled } = get();
    if (queue.length === 0 || queueIndex < 0) return null;
    if (repeatMode === "one") return queueIndex;

    const playableIndexes = queue
      .map((track, index) => ({ index, uri: track.uri }))
      .filter((item) => item.uri !== null);
    if (playableIndexes.length === 0) return null;

    if (shuffleEnabled && playableIndexes.length > 1) {
      const candidates = playableIndexes.map((item) => item.index).filter((index) => index !== queueIndex);
      if (candidates.length === 0) return queueIndex;
      return candidates[Math.floor(Math.random() * candidates.length)];
    }

    const nextIndex = queueIndex + 1;
    if (nextIndex < queue.length) return nextIndex;
    if (repeatMode === "all") return 0;
    return null;
  },

  getPrevIndex: () => {
    const { queue, queueIndex, repeatMode, shuffleEnabled } = get();
    if (queue.length === 0 || queueIndex < 0) return null;
    if (repeatMode === "one") return queueIndex;

    const playableIndexes = queue
      .map((track, index) => ({ index, uri: track.uri }))
      .filter((item) => item.uri !== null);
    if (playableIndexes.length === 0) return null;

    if (shuffleEnabled && playableIndexes.length > 1) {
      const candidates = playableIndexes.map((item) => item.index).filter((index) => index !== queueIndex);
      if (candidates.length === 0) return queueIndex;
      return candidates[Math.floor(Math.random() * candidates.length)];
    }

    const prevIndex = queueIndex - 1;
    if (prevIndex >= 0) return prevIndex;
    if (repeatMode === "all") return queue.length - 1;
    return null;
  },
}), {
  name: "jokerly-player-v1",
  storage: createJSONStorage(() => sessionStorage),
  partialize: (state) => ({
    currentTrack: state.currentTrack,
    queue: state.queue,
    queueIndex: state.queueIndex,
    pendingIndex: null,
    isPlaying: state.isPlaying,
    isTransitioning: false,
    progressMs: state.progressMs,
    durationMs: state.durationMs,
    repeatMode: state.repeatMode,
    shuffleEnabled: state.shuffleEnabled,
    isPlayerExpanded: false,
    endedToken: 0,
    isPlayerReady: false,
    sdkError: null,
    player: null,
    deviceId: null,
    accessToken: null,
    initializePlayer: state.initializePlayer,
    setQueueAndPlay: state.setQueueAndPlay,
    updateTrackUri: state.updateTrackUri,
    playIndex: state.playIndex,
    togglePlay: state.togglePlay,
    seek: state.seek,
    stop: state.stop,
    setRepeatMode: state.setRepeatMode,
    toggleShuffle: state.toggleShuffle,
    getNextIndex: state.getNextIndex,
    getPrevIndex: state.getPrevIndex,
  }),
}));
