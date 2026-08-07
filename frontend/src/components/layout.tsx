import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  LogOut,
  FolderKanban,
  ListTodo,
  Bell,
  PanelLeftClose,
  PanelLeft,
} from 'lucide-react';
import { useAuthStore, canManageUsers } from '@/store/auth';
import { useNotificationsStore } from '@/store/notifications';
import { NotificationWatcher } from '@/components/notification-watcher';
import { UploadProgressDock } from '@/components/upload-progress-dock';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme-toggle';
import { UploadProgressDock } from '@/components/upload-progress-dock';
import { ROLE_LABELS, cn } from '@/lib/utils';
import { UserAvatar, displayName } from '@/components/user-avatar';

const SIDEBAR_COLLAPSED_KEY = 'boevtracker.sidebarCollapsed';

export function AppLayout() {
  const { user, logout } = useAuthStore();
  const unreadCount = useNotificationsStore((s) => s.unreadCount);
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? '1' : '0');
    } catch {
      // ignore
    }
  }, [collapsed]);

  const onLogout = async () => {
    await logout();
    navigate('/login');
  };

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      'flex items-center rounded-lg text-sm transition-colors',
      collapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2.5',
      isActive
        ? 'bg-primary text-primary-foreground'
        : 'text-sidebar-foreground/80 hover:bg-sidebar-accent',
    );

  return (
    <div className="flex min-h-screen">
      <aside
        className={cn(
          'sticky top-0 flex h-screen flex-col border-r border-border bg-sidebar py-4 transition-[width] duration-200',
          collapsed ? 'w-[4.5rem] px-2' : 'w-64 px-3',
        )}
      >
        <div
          className={cn(
            'mb-6 flex items-start',
            collapsed ? 'flex-col items-center gap-3' : 'justify-between gap-2 px-2',
          )}
        >
          <div className={cn(collapsed && 'text-center')}>
            <div className="text-xl font-bold tracking-tight">
              {collapsed ? (
                <>
                  <span className="text-primary">B</span>
                  <span className="text-slate-600 dark:text-white">T</span>
                </>
              ) : (
                <>
                  <span className="text-primary">Boev</span>
                  <span className="text-slate-600 dark:text-white">Tracker</span>
                </>
              )}
            </div>
            {!collapsed && (
              <div className="mt-1 text-xs text-muted-foreground">
                Рабочий трекер задач
              </div>
            )}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-muted-foreground"
            title={collapsed ? 'Развернуть меню' : 'Свернуть меню'}
            onClick={() => setCollapsed((v) => !v)}
          >
            {collapsed ? (
              <PanelLeft className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </Button>
        </div>

        <nav className="flex flex-1 flex-col gap-1">
          <NavLink to="/" end className={linkClass} title="Доски">
            <LayoutDashboard className="h-4 w-4 shrink-0" />
            {!collapsed && 'Доски'}
          </NavLink>
          <NavLink to="/tasks" className={linkClass} title="Задачи">
            <ListTodo className="h-4 w-4 shrink-0" />
            {!collapsed && 'Задачи'}
          </NavLink>
          <NavLink to="/notifications" className={linkClass} title="Уведомления">
            <span className="relative shrink-0">
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <span
                  className={cn(
                    'absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-0.5 text-[10px] font-semibold text-destructive-foreground',
                    collapsed && '-right-2 -top-2',
                  )}
                >
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </span>
            {!collapsed && 'Уведомления'}
          </NavLink>
          {canManageUsers(user?.role) && (
            <NavLink to="/users" className={linkClass} title="Пользователи">
              <Users className="h-4 w-4 shrink-0" />
              {!collapsed && 'Пользователи'}
            </NavLink>
          )}
        </nav>

        <div
          className={cn(
            'mt-auto border-t border-border pt-4',
            collapsed ? 'px-0' : 'px-2',
          )}
        >
          {collapsed ? (
            <div className="flex flex-col items-center gap-2">
              <UserAvatar user={user} size="md" title={displayName(user)} />
              <ThemeToggle />
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9"
                onClick={onLogout}
                title="Выйти"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <>
              <div className="mb-3 flex items-center gap-2">
                <UserAvatar user={user} size="md" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">
                    {displayName(user)}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {user ? ROLE_LABELS[user.role] : ''}
                  </div>
                </div>
                <ThemeToggle />
              </div>
              <Button variant="outline" className="w-full" onClick={onLogout}>
                <LogOut className="h-4 w-4" />
                Выйти
              </Button>
            </>
          )}
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <div className="mx-auto w-full p-6 md:p-8">
          <Outlet />
        </div>
      </main>
      <NotificationWatcher />
      <UploadProgressDock />
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {actions}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  icon,
}: {
  title: string;
  description?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/40 px-6 py-16 text-center">
      <div className="mb-3 text-primary">
        {icon || <FolderKanban className="h-10 w-10" />}
      </div>
      <div className="text-lg font-medium">{title}</div>
      {description && (
        <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>
      )}
    </div>
  );
}
