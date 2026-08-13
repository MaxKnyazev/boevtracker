import { create } from 'zustand';
import { api, type WorkShift } from '@/lib/api';

type ShiftState = {
  shift: WorkShift | null;
  loading: boolean;
  initialized: boolean;
  fetchCurrent: () => Promise<void>;
  start: () => Promise<WorkShift>;
  pause: () => Promise<WorkShift>;
  resume: () => Promise<WorkShift>;
  end: (body: { endedAt: string; comment?: string }) => Promise<WorkShift>;
  clear: () => void;
};

export const useShiftStore = create<ShiftState>((set) => ({
  shift: null,
  loading: false,
  initialized: false,
  fetchCurrent: async () => {
    set({ loading: true });
    try {
      const { shift } = await api.currentShift();
      set({ shift, initialized: true, loading: false });
    } catch {
      set({ shift: null, initialized: true, loading: false });
    }
  },
  start: async () => {
    const { shift } = await api.startShift();
    set({ shift });
    return shift;
  },
  pause: async () => {
    const { shift } = await api.pauseShift();
    set({ shift });
    return shift;
  },
  resume: async () => {
    const { shift } = await api.resumeShift();
    set({ shift });
    return shift;
  },
  end: async (body) => {
    const { shift } = await api.endShift(body);
    set({ shift: null });
    return shift;
  },
  clear: () => set({ shift: null, initialized: false }),
}));
