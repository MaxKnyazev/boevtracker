import {
  playNotificationSound as playSelectedNotificationSound,
  unlockNotificationAudio as unlockSelectedNotificationAudio,
} from '@/lib/notification-sound';

export function unlockNotificationAudio() {
  unlockSelectedNotificationAudio();
}

export function playNotificationSound() {
  playSelectedNotificationSound();
}

export function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
}

export function notificationsSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'Notification' in window &&
    window.isSecureContext
  );
}

/**
 * Must be called from a direct user gesture (click).
 * Do not auto-call on page load — browsers silently deny that.
 */
export async function ensureNotificationPermission(): Promise<
  NotificationPermission | 'unsupported'
> {
  if (!notificationsSupported()) {
    return 'unsupported';
  }
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';

  try {
    const permission = await Notification.requestPermission();
    return permission;
  } catch {
    return Notification.permission;
  }
}

export function showBrowserNotification(options: {
  title: string;
  body?: string | null;
  tag?: string;
  onClick?: () => void;
}) {
  if (typeof window === 'undefined' || !('Notification' in window)) return null;
  if (Notification.permission !== 'granted') return null;

  try {
    const n = new Notification(options.title, {
      body: options.body || undefined,
      tag: options.tag,
      silent: true, // we play our own sound
      icon: '/favicon.ico',
    });
    n.onclick = () => {
      window.focus();
      options.onClick?.();
      n.close();
    };
    return n;
  } catch {
    return null;
  }
}
