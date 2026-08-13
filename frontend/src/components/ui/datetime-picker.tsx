import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, Clock3 } from 'lucide-react';
import { format, isSameDay, startOfDay } from 'date-fns';
import { ru } from 'date-fns/locale';
import type { Matcher } from 'react-day-picker';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function combineDateAndTime(day: Date, hours: number, minutes: number): Date {
  const next = new Date(day);
  next.setHours(hours, minutes, 0, 0);
  return next;
}

function clampDate(value: Date, min?: Date, max?: Date): Date {
  let next = value;
  if (min && next.getTime() < min.getTime()) next = new Date(min);
  if (max && next.getTime() > max.getTime()) next = new Date(max);
  return next;
}

function isHourAllowed(
  day: Date,
  hour: number,
  min?: Date,
  max?: Date,
): boolean {
  for (let minute = 0; minute < 60; minute++) {
    const candidate = combineDateAndTime(day, hour, minute);
    if ((!min || candidate >= min) && (!max || candidate <= max)) return true;
  }
  return false;
}

function isMinuteAllowed(
  day: Date,
  hour: number,
  minute: number,
  min?: Date,
  max?: Date,
): boolean {
  const candidate = combineDateAndTime(day, hour, minute);
  return (!min || candidate >= min) && (!max || candidate <= max);
}

