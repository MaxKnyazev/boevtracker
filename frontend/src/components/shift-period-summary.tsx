import { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { format, parseISO, startOfDay, startOfMonth } from 'date-fns';
import { ru } from 'date-fns/locale';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { AppSelect } from '@/components/ui/select';
import { UserAvatar, displayName } from '@/components/user-avatar';
import { UserPreviewDialog } from '@/components/user-preview-dialog';
import { ShiftStatsDialog } from '@/components/shift-stats-dialog';
import { EmptyState } from '@/components/layout';
import type { PublicUser, WorkShift, WorkShiftStatus } from '@/lib/api';
import { cn, formatDateTime, formatSeconds } from '@/lib/utils';
import {
  applyCalendarMonthClick,
  applyCalendarRangeClick,
  applySummaryPeriodKind,
  buildPeriodSummary,
  defaultSummaryPeriod,
  periodBoundsForKind,
  resolveSummaryRange,
  shiftSummaryPeriod,
  type SummaryPeriodKind,
  type SummaryPeriodState,
  type UserShiftSummary,
} from '@/lib/shift-summary';
import { shiftTotals } from '@/lib/shift-view';

const PERIOD_KIND_OPTIONS: { value: SummaryPeriodKind; label: string }[] = [
  { value: 'day', label: 'День' },
  { value: 'week', label: 'Неделя' },
  { value: 'month', label: 'Месяц' },
  { value: 'custom', label: 'Произвольный' },
];

const STATUS_LABELS: Record<WorkShiftStatus, string> = {
  active: 'Активна',
  paused: 'Пауза',
  completed: 'Завершена',
};

const STATUS_CLASS: Record<WorkShiftStatus, string> = {
  active: 'border-emerald-500/40 text-emerald-700 dark:text-emerald-300',
  paused: 'border-amber-500/40 text-amber-700 dark:text-amber-300',
  completed: 'border-slate-500/40 text-slate-600 dark:text-slate-300',
};

function DateField({
  label,
  value,
  onChange,
  max,
  min,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  max?: Date;
  min?: Date;
}) {
  const selected = useMemo(() => {
    const d = parseISO(value);
    return Number.isNaN(d.getTime()) ? undefined : d;
  }, [value]);

  return (
    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className="shrink-0">{label}</span>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="h-9 w-[9.5rem] justify-start px-2.5 text-xs font-normal text-foreground"
          >
            {selected ? format(selected, 'dd.MM.yyyy') : 'Дата'}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={selected}
            onSelect={(day) => {
              if (!day) return;
              onChange(format(day, 'yyyy-MM-dd'));
            }}
            disabled={(day) => {
              if (min && !Number.isNaN(min.getTime()) && day < startOfDay(min)) {
                return true;
              }
              if (max && !Number.isNaN(max.getTime()) && day > startOfDay(max)) {
                return true;
              }
              return false;
            }}
          />
        </PopoverContent>
      </Popover>
    </label>
  );
}

export function ShiftPeriodSummary({
  shifts,
  users,
  selectedUser,
  selectedUserKey,
  showUserFilter = true,
}: {
  shifts: WorkShift[];
  users: PublicUser[];
  selectedUser?: string;
  selectedUserKey?: number;
  showUserFilter?: boolean;
}) {
  const [period, setPeriod] = useState<SummaryPeriodState>(() => ({
    ...defaultSummaryPeriod(),
    ...(selectedUser && selectedUser !== 'all' ? { user: selectedUser } : {}),
  }));
  const [rangeStart, setRangeStart] = useState<Date | null>(null);
  const [previewUser, setPreviewUser] = useState<PublicUser | null>(null);
  const [expandedUserIds, setExpandedUserIds] = useState<Set<number>>(
    () => new Set(),
  );
  const [selectedShift, setSelectedShift] = useState<WorkShift | null>(null);

  useEffect(() => {
    if (!selectedUser || selectedUser === 'all') return;
    setPeriod((current) =>
      current.user === selectedUser ? current : { ...current, user: selectedUser },
    );
  }, [selectedUser, selectedUserKey]);

  useEffect(() => {
    if (showUserFilter) return;
    setPeriod((current) =>
      current.user === 'all' ? current : { ...current, user: 'all' },
    );
  }, [showUserFilter]);

  const range = useMemo(() => resolveSummaryRange(period), [period]);
  const selectedRange = useMemo(
    () => ({
      from: startOfDay(range.from),
      to: startOfDay(range.to),
    }),
    [range.from, range.to],
  );
  const [visibleMonth, setVisibleMonth] = useState(() =>
    startOfMonth(selectedRange.from),
  );

  useEffect(() => {
    const from = parseISO(period.customFrom);
    if (!Number.isNaN(from.getTime())) {
      setVisibleMonth(startOfMonth(from));
    }
  }, [period.customFrom]);

  const summary = useMemo(
    () =>
      buildPeriodSummary(
        shifts,
        range,
        period.user,
        Date.now(),
        period.completedOnly,
      ),
    [shifts, range, period.user, period.completedOnly],
  );

  const chartData = useMemo(
    () =>
      summary.byUser.map((row) => {
        const regular = Math.max(0, row.withoutBreaks - row.overtimeSeconds);
        return {
          id: row.user.id,
          name: displayName(row.user),
          regularSeconds: regular,
          overtimeSeconds: row.overtimeSeconds,
          pauseSeconds: row.pauseSeconds,
        };
      }),
    [summary.byUser],
  );

  const shiftsByUser = useMemo(() => {
    const map = new Map<number, WorkShift[]>();
    for (const shift of summary.shifts) {
      const list = map.get(shift.userId) ?? [];
      list.push(shift);
      map.set(shift.userId, list);
    }
    for (const list of map.values()) {
      list.sort(
        (a, b) =>
          new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
      );
    }
    return map;
  }, [summary.shifts]);

  const toggleUserShifts = (userId: number) => {
    setExpandedUserIds((current) => {
      const next = new Set(current);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const patch = (partial: Partial<SummaryPeriodState>) => {
    setPeriod((prev) => ({ ...prev, ...partial }));
  };

  const patchKind = (kind: SummaryPeriodKind) => {
    setPeriod((current) => applySummaryPeriodKind(current, kind));
    setRangeStart(null);
  };

  const shift = (direction: -1 | 1) => {
    setPeriod((current) => shiftSummaryPeriod(current, direction));
    setRangeStart(null);
  };

  const jumpToday = () => {
    const now = new Date();
    setPeriod((current) => ({
      ...current,
      kind: current.kind,
      user: current.user,
      ...periodBoundsForKind(current.kind, now),
    }));
    setRangeStart(null);
  };

  const handleDayClick = (day: Date) => {
    const next = applyCalendarRangeClick(period, day, rangeStart);
    setPeriod(next.state);
    setRangeStart(next.startDay);
  };

  const handleMonthCaptionClick = (month: Date) => {
    setPeriod((current) => applyCalendarMonthClick(current, month));
    setRangeStart(null);
    setVisibleMonth(startOfMonth(month));
  };

  const handleMonthChange = (month: Date) => {
    setVisibleMonth(startOfMonth(month));
  };

  const openUserFromChartBar = (data: { payload?: { id?: number } }) => {
    const id = Number(data?.payload?.id);
    if (!Number.isFinite(id)) return;
    const row = summary.byUser.find((item) => item.user.id === id);
    if (row) setPreviewUser(row.user);
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2 rounded-lg border border-border/60 bg-card/60 px-2.5 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="shrink-0">Период</span>
            <AppSelect
              value={period.kind}
              onValueChange={(v) => patchKind(v as SummaryPeriodKind)}
              options={PERIOD_KIND_OPTIONS}
              className="w-[11rem] text-xs"
            />
          </label>

          {period.kind !== 'custom' ? (
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-9 w-9 px-0"
                title="Предыдущий период"
                onClick={() => shift(-1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="min-w-[10rem] text-center text-sm font-medium">
                {range.label}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-9 w-9 px-0"
                title="Следующий период"
                onClick={() => shift(1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 text-xs"
                onClick={jumpToday}
              >
                Сегодня
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <DateField
                label="С"
                value={period.customFrom}
                onChange={(customFrom) => {
                  patch({ customFrom });
                  setRangeStart(null);
                }}
                max={parseISO(period.customTo)}
              />
              <DateField
                label="По"
                value={period.customTo}
                onChange={(customTo) => {
                  patch({ customTo });
                  setRangeStart(null);
                }}
                min={parseISO(period.customFrom)}
              />
            </div>
          )}

          {showUserFilter ? (
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="shrink-0">Сотрудник</span>
              <AppSelect
                value={period.user}
                onValueChange={(v) => patch({ user: v })}
                options={[
                  { value: 'all', label: 'Все' },
                  ...users.map((u) => ({
                    value: String(u.id),
                    label: displayName(u),
                    leading: <UserAvatar user={u} size="sm" />,
                  })),
                ]}
                className="w-[13rem] text-xs"
              />
            </label>
          ) : null}

          <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              className="h-4 w-4 cursor-pointer rounded border-border accent-primary"
              checked={period.completedOnly}
              onChange={(e) => patch({ completedOnly: e.target.checked })}
            />
            <span>Только закрытые смены</span>
          </label>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[auto_minmax(0,1fr)] lg:items-stretch">
        <div className="flex h-full flex-col rounded-xl border border-border px-3 py-3">
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Календарь периода
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-x-auto">
            <Calendar
              mode="range"
              required
              selected={selectedRange}
              month={visibleMonth}
              onMonthChange={handleMonthChange}
              onMonthCaptionClick={handleMonthCaptionClick}
              numberOfMonths={1}
              weekStartsOn={1}
              onSelect={() => {}}
              onDayClick={handleDayClick}
            />
          </div>
        </div>

        <div className="flex h-full min-h-0 flex-col rounded-xl border border-border px-3 py-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Время по сотрудникам
            </div>
            <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="h-2 w-2.5 rounded-sm"
                  style={{ backgroundColor: '#0d9488' }}
                />
                Без перерывов
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="h-2 w-2.5 rounded-sm"
                  style={{ backgroundColor: '#d97706' }}
                />
                Перерывы
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="h-2 w-2.5 rounded-sm"
                  style={{ backgroundColor: '#dc2626' }}
                />
                Переработки
              </span>
            </div>
          </div>
          {summary.shiftCount === 0 ? (
            <div className="flex min-h-64 flex-1 items-center justify-center text-sm text-muted-foreground">
              Нет смен за период
            </div>
          ) : (
            <div className="min-h-64 flex-1 [&_.recharts-wrapper]:h-full [&_.recharts-wrapper]:outline-none [&_.recharts-surface]:outline-none [&_svg]:outline-none [&_path]:outline-none [&_*:focus]:outline-none [&_*:focus-visible]:outline-none">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  layout="vertical"
                  margin={{ top: 4, right: 12, left: 4, bottom: 4 }}
                  accessibilityLayer={false}
                  style={{ outline: 'none' }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis
                    type="number"
                    tickFormatter={(v) => `${Math.round(Number(v) / 3600)} ч`}
                    fontSize={11}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={100}
                    fontSize={11}
                    tickLine={false}
                  />
                  <Tooltip
                    shared={false}
                    cursor={false}
                    content={<ChartSegmentTooltip />}
                  />
                  <Bar
                    dataKey="regularSeconds"
                    name="Без перерывов"
                    stackId="time"
                    fill="#0d9488"
                    maxBarSize={28}
                    cursor="pointer"
                    activeBar={{ fill: '#2dd4bf', stroke: 'none' }}
                    onClick={(data) => openUserFromChartBar(data)}
                  />
                  <Bar
                    dataKey="pauseSeconds"
                    name="Перерывы"
                    stackId="time"
                    fill="#d97706"
                    maxBarSize={28}
                    cursor="pointer"
                    activeBar={{ fill: '#fbbf24', stroke: 'none' }}
                    onClick={(data) => openUserFromChartBar(data)}
                  />
                  <Bar
                    dataKey="overtimeSeconds"
                    name="Переработки"
                    stackId="time"
                    fill="#dc2626"
                    radius={[0, 4, 4, 0]}
                    maxBarSize={28}
                    cursor="pointer"
                    activeBar={{ fill: '#f87171', stroke: 'none' }}
                    onClick={(data) => openUserFromChartBar(data)}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {summary.shiftCount === 0 ? (
        <EmptyState
          title="Нет смен за период"
          description="Выберите другой период или сотрудника"
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[560px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
                <th className="px-3 py-2.5 font-medium">Сотрудник</th>
                <th className="px-3 py-2.5 font-medium">Смен</th>
                <th className="px-3 py-2.5 font-medium">Общее время</th>
                <th className="px-3 py-2.5 font-medium">Без перерывов</th>
                <th className="px-3 py-2.5 font-medium">Перерывы</th>
                <th className="px-3 py-2.5 font-medium">Переработки</th>
                <th className="w-12 px-2 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {summary.byUser.map((row) => {
                const expanded = expandedUserIds.has(row.user.id);
                const userShifts = shiftsByUser.get(row.user.id) ?? [];
                return (
                  <UserSummaryRows
                    key={row.user.id}
                    row={row}
                    expanded={expanded}
                    shifts={userShifts}
                    onPreviewUser={() => setPreviewUser(row.user)}
                    onToggleShifts={() => toggleUserShifts(row.user.id)}
                    onOpenShift={setSelectedShift}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <UserPreviewDialog
        user={previewUser}
        onClose={() => setPreviewUser(null)}
      />
      <ShiftStatsDialog
        open={selectedShift != null}
        shift={selectedShift}
        onClose={() => setSelectedShift(null)}
      />
    </div>
  );
}

function UserSummaryRows({
  row,
  expanded,
  shifts,
  onPreviewUser,
  onToggleShifts,
  onOpenShift,
}: {
  row: UserShiftSummary;
  expanded: boolean;
  shifts: WorkShift[];
  onPreviewUser: () => void;
  onToggleShifts: () => void;
  onOpenShift: (shift: WorkShift) => void;
}) {
  return (
    <>
      <tr
        className="cursor-pointer border-b border-border/70 hover:bg-accent/40"
        onClick={onToggleShifts}
      >
        <td className="px-3 py-2.5">
          <button
            type="button"
            className="flex max-w-full items-center gap-2 rounded-md text-left outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring"
            onClick={(event) => {
              event.stopPropagation();
              onPreviewUser();
            }}
          >
            <UserAvatar user={row.user} size="sm" />
            <span className="truncate">{displayName(row.user)}</span>
          </button>
        </td>
        <td className="px-3 py-2.5 tabular-nums">{row.shiftCount}</td>
        <td className="px-3 py-2.5 tabular-nums font-medium">
          {formatSeconds(row.withBreaks)}
        </td>
        <td className="px-3 py-2.5 tabular-nums font-medium">
          {formatSeconds(row.withoutBreaks)}
        </td>
        <td className="px-3 py-2.5 tabular-nums text-muted-foreground">
          {formatSeconds(row.pauseSeconds, { withSeconds: true })}
        </td>
        <td className="px-3 py-2.5 tabular-nums font-medium">
          {formatSeconds(row.overtimeSeconds)}
        </td>
        <td className="px-2 py-2.5 text-right">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-8 px-0"
            title={expanded ? 'Скрыть смены' : 'Показать смены'}
            aria-expanded={expanded}
            aria-label={expanded ? 'Скрыть смены' : 'Показать смены'}
            onClick={(event) => {
              event.stopPropagation();
              onToggleShifts();
            }}
          >
            <ChevronDown
              className={cn(
                'h-4 w-4 transition-transform',
                expanded && 'rotate-180',
              )}
            />
          </Button>
        </td>
      </tr>
      {expanded ? (
        <tr className="border-b border-border/70 last:border-0">
          <td colSpan={7} className="bg-muted/20 px-3 py-2">
            {shifts.length === 0 ? (
              <div className="px-2 py-1.5 text-xs text-muted-foreground">
                Нет смен
              </div>
            ) : (
              <div className="space-y-1">
                {shifts.map((shift) => {
                  const totals = shiftTotals(shift);
                  return (
                    <button
                      key={shift.id}
                      type="button"
                      className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 rounded-lg px-2 py-2 text-left text-xs transition-colors hover:bg-accent/60"
                      onClick={() => onOpenShift(shift)}
                    >
                      <span className="min-w-[9.5rem] tabular-nums text-muted-foreground">
                        {formatDateTime(shift.startedAt)}
                      </span>
                      <span className="min-w-[9.5rem] tabular-nums text-muted-foreground">
                        {formatDateTime(shift.endedAt)}
                      </span>
                      <Badge className={cn(STATUS_CLASS[shift.status])}>
                        {STATUS_LABELS[shift.status]}
                      </Badge>
                      <span className="tabular-nums font-medium">
                        {formatSeconds(totals.withBreaks)}
                      </span>
                      <span className="tabular-nums text-muted-foreground">
                        без перерывов {formatSeconds(totals.withoutBreaks)}
                      </span>
                      {shift.comment?.trim() ? (
                        <span
                          className="max-w-[16rem] truncate text-muted-foreground"
                          title={shift.comment}
                        >
                          {shift.comment}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            )}
          </td>
        </tr>
      ) : null}
    </>
  );
}

function ChartSegmentTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; color?: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  const n = typeof item.value === 'number' ? item.value : Number(item.value);
  return (
    <div className="rounded-lg border border-border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md">
      <div className="font-medium">{label}</div>
      <div className="mt-0.5" style={{ color: item.color }}>
        {item.name}: {formatSeconds(Number.isFinite(n) ? n : 0)}
      </div>
    </div>
  );
}
