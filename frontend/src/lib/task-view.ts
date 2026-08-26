import { useCallback, useEffect, useState } from 'react';
import {
  taskActiveAssignee,
  taskAssignees,
  type Task,
  type User,
} from '@/lib/api';
import { displayName } from '@/components/user-avatar';

export type TaskSortField =
  | 'order'
  | 'createdAt'
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

export type TaskViewState = {
  sortField: TaskSortField;
  sortDir: TaskSortDir;
  /** 'all' | board id as string */
  board: string;
  /** 'all' | project id as string */
  project: string;
  priority: string; // 'all' | Priority
  deadline: DeadlineFilter;
  /** 'all' | status name */
  status: string;
  /** 'all' | 'none' | user id as string */
  assignee: string;
};

export const DEFAULT_TASK_VIEW: TaskViewState = {
  sortField: 'createdAt',
  sortDir: 'desc',
  board: 'all',
  project: 'all',
  priority: 'all',
  deadline: 'all',
  status: 'all',
  assignee: 'all',
};

export const taskViewStorageKey = {
  tasks: 'boevtracker.taskView.tasks',
  board: (boardId: string | number) =>
    `boevtracker.taskView.board.${boardId}`,
  project: (projectId: string | number) =>
    `boevtracker.taskView.project.${projectId}`,
} as const;

const SORT_FIELDS: ReadonlySet<string> = new Set([
  'order',
  'createdAt',
  'title',
  'board',
  'project',
  'status',
  'priority',
  'deadline',
  'statusTime',
  'assignee',
]);
const SORT_DIRS: ReadonlySet<string> = new Set(['asc', 'desc']);
const DEADLINE_FILTERS: ReadonlySet<string> = new Set([
  'all',
  'with',
  'without',
  'overdue',
  'week',
]);

function parseTaskView(raw: unknown): TaskViewState | null {
  if (!raw || typeof raw !== 'object') return null;
  const v = raw as Record<string, unknown>;

  const sortField = SORT_FIELDS.has(String(v.sortField))
    ? (v.sortField as TaskSortField)
    : DEFAULT_TASK_VIEW.sortField;
  const sortDir = SORT_DIRS.has(String(v.sortDir))
    ? (v.sortDir as TaskSortDir)
    : DEFAULT_TASK_VIEW.sortDir;
  const deadline = DEADLINE_FILTERS.has(String(v.deadline))
    ? (v.deadline as DeadlineFilter)
    : DEFAULT_TASK_VIEW.deadline;

  const asIdOrAll = (value: unknown, allowNone = false): string => {
    if (value === 'all') return 'all';
    if (allowNone && value === 'none') return 'none';
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    if (typeof value === 'string' && /^\d+$/.test(value)) return value;
    if (
      typeof value === 'string' &&
      (value === 'LOW' ||
        value === 'MEDIUM' ||
        value === 'HIGH' ||
        value === 'CRITICAL')
    ) {
      return value;
    }
    return 'all';
  };

  const priority =
    v.priority === 'all' ||
    v.priority === 'LOW' ||
    v.priority === 'MEDIUM' ||
    v.priority === 'HIGH' ||
    v.priority === 'CRITICAL'
      ? String(v.priority)
      : DEFAULT_TASK_VIEW.priority;

  const status =
    typeof v.status === 'string' && v.status.trim() !== ''
      ? v.status.trim()
      : DEFAULT_TASK_VIEW.status;

  return {
    sortField,
    sortDir,
    board: asIdOrAll(v.board),
    project: asIdOrAll(v.project),
    priority,
    deadline,
    status,
    assignee: asIdOrAll(v.assignee, true),
  };
}

export function readTaskView(storageKey: string): TaskViewState {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return { ...DEFAULT_TASK_VIEW };
    const parsed = parseTaskView(JSON.parse(raw));
    return parsed ?? { ...DEFAULT_TASK_VIEW };
  } catch {
    return { ...DEFAULT_TASK_VIEW };
  }
}

export function writeTaskView(storageKey: string, view: TaskViewState): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify(view));
  } catch {
    // ignore quota / private mode
  }
}

export function usePersistedTaskView(
  storageKey: string,
): [
  TaskViewState,
  (
    next: TaskViewState | ((prev: TaskViewState) => TaskViewState),
  ) => void,
] {
  const [view, setViewState] = useState(() => readTaskView(storageKey));

  useEffect(() => {
    setViewState(readTaskView(storageKey));
  }, [storageKey]);

  const setView = useCallback(
    (next: TaskViewState | ((prev: TaskViewState) => TaskViewState)) => {
      setViewState((prev) => {
        const value = typeof next === 'function' ? next(prev) : next;
        writeTaskView(storageKey, value);
        return value;
      });
    },
    [storageKey],
  );

  return [view, setView];
}

const PRIORITY_RANK: Record<string, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

const DAY_MS = 86_400_000;

export function hasActiveTaskView(view: TaskViewState): boolean {
  return (
    view.sortField !== DEFAULT_TASK_VIEW.sortField ||
    view.sortDir !== DEFAULT_TASK_VIEW.sortDir ||
    view.board !== 'all' ||
    view.project !== 'all' ||
    view.priority !== 'all' ||
    view.deadline !== 'all' ||
    view.status !== 'all' ||
    view.assignee !== 'all'
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

function matchesStatus(task: Task, filter: string): boolean {
  if (filter === 'all') return true;
  return (task.status?.name || '') === filter;
}

function matchesAssignee(task: Task, filter: string): boolean {
  if (filter === 'all') return true;
  const assignees = taskAssignees(task);
  if (filter === 'none') return assignees.length === 0;
  return assignees.some((u) => String(u.id) === filter);
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
    if (!matchesStatus(task, view.status)) return false;
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
      case 'createdAt': {
        const ca = new Date(a.createdAt).getTime();
        const cb = new Date(b.createdAt).getTime();
        cmp = sortDir === 'asc' ? ca - cb : cb - ca;
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
        const na = taskActiveAssignee(a)
          ? displayName(taskActiveAssignee(a))
          : '';
        const nb = taskActiveAssignee(b)
          ? displayName(taskActiveAssignee(b))
          : '';
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
