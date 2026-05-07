import { create } from "zustand";

export type LogLevel = "info" | "warn" | "error";

export interface LogEntry {
  id: string;
  ts: number;
  message: string;
  level: LogLevel;
}

const MAX_ENTRIES = 200;

interface DebugLogState {
  entries: LogEntry[];
  addLog: (message: string, level?: LogLevel) => void;
  clearLogs: () => void;
}

export const useDebugLogStore = create<DebugLogState>((set) => ({
  entries: [],
  addLog: (message, level = "info") => {
    const entry: LogEntry = { id: `${Date.now()}-${Math.random()}`, ts: Date.now(), message, level };
    set((s) => ({
      entries: [...s.entries.slice(-(MAX_ENTRIES - 1)), entry],
    }));
  },
  clearLogs: () => set({ entries: [] }),
}));

export function addLog(message: string, level: LogLevel = "info") {
  useDebugLogStore.getState().addLog(message, level);
}
