import { useState } from 'react';
import { Check, Rocket } from 'lucide-react';
import type { Release, ReleaseStatus } from '@/lib/api';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn, formatDate } from '@/lib/utils';

const RELEASE_STATUS_LABELS: Record<ReleaseStatus, string> = {
  PLANNED: 'Запланирован',
  IN_PROGRESS: 'В работе',
  RELEASED: 'Выпущен',
  CANCELLED: 'Отменён',
};

export function ReleasePicker({
  value,
  releases,
  disabled,
  onChange,
  className,
  size = 'sm',
  emptyLabel = 'Не привязан',
}: {
  value?: number | null;
  releases: Release[];
  disabled?: boolean;
  onChange: (next: number | null) => void;
  className?: string;
  size?: 'sm' | 'md';
  emptyLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = releases.find((r) => r.id === value) ?? null;
  const compact = size === 'sm';

  return (
    <Popover modal={false} open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            'flex w-full min-w-0 cursor-pointer items-center gap-2 rounded-md border border-input bg-background text-left outline-none transition-colors',
            'hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
            compact ? 'px-2 py-1.5 text-sm' : 'h-10 px-3 text-sm',
            className,
          )}
          title="Выбрать релиз"
        >
          <Rocket className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span
            className={cn(
              'min-w-0 flex-1 truncate',
              !selected && 'text-muted-foreground',
            )}
          >
            {selected?.name || emptyLabel}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-64 p-1"
        data-release-picker
        onOpenAutoFocus={(e) => e.preventDefault()}
        onWheel={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          disabled={disabled || value == null}
          className="flex w-full items-center rounded-sm px-2 py-1.5 text-left text-xs text-muted-foreground outline-none hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
          onClick={() => {
            setOpen(false);
            onChange(null);
          }}
        >
          Без релиза
        </button>
        {releases.length > 0 ? (
          <>
            <div className="my-1 h-px bg-border" />
            <div
              className="max-h-56 overflow-y-auto overscroll-contain py-0.5"
              onWheel={(e) => e.stopPropagation()}
            >
              {releases.map((release) => {
                const isSelected = value === release.id;
                return (
                  <button
                    key={release.id}
                    type="button"
                    disabled={disabled}
                    className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left outline-none hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
                    onClick={() => {
                      setOpen(false);
                      onChange(release.id);
                    }}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm">{release.name}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {RELEASE_STATUS_LABELS[release.status]}
                        {release.targetDate
                          ? ` · ${formatDate(release.targetDate)}`
                          : ''}
                      </div>
                    </div>
                    {isSelected ? (
                      <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
                    ) : null}
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <p className="px-2 py-2 text-xs text-muted-foreground">
            Релизов пока нет
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
