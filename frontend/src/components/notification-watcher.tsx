import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  playNotificationSound,
  showBrowserNotification,
  unlockNotificationAudio,
} from '@/lib/browser-notifications';
import { realtimeClient } from '@/lib/realtime';
import { useAuthStore } from '@/store/auth';
import { useNotificationsStore } from '@/store/notifications';
import type { AppNotification } from '@/lib/api';

export function NotificationWatcher() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const setUnreadCount = useNotificationsStore((s) => s.setUnreadCount);
  const bumpFromNotifications = useNotificationsStore(
    (s) => s.bumpFromNotifications,
  );
  const seedLastSeen = useNotificationsStore((s) => s.seedLastSeen);
  const hydrateForUser = useNotificationsStore((s) => s.hydrateForUser);

  useEffect(() => {
    const unlock = () => unlockNotificationAudio();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  useEffect(() => {
    if (!user) {
      realtimeClient.stop();
      return;
    }

    hydrateForUser(user.id);
    const afterId = useNotificationsStore.getState().lastSeenId;

    realtimeClient.start({
      afterNotificationId: afterId,
      onNotifications: (
        items: AppNotification[],
        unreadCount: number,
        afterNotificationId: number,
      ) => {
        setUnreadCount(unreadCount);
        seedLastSeen(afterNotificationId);

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
    });

    return () => {
      realtimeClient.stop();
    };
  }, [
    user?.id,
    navigate,
    bumpFromNotifications,
    hydrateForUser,
    seedLastSeen,
    setUnreadCount,
  ]);

  return null;
}
