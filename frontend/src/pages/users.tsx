import { useEffect, useMemo, useState } from 'react';
import { api, type Role, type User } from '@/lib/api';
import { PageHeader, EmptyState } from '@/components/layout';
import { PaginationControls } from '@/components/pagination-controls';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AppSelect } from '@/components/ui/select';
import { ROLE_LABELS } from '@/lib/utils';
import { UserAvatar, displayName } from '@/components/user-avatar';
import { UserPreviewDialog } from '@/components/user-preview-dialog';
import { usePagination } from '@/hooks/use-pagination';
import { paginateList, PAGINATION_PAGE_SIZE_KEYS } from '@/lib/pagination';

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: 'ADMIN', label: ROLE_LABELS.ADMIN },
  { value: 'DEVELOPER', label: ROLE_LABELS.DEVELOPER },
  { value: 'READER', label: ROLE_LABELS.READER },
  { value: 'PENDING', label: ROLE_LABELS.PENDING },
];

export function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [previewUser, setPreviewUser] = useState<User | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.users();
      setUsers(data.users);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const pending = users.filter((u) => u.role === 'PENDING');
  const active = users.filter((u) => u.role !== 'PENDING');

  const pendingPagination = usePagination(
    PAGINATION_PAGE_SIZE_KEYS.usersPending,
    [pending.length],
  );
  const activePagination = usePagination(
    PAGINATION_PAGE_SIZE_KEYS.usersActive,
    [active.length],
  );

  const pendingPage = useMemo(
    () => paginateList(pending, pendingPagination.page, pendingPagination.pageSize),
    [pending, pendingPagination.page, pendingPagination.pageSize],
  );
  const activePage = useMemo(
    () => paginateList(active, activePagination.page, activePagination.pageSize),
    [active, activePagination.page, activePagination.pageSize],
  );

  const approve = async (id: number, role: Role) => {
    await api.approveUser(id, role);
    await load();
  };

  const reject = async (id: number) => {
    if (!confirm('Отклонить и удалить пользователя?')) return;
    await api.rejectUser(id);
    await load();
  };

  const changeRole = async (id: number, role: Role) => {
    await api.setRole(id, role);
    await load();
  };

  return (
    <div>
      <PageHeader
        title="Пользователи"
        description="Подтверждение регистраций и управление ролями"
      />
      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
      {loading ? (
        <p className="text-muted-foreground">Загрузка...</p>
      ) : (
        <div className="space-y-8">
          <section>
            <h2 className="mb-3 text-lg font-medium">Ожидают подтверждения</h2>
            {pending.length === 0 ? (
              <EmptyState
                title="Нет заявок"
                description="Новые регистрации появятся здесь"
              />
            ) : (
              <div className="space-y-3">
                {pendingPage.items.map((u) => (
                  <UserRow
                    key={u.id}
                    user={u}
                    onPreview={() => setPreviewUser(u)}
                  >
                    <Button
                      size="sm"
                      onClick={() => approve(u.id, 'DEVELOPER')}
                    >
                      Подтвердить как разработчик
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => approve(u.id, 'READER')}
                    >
                      Как читатель
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => reject(u.id)}
                    >
                      Отклонить
                    </Button>
                  </UserRow>
                ))}
              </div>
            )}
            {pending.length > 0 && (
              <PaginationControls
                result={pendingPage}
                page={pendingPagination.page}
                pageSize={pendingPagination.pageSize}
                onPageChange={pendingPagination.setPage}
                onPageSizeChange={pendingPagination.setPageSize}
              />
            )}
          </section>

          <section>
            <h2 className="mb-3 text-lg font-medium">Активные пользователи</h2>
            {active.length === 0 ? (
              <EmptyState
                title="Нет активных пользователей"
                description="Подтверждённые пользователи появятся здесь"
              />
            ) : (
              <div className="space-y-3">
                {activePage.items.map((u) => (
                <UserRow
                  key={u.id}
                  user={u}
                  onPreview={() => setPreviewUser(u)}
                >
                  <RoleSelect
                    value={u.role}
                    onChange={(role) => changeRole(u.id, role)}
                  />
                </UserRow>
                ))}
              </div>
            )}
            {active.length > 0 && (
              <PaginationControls
                result={activePage}
                page={activePagination.page}
                pageSize={activePagination.pageSize}
                onPageChange={activePagination.setPage}
                onPageSizeChange={activePagination.setPageSize}
              />
            )}
          </section>
        </div>
      )}
      <UserPreviewDialog
        user={previewUser}
        onClose={() => setPreviewUser(null)}
      />
    </div>
  );
}

function UserRow({
  user,
  onPreview,
  children,
}: {
  user: User;
  onPreview: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
      <button
        type="button"
        className="flex min-w-0 cursor-pointer items-center gap-3 rounded-lg text-left outline-none transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring"
        onClick={onPreview}
      >
        <UserAvatar user={user} size="md" />
        <div>
          <div className="font-medium">{displayName(user)}</div>
          <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
            <span>@{user.username}</span>
            <Badge>{ROLE_LABELS[user.role]}</Badge>
            <span>с {new Date(user.createdAt).toLocaleDateString('ru-RU')}</span>
          </div>
        </div>
      </button>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function RoleSelect({
  value,
  onChange,
}: {
  value: Role;
  onChange: (role: Role) => void;
}) {
  return (
    <AppSelect
      value={value}
      onValueChange={(v) => onChange(v as Role)}
      options={ROLE_OPTIONS}
      className="w-[11rem] text-xs"
    />
  );
}
