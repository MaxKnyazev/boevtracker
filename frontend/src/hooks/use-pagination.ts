import { useCallback, useEffect, useState } from 'react';
import {
  readStoredPageSize,
  writeStoredPageSize,
} from '@/lib/pagination';

export function usePagination(storageKey: string, resetDeps: unknown[] = []) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState(() =>
    readStoredPageSize(storageKey),
  );

  const setPageSize = useCallback(
    (next: number) => {
      setPageSizeState(next);
      writeStoredPageSize(storageKey, next);
    },
    [storageKey],
  );

  useEffect(() => {
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset when filters / sort change
  }, [...resetDeps, pageSize]);

  return { page, setPage, pageSize, setPageSize };
}
