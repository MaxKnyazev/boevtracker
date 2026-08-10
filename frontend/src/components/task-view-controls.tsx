import { ArrowDownUp, ListFilter, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AppSelect, type SelectOption } from '@/components/ui/select';
import {
  EmptyAssigneeAvatar,
  UserAvatar,
  displayName,
} from '@/components/user-avatar';
import { PRIORITY_LABELS, cn } from '@/lib/utils';
import {
  DEFAULT_TASK_VIEW,
  hasActiveTaskView,
  type DeadlineFilter,
  type StatusTimeFilter,
  type TaskSortDir,
  type TaskSortField,
  type TaskViewState,
  type TaskViewUser,
} from '@/lib/task-view';

export function TaskViewControls({
  view,
  onChange,
  users,
  className,
  boards,
  projects,
  showSort = true,
}: {
  view: TaskViewState;
  onChange: (next: TaskViewState) => void;
  users: TaskViewUser[];
  className?: string;
  boards?: SelectOption[];
  projects?: SelectOption[];
  showSort?: boolean;
}) {
  const active = hasActiveTaskView(view);
  const showLocation = boards != null && projects != null;

  const patch = (partial: Partial<TaskViewState>) => {
    onChange({ ...view, ...partial });
  };

  const resetButton = active ? (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-9 w-9 shrink-0 px-0"
      onClick={() => onChange({ ...DEFAULT_TASK_VIEW })}
      title="Сбросить"
      aria-label="Сбросить"
    >
      <RotateCcw className="h-3.5 w-3.5" />
    </Button>
  ) : null;

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
          {showLocation && (
            <>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="shrink-0">Доска</span>
                <AppSelect
                  value={view.board}
                  onValueChange={(v) => patch({ board: v, project: 'all' })}
                  options={[{ value: 'all', label: 'Все' }, ...boards]}
                  className="w-[10.5rem] text-xs"
                />
              </label>

              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="shrink-0">Проект</span>
                <AppSelect
                  value={view.project}
                  onValueChange={(v) => patch({ project: v })}
                  options={[{ value: 'all', label: 'Все' }, ...projects]}
                  className="w-[10.5rem] text-xs"
                />
              </label>
            </>
          )}

          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="shrink-0">Приоритет</span>
            <AppSelect
              value={view.priority}
              onValueChange={(v) => patch({ priority: v })}
              options={[
                { value: 'all', label: 'Все' },
                ...Object.entries(PRIORITY_LABELS).map(([value, label]) => ({
                  value,
                  label,
                })),
              ]}
              className="w-[8.5rem] text-xs"
            />
          </label>

          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="shrink-0">Дедлайн</span>
            <AppSelect
              value={view.deadline}
              onValueChange={(v) => patch({ deadline: v as DeadlineFilter })}
              options={[
                { value: 'all', label: 'Все' },
                { value: 'with', label: 'С дедлайном' },
                { value: 'without', label: 'Без дедлайна' },
                { value: 'overdue', label: 'Просроченные' },
                { value: 'week', label: 'На этой неделе' },
              ]}
              className="w-[9.5rem] text-xs"
            />
          </label>

          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="shrink-0">В статусе</span>
            <AppSelect
              value={view.statusTime}
              onValueChange={(v) =>
                patch({ statusTime: v as StatusTimeFilter })
              }
              options={[
                { value: 'all', label: 'Все' },
                { value: '1d', label: 'Дольше 1 дня' },
                { value: '3d', label: 'Дольше 3 дней' },
                { value: '7d', label: 'Дольше 7 дней' },
                { value: '30d', label: 'Дольше 30 дней' },
              ]}
              className="w-[9.5rem] text-xs"
            />
          </label>

          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="shrink-0">Исполнитель</span>
            <AppSelect
              value={view.assignee}
              onValueChange={(v) => patch({ assignee: v })}
              options={[
                { value: 'all', label: 'Все' },
                {
                  value: 'none',
                  label: 'Без исполнителя',
                  leading: (
                    <EmptyAssigneeAvatar size="sm" title="Без исполнителя" />
                  ),
                },
                ...users.map((u) => ({
                  value: String(u.id),
                  label: displayName(u),
                  leading: <UserAvatar user={u} size="sm" />,
                })),
              ]}
              className="w-[13rem] text-xs"
            />
          </label>

          {!showSort && resetButton}
        </div>
      </div>

      {showSort && (
        <div className="flex items-start gap-3">
          <span className="inline-flex h-9 shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
            <ArrowDownUp className="h-3.5 w-3.5" />
            Сортировка
          </span>

          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <AppSelect
              value={view.sortField}
              onValueChange={(v) =>
                patch({ sortField: v as TaskSortField })
              }
              options={[
                { value: 'createdAt', label: 'Дата создания' },
                { value: 'order', label: 'Порядок на доске' },
                { value: 'priority', label: 'Приоритет' },
                { value: 'deadline', label: 'Дедлайн' },
                { value: 'statusTime', label: 'Время в статусе' },
                { value: 'assignee', label: 'Исполнитель' },
              ]}
              className="w-[10.5rem] text-xs"
            />

            <AppSelect
              value={view.sortDir}
              onValueChange={(v) => patch({ sortDir: v as TaskSortDir })}
              title="Направление сортировки"
              options={[
                { value: 'asc', label: 'По возрастанию' },
                { value: 'desc', label: 'По убыванию' },
              ]}
              className="w-[9.5rem] text-xs"
            />

            {resetButton}
          </div>
        </div>
      )}
    </div>
  );
}
