export const DEFAULT_PAGE_SIZE = 25;

export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

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
