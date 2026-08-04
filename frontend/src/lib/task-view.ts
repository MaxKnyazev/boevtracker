import type { Task, User } from '@/lib/api';
import { displayName } from '@/components/user-avatar';

export type TaskSortField =
  | 'order'
  | 'priority'
  | 'deadline'
  | 'statusTime'
  | 'assignee';

export type TaskSortDir = 'asc' | 'desc';

export type DeadlineFilter =
  | 'all'
  | 'with'
  | 'without'
  | 'overdue'
  | 'week';

export type StatusTimeFilter = 'all' | '1d' | '3d' | '7d' | '30d';

export type TaskViewState = {
  sortField: TaskSortField;
  sortDir: TaskSortDir;
  priority: string; // 'all' | Priority
  deadline: DeadlineFilter;
  statusTime: StatusTimeFilter;
  /** 'all' | 'none' | user id as string */
  assignee: string;
};

export const DEFAULT_TASK_VIEW: TaskViewState = {
  sortField: 'order',
  sortDir: 'asc',
  priority: 'all',
  deadline: 'all',
  statusTime: 'all',
  assignee: 'all',
};

const PRIORITY_RANK: Record<string, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

const DAY_MS = 86_400_000;

export function hasActiveTaskView(view: TaskViewState): boolean {
  return (
    view.sortField !== 'order' ||
    view.priority !== 'all' ||
    view.deadline !== 'all' ||
    view.statusTime !== 'all' ||
    view.assignee !== 'all' ||
    (view.sortField === 'order' && view.sortDir !== 'asc')
  );
}

function matchesDeadline(task: Task, filter: DeadlineFilter): boolean {
  if (filter === 'all') return true;
  const has = !!task.deadline;
  if (filter === 'with') return has;
  if (filter === 'without') return !has;
  if (!task.deadline) return false;
  const due = new Date(task.deadline).getTime();
  const now = Date.now();
  if (filter === 'overdue') return due < now;
  if (filter === 'week') {
    return due >= now && due <= now + 7 * DAY_MS;
  }
  return true;
}

function matchesStatusTime(task: Task, filter: StatusTimeFilter): boolean {
  if (filter === 'all') return true;
  const age = Date.now() - new Date(task.statusChangedAt).getTime();
  const map: Record<Exclude<StatusTimeFilter, 'all'>, number> = {
    '1d': DAY_MS,
    '3d': 3 * DAY_MS,
    '7d': 7 * DAY_MS,
    '30d': 30 * DAY_MS,
  };
  return age >= map[filter];
}

function matchesAssignee(task: Task, filter: string): boolean {
  if (filter === 'all') return true;
  if (filter === 'none') return task.assigneeId == null;
  return String(task.assigneeId) === filter;
}

export function filterTasks(tasks: Task[], view: TaskViewState): Task[] {
  return tasks.filter((task) => {
    if (view.priority !== 'all' && task.priority !== view.priority) return false;
    if (!matchesDeadline(task, view.deadline)) return false;
    if (!matchesStatusTime(task, view.statusTime)) return false;
    if (!matchesAssignee(task, view.assignee)) return false;
    return true;
  });
}

function compareNullableNumber(
  a: number | null,
  b: number | null,
  dir: TaskSortDir,
): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return dir === 'asc' ? a - b : b - a;
}

export function sortTasks(tasks: Task[], view: TaskViewState): Task[] {
  const { sortField, sortDir } = view;
  if (sortField === 'order') {
    return [...tasks].sort((a, b) => {
      const byOrder = (a.order ?? 0) - (b.order ?? 0) || a.id - b.id;
      return sortDir === 'asc' ? byOrder : -byOrder;
    });
  }

  return [...tasks].sort((a, b) => {
    let cmp = 0;
    switch (sortField) {
      case 'priority': {
        const pa = PRIORITY_RANK[a.priority] ?? 99;
        const pb = PRIORITY_RANK[b.priority] ?? 99;
        cmp = sortDir === 'asc' ? pa - pb : pb - pa;
        break;
      }
      case 'deadline': {
        const da = a.deadline ? new Date(a.deadline).getTime() : null;
        const db = b.deadline ? new Date(b.deadline).getTime() : null;
        cmp = compareNullableNumber(da, db, sortDir);
        break;
      }
      case 'statusTime': {
        const sa = new Date(a.statusChangedAt).getTime();
        const sb = new Date(b.statusChangedAt).getTime();
        // asc = shorter in status first (more recent statusChangedAt)
        cmp = sortDir === 'asc' ? sb - sa : sa - sb;
        break;
      }
      case 'assignee': {
        const na = a.assignee ? displayName(a.assignee) : '';
        const nb = b.assignee ? displayName(b.assignee) : '';
        if (!na && !nb) cmp = 0;
        else if (!na) cmp = 1;
        else if (!nb) cmp = -1;
        else {
          cmp = na.localeCompare(nb, 'ru');
          if (sortDir === 'desc') cmp = -cmp;
        }
        break;
      }
      default:
        cmp = 0;
    }
    return cmp || a.id - b.id;
  });
}

export function applyTaskView(tasks: Task[], view: TaskViewState): Task[] {
  return sortTasks(filterTasks(tasks, view), view);
}

export type TaskViewUser = Pick<
  User,
  'id' | 'firstName' | 'lastName' | 'username'
>;
