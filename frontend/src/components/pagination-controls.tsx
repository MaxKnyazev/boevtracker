import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AppSelect } from '@/components/ui/select';
import {
  PAGE_SIZE_OPTIONS,
  type PaginatedResult,
} from '@/lib/pagination';
import { cn } from '@/lib/utils';

type PaginationControlsProps<T> = {
  result: PaginatedResult<T>;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  className?: string;
};

export function PaginationControls<T>({
  result,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  className,
}: PaginationControlsProps<T>) {
  if (result.total === 0) return null;

  const pageSizeOptions = PAGE_SIZE_OPTIONS.map((size) => ({
    value: String(size),
    label: String(size),
  }));

  return (
    <div
      className={cn(
        'mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground',
        className,
      )}
    >
      <span>
        Показано {result.from}–{result.to} из {result.total}
      </span>

      <div className="flex flex-wrap items-center gap-2">
        <span className="hidden sm:inline">На странице</span>
        <AppSelect
          value={String(pageSize)}
          onValueChange={(value) => onPageSizeChange(Number(value))}
          options={pageSizeOptions}
          className="h-8 w-[4.5rem] text-xs"
          title="Записей на странице"
        />

        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8"
            disabled={page <= 1}
            title="Предыдущая страница"
            onClick={() => onPageChange(page - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[5rem] text-center tabular-nums">
            {page} / {result.totalPages}
          </span>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8"
            disabled={page >= result.totalPages}
            title="Следующая страница"
            onClick={() => onPageChange(page + 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
