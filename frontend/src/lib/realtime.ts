import Echo from 'laravel-echo';
import Pusher from 'pusher-js';
import { api, type AppNotification, type Task } from '@/lib/api';

declare global {
  interface Window {
    Pusher: typeof Pusher;
    Echo?: Echo<'pusher'>;
  }
}

window.Pusher = Pusher;

type TaskHandler = (task: Task) => void;
type NotificationsHandler = (
  items: AppNotification[],
  unreadCount: number,
  afterNotificationId: number,
) => void;
type ShiftsHandler = () => void;

type WatchState = {
  taskId: number | null;
  taskVersion: string;
  onTask: TaskHandler | null;
};

const DEFAULT_POLL_MS = 4000;

/**
 * Realtime: Pusher when configured, otherwise lightweight short polling.
 * Never holds a PHP worker in a sleep loop.
 */
class RealtimeClient {
  private userActive = false;
  private userId: number | null = null;
  private afterNotificationId = 0;
  private onNotifications: NotificationsHandler | null = null;
  private watch: WatchState = {
    taskId: null,
    taskVersion: '',
    onTask: null,
  };
  private watchShifts = false;
  private shiftsVersion = '';
  private onShifts: ShiftsHandler | null = null;

  private driver: 'pusher' | 'poll' | null = null;
  private echo: Echo<'pusher'> | null = null;
  private userChannel: ReturnType<Echo<'pusher'>['private']> | null = null;
  private taskChannel: ReturnType<Echo<'pusher'>['private']> | null = null;
  private shiftsChannel: ReturnType<Echo<'pusher'>['private']> | null = null;

  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private pollAbort: AbortController | null = null;
  private pollIntervalMs = DEFAULT_POLL_MS;
  private primed = false;

  async start(options: {
    userId: number;
    afterNotificationId: number;
    onNotifications: NotificationsHandler;
  }) {
    this.stop();
    this.userActive = true;
    this.userId = options.userId;
    this.afterNotificationId = Math.max(0, options.afterNotificationId);
    this.onNotifications = options.onNotifications;
    this.primed = false;

    try {
      const cfg = await api.realtimeConfig();
      if (!this.userActive) return;

      if (cfg.driver === 'pusher' && cfg.pusher?.key) {
        this.driver = 'pusher';
        await this.startPusher(cfg.pusher.key, cfg.pusher.cluster);
      } else {
        this.driver = 'poll';
        this.pollIntervalMs = cfg.pollIntervalMs || DEFAULT_POLL_MS;
        void this.startPolling();
      }
    } catch {
      if (!this.userActive) return;
      this.driver = 'poll';
      this.pollIntervalMs = DEFAULT_POLL_MS;
      void this.startPolling();
    }
  }

  stop() {
    this.userActive = false;
    this.onNotifications = null;
    this.userId = null;
    this.primed = false;
    this.stopPolling();
    this.unsubscribeTaskChannel();
    this.unsubscribeShiftsChannel();
    this.unsubscribeUserChannel();
    if (this.echo) {
      try {
        this.echo.disconnect();
      } catch {
        // ignore
      }
      this.echo = null;
      window.Echo = undefined;
    }
    this.driver = null;
    this.watch = { taskId: null, taskVersion: '', onTask: null };
    this.watchShifts = false;
    this.shiftsVersion = '';
    this.onShifts = null;
  }

  watchTask(taskId: number, onTask: TaskHandler) {
    this.watch = { taskId, taskVersion: '', onTask };
    if (this.driver === 'pusher') {
      this.subscribeTaskChannel(taskId);
    } else if (this.driver === 'poll') {
      this.kickPoll();
    }
  }

  unwatchTask(taskId?: number) {
    if (taskId != null && this.watch.taskId !== taskId) return;
    this.unsubscribeTaskChannel();
    this.watch = { taskId: null, taskVersion: '', onTask: null };
    if (this.driver === 'poll') {
      this.kickPoll();
    }
  }

  watchShiftsList(onShifts: ShiftsHandler) {
    this.watchShifts = true;
    this.onShifts = onShifts;
    this.shiftsVersion = '';
    if (this.driver === 'pusher') {
      this.subscribeShiftsChannel();
    } else if (this.driver === 'poll') {
      this.kickPoll();
    }
  }

  unwatchShiftsList() {
    this.unsubscribeShiftsChannel();
    this.watchShifts = false;
    this.shiftsVersion = '';
    this.onShifts = null;
    if (this.driver === 'poll') {
      this.kickPoll();
    }
  }

  private async startPusher(key: string, cluster: string) {
    const apiBase = String(import.meta.env.VITE_API_URL ?? '').trim();

    this.echo = new Echo({
      broadcaster: 'pusher',
      key,
      cluster,
      forceTLS: true,
      authEndpoint: `${apiBase}/api/broadcasting/auth`,
      auth: {
        headers: {},
      },
      authorizer: (channel: { name: string }) => ({
        authorize: (
          socketId: string,
          callback: (error: Error | null, authData: { auth: string } | null) => void,
        ) => {
          void fetch(`${apiBase}/api/broadcasting/auth`, {
            method: 'POST',
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json',
            },
            body: JSON.stringify({
              socket_id: socketId,
              channel_name: channel.name,
            }),
          })
            .then(async (res) => {
              if (!res.ok) {
                throw new Error('Broadcast auth failed');
              }
              return res.json() as Promise<{ auth: string }>;
            })
            .then((data) => callback(null, data))
            .catch((err: Error) => callback(err, null));
        },
      }),
    });

    window.Echo = this.echo;

    // Seed cursor without toasting history, then subscribe.
    await this.primeCursor();
    if (!this.userActive || this.userId == null) return;