function TimeColumn({
  label,
  values,
  value,
  disabledValues,
  onChange,
  scrollToken,
}: {
  label: string;
  values: number[];
  value: number;
  disabledValues: Set<number>;
  onChange: (value: number) => void;
  /** Increments when the popover opens so we jump to the current value. */
  scrollToken: number;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;

    const frame = window.requestAnimationFrame(() => {
      const selected = list.querySelector<HTMLElement>('[data-selected="true"]');
      if (!selected) return;
      const listRect = list.getBoundingClientRect();
      const itemRect = selected.getBoundingClientRect();
      const top =
        itemRect.top -
        listRect.top -
        listRect.height / 2 +
        itemRect.height / 2 +
        list.scrollTop;
      list.scrollTo({ top: Math.max(0, top), behavior: 'auto' });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [value, scrollToken]);

  // Dialog's remove-scroll blocks native wheel on portaled popovers —
  // apply scroll manually so mouse wheel works.
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      list.scrollTop += event.deltaY;
    };

    list.addEventListener('wheel', onWheel, { passive: false });
    return () => list.removeEventListener('wheel', onWheel);
  }, []);

  return (
    <div className="flex h-full min-h-0 w-[4.5rem] flex-col">
      <div className="shrink-0 px-2 pb-1.5 text-center text-[11px] font-medium text-muted-foreground">
        {label}
      </div>
      <div
        ref={listRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-lg border border-border/70 bg-background/60 p-1"
        data-scroll-lock-scrollable=""
      >
        {values.map((item) => {
          const disabled = disabledValues.has(item);
          const selected = item === value;
          return (
            <button
              key={item}
              type="button"
              disabled={disabled}
              data-selected={selected ? 'true' : undefined}
              onClick={() => onChange(item)}
              className={cn(
                'flex h-8 w-full items-center justify-center rounded-md text-sm tabular-nums transition-colors',
                selected
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-accent',
                disabled &&
                  'cursor-not-allowed text-muted-foreground/40 hover:bg-transparent',
              )}
            >
              {pad2(item)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function DateTimePicker({
  value,
  onChange,
  min,
  max,
  disabled,
  className,
}: {
  value: Date | null;
  onChange: (next: Date) => void;
  min?: Date;
  max?: Date;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [scrollToken, setScrollToken] = useState(0);
  const [timePanelHeight, setTimePanelHeight] = useState<number | null>(null);
  const calendarRef = useRef<HTMLDivElement>(null);
  const selected = value ?? max ?? min ?? new Date();

  useLayoutEffect(() => {
    if (!open) return;
    const node = calendarRef.current;
    if (!node) return;

    const syncHeight = () => {
      const next = Math.round(node.getBoundingClientRect().height);
      if (next > 0) setTimePanelHeight(next);
    };

    syncHeight();
    const frame = window.requestAnimationFrame(syncHeight);
    const observer = new ResizeObserver(syncHeight);
    observer.observe(node);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [open, scrollToken]);

  const hours = useMemo(() => Array.from({ length: 24 }, (_, i) => i), []);
  const minutes = useMemo(() => Array.from({ length: 60 }, (_, i) => i), []);

  const disabledHours = useMemo(() => {
    const set = new Set<number>();
    for (const hour of hours) {
      if (!isHourAllowed(selected, hour, min, max)) set.add(hour);
    }
    return set;
  }, [hours, selected, min, max]);

  const disabledMinutes = useMemo(() => {
    const set = new Set<number>();
    for (const minute of minutes) {
      if (!isMinuteAllowed(selected, selected.getHours(), minute, min, max)) {
        set.add(minute);
      }
    }
    return set;
  }, [minutes, selected, min, max]);

  const disabledDays = useMemo(() => {
    const matchers: Matcher[] = [];
    if (min) matchers.push({ before: startOfDay(min) });
    if (max) matchers.push({ after: startOfDay(max) });
    return matchers;
  }, [min, max]);

  const setDay = (day?: Date) => {
    if (!day) return;
    const next = clampDate(
      combineDateAndTime(day, selected.getHours(), selected.getMinutes()),
      min,
      max,
    );
    onChange(next);
  };

  const setHour = (hour: number) => {
    let minute = selected.getMinutes();
    if (!isMinuteAllowed(selected, hour, minute, min, max)) {
      const first = minutes.find((m) =>
        isMinuteAllowed(selected, hour, m, min, max),
      );
      if (first == null) return;
      minute = first;
    }
    onChange(clampDate(combineDateAndTime(selected, hour, minute), min, max));
  };

  const setMinute = (minute: number) => {
    if (!isMinuteAllowed(selected, selected.getHours(), minute, min, max)) {
      return;
    }
    onChange(
      clampDate(
        combineDateAndTime(selected, selected.getHours(), minute),
        min,
        max,
      ),
    );
  };

  return (
    <Popover
      modal={false}
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setScrollToken((n) => n + 1);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            'flex h-10 w-full items-center gap-2 rounded-lg border border-input bg-background px-3 text-left text-sm shadow-sm transition-colors',
            'hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            'disabled:cursor-not-allowed disabled:opacity-50',
            className,
          )}
        >
          <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate tabular-nums">
            {value
              ? format(value, 'd MMM yyyy, HH:mm', { locale: ru })
              : 'Выберите дату и время'}
          </span>
          <Clock3 className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto overflow-hidden rounded-xl p-0"
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onWheel={(e) => e.stopPropagation()}
        data-scroll-lock-scrollable=""
      >
        <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-start">
          <div ref={calendarRef} className="shrink-0">
            <Calendar
              mode="single"
              selected={selected}
              onSelect={setDay}
              disabled={disabledDays}
              defaultMonth={selected}
              modifiers={{
                rangeEdge: (day) =>
                  (!!min && isSameDay(day, min)) ||
                  (!!max && isSameDay(day, max)),
              }}
              modifiersClassNames={{
                rangeEdge: '[&>button]:ring-1 [&>button]:ring-primary/40',
              }}
            />
          </div>
          <div
            className="flex gap-2 border-t border-border pt-3 sm:border-l sm:border-t-0 sm:pl-3 sm:pt-0"
            style={
              timePanelHeight
                ? { height: timePanelHeight }
                : { height: '17.5rem' }
            }
          >
            <TimeColumn
              label="Часы"
              values={hours}
              value={selected.getHours()}
              disabledValues={disabledHours}
              onChange={setHour}
              scrollToken={scrollToken}
            />
            <TimeColumn
              label="Минуты"
              values={minutes}
              value={selected.getMinutes()}
              disabledValues={disabledMinutes}
              onChange={setMinute}
              scrollToken={scrollToken}
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
