import { create } from 'zustand';

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'failed'
  | 'no_update';

export type UpdateChannel = 'stable' | 'beta';

export interface UpdateProgress {
  chunkedBytes: number;
  totalBytes?: number;
  percent?: number;
}

export interface UpdateAvailable {
  version: string | null;
  notes: string;
  pubDate: string | null;
}

interface UpdaterState {
  status: UpdateStatus;
  available: UpdateAvailable;
  progress: UpdateProgress;
  error: string | null;
  channel: UpdateChannel;
  lastCheckedAtMs: number | null;

  setStatus: (status: UpdateStatus) => void;
  setProgress: (progress: UpdateProgress) => void;
  setAvailable: (available: UpdateAvailable) => void;
  setError: (error: string | null) => void;
  setChannel: (channel: UpdateChannel) => void;
  setLastCheckedAt: (ms: number) => void;
  reset: () => void;
}

const initial = {
  status: 'idle' as UpdateStatus,
  available: { version: null, notes: '', pubDate: null } as UpdateAvailable,
  progress: { chunkedBytes: 0, totalBytes: undefined, percent: undefined } as UpdateProgress,
  error: null as string | null,
  channel: 'stable' as UpdateChannel,
  lastCheckedAtMs: null as number | null,
};

export const useUpdaterStore = create<UpdaterState>((set) => ({
  ...initial,
  setStatus: (status) => set({ status }),
  setProgress: (progress) => set({ progress }),
  setAvailable: (available) => set({ available }),
  setError: (error) => set({ error }),
  setChannel: (channel) => set({ channel }),
  setLastCheckedAt: (ms) => set({ lastCheckedAtMs: ms }),
  reset: () => set(initial),
}));
