import { ArrowDownUp, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
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

const selectClass =
  'h-9 rounded-md border border-input bg-background px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

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
        'flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-muted/20 px-2.5 py-2',
        className,
      )}
    >
      <ArrowDownUp className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />

      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="shrink-0">Сортировка</span>
        <select
          className={selectClass}
          value={view.sortField}
          onChange={(e) =>
            patch({ sortField: e.target.value as TaskSortField })
          }
        >
          <option value="order">По умолчанию</option>
          <option value="priority">Приоритет</option>
          <option value="deadline">Дедлайн</option>
          <option value="statusTime">Время в статусе</option>
          <option value="assignee">Исполнитель</option>
        </select>
      </label>

      <select
        className={selectClass}
        value={view.sortDir}
        onChange={(e) => patch({ sortDir: e.target.value as TaskSortDir })}
        title="Направление сортировки"
      >
        <option value="asc">По возрастанию</option>
        <option value="desc">По убыванию</option>
      </select>

      <span className="mx-0.5 hidden h-4 w-px bg-border sm:block" />

      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="shrink-0">Приоритет</span>
        <select
          className={selectClass}
          value={view.priority}
          onChange={(e) => patch({ priority: e.target.value })}
        >
          <option value="all">Все</option>
          {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="shrink-0">Дедлайн</span>
        <select
          className={selectClass}
          value={view.deadline}
          onChange={(e) =>
            patch({ deadline: e.target.value as DeadlineFilter })
          }
        >
          <option value="all">Все</option>
          <option value="with">С дедлайном</option>
          <option value="without">Без дедлайна</option>
          <option value="overdue">Просроченные</option>
          <option value="week">На этой неделе</option>
        </select>
      </label>

      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="shrink-0">В статусе</span>
        <select
          className={selectClass}
          value={view.statusTime}
          onChange={(e) =>
            patch({ statusTime: e.target.value as StatusTimeFilter })
          }
        >
          <option value="all">Все</option>
          <option value="1d">Дольше 1 дня</option>
          <option value="3d">Дольше 3 дней</option>
          <option value="7d">Дольше 7 дней</option>
          <option value="30d">Дольше 30 дней</option>
        </select>
      </label>

      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="shrink-0">Исполнитель</span>
        <select
          className={cn(selectClass, 'max-w-[10rem]')}
          value={view.assignee}
          onChange={(e) => patch({ assignee: e.target.value })}
        >
          <option value="all">Все</option>
          <option value="none">Без исполнителя</option>
          {users.map((u) => (
            <option key={u.id} value={String(u.id)}>
              {displayName(u)}
            </option>
          ))}
        </select>
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
