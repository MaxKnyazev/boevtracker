import {
  addDays,
  addMonths,
  addWeeks,
  endOfDay,
  endOfMonth,
  endOfWeek,
  format,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { ru } from 'date-fns/locale';
import type { PublicUser, WorkShift } from '@/lib/api';
import { displayName } from '@/components/user-avatar';
import { shiftTotals } from '@/lib/shift-view';

export type SummaryPeriodKind = 'day' | 'week' | 'month' | 'custom';

export type SummaryPeriodState = {
  kind: SummaryPeriodKind;
  /** Any day inside the day/week/month period (yyyy-MM-dd). */
  anchor: string;
  customFrom: string;
  customTo: string;
  /** 'all' | user id */
  user: string;
};

export type SummaryRange = {
  from: Date;
  to: Date;
  label: string;
};

export type UserShiftSummary = {
  user: PublicUser;
  shiftCount: number;
  withBreaks: number;
  withoutBreaks: number;
  pauseSeconds: number;
};

export type PeriodShiftSummary = {
  shifts: WorkShift[];
  shiftCount: number;
  withBreaks: number;
  withoutBreaks: number;
  pauseSeconds: number;
  byUser: UserShiftSummary[];
};

function toDateKey(d: Date): string {
  return format(d, 'yyyy-MM-dd');
}

export function defaultSummaryPeriod(now = new Date()): SummaryPeriodState {
  const key = toDateKey(now);
  return {
    kind: 'week',
    anchor: key,
    customFrom: key,
    customTo: key,
    user: 'all',
  };
}

export function resolveSummaryRange(
  state: SummaryPeriodState,
  now = new Date(),
): SummaryRange {
  if (state.kind === 'custom') {
    let from = startOfDay(parseISO(state.customFrom));
    let to = endOfDay(parseISO(state.customTo));
    if (Number.isNaN(from.getTime())) from = startOfDay(now);
    if (Number.isNaN(to.getTime())) to = endOfDay(now);
    if (to < from) {
      const tmp = from;
      from = startOfDay(to);
      to = endOfDay(tmp);
    }
    return {
      from,
      to,
      label: `${format(from, 'dd.MM.yyyy')} — ${format(to, 'dd.MM.yyyy')}`,
    };
  }

  const anchor = parseISO(state.anchor);
  const base = Number.isNaN(anchor.getTime()) ? now : anchor;

  if (state.kind === 'day') {
    const from = startOfDay(base);
    const to = endOfDay(base);
    return { from, to, label: format(from, 'dd.MM.yyyy') };
  }

  if (state.kind === 'week') {
    const from = startOfWeek(base, { weekStartsOn: 1 });
    const to = endOfWeek(base, { weekStartsOn: 1 });
    return {
      from,
      to,
      label: `${format(from, 'dd.MM.yyyy')} — ${format(to, 'dd.MM.yyyy')}`,
    };
  }

  const from = startOfMonth(base);
  const to = endOfMonth(base);
  return {
    from,
    to,
    label: format(from, 'LLLL yyyy', { locale: ru }),
  };
}

export function shiftSummaryPeriod(
  state: SummaryPeriodState,
  direction: -1 | 1,
): SummaryPeriodState {
  if (state.kind === 'custom') return state;
  const anchor = parseISO(state.anchor);
  const base = Number.isNaN(anchor.getTime()) ? new Date() : anchor;
  let next = base;
  if (state.kind === 'day') next = addDays(base, direction);
  else if (state.kind === 'week') next = addWeeks(base, direction);
  else next = addMonths(base, direction);
  return { ...state, anchor: toDateKey(next) };
}

/** Shifts that started inside [from, to]. */
export function shiftsInRange(
  shifts: WorkShift[],
  range: SummaryRange,
  userFilter: string,
): WorkShift[] {
  return shifts.filter((shift) => {
    if (userFilter !== 'all' && shift.userId !== Number(userFilter)) {
      return false;
    }
    const started = new Date(shift.startedAt).getTime();
    if (Number.isNaN(started)) return false;
    return started >= range.from.getTime() && started <= range.to.getTime();
  });
}

export function buildPeriodSummary(
  shifts: WorkShift[],
  range: SummaryRange,
  userFilter: string,
  nowMs = Date.now(),
): PeriodShiftSummary {
  const inRange = shiftsInRange(shifts, range, userFilter);
  let withBreaks = 0;
  let withoutBreaks = 0;
  let pauseSeconds = 0;
  const byUserMap = new Map<number, UserShiftSummary>();

  for (const shift of inRange) {
    const totals = shiftTotals(shift, nowMs);
    withBreaks += totals.withBreaks;
    withoutBreaks += totals.withoutBreaks;
    pauseSeconds += shift.totalPauseSeconds ?? 0;

    const user = shift.user;
    if (!user) continue;
    const prev = byUserMap.get(user.id);
    if (prev) {
      prev.shiftCount += 1;
      prev.withBreaks += totals.withBreaks;
      prev.withoutBreaks += totals.withoutBreaks;
      prev.pauseSeconds += shift.totalPauseSeconds ?? 0;
    } else {
      byUserMap.set(user.id, {
        user,
        shiftCount: 1,
        withBreaks: totals.withBreaks,
        withoutBreaks: totals.withoutBreaks,
        pauseSeconds: shift.totalPauseSeconds ?? 0,
      });
    }
  }

  const byUser = [...byUserMap.values()].sort(
    (a, b) =>
      b.withoutBreaks - a.withoutBreaks ||
      displayName(a.user).localeCompare(displayName(b.user), 'ru'),
  );

  return {
    shifts: inRange,
    shiftCount: inRange.length,
    withBreaks,
    withoutBreaks,
    pauseSeconds,
    byUser,
  };
}
