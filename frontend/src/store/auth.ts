import { create } from 'zustand';
import { api, type User } from '@/lib/api';

type AuthState = {
  user: User | null;
  loading: boolean;
  initialized: boolean;
  setUser: (user: User | null) => void;
  fetchMe: () => Promise<void>;
  logout: () => Promise<void>;
};

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: false,
  initialized: false,
  setUser: (user) => set({ user }),
  fetchMe: async () => {
    set({ loading: true });
    try {
      const { user } = await api.me();
      set({ user, initialized: true, loading: false });
    } catch {
      set({ user: null, initialized: true, loading: false });
    }
  },
  logout: async () => {
    try {
      await api.logout();
    } finally {
      set({ user: null });
    }
  },
}));

export function canWrite(role?: string) {
  return role === 'ADMIN' || role === 'DEVELOPER';
}

export function canManageUsers(role?: string) {
  return role === 'ADMIN';
}

export function canDeleteBoardProject(role?: string) {
  return role === 'ADMIN';
}
