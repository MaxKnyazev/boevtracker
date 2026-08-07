/** Short soft chime via Web Audio (no asset file). */
let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  const Ctx =
    typeof window !== 'undefined'
      ? window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext
      : null;
  if (!Ctx) return null;
  if (!audioCtx) audioCtx = new Ctx();
  return audioCtx;
}

/** Call from a user gesture so later background sounds can play. */
export function unlockNotificationAudio() {
  const ctx = getCtx();
  if (!ctx) return;
  if (ctx.state === 'suspended') {
    void ctx.resume();
  }
}

export function playNotificationSound() {
  const ctx = getCtx();
  if (!ctx) return;

  const play = () => {
    const now = ctx.currentTime;
    const notes = [660, 880];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.08, now + 0.02 + i * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18 + i * 0.12);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.12);
      osc.stop(now + 0.22 + i * 0.12);
    });
  };

  if (ctx.state === 'suspended') {
    void ctx.resume().then(play).catch(() => undefined);
  } else {
    play();
  }
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
