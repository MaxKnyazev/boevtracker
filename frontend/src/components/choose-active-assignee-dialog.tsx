import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { UserAvatar, displayName } from '@/components/user-avatar';
import type { PublicUser } from '@/lib/api';
import { cn } from '@/lib/utils';

export function ChooseActiveAssigneeDialog({
  open,
  title,
  description,
  assignees,
  initialUserId,
  confirmLabel = 'Подтвердить',
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description?: string;
  assignees: PublicUser[];
  initialUserId?: number | null;
  confirmLabel?: string;
  onConfirm: (userId: number) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelected(initialUserId ?? assignees[0]?.id ?? null);
  }, [open, initialUserId, assignees]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
        <ul className="max-h-64 space-y-1 overflow-y-auto">
          {assignees.map((u) => (
            <li key={u.id}>
              <button
                type="button"
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-accent',
                  selected === u.id && 'bg-accent',
                )}
                onClick={() => setSelected(u.id)}
              >
                <UserAvatar user={u} size="sm" />
                <span className="truncate">{displayName(u)}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
            Отмена
          </Button>
          <Button
            type="button"
            disabled={saving || selected == null}
            onClick={() => {
              if (selected == null) return;
              void (async () => {
                setSaving(true);
                try {
                  await onConfirm(selected);
                } finally {
                  setSaving(false);
                }
              })();
            }}
          >
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
