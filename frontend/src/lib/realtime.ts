import { api, type AppNotification, type Task } from '@/lib/api';

type TaskHandler = (task: Task, version: string) => void;
type NotificationsHandler = (
  items: AppNotification[],
  unreadCount: number,
  afterNotificationId: number,
) => void;

type WatchState = {
  taskId: number | null;
  taskVersion: string;
  onTask: TaskHandler | null;
};

/**
 * Shared long-poll realtime client.
 * Suitable for shared PHP hosting (no dedicated WebSocket process).
 */
class RealtimeClient {
  private running = false;
  private userActive = false;
  private abort: AbortController | null = null;
  private afterNotificationId = 0;
  private primed = false;
  private watch: WatchState = {
    taskId: null,
    taskVersion: '',
    onTask: null,
  };
  private onNotifications: NotificationsHandler | null = null;

  start(options: {
    afterNotificationId: number;
    onNotifications: NotificationsHandler;
  }) {
    this.userActive = true;
    this.afterNotificationId = Math.max(0, options.afterNotificationId);
    this.onNotifications = options.onNotifications;
    this.primed = false;
    this.kick();
    if (!this.running) {
      void this.loop();
    }
  }

  stop() {
    this.userActive = false;
    this.onNotifications = null;
    this.watch = { taskId: null, taskVersion: '', onTask: null };
    this.abort?.abort();
    this.abort = null;
    this.running = false;
    this.primed = false;
  }

  setAfterNotificationId(id: number) {
    this.afterNotificationId = Math.max(this.afterNotificationId, id);
  }

  watchTask(taskId: number, onTask: TaskHandler, taskVersion = '') {
    this.watch = { taskId, taskVersion, onTask };
    this.kick();
  }

  unwatchTask(taskId?: number) {
    if (taskId != null && this.watch.taskId !== taskId) return;
    this.watch = { taskId: null, taskVersion: '', onTask: null };
    this.kick();
  }

  setTaskVersion(taskId: number, version: string) {
    if (this.watch.taskId !== taskId) return;
    this.watch.taskVersion = version;
  }

  private kick() {
    this.abort?.abort();
  }

  private async loop() {
    if (this.running) return;
    this.running = true;

    while (this.userActive) {
      const controller = new AbortController();
      this.abort = controller;

      try {
        if (!this.primed) {
          await this.prime(controller.signal);
          if (!this.userActive) break;
          this.primed = true;
          continue;
        }

        const data = await api.realtimeWait(
          {
            afterNotificationId: this.afterNotificationId,
            taskId: this.watch.taskId,
            taskVersion: this.watch.taskVersion || undefined,
            timeout: 20,
          },
          controller.signal,
        );
        if (!this.userActive) break;

        this.handlePayload(data, true);
      } catch (err) {
        if (!this.userActive) break;
        const aborted =
          (err instanceof DOMException && err.name === 'AbortError') ||
          (err instanceof Error && err.name === 'AbortError');
        if (aborted) continue;
        await new Promise((r) => setTimeout(r, 1500));
      }
    }

    this.running = false;
  }

  private async prime(signal: AbortSignal) {
    if (this.afterNotificationId <= 0) {
      const list = await api.notifications();
      if (signal.aborted || !this.userActive) return;
      const maxId =
        list.notifications.length > 0
          ? Math.max(...list.notifications.map((n) => n.id))
          : 0;
      this.afterNotificationId = maxId;
      this.onNotifications?.([], list.unreadCount, maxId);
    } else {
      const count = await api.notificationsUnreadCount();
      if (signal.aborted || !this.userActive) return;
      this.onNotifications?.(
        [],
        count.unreadCount,
        this.afterNotificationId,
      );
    }

    if (this.watch.taskId != null) {
      const snap = await api.realtimeWait(
        {
          afterNotificationId: this.afterNotificationId,
          taskId: this.watch.taskId,
          taskVersion: '',
          timeout: 1,
        },
        signal,
      );
      if (signal.aborted || !this.userActive) return;
      this.handlePayload(snap, false);
    }
  }

  private handlePayload(
    data: {
      notifications: AppNotification[];
      unreadCount: number;
      afterNotificationId: number;
      task: Task | null;
      taskVersion: string | null;
    },
    announceNotifications: boolean,
  ) {
    this.afterNotificationId = Math.max(
      this.afterNotificationId,
      data.afterNotificationId,
    );

    if (announceNotifications && data.notifications.length > 0) {
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

    if (data.task && data.taskVersion && this.watch.onTask) {
      this.watch.taskVersion = data.taskVersion;
      this.watch.onTask(data.task, data.taskVersion);
    } else if (data.taskVersion && this.watch.taskId) {
      this.watch.taskVersion = data.taskVersion;
    }
  }
}

export const realtimeClient = new RealtimeClient();
