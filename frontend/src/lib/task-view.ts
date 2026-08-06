import type { Task, User } from '@/lib/api';
import { displayName } from '@/components/user-avatar';

export type TaskSortField =
  | 'order'
  | 'title'
  | 'board'
  | 'project'
  | 'status'
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
  /** 'all' | board id as string */
  board: string;
  /** 'all' | project id as string */
  project: string;
  priority: string; // 'all' | Priority
  deadline: DeadlineFilter;
  statusTime: StatusTimeFilter;
  /** 'all' | 'none' | user id as string */
  assignee: string;
};

export const DEFAULT_TASK_VIEW: TaskViewState = {
  sortField: 'order',
  sortDir: 'asc',
  board: 'all',
  project: 'all',
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
    view.board !== 'all' ||
    view.project !== 'all' ||
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
    if (
      view.board !== 'all' &&
      String(task.project?.boardId) !== view.board
    ) {
      return false;
    }
    if (view.project !== 'all' && String(task.projectId) !== view.project) {
      return false;
    }
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
      case 'title': {
        cmp = a.title.localeCompare(b.title, 'ru');
        if (sortDir === 'desc') cmp = -cmp;
        break;
      }
      case 'board': {
        const na = a.project?.board?.name ?? '';
        const nb = b.project?.board?.name ?? '';
        cmp = compareNullableString(na, nb, sortDir);
        break;
      }
      case 'project': {
        const na = a.project?.name ?? '';
        const nb = b.project?.name ?? '';
        cmp = compareNullableString(na, nb, sortDir);
        break;
      }
      case 'status': {
        const na = a.status?.name ?? '';
        const nb = b.status?.name ?? '';
        cmp = compareNullableString(na, nb, sortDir);
        break;
      }
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
        cmp = compareNullableString(na, nb, sortDir);
        break;
      }
      default:
        cmp = 0;
    }
    return cmp || a.id - b.id;
  });
}

function compareNullableString(
  a: string,
  b: string,
  dir: TaskSortDir,
): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  const cmp = a.localeCompare(b, 'ru');
  return dir === 'desc' ? -cmp : cmp;
}

export function applyTaskView(tasks: Task[], view: TaskViewState): Task[] {
  return sortTasks(filterTasks(tasks, view), view);
}

export type TaskViewUser = Pick<
  User,
  'id' | 'firstName' | 'lastName' | 'username' | 'avatarColor'
>;
