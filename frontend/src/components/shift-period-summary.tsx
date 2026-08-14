import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { format, parseISO, startOfDay } from 'date-fns';
import { ru } from 'date-fns/locale';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { AppSelect } from '@/components/ui/select';
import { UserAvatar, displayName } from '@/components/user-avatar';
import { EmptyState } from '@/components/layout';
import type { PublicUser, WorkShift } from '@/lib/api';
import { cn, formatSeconds } from '@/lib/utils';
import {
  buildPeriodSummary,
  defaultSummaryPeriod,
  resolveSummaryRange,
  shiftSummaryPeriod,
  type SummaryPeriodKind,
  type SummaryPeriodState,
} from '@/lib/shift-summary';

const PERIOD_KIND_OPTIONS: { value: SummaryPeriodKind; label: string }[] = [
  { value: 'day', label: 'День' },
  { value: 'week', label: 'Неделя' },
  { value: 'month', label: 'Месяц' },
  { value: 'custom', label: 'Произвольный' },
];

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
}: {
  shifts: WorkShift[];
  users: PublicUser[];
}) {
  const [period, setPeriod] = useState<SummaryPeriodState>(() =>
    defaultSummaryPeriod(),
  );

  const range = useMemo(() => resolveSummaryRange(period), [period]);
  const summary = useMemo(
    () => buildPeriodSummary(shifts, range, period.user),
    [shifts, range, period.user],
  );

  const chartData = useMemo(
    () =>
      summary.byUser.map((row) => ({
        id: row.user.id,
        name: displayName(row.user),
        hours: Math.round((row.withoutBreaks / 3600) * 10) / 10,
        seconds: row.withoutBreaks,
      })),
    [summary.byUser],
  );

  const patch = (partial: Partial<SummaryPeriodState>) => {
    setPeriod((prev) => ({ ...prev, ...partial }));
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2 rounded-lg border border-border/60 bg-card/60 px-2.5 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="shrink-0">Период</span>
            <AppSelect
              value={period.kind}
              onValueChange={(v) => patch({ kind: v as SummaryPeriodKind })}
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
                onClick={() => setPeriod((p) => shiftSummaryPeriod(p, -1))}
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
                onClick={() => setPeriod((p) => shiftSummaryPeriod(p, 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 text-xs"
                onClick={() =>
                  setPeriod((p) => ({
                    ...p,
                    ...defaultSummaryPeriod(),
                    kind: p.kind,
                    user: p.user,
                  }))
                }
              >
                Сегодня
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <DateField
                label="С"
                value={period.customFrom}
                onChange={(customFrom) => patch({ customFrom })}
                max={parseISO(period.customTo)}
              />
              <DateField
                label="По"
                value={period.customTo}
                onChange={(customTo) => patch({ customTo })}
                min={parseISO(period.customFrom)}
              />
            </div>
          )}

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
        </div>
      </div>

      <div className="grid gap-2 rounded-xl border border-border bg-muted/20 px-3 py-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Смен" value={String(summary.shiftCount)} />
        <StatCard
          label="Общее время"
          value={formatSeconds(summary.withoutBreaks)}
        />
        <StatCard
          label="С перерывами"
          value={formatSeconds(summary.withBreaks)}
        />
        <StatCard
          label="Перерывы"
          value={formatSeconds(summary.pauseSeconds, { withSeconds: true })}
        />
      </div>

      {summary.shiftCount === 0 ? (
        <EmptyState
          title="Нет смен за период"
          description="Выберите другой период или сотрудника"
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[520px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2.5 font-medium">Сотрудник</th>
                  <th className="px-3 py-2.5 font-medium">Смен</th>
                  <th className="px-3 py-2.5 font-medium">Общее время</th>
                  <th className="px-3 py-2.5 font-medium">С перерывами</th>
                  <th className="px-3 py-2.5 font-medium">Перерывы</th>
                </tr>
              </thead>
              <tbody>
                {summary.byUser.map((row) => (
                  <tr
                    key={row.user.id}
                    className="border-b border-border/70 last:border-0"
                  >
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <UserAvatar user={row.user} size="sm" />
                        <span className="truncate">{displayName(row.user)}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 tabular-nums">{row.shiftCount}</td>
                    <td className="px-3 py-2.5 tabular-nums font-medium">
                      {formatSeconds(row.withoutBreaks)}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums font-medium">
                      {formatSeconds(row.withBreaks)}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums text-muted-foreground">
                      {formatSeconds(row.pauseSeconds, { withSeconds: true })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="rounded-xl border border-border px-3 py-3">
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Время по сотрудникам
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  layout="vertical"
                  margin={{ top: 4, right: 12, left: 4, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis
                    type="number"
                    tickFormatter={(v) => `${v} ч`}
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
                    cursor={{ fill: 'var(--muted)', opacity: 0.45 }}
                    contentStyle={{
                      backgroundColor: 'var(--popover)',
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      color: 'var(--popover-foreground)',
                      boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
                    }}
                    labelStyle={{ color: 'var(--popover-foreground)' }}
                    itemStyle={{ color: 'var(--foreground)' }}
                    formatter={(value) => {
                      const n =
                        typeof value === 'number' ? value : Number(value);
                      return [
                        `${Number.isFinite(n) ? n : 0} ч`,
                        'Общее время',
                      ];
                    }}
                    labelFormatter={(label) => String(label)}
                  />
                  <Bar
                    dataKey="hours"
                    fill="#0d9488"
                    radius={[0, 4, 4, 0]}
                    maxBarSize={28}
                    activeBar={{ fill: '#0f766e' }}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className={cn('flex items-center justify-between gap-2 sm:block')}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium tabular-nums">{value}</div>
    </div>
  );
}
