import { useMemo } from 'react';
import { format, parseISO, startOfDay } from 'date-fns';
import { CalendarDays, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export function DeadlinePicker({
  value,
  disabled,
  onChange,
  className,
  triggerClassName,
  size = 'md',
}: {
  value?: string | null;
  disabled?: boolean;
  onChange: (next: string | null) => void;
  className?: string;
  triggerClassName?: string;
  size?: 'sm' | 'md';
}) {
  const today = startOfDay(new Date());

  const selected = useMemo(() => {
    if (!value) return undefined;
    const raw = value.length >= 10 ? value.slice(0, 10) : value;
    const d = parseISO(raw);
    return Number.isNaN(d.getTime()) ? undefined : d;
  }, [value]);

  const defaultMonth =
    selected && selected >= today ? selected : today;

  const compact = size === 'sm';

  return (
    <div className={cn('flex gap-1.5', className)}>
      <Popover modal={false}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            className={cn(
              'min-w-0 flex-1 justify-start gap-2 font-normal',
              compact ? 'h-9 px-2.5 text-xs' : 'h-10 px-3 text-sm',
              !selected && 'text-muted-foreground',
              triggerClassName,
            )}
          >
            <CalendarDays
              className={cn(
                'shrink-0 opacity-70',
                compact ? 'h-3.5 w-3.5' : 'h-4 w-4',
              )}
            />
            <span className="truncate">
              {selected ? format(selected, 'dd.MM.yyyy') : 'Выберите дату'}
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-auto overflow-hidden p-0"
          align="start"
          onOpenAutoFocus={(e) => e.preventDefault()}
          onWheel={(e) => e.stopPropagation()}
        >
          <div className="border-b border-border px-3 py-2">
            <div className="text-sm font-medium">Дедлайн</div>
            <div className="text-[11px] text-muted-foreground">
              Только сегодня или будущая дата
            </div>
          </div>
          <Calendar
            mode="single"
            selected={selected}
            defaultMonth={defaultMonth}
            disabled={{ before: today }}
            onSelect={(day) => {
              if (!day) return;
              if (day < today) return;
              onChange(format(day, 'yyyy-MM-dd'));
            }}
            className="p-3"
          />
        </PopoverContent>
      </Popover>
      {value ? (
        <Button
          type="button"
          variant="outline"
          size="icon"
          className={cn('shrink-0', compact ? 'h-9 w-9' : 'h-10 w-10')}
          disabled={disabled}
          title="Очистить дедлайн"
          onClick={() => onChange(null)}
        >
          <X className={cn(compact ? 'h-3.5 w-3.5' : 'h-4 w-4')} />
        </Button>
      ) : null}
    </div>
  );
}
