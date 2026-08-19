import { useEffect, useState } from 'react';
import { DEFAULT_PAGE_SIZE } from '@/lib/pagination';

export function usePagination(resetDeps: unknown[] = []) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  useEffect(() => {
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset when filters / sort change
  }, [...resetDeps, pageSize]);

  return { page, setPage, pageSize, setPageSize };
}
