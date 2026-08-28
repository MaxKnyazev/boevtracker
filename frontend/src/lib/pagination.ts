export const DEFAULT_PAGE_SIZE = 25;

export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

export const PAGINATION_PAGE_SIZE_KEYS = {
  tasks: 'boevtracker.pagination.pageSize.tasks',
  backlogTasks: 'boevtracker.pagination.pageSize.backlogTasks',
  timeTracking: 'boevtracker.pagination.pageSize.timeTracking',
  notifications: 'boevtracker.pagination.pageSize.notifications',
  usersPending: 'boevtracker.pagination.pageSize.usersPending',
  usersActive: 'boevtracker.pagination.pageSize.usersActive',
  releases: 'boevtracker.pagination.pageSize.releases',
} as const;

export type PaginatedResult<T> = {
  items: T[];
  total: number;
  totalPages: number;
  page: number;
  pageSize: number;
  from: number;
  to: number;
};

export function paginateList<T>(
  items: readonly T[],
  page: number,
  pageSize: number,
): PaginatedResult<T> {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  const end = Math.min(start + pageSize, total);

  return {
    items: items.slice(start, end),
    total,
    totalPages,
    page: safePage,
    pageSize,
    from: total === 0 ? 0 : start + 1,
    to: end,
  };
}

function isValidPageSize(value: number): value is (typeof PAGE_SIZE_OPTIONS)[number] {
  return PAGE_SIZE_OPTIONS.includes(value as (typeof PAGE_SIZE_OPTIONS)[number]);
}

export function readStoredPageSize(storageKey: string): number {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return DEFAULT_PAGE_SIZE;
    const value = Number(raw);
    if (!Number.isFinite(value) || !isValidPageSize(value)) {
      return DEFAULT_PAGE_SIZE;
    }
    return value;
  } catch {
    return DEFAULT_PAGE_SIZE;
  }
}

export function writeStoredPageSize(storageKey: string, pageSize: number): void {
  if (!isValidPageSize(pageSize)) return;
  try {
    localStorage.setItem(storageKey, String(pageSize));
  } catch {
    // ignore
  }
}
