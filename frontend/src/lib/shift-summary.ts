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
import { APP_DISPLAY_TIMEZONE } from '@/lib/utils';

export const STANDARD_WORKDAY_SECONDS = 8 * 3600;
/** Daily overtime shorter than this is ignored in the summary. */
export const OVERTIME_MIN_SECONDS = 10 * 60;

export type SummaryPeriodKind = 'day' | 'week' | 'month' | 'custom';

export type SummaryPeriodState = {
  kind: SummaryPeriodKind;
  /** Any day inside the day/week/month period (yyyy-MM-dd). */
  anchor: string;
  customFrom: string;
  customTo: string;
  /** 'all' | user id */
  user: string;
  /** When true, only completed shifts are included in the summary. */
  completedOnly: boolean;
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
  overtimeSeconds: number;
};

export type PeriodShiftSummary = {
  shifts: WorkShift[];
  shiftCount: number;
  withBreaks: number;
  withoutBreaks: number;
  pauseSeconds: number;
  overtimeSeconds: number;
  byUser: UserShiftSummary[];
};

export const WEEK_STARTS_ON = 1 as const;

const WEEK = { weekStartsOn: WEEK_STARTS_ON };

function toDateKey(d: Date): string {
  return format(d, 'yyyy-MM-dd');
}

function parseDay(value: string, fallback: Date): Date {
  const d = parseISO(value);
  return Number.isNaN(d.getTime()) ? fallback : d;
}

export function defaultSummaryPeriod(now = new Date()): SummaryPeriodState {
  return {
    kind: 'week',
    user: 'all',
    completedOnly: false,
    ...periodBoundsForKind('week', now),
  };
}

export function periodBoundsForKind(
  kind: SummaryPeriodKind,
  now = new Date(),
): Pick<SummaryPeriodState, 'anchor' | 'customFrom' | 'customTo'> {
  const key = toDateKey(now);
  if (kind === 'week') {
    return {
      anchor: key,
      customFrom: toDateKey(startOfWeek(now, WEEK)),
      customTo: toDateKey(endOfWeek(now, WEEK)),
    };
  }
  if (kind === 'month') {
    return {
      anchor: key,
      customFrom: toDateKey(startOfMonth(now)),
      customTo: toDateKey(endOfMonth(now)),
    };
  }
  return { anchor: key, customFrom: key, customTo: key };
}

export function applySummaryPeriodKind(
  state: SummaryPeriodState,
  kind: SummaryPeriodKind,
  now = new Date(),
): SummaryPeriodState {
  const day = parseDay(state.anchor || state.customFrom, now);
  if (kind === 'month') {
    return { ...state, kind, ...periodBoundsForKind('month', day) };
  }
  if (kind === 'week') {
    return { ...state, kind, ...periodBoundsForKind('week', day) };
  }
  if (kind === 'day') {
    const key = toDateKey(day);
    return { ...state, kind, anchor: key, customFrom: key, customTo: key };
  }
  return { ...state, kind };
}

export function resolveSummaryRange(
  state: SummaryPeriodState,
  now = new Date(),
): SummaryRange {
  let from = startOfDay(parseDay(state.customFrom, now));
  let to = startOfDay(parseDay(state.customTo, now));
  if (to < from) {
    const tmp = from;
    from = to;
    to = tmp;
  }

  if (state.kind === 'week') {
    from = startOfWeek(from, WEEK);
    to = endOfWeek(to, WEEK);
  } else {
    to = endOfDay(to);
  }

  const sameDay = format(from, 'yyyy-MM-dd') === format(to, 'yyyy-MM-dd');
  return {
    from,
    to,
    label:
      state.kind === 'day' && sameDay
        ? format(from, 'dd.MM.yyyy')
        : `${format(from, 'dd.MM.yyyy')} — ${format(to, 'dd.MM.yyyy')}`,
  };
}

export function shiftSummaryPeriod(
  state: SummaryPeriodState,
  direction: -1 | 1,
): SummaryPeriodState {
  if (state.kind === 'custom') return state;

  if (state.kind === 'month') {
    const anchor = parseDay(state.anchor, new Date());
    const next = addMonths(anchor, direction);
    return { ...state, ...periodBoundsForKind('month', next) };
  }

  const from = parseDay(state.customFrom, new Date());
  const to = parseDay(state.customTo, new Date());
  if (state.kind === 'week') {
    return {
      ...state,
      customFrom: toDateKey(addWeeks(from, direction)),
      customTo: toDateKey(addWeeks(to, direction)),
      anchor: toDateKey(addWeeks(from, direction)),
    };
  }

  return {
    ...state,
    customFrom: toDateKey(addDays(from, direction)),
    customTo: toDateKey(addDays(to, direction)),
    anchor: toDateKey(addDays(from, direction)),
  };
}

