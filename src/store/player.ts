import { create } from "zustand";
import { SpotifyTrack } from "@/types";

interface PlayerState {
  currentTrack: SpotifyTrack | null;
  queue: SpotifyTrack[];
  isPlaying: boolean;
  audio: HTMLAudioElement | null;
  setTrack: (track: SpotifyTrack) => void;
  setQueue: (tracks: SpotifyTrack[]) => void;
  togglePlay: () => void;
  stop: () => void;
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  currentTrack: null,
  queue: [],
  isPlaying: false,
  audio: null,

  setTrack: (track) => {
    const { audio } = get();
    if (audio) {
      audio.pause();
      audio.src = "";
    }
    if (!track.preview_url) {
      set({ currentTrack: track, isPlaying: false, audio: null });
      return;
    }
    const newAudio = new Audio(track.preview_url);
    newAudio.play();
    newAudio.onended = () => set({ isPlaying: false });
    set({ currentTrack: track, isPlaying: true, audio: newAudio });
  },

  setQueue: (tracks) => set({ queue: tracks }),

  togglePlay: () => {
    const { audio, isPlaying } = get();
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
      set({ isPlaying: false });
    } else {
      audio.play();
      set({ isPlaying: true });
    }
  },

  stop: () => {
    const { audio } = get();
    if (audio) {
      audio.pause();
      audio.src = "";
    }
    set({ currentTrack: null, isPlaying: false, audio: null });
  },
}));
