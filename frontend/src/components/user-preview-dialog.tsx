import { useNavigate } from 'react-router-dom';
import { Clock } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { UserAvatar } from '@/components/user-avatar';
import type { PublicUser } from '@/lib/api';
import { ROLE_LABELS } from '@/lib/utils';

export function UserPreviewDialog({
  user,
  onClose,
}: {
  user: PublicUser | null;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const color = user?.avatarColor || '#3B82F6';
  const roleLabel = user?.role ? ROLE_LABELS[user.role] ?? user.role : '—';

  return (
    <Dialog
      open={Boolean(user)}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="max-w-sm">
        {user ? (
          <>
            <DialogHeader>
              <DialogTitle>Сотрудник</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col items-center gap-4">
              <UserAvatar user={user} size="2xl" />
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>Цвет</span>
                <span
                  className="h-5 w-5 rounded-full border border-border"
                  style={{ backgroundColor: color }}
                  title={color}
                />
              </div>
            </div>
            <dl className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Логин</dt>
              <dd className="min-w-0 truncate font-medium">@{user.username}</dd>
              <dt className="text-muted-foreground">Имя</dt>
              <dd className="min-w-0 truncate">{user.firstName || '—'}</dd>
              <dt className="text-muted-foreground">Фамилия</dt>
              <dd className="min-w-0 truncate">{user.lastName || '—'}</dd>
              <dt className="text-muted-foreground">Роль</dt>
              <dd className="min-w-0 truncate">{roleLabel}</dd>
            </dl>
            <Button
              type="button"
              className="w-full"
              onClick={() => {
                onClose();
                navigate(`/time?user=${user.id}`);
              }}
            >
              <Clock className="h-4 w-4" />
              Показать статистику смен
            </Button>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
