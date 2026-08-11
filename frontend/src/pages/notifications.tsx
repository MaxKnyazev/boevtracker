import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AtSign,
  Bell,
  BellRing,
  CheckCheck,
  ChevronDown,
  FolderKanban,
  LayoutGrid,
  MessageSquareText,
  Plus,
  Reply,
  Settings,
  Trash2,
  UserRoundCheck,
  Workflow,
} from 'lucide-react';
import {
  api,
  type AppNotification,
  type AppNotificationType,
  type Board,
  type NotificationSettings,
  type NotificationSubscription,
  type Project,
  type User,
} from '@/lib/api';
import { EmptyState, PageHeader } from '@/components/layout';
import { TaskModal } from '@/components/task-modal';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { AppSelect } from '@/components/ui/select';
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
  task_comment: { label: 'Сообщение', icon: MessageSquareText },
  status_assignee: { label: 'Статус', icon: Workflow },
  status_creator: { label: 'Статус', icon: Workflow },
  subscription_task: { label: 'Подписка', icon: FolderKanban },
  subscription_status: { label: 'Подписка', icon: FolderKanban },
};

const SETTINGS_ROWS: {
  key: keyof NotificationSettings;
  title: string;
  description: string;
}[] = [
  {
    key: 'taskComment',
    title: 'Сообщения в чате задачи',
    description:
      'Новые сообщения в задачах, где вы исполнитель (кроме @ и ответов)',
  },
  {
    key: 'mention',
    title: 'Упоминания через @',
    description: 'Когда вас упоминают в комментарии',
  },
  {
    key: 'reply',
    title: 'Ответы на сообщения',
    description: 'Когда отвечают на ваш комментарий',
  },
  {
    key: 'assignee',
    title: 'Назначение исполнителем',
    description: 'Когда вас добавляют в исполнители задачи',
  },
  {
    key: 'statusAssignee',
    title: 'Смена статуса (исполнитель)',
    description:
      'Статус задачи, где вы исполнитель, меняет кто-то другой',
  },
  {
    key: 'statusCreator',
    title: 'Смена статуса (автор)',
    description: 'Статус созданной вами задачи меняет кто-то другой',
  },
];