export function applyCalendarRangeClick(
  state: SummaryPeriodState,
  day: Date,
  startDay: Date | null,
): { state: SummaryPeriodState; startDay: Date | null } {
  if (!startDay) {
    const key = toDateKey(day);
    return {
      state: {
        ...state,
        kind: 'custom',
        customFrom: key,
        customTo: key,
        anchor: key,
      },
      startDay: startOfDay(day),
    };
  }

  let from = startOfDay(startDay);
  let to = startOfDay(day);
  if (to < from) {
    const tmp = from;
    from = to;
    to = tmp;
  }

  return {
    state: {
      ...state,
      kind: 'custom',
      customFrom: toDateKey(from),
      customTo: toDateKey(to),
      anchor: toDateKey(from),
    },
    startDay: null,
  };
}

export function applyCalendarMonthClick(
  state: SummaryPeriodState,
  month: Date,
): SummaryPeriodState {
  const from = startOfMonth(month);
  const to = endOfMonth(month);
  return {
    ...state,
    kind: 'custom',
    customFrom: toDateKey(from),
    customTo: toDateKey(to),
    anchor: toDateKey(from),
  };
}

/** Shifts that started inside [from, to]. */
export function shiftsInRange(
  shifts: WorkShift[],
  range: SummaryRange,
  userFilter: string,
  completedOnly = false,
): WorkShift[] {
  return shifts.filter((shift) => {
    if (completedOnly && shift.status !== 'completed') {
      return false;
    }
    if (userFilter !== 'all' && shift.userId !== Number(userFilter)) {
      return false;
    }
    const started = new Date(shift.startedAt).getTime();
    if (Number.isNaN(started)) return false;
    return started >= range.from.getTime() && started <= range.to.getTime();
  });
}

function moscowDayInfo(value: string): { key: string; isWeekend: boolean } {
  const date = new Date(value);
  const key = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_DISPLAY_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: APP_DISPLAY_TIMEZONE,
    weekday: 'short',
  }).format(date);
  return { key, isWeekend: weekday === 'Sat' || weekday === 'Sun' };
}

function overtimeForDay(withoutBreaks: number, isWeekend: boolean): number {
  if (withoutBreaks <= 0) return 0;
  const extra = isWeekend
    ? withoutBreaks
    : Math.max(0, withoutBreaks - STANDARD_WORKDAY_SECONDS);
  return extra > OVERTIME_MIN_SECONDS ? extra : 0;
}

export function buildPeriodSummary(
  shifts: WorkShift[],
  range: SummaryRange,
  userFilter: string,
  nowMs = Date.now(),
  completedOnly = false,
): PeriodShiftSummary {
  const inRange = shiftsInRange(shifts, range, userFilter, completedOnly);
  let withBreaks = 0;
  let withoutBreaks = 0;
  let pauseSeconds = 0;
  const byUserMap = new Map<number, UserShiftSummary>();
  /** Net work seconds per user per Moscow calendar day. */
  const dayNet = new Map<string, { userId: number; seconds: number; isWeekend: boolean }>();

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
        overtimeSeconds: 0,
      });
    }

    const day = moscowDayInfo(shift.startedAt);
    const dayKey = `${user.id}|${day.key}`;
    const bucket = dayNet.get(dayKey);
    if (bucket) {
      bucket.seconds += totals.withoutBreaks;
    } else {
      dayNet.set(dayKey, {
        userId: user.id,
        seconds: totals.withoutBreaks,
        isWeekend: day.isWeekend,
      });
    }
  }

  let overtimeSeconds = 0;
  for (const bucket of dayNet.values()) {
    const extra = overtimeForDay(bucket.seconds, bucket.isWeekend);
    overtimeSeconds += extra;
    const row = byUserMap.get(bucket.userId);
    if (row) row.overtimeSeconds += extra;
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
    overtimeSeconds,
    byUser,
  };
}
