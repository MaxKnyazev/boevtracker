import { useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import {
  playNotificationSound,
  showBrowserNotification,
  unlockNotificationAudio,
} from '@/lib/browser-notifications';
import { useAuthStore } from '@/store/auth';
import { useNotificationsStore } from '@/store/notifications';
import type { AppNotification } from '@/lib/api';

const POLL_MS = 10000;

export function NotificationWatcher() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const setUnreadCount = useNotificationsStore((s) => s.setUnreadCount);
  const seedLastSeen = useNotificationsStore((s) => s.seedLastSeen);
  const bumpFromNotifications = useNotificationsStore(
    (s) => s.bumpFromNotifications,
  );
  const refreshUnread = useNotificationsStore((s) => s.refreshUnread);
  const lastSeenRef = useRef(useNotificationsStore.getState().lastSeenId);
  const runningRef = useRef(false);

  useEffect(() => {
    return useNotificationsStore.subscribe((state) => {
      lastSeenRef.current = state.lastSeenId;
    });
  }, []);

  useEffect(() => {
    const unlock = () => unlockNotificationAudio();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  const announce = useCallback(
    (items: AppNotification[]) => {
      if (items.length === 0) return;
      bumpFromNotifications(items);
      playNotificationSound();
      for (const n of items) {
        showBrowserNotification({
          title: n.title,
          body: n.body,
          tag: `bt-notification-${n.id}`,
          onClick: () => {
            navigate(
              n.taskId
                ? `/notifications?task=${n.taskId}`
                : '/notifications',
            );
          },
        });
      }
    },
    [bumpFromNotifications, navigate],
  );

  useEffect(() => {
    if (!user) return;

    useNotificationsStore.getState().hydrateForUser(user.id);

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let primed = false;
    lastSeenRef.current = useNotificationsStore.getState().lastSeenId;

    const schedule = () => {
      timer = setTimeout(() => {
        void poll();
      }, POLL_MS);
    };

    const poll = async () => {
      if (cancelled || runningRef.current) {
        if (!cancelled) schedule();
        return;
      }
      runningRef.current = true;
      try {
        const since = lastSeenRef.current;

        if (!primed) {
          primed = true;

          if (since > 0) {
            const data = await api.notifications(since);
            if (cancelled) return;
            setUnreadCount(data.unreadCount);
            if (data.notifications.length > 0) {
              announce(data.notifications);
            }
          } else {
            const data = await api.notifications();
            if (cancelled) return;
            setUnreadCount(data.unreadCount);
            if (data.notifications.length > 0) {
              seedLastSeen(
                Math.max(...data.notifications.map((n) => n.id)),
              );
            }
          }
        } else {
          const data = await api.notifications(since > 0 ? since : undefined);
          if (cancelled) return;
          setUnreadCount(data.unreadCount);

          if (since > 0) {
            if (data.notifications.length > 0) {
              announce(data.notifications);
            }
          } else if (data.notifications.length > 0) {
            seedLastSeen(Math.max(...data.notifications.map((n) => n.id)));
          }
        }
      } catch {
        // ignore
      } finally {
        runningRef.current = false;
        if (!cancelled) schedule();
      }
    };

    void poll();

    const onFocus = () => {
      void refreshUnread();
    };
    window.addEventListener('focus', onFocus);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [
    user?.id,
    announce,
    refreshUnread,
    seedLastSeen,
    setUnreadCount,
  ]);

  return null;
}
