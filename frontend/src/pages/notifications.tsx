import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AtSign,
  Bell,
  BellRing,
  CheckCheck,
  Reply,
  UserRoundCheck,
} from 'lucide-react';
import {
  api,
  type AppNotification,
  type AppNotificationType,
  type Project,
  type User,
} from '@/lib/api';
import { EmptyState, PageHeader } from '@/components/layout';
import { TaskModal } from '@/components/task-modal';
import { Button } from '@/components/ui/button';
import { UserAvatar, displayName } from '@/components/user-avatar';
import { canWrite, useAuthStore } from '@/store/auth';
import { useNotificationsStore } from '@/store/notifications';
import {
  ensureNotificationPermission,
  getNotificationPermission,
  notificationsSupported,
  playNotificationSound,
  showBrowserNotification,
  unlockNotificationAudio,
} from '@/lib/browser-notifications';
import { cn } from '@/lib/utils';

const TYPE_META: Record<
  AppNotificationType,
  { label: string; icon: typeof Bell }
> = {
  mention: { label: 'Упоминание', icon: AtSign },
  reply: { label: 'Ответ', icon: Reply },
  assignee: { label: 'Назначение', icon: UserRoundCheck },
};

function formatWhen(value: string): string {
  return new Date(value).toLocaleString('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

type PermissionState = NotificationPermission | 'unsupported';

export function NotificationsPage() {
  const me = useAuthStore((s) => s.user);
  const writable = canWrite(me?.role);
  const [searchParams, setSearchParams] = useSearchParams();
  const { setUnreadCount, markLocalRead, markAllLocalRead, refreshUnread } =
    useNotificationsStore();
  const liveRevision = useNotificationsStore((s) => s.liveRevision);

  const [items, setItems] = useState<AppNotification[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [permission, setPermission] = useState<PermissionState>(() =>
    notificationsSupported() ? getNotificationPermission() : 'unsupported',
  );
  const [enabling, setEnabling] = useState(false);
  const [permissionHint, setPermissionHint] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [data, assignable] = await Promise.all([
        api.notifications(),
        api.assignableUsers(),
      ]);
      setItems(data.notifications);
      setUsers(assignable.users);
      setUnreadCount(data.unreadCount);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  }, [setUnreadCount]);

  const openTask = useCallback(async (taskId: number) => {
    try {
      const res = await api.task(taskId);
      setSelectedTaskId(taskId);
      setSelectedProject(
        res.task.project
          ? ({
              id: res.task.project.id,
              name: res.task.project.name,
              boardId: res.task.project.boardId,
              statuses: res.task.status ? [res.task.status] : [],
            } as Project)
          : null,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось открыть задачу');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (liveRevision <= 0) return;
    void load();
  }, [liveRevision, load]);

  useEffect(() => {
    const sync = () => {
      setPermission(
        notificationsSupported() ? getNotificationPermission() : 'unsupported',
      );
    };
    sync();
    window.addEventListener('focus', sync);
    return () => window.removeEventListener('focus', sync);
  }, []);

  useEffect(() => {
    const raw = searchParams.get('task');
    if (!raw) return;
    const taskId = Number(raw);
    if (!Number.isFinite(taskId) || taskId <= 0) return;
    void openTask(taskId);
    const next = new URLSearchParams(searchParams);
    next.delete('task');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, openTask]);

  const enableBrowserNotifications = async () => {
    setPermissionHint('');
    setEnabling(true);
    try {
      unlockNotificationAudio();

      if (!notificationsSupported()) {
        setPermission('unsupported');
        setPermissionHint(
          !window.isSecureContext
            ? 'Браузерные уведомления доступны только по HTTPS или на localhost.'
            : 'Этот браузер не поддерживает уведомления.',
        );
        return;
      }

      const current = getNotificationPermission();
      if (current === 'denied') {
        setPermission('denied');
        setPermissionHint(
          'Разрешение уже заблокировано. Откройте настройки сайта в браузере (замок / иконка слева от адреса) → «Уведомления» → «Разрешить», затем обновите страницу.',
        );
        return;
      }

      const next = await ensureNotificationPermission();
      setPermission(next);

      if (next === 'granted') {
        playNotificationSound();
        showBrowserNotification({
          title: 'Уведомления включены',
          body: 'BoevTracker будет показывать новые события даже при свёрнутом окне.',
          tag: 'bt-notifications-enabled',
        });
        setPermissionHint('Готово: тестовое уведомление отправлено.');
      } else if (next === 'denied') {
        setPermissionHint(
          'Вы отклонили запрос. Чтобы включить позже: настройки сайта → «Уведомления» → «Разрешить».',
        );
      } else {
        setPermissionHint(
          'Запрос не завершён. Нажмите кнопку ещё раз и выберите «Разрешить» во всплывающем окне браузера.',
        );
      }
    } finally {
      setEnabling(false);
    }
  };

  const openNotification = async (n: AppNotification) => {
    if (!n.readAt) {
      try {
        await api.markNotificationRead(n.id);
        setItems((prev) =>
          prev.map((item) =>
            item.id === n.id
              ? { ...item, readAt: new Date().toISOString() }
              : item,
          ),
        );
        markLocalRead();
      } catch {
        // ignore
      }
    }

    if (n.taskId != null) {
      await openTask(n.taskId);
    }
  };

  const markAll = async () => {
    try {
      await api.markAllNotificationsRead();
      setItems((prev) =>
        prev.map((item) => ({
          ...item,
          readAt: item.readAt || new Date().toISOString(),
        })),
      );
      markAllLocalRead();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    }
  };

  return (
    <div>
      <PageHeader
        title="Уведомления"
        description="Упоминания, ответы на сообщения и назначения исполнителем"
        actions={
          <div className="flex flex-wrap gap-2">
            {permission !== 'granted' && (
              <Button
                type="button"
                variant="outline"
                disabled={enabling}
                onClick={() => void enableBrowserNotifications()}
              >
                <BellRing className="h-4 w-4" />
                {enabling ? 'Запрос…' : 'Включить в браузере'}
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              disabled={items.length === 0 || items.every((n) => n.readAt)}
              onClick={() => void markAll()}
            >
              <CheckCheck className="h-4 w-4" />
              Прочитать все
            </Button>
          </div>
        }
      />

      {permissionHint && (
        <div
          className={cn(
            'mb-4 rounded-lg border px-4 py-3 text-sm',
            permission === 'granted'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200'
              : 'border-border bg-muted/40 text-muted-foreground',
          )}
        >
          {permissionHint}
        </div>
      )}
      {!permissionHint && permission === 'default' && (
        <div className="mb-4 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          Нажмите «Включить в браузере» и разрешите уведомления во всплывающем
          окне — тогда оповещения со звуком будут приходить даже при свёрнутой
          вкладке.
        </div>
      )}
      {!permissionHint && permission === 'denied' && (
        <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
          Уведомления заблокированы для этого сайта. В адресной строке откройте
          настройки сайта → «Уведомления» → «Разрешить», затем обновите страницу.
        </div>
      )}
      {!permissionHint && permission === 'unsupported' && (
        <div className="mb-4 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          Браузерные уведомления недоступны в этом окружении (нужен HTTPS или
          localhost).
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-muted-foreground">Загрузка...</div>
      ) : items.length === 0 ? (
        <EmptyState
          title="Пока нет уведомлений"
          description="Здесь появятся упоминания, ответы и назначения"
          icon={<Bell className="h-10 w-10" />}
        />
      ) : (
        <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {items.map((n) => {
            const meta = TYPE_META[n.type] ?? TYPE_META.mention;
            const Icon = meta.icon;
            const unread = !n.readAt;
            return (
              <button
                key={n.id}
                type="button"
                className={cn(
                  'flex w-full cursor-pointer items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/50',
                  unread && 'bg-primary/5',
                )}
                onClick={() => void openNotification(n)}
              >
                <div
                  className={cn(
                    'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                    unread
                      ? 'bg-primary/15 text-primary'
                      : 'bg-muted text-muted-foreground',
                  )}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span
                      className={cn(
                        'text-sm',
                        unread ? 'font-semibold' : 'font-medium',
                      )}
                    >
                      {n.title}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {meta.label}
                    </span>
                    <span className="ml-auto text-[11px] text-muted-foreground">
                      {formatWhen(n.createdAt)}
                    </span>
                  </div>
                  {n.body && (
                    <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
                      {n.body}
                    </p>
                  )}
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                    {n.actor && (
                      <span className="inline-flex items-center gap-1.5">
                        <UserAvatar user={n.actor} size="sm" />
                        {displayName(n.actor)}
                      </span>
                    )}
                    {n.taskTitle && (
                      <span className="truncate">· {n.taskTitle}</span>
                    )}
                  </div>
                </div>
                {unread && (
                  <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary" />
                )}
              </button>
            );
          })}
        </div>
      )}

      {selectedTaskId != null && (
        <TaskModal
          taskId={selectedTaskId}
          project={selectedProject}
          users={users}
          writable={writable}
          onClose={() => {
            setSelectedTaskId(null);
            setSelectedProject(null);
            void refreshUnread();
            void load();
          }}
          onChanged={async () => {
            await refreshUnread();
          }}
        />
      )}
    </div>
  );
}
