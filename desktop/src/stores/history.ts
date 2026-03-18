import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { tauriStorage } from '../lib/tauri-storage';
import type { Track } from './player';

const MAX_HISTORY = 50;

interface HistoryState {
  tracks: Track[];
  push: (track: Track) => void;
  clear: () => void;
}

export const useHistoryStore = create<HistoryState>()(
  persist(
    (set) => ({
      tracks: [],
      push: (track) =>
        set((s) => {
          const filtered = s.tracks.filter((t) => t.urn !== track.urn);
          return { tracks: [track, ...filtered].slice(0, MAX_HISTORY) };
        }),
      clear: () => set({ tracks: [] }),
    }),
    {
      name: 'sc-history',
      storage: createJSONStorage(() => tauriStorage),
      partialize: (s) => ({ tracks: s.tracks }),
    },
  ),
);