function formatWhen(value: string): string {
  return new Date(value).toLocaleString('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

type PermissionState = NotificationPermission | 'unsupported';

function Toggle({
  checked,
  disabled,
  onChange,
  label,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-6 w-11 shrink-0 cursor-pointer rounded-full border transition-colors',
        checked
          ? 'border-primary bg-primary'
          : 'border-border bg-muted',
        disabled && 'cursor-not-allowed opacity-50',
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 h-4.5 w-4.5 rounded-full bg-background shadow transition-transform',
          checked ? 'left-[22px]' : 'left-0.5',
        )}
        style={{ height: 18, width: 18 }}
      />
    </button>
  );
}

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

  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [subscriptions, setSubscriptions] = useState<NotificationSubscription[]>(
    [],
  );
  const [boards, setBoards] = useState<Board[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [addScope, setAddScope] = useState<'board' | 'project'>('project');
  const [addBoardId, setAddBoardId] = useState('');
  const [addProjectId, setAddProjectId] = useState('');
  const [addNotifyNew, setAddNotifyNew] = useState(true);
  const [addNotifyStatus, setAddNotifyStatus] = useState(true);
  const [addSaving, setAddSaving] = useState(false);
  const [feedFilter, setFeedFilter] = useState<'all' | 'unread' | 'read'>('all');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [data, assignable, prefs, subs, boardsRes] = await Promise.all([
        api.notifications(),
        api.assignableUsers(),
        api.notificationSettings(),
        api.notificationSubscriptions(),
        api.boards(),
      ]);
      setItems(data.notifications);
      setUsers(assignable.users);
      setUnreadCount(data.unreadCount);
      setSettings(prefs.settings);
      setSubscriptions(subs.subscriptions);
      setBoards(boardsRes.boards);
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

  const projectOptions = useMemo(() => {
    const list: { value: string; label: string }[] = [];
    for (const board of boards) {
      for (const project of board.projects || []) {
        list.push({
          value: String(project.id),
          label: `${board.name} / ${project.name}`,
        });
      }
    }
    return list;
  }, [boards]);

  const subscribedBoardIds = useMemo(
    () =>
      new Set(
        subscriptions
          .filter((s) => s.boardId != null)
          .map((s) => s.boardId as number),
      ),
    [subscriptions],
  );
  const subscribedProjectIds = useMemo(
    () =>
      new Set(
        subscriptions
          .filter((s) => s.projectId != null)
          .map((s) => s.projectId as number),
      ),
    [subscriptions],
  );

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

  const patchSetting = async (
    key: keyof NotificationSettings,
    value: boolean,
  ) => {
    if (!settings) return;
    const prev = settings;
    setSettings({ ...settings, [key]: value });
    setSettingsSaving(true);
    try {
      const res = await api.updateNotificationSettings({ [key]: value });
      setSettings(res.settings);
    } catch (err) {
      setSettings(prev);
      setError(err instanceof Error ? err.message : 'Ошибка сохранения');
    } finally {
      setSettingsSaving(false);
    }
  };

  const patchSubscription = async (
    id: number,
    patch: { notifyNewTasks?: boolean; notifyStatusChanges?: boolean },
  ) => {
    const prev = subscriptions;
    setSubscriptions((list) =>
      list.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    );
    try {
      const res = await api.updateNotificationSubscription(id, patch);
      setSubscriptions((list) =>
        list.map((s) => (s.id === id ? res.subscription : s)),
      );
    } catch (err) {
      setSubscriptions(prev);
      setError(err instanceof Error ? err.message : 'Ошибка сохранения');
    }
  };

  const removeSubscription = async (id: number) => {
    const prev = subscriptions;
    setSubscriptions((list) => list.filter((s) => s.id !== id));
    try {
      await api.deleteNotificationSubscription(id);
    } catch (err) {
      setSubscriptions(prev);
      setError(err instanceof Error ? err.message : 'Ошибка удаления');
    }
  };

  const submitSubscription = async () => {
    setAddSaving(true);
    try {
      const boardId =
        addScope === 'board'
          ? Number(addBoardId || boardOptions[0]?.value)
          : undefined;
      const projectId =
        addScope === 'project'
          ? Number(addProjectId || availableProjects[0]?.value)
          : undefined;
      if (
        (addScope === 'board' && !boardId) ||
        (addScope === 'project' && !projectId)
      ) {
        setError('Выберите цель подписки');
        return;
      }
      const payload =
        addScope === 'board'
          ? {
              boardId: boardId!,
              notifyNewTasks: addNotifyNew,
              notifyStatusChanges: addNotifyStatus,
            }
          : {
              projectId: projectId!,
              notifyNewTasks: addNotifyNew,
              notifyStatusChanges: addNotifyStatus,
            };
      const res = await api.createNotificationSubscription(payload);
      setSubscriptions((list) => [res.subscription, ...list]);
      setAddOpen(false);
      setAddBoardId('');
      setAddProjectId('');
      setAddNotifyNew(true);
      setAddNotifyStatus(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка создания подписки');
    } finally {
      setAddSaving(false);
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

  const boardOptions = boards
    .filter((b) => !subscribedBoardIds.has(b.id))
    .map((b) => ({ value: String(b.id), label: b.name }));

  const availableProjects = projectOptions.filter(
    (p) => !subscribedProjectIds.has(Number(p.value)),
  );

  const filteredItems = useMemo(() => {
    if (feedFilter === 'unread') return items.filter((n) => !n.readAt);
    if (feedFilter === 'read') return items.filter((n) => Boolean(n.readAt));
    return items;
  }, [items, feedFilter]);

  return (
    <div>
      <PageHeader
        title="Уведомления"
        description="События, браузерные оповещения и персональные настройки"
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

      <section className="mb-6 overflow-hidden rounded-xl border border-border bg-card">
        <button
          type="button"
          className="flex w-full cursor-pointer items-center justify-between gap-3 px-4 py-3 text-left"
          aria-expanded={settingsOpen}
          onClick={() => setSettingsOpen((v) => !v)}
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <Settings className="h-5 w-5 shrink-0 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Настройки уведомлений</h2>
          </div>
          <ChevronDown
            className={cn(
              'h-5 w-5 shrink-0 text-muted-foreground transition-transform',
              settingsOpen && 'rotate-180',
            )}
          />
        </button>
        <div
          className={cn(
            'grid transition-[grid-template-rows] duration-300 ease-out',
            settingsOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
          )}
        >
          <div className="min-h-0 overflow-hidden">
            <div className="divide-y divide-border border-t border-border">
              {SETTINGS_ROWS.map((row) => (
                <div
                  key={row.key}
                  className="flex items-start justify-between gap-4 px-4 py-3"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{row.title}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {row.description}
                    </div>
                  </div>
                  <Toggle
                    checked={Boolean(settings?.[row.key])}
                    disabled={!settings || settingsSaving}
                    label={row.title}
                    onChange={(next) => void patchSetting(row.key, next)}
                  />
                </div>
              ))}
            </div>

            <div className="border-t border-border">
              <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <div>
                  <h3 className="text-sm font-semibold">Подписки</h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Рабочие пространства и проекты: новые задачи и смена
                    статусов
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setAddOpen(true)}
                >
                  <Plus className="h-4 w-4" />
                  Добавить
                </Button>
              </div>
              {subscriptions.length === 0 ? (
                <div className="px-4 pb-4 text-sm text-muted-foreground">
                  Подписок пока нет. Добавьте рабочее пространство или проект.
                </div>
              ) : (
                <div className="divide-y divide-border border-t border-border">
                  {subscriptions.map((sub) => {
                    const title = sub.board
                      ? sub.board.name
                      : sub.project
                        ? `${sub.project.board?.name ? `${sub.project.board.name} / ` : ''}${sub.project.name}`
                        : 'Подписка';
                    const scopeLabel =
                      sub.boardId != null ? 'Пространство' : 'Проект';
                    const ScopeIcon =
                      sub.boardId != null ? LayoutGrid : FolderKanban;
                    return (
                      <div key={sub.id} className="space-y-3 px-4 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 items-start gap-2">
                            <ScopeIcon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                            <div className="min-w-0">
                              <div className="truncate text-sm font-medium">
                                {title}
                              </div>
                              <div className="text-[11px] text-muted-foreground">
                                {scopeLabel}
                              </div>
                            </div>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            className="h-8 w-8 cursor-pointer p-0 text-muted-foreground hover:text-destructive"
                            title="Удалить подписку"
                            onClick={() => void removeSubscription(sub.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="flex flex-wrap gap-4 pl-6">
                          <label className="flex cursor-pointer items-center gap-2 text-xs">
                            <Toggle
                              checked={sub.notifyNewTasks}
                              label="Новые задачи"
                              onChange={(next) =>
                                void patchSubscription(sub.id, {
                                  notifyNewTasks: next,
                                })
                              }
                            />
                            Новые задачи
                          </label>
                          <label className="flex cursor-pointer items-center gap-2 text-xs">
                            <Toggle
                              checked={sub.notifyStatusChanges}
                              label="Смена статусов"
                              onChange={(next) =>
                                void patchSubscription(sub.id, {
                                  notifyStatusChanges: next,
                                })
                              }
                            />
                            Смена статусов
                          </label>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">Лента</h2>
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              { id: 'all', label: 'Все' },
              { id: 'unread', label: 'Новые' },
              { id: 'read', label: 'Прочитанные' },
            ] as const
          ).map((tab) => (
            <Button
              key={tab.id}
              type="button"
              size="sm"
              variant={feedFilter === tab.id ? 'default' : 'outline'}
              className="cursor-pointer"
              onClick={() => setFeedFilter(tab.id)}
            >
              {tab.label}
            </Button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Загрузка...</div>
      ) : items.length === 0 ? (
        <EmptyState
          title="Пока нет уведомлений"
          description="Здесь появятся события по вашим настройкам"
          icon={<Bell className="h-10 w-10" />}
        />
      ) : filteredItems.length === 0 ? (
        <EmptyState
          title={
            feedFilter === 'unread'
              ? 'Нет новых уведомлений'
              : 'Нет прочитанных уведомлений'
          }
          description={
            feedFilter === 'unread'
              ? 'Все уведомления уже прочитаны'
              : 'Прочитанные уведомления появятся здесь'
          }
          icon={<Bell className="h-10 w-10" />}
        />
      ) : (
        <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {filteredItems.map((n) => {
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

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Новая подписка</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Button
                type="button"
                variant={addScope === 'project' ? 'default' : 'outline'}
                className="flex-1"
                onClick={() => setAddScope('project')}
              >
                Проект
              </Button>
              <Button
                type="button"
                variant={addScope === 'board' ? 'default' : 'outline'}
                className="flex-1"
                onClick={() => setAddScope('board')}
              >
                Пространство
              </Button>
            </div>

            {addScope === 'board' ? (
              boardOptions.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Нет доступных рабочих пространств для подписки
                </p>
              ) : (
                <AppSelect
                  value={addBoardId || boardOptions[0]!.value}
                  onValueChange={setAddBoardId}
                  placeholder="Выберите рабочее пространство"
                  options={boardOptions}
                />
              )
            ) : availableProjects.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Нет доступных проектов для подписки
              </p>
            ) : (
              <AppSelect
                value={addProjectId || availableProjects[0]!.value}
                onValueChange={setAddProjectId}
                placeholder="Выберите проект"
                options={availableProjects}
              />
            )}

            <label className="flex items-center justify-between gap-3 text-sm">
              <span>Новые задачи</span>
              <Toggle checked={addNotifyNew} onChange={setAddNotifyNew} />
            </label>
            <label className="flex items-center justify-between gap-3 text-sm">
              <span>Смена статусов</span>
              <Toggle checked={addNotifyStatus} onChange={setAddNotifyStatus} />
            </label>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setAddOpen(false)}
              >
                Отмена
              </Button>
              <Button
                type="button"
                disabled={addSaving}
                onClick={() => void submitSubscription()}
              >
                {addSaving ? 'Сохранение…' : 'Подписаться'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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
