import { ListFilter, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AppSelect } from '@/components/ui/select';
import { UserAvatar, displayName } from '@/components/user-avatar';
import { cn } from '@/lib/utils';
import {
  DEFAULT_SHIFT_VIEW,
  hasActiveShiftView,
  type ShiftPeriodFilter,
  type ShiftViewState,
} from '@/lib/shift-view';
import type { PublicUser, WorkShiftStatus } from '@/lib/api';

const STATUS_OPTIONS: { value: WorkShiftStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'Все' },
  { value: 'active', label: 'Активна' },
  { value: 'paused', label: 'Пауза' },
  { value: 'completed', label: 'Завершена' },
];

const PERIOD_OPTIONS: { value: ShiftPeriodFilter; label: string }[] = [
  { value: 'all', label: 'Все' },
  { value: 'today', label: 'Сегодня' },
  { value: 'week', label: 'Эта неделя' },
  { value: 'month', label: 'Этот месяц' },
];

export function ShiftViewControls({
  view,
  onChange,
  users,
  className,
}: {
  view: ShiftViewState;
  onChange: (next: ShiftViewState) => void;
  users: PublicUser[];
  className?: string;
}) {
  const active = hasActiveShiftView(view);

  const patch = (partial: Partial<ShiftViewState>) => {
    onChange({ ...view, ...partial });
  };

  return (
    <div
      className={cn(
        'space-y-2 rounded-lg border border-border/60 bg-card/60 px-2.5 py-2',
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <span className="inline-flex h-9 shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
          <ListFilter className="h-3.5 w-3.5" />
          Фильтры
        </span>

        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="shrink-0">Сотрудник</span>
            <AppSelect
              value={view.user}
              onValueChange={(v) => patch({ user: v })}
              options={[
                { value: 'all', label: 'Все' },
                ...users.map((u) => ({
                  value: String(u.id),
                  label: displayName(u),
                  leading: <UserAvatar user={u} size="sm" />,
                })),
              ]}
              className="w-[13rem] text-xs"
            />
          </label>

          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="shrink-0">Статус</span>
            <AppSelect
              value={view.status}
              onValueChange={(v) => patch({ status: v })}
              options={STATUS_OPTIONS}
              className="w-[9.5rem] text-xs"
            />
          </label>

          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="shrink-0">Период</span>
            <AppSelect
              value={view.period}
              onValueChange={(v) => patch({ period: v as ShiftPeriodFilter })}
              options={PERIOD_OPTIONS}
              className="w-[9.5rem] text-xs"
            />
          </label>

          {active && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-9 w-9 shrink-0 px-0"
              onClick={() => onChange({ ...DEFAULT_SHIFT_VIEW })}
              title="Сбросить"
              aria-label="Сбросить"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
