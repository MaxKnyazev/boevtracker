import { create } from 'zustand';
import { api, type AppNotification } from '@/lib/api';

type NotificationsState = {
  unreadCount: number;
  lastSeenId: number;
  userId: number | null;
  hydrateForUser: (userId: number) => void;
  setUnreadCount: (count: number) => void;
  seedLastSeen: (id: number) => void;
  bumpFromNotifications: (items: AppNotification[]) => void;
  markLocalRead: () => void;
  markAllLocalRead: () => void;
  refreshUnread: () => Promise<void>;
};

function storageKey(userId: number) {
  return `boevtracker.notifications.lastSeenId.${userId}`;
}

function readLastSeenId(userId: number): number {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    const n = raw ? Number(raw) : 0;
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

function writeLastSeenId(userId: number, id: number) {
  try {
    localStorage.setItem(storageKey(userId), String(id));
  } catch {
    // ignore
  }
}

export const useNotificationsStore = create<NotificationsState>((set, get) => ({
  unreadCount: 0,
  lastSeenId: 0,
  userId: null,
  hydrateForUser: (userId) => {
    set({
      userId,
      lastSeenId: readLastSeenId(userId),
      unreadCount: 0,
    });
  },
  setUnreadCount: (count) => set({ unreadCount: Math.max(0, count) }),
  seedLastSeen: (id) => {
    const { lastSeenId, userId } = get();
    if (id <= lastSeenId || userId == null) return;
    set({ lastSeenId: id });
    writeLastSeenId(userId, id);
  },
  bumpFromNotifications: (items) => {
    if (items.length === 0) return;
    const { lastSeenId, userId } = get();
    if (userId == null) return;
    const maxId = Math.max(...items.map((n) => n.id), lastSeenId);
    set({ lastSeenId: maxId });
    writeLastSeenId(userId, maxId);
  },
  markLocalRead: () => {
    set((s) => ({ unreadCount: Math.max(0, s.unreadCount - 1) }));
  },
  markAllLocalRead: () => set({ unreadCount: 0 }),
  refreshUnread: async () => {
    try {
      const res = await api.notificationsUnreadCount();
      set({ unreadCount: res.unreadCount });
    } catch {
      // ignore
    }
  },
}));
