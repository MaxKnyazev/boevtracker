import { ArrowDownUp, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AppSelect } from '@/components/ui/select';
import { displayName } from '@/components/user-avatar';
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
}: {
  view: TaskViewState;
  onChange: (next: TaskViewState) => void;
  users: TaskViewUser[];
  className?: string;
}) {
  const active = hasActiveTaskView(view);

  const patch = (partial: Partial<TaskViewState>) => {
    onChange({ ...view, ...partial });
  };

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-card/60 px-2.5 py-2',
        className,
      )}
    >
      <ArrowDownUp className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />

      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="shrink-0">Сортировка</span>
        <AppSelect
          value={view.sortField}
          onValueChange={(v) => patch({ sortField: v as TaskSortField })}
          options={[
            { value: 'order', label: 'По умолчанию' },
            { value: 'priority', label: 'Приоритет' },
            { value: 'deadline', label: 'Дедлайн' },
            { value: 'statusTime', label: 'Время в статусе' },
            { value: 'assignee', label: 'Исполнитель' },
          ]}
          className="w-[10.5rem] text-xs"
        />
      </label>

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

      <span className="mx-0.5 hidden h-4 w-px bg-border sm:block" />

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
          onValueChange={(v) => patch({ statusTime: v as StatusTimeFilter })}
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
            { value: 'none', label: 'Без исполнителя' },
            ...users.map((u) => ({
              value: String(u.id),
              label: displayName(u),
            })),
          ]}
          className="w-[10rem] text-xs"
        />
      </label>

      {active && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-9 gap-1 px-2 text-xs"
          onClick={() => onChange({ ...DEFAULT_TASK_VIEW })}
          title="Сбросить"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Сбросить
        </Button>
      )}
    </div>
  );
}
