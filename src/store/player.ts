import { create } from "zustand";

export interface PlayableTrack {
  name: string;
  artist: string;
  image?: string;
  lfmUrl?: string;
  uri?: string | null; // undefined = not yet resolved, null = not found on Spotify
  durationMs?: number;
}

export type RepeatMode = "off" | "all" | "one";

interface PlayerState {
  currentTrack: PlayableTrack | null;
  queue: PlayableTrack[];
  queueIndex: number;
  isPlaying: boolean;
  progressMs: number;
  durationMs: number;
  isPlayerReady: boolean;
  player: SpotifyPlayer | null;
  deviceId: string | null;
  accessToken: string | null;
  repeatMode: RepeatMode;
  shuffleEnabled: boolean;
  endedToken: number;

  initializePlayer: (accessToken: string) => Promise<void>;
  setQueueAndPlay: (tracks: PlayableTrack[], index: number) => Promise<void>;
  updateTrackUri: (index: number, uri: string | null, imageUrl?: string | null, durationMs?: number) => void;
  playIndex: (index: number) => void;
  togglePlay: () => void;
  seek: (ratio: number) => void;
  stop: () => void;
  setRepeatMode: (mode: RepeatMode) => void;
  toggleShuffle: () => void;
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
    usePlayerStore.setState({ isPlaying: false });
    return;
  }

  const sdkTrack = state.track_window.current_track;
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
    isPlaying: !state.paused,
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

export const usePlayerStore = create<PlayerState>((set, get) => ({
  currentTrack: null,
  queue: [],
  queueIndex: -1,
  isPlaying: false,
  progressMs: 0,
  durationMs: 0,
  isPlayerReady: false,
  player: null,
  deviceId: null,
  accessToken: null,
  repeatMode: "off",
  shuffleEnabled: false,
  endedToken: 0,

  initializePlayer: async (accessToken) => {
    set({ accessToken });
    if (get().player) return;

    const Spotify = await loadSpotifySdk();
    if (!Spotify) return;

    const player = new Spotify.Player({
      name: "Jokerly Web Player",
      getOAuthToken: (cb) => {
        cb(get().accessToken ?? accessToken);
      },
      volume: 0.8,
    });

    player.addListener("ready", async (payload) => {
      const ready = payload as { device_id: string };
      set({ deviceId: ready.device_id, isPlayerReady: true });

      const token = get().accessToken;
      if (!token) return;

      try {
        await spotifyApi("/me/player", token, {
          method: "PUT",
          body: JSON.stringify({
            device_ids: [ready.device_id],
            play: false,
          }),
        });
      } catch {
        // Transfer can fail temporarily if account/session is not fully ready.
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
      set({ isPlayerReady: false });
    });
    player.addListener("authentication_error", () => {
      set({ isPlayerReady: false });
    });
    player.addListener("account_error", () => {
      set({ isPlayerReady: false });
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
    const { queue, accessToken, deviceId } = get();
    if (index < 0 || index >= queue.length) return;

    const uriEntries = queue
      .map((track, queueIndex) => ({ uri: track.uri, queueIndex }))
      .filter((item): item is { uri: string; queueIndex: number } => Boolean(item.uri));

    const targetPosition = uriEntries.findIndex((item) => item.queueIndex === index);
    if (targetPosition === -1 || !accessToken || !deviceId) {
      set({ queueIndex: index, currentTrack: queue[index], isPlaying: false, progressMs: 0, durationMs: 0 });
      return;
    }

    await spotifyApi(`/me/player/play?device_id=${encodeURIComponent(deviceId)}`, accessToken, {
      method: "PUT",
      body: JSON.stringify({
        uris: uriEntries.map((item) => item.uri),
        offset: { position: targetPosition },
        position_ms: 0,
      }),
    });

    const currentTrack = queue[index];
    set({
      queueIndex: index,
      currentTrack,
      isPlaying: true,
      progressMs: 0,
      durationMs: currentTrack.durationMs ?? 0,
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
      queue: [],
      queueIndex: -1,
      progressMs: 0,
      durationMs: 0,
    });
  },

  setRepeatMode: (mode) => {
    set({ repeatMode: mode });
  },

  toggleShuffle: () => {
    set({ shuffleEnabled: !get().shuffleEnabled });
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
}));