    this.userChannel = this.echo.private(`user.${this.userId}`);
    this.userChannel.listen('.notification.created', (payload: {
      notification?: AppNotification;
    }) => {
      const n = payload?.notification;
      if (!n) return;
      this.afterNotificationId = Math.max(this.afterNotificationId, n.id);
      void api.notificationsUnreadCount().then((res) => {
        this.onNotifications?.([n], res.unreadCount, this.afterNotificationId);
      }).catch(() => {
        this.onNotifications?.([n], 0, this.afterNotificationId);
      });
    });

    if (this.watch.taskId != null) {
      this.subscribeTaskChannel(this.watch.taskId);
    }
    if (this.watchShifts) {
      this.subscribeShiftsChannel();
    }
  }

  private subscribeTaskChannel(taskId: number) {
    if (!this.echo) return;
    this.unsubscribeTaskChannel();
    this.taskChannel = this.echo.private(`task.${taskId}`);
    this.taskChannel.listen('.task.updated', () => {
      void this.reloadWatchedTask();
    });
  }

  private unsubscribeTaskChannel() {
    if (this.echo && this.watch.taskId != null) {
      try {
        this.echo.leave(`task.${this.watch.taskId}`);
      } catch {
        // ignore
      }
    }
    this.taskChannel = null;
  }

  private subscribeShiftsChannel() {
    if (!this.echo) return;
    this.unsubscribeShiftsChannel();
    this.shiftsChannel = this.echo.private('shifts');
    this.shiftsChannel.listen('.shift.updated', () => {
      this.onShifts?.();
    });
  }

  private unsubscribeShiftsChannel() {
    if (this.echo && this.shiftsChannel) {
      try {
        this.echo.leave('shifts');
      } catch {
        // ignore
      }
    }
    this.shiftsChannel = null;
  }

  private unsubscribeUserChannel() {
    if (this.echo && this.userId != null) {
      try {
        this.echo.leave(`user.${this.userId}`);
      } catch {
        // ignore
      }
    }
    this.userChannel = null;
  }

  private async reloadWatchedTask() {
    const taskId = this.watch.taskId;
    const onTask = this.watch.onTask;
    if (taskId == null || !onTask) return;
    try {
      const res = await api.task(taskId);
      if (this.watch.taskId === taskId) {
        onTask(res.task);
      }
    } catch {
      // ignore
    }
  }

  private async primeCursor() {
    if (this.afterNotificationId <= 0) {
      const list = await api.notifications();
      if (!this.userActive) return;
      const maxId =
        list.notifications.length > 0
          ? Math.max(...list.notifications.map((n) => n.id))
          : 0;
      this.afterNotificationId = maxId;
      this.onNotifications?.([], list.unreadCount, maxId);
    } else {
      const count = await api.notificationsUnreadCount();
      if (!this.userActive) return;
      this.onNotifications?.(
        [],
        count.unreadCount,
        this.afterNotificationId,
      );
    }
    this.primed = true;
  }

  private async startPolling() {
    await this.primeCursor();
    if (!this.userActive) return;
    this.schedulePoll();
  }

  private kickPoll() {
    this.stopPolling(false);
    if (this.userActive && this.driver === 'poll') {
      this.schedulePoll(0);
    }
  }

  private stopPolling(clearDriver = true) {
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    this.pollAbort?.abort();
    this.pollAbort = null;
    void clearDriver;
  }

  private schedulePoll(delay = this.pollIntervalMs) {
    if (!this.userActive) return;
    this.pollTimer = setTimeout(() => {
      void this.pollOnce();
    }, delay);
  }

  private async pollOnce() {
    if (!this.userActive || this.driver !== 'poll') return;

    // Slow down when tab is hidden
    if (typeof document !== 'undefined' && document.hidden) {
      this.schedulePoll(Math.max(this.pollIntervalMs, 15000));
      return;
    }

    const controller = new AbortController();
    this.pollAbort = controller;

    try {
      const data = await api.realtimePoll(
        {
          afterNotificationId: this.afterNotificationId,
          taskId: this.watch.taskId,
          taskVersion: this.watch.taskVersion || undefined,
          watchShifts: this.watchShifts || undefined,
          shiftsVersion: this.watchShifts
            ? this.shiftsVersion || undefined
            : undefined,
        },
        controller.signal,
      );
      if (!this.userActive) return;

      this.afterNotificationId = Math.max(
        this.afterNotificationId,
        data.afterNotificationId,
      );

      if (data.notifications.length > 0) {
        this.onNotifications?.(
          data.notifications,
          data.unreadCount,
          this.afterNotificationId,
        );
      } else {
        this.onNotifications?.(
          [],
          data.unreadCount,
          this.afterNotificationId,
        );
      }

      if (data.task && this.watch.onTask && this.watch.taskId === data.task.id) {
        this.watch.onTask(data.task);
      }
      if (data.taskVersion && this.watch.taskId) {
        this.watch.taskVersion = data.taskVersion;
      }

      if (this.watchShifts && data.shiftsVersion) {
        const hadVersion = this.shiftsVersion !== '';
        this.shiftsVersion = data.shiftsVersion;
        if (hadVersion && data.shiftsChanged) {
          this.onShifts?.();
        }
      }
    } catch (err) {
      const aborted =
        (err instanceof DOMException && err.name === 'AbortError') ||
        (err instanceof Error && err.name === 'AbortError');
      if (!aborted && this.userActive) {
        this.schedulePoll(Math.max(this.pollIntervalMs, 5000));
        return;
      }
    }

    if (this.userActive && this.driver === 'poll') {
      this.schedulePoll();
    }
  }
}

export const realtimeClient = new RealtimeClient();
