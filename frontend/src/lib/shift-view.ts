import { useCallback, useEffect, useState } from 'react';
import type { PublicUser, WorkShift, WorkShiftStatus } from '@/lib/api';
import { displayName } from '@/components/user-avatar';

export type ShiftSortField =
  | 'user'
  | 'startedAt'
  | 'endedAt'
  | 'status'
  | 'pauses'
  | 'withBreaks'
  | 'withoutBreaks'
  | 'comment';

export type ShiftSortDir = 'asc' | 'desc';

export type ShiftPeriodFilter = 'all' | 'today' | 'week' | 'month';

export type ShiftViewState = {
  sortField: ShiftSortField;
  sortDir: ShiftSortDir;
  /** 'all' | user id as string */
  user: string;
  /** 'all' | WorkShiftStatus */
  status: string;
  period: ShiftPeriodFilter;
};

export const DEFAULT_SHIFT_VIEW: ShiftViewState = {
  sortField: 'startedAt',
  sortDir: 'desc',
  user: 'all',
  status: 'all',
  period: 'all',
};

export const SHIFT_VIEW_STORAGE_KEY = 'boevtracker.shiftView.time';

const SORT_FIELDS: ReadonlySet<string> = new Set([
  'user',
  'startedAt',
  'endedAt',
  'status',
  'pauses',
  'withBreaks',
  'withoutBreaks',
  'comment',
]);
const SORT_DIRS: ReadonlySet<string> = new Set(['asc', 'desc']);
const PERIOD_FILTERS: ReadonlySet<string> = new Set([
  'all',
  'today',
  'week',
  'month',
]);
const STATUS_FILTERS: ReadonlySet<string> = new Set([
  'all',
  'active',
  'paused',
  'completed',
]);

function parseShiftView(raw: unknown): ShiftViewState | null {
  if (!raw || typeof raw !== 'object') return null;
  const v = raw as Record<string, unknown>;

  const sortField = SORT_FIELDS.has(String(v.sortField))
    ? (v.sortField as ShiftSortField)
    : DEFAULT_SHIFT_VIEW.sortField;
  const sortDir = SORT_DIRS.has(String(v.sortDir))
    ? (v.sortDir as ShiftSortDir)
    : DEFAULT_SHIFT_VIEW.sortDir;
  const period = PERIOD_FILTERS.has(String(v.period))
    ? (v.period as ShiftPeriodFilter)
    : DEFAULT_SHIFT_VIEW.period;
  const status = STATUS_FILTERS.has(String(v.status))
    ? String(v.status)
    : DEFAULT_SHIFT_VIEW.status;

  const user =
    v.user === 'all' ||
    (typeof v.user === 'string' && /^\d+$/.test(v.user)) ||
    (typeof v.user === 'number' && Number.isFinite(v.user))
      ? String(v.user === 'all' ? 'all' : v.user)
      : DEFAULT_SHIFT_VIEW.user;

  return { sortField, sortDir, user, status, period };
}

export function readShiftView(storageKey: string): ShiftViewState {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return { ...DEFAULT_SHIFT_VIEW };
    return parseShiftView(JSON.parse(raw)) ?? { ...DEFAULT_SHIFT_VIEW };
  } catch {
    return { ...DEFAULT_SHIFT_VIEW };
  }
}

export function writeShiftView(storageKey: string, view: ShiftViewState): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify(view));
  } catch {
    // ignore
  }
}

export function usePersistedShiftView(
  storageKey: string,
): [
  ShiftViewState,
  (
    next: ShiftViewState | ((prev: ShiftViewState) => ShiftViewState),
  ) => void,
] {
  const [view, setViewState] = useState(() => readShiftView(storageKey));

  useEffect(() => {
    setViewState(readShiftView(storageKey));
  }, [storageKey]);

  const setView = useCallback(
    (next: ShiftViewState | ((prev: ShiftViewState) => ShiftViewState)) => {
      setViewState((prev) => {
        const value = typeof next === 'function' ? next(prev) : next;
        writeShiftView(storageKey, value);
        return value;
      });
    },
    [storageKey],
  );

  return [view, setView];
}

export function hasActiveShiftView(view: ShiftViewState): boolean {
  return (
    view.sortField !== DEFAULT_SHIFT_VIEW.sortField ||
    view.sortDir !== DEFAULT_SHIFT_VIEW.sortDir ||
    view.user !== 'all' ||
    view.status !== 'all' ||
    view.period !== 'all'
  );
}

export function shiftTotals(shift: WorkShift, nowMs = Date.now()) {
  const startMs = new Date(shift.startedAt).getTime();
  const endMs = shift.endedAt
    ? new Date(shift.endedAt).getTime()
    : nowMs;
  const withBreaks = Math.max(0, Math.floor((endMs - startMs) / 1000));
  const withoutBreaks = Math.max(
    0,
    withBreaks - (shift.totalPauseSeconds ?? 0),
  );
  return { withBreaks, withoutBreaks };
}

const STATUS_RANK: Record<WorkShiftStatus, number> = {
  active: 0,
  paused: 1,
  completed: 2,
};

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function matchesPeriod(shift: WorkShift, period: ShiftPeriodFilter): boolean {
  if (period === 'all') return true;
  const started = new Date(shift.startedAt);
  if (Number.isNaN(started.getTime())) return false;
  const now = new Date();
  const dayStart = startOfLocalDay(now);

  if (period === 'today') {
    return started >= dayStart;
  }
  if (period === 'week') {
    const weekStart = new Date(dayStart);
    const day = weekStart.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    weekStart.setDate(weekStart.getDate() + mondayOffset);
    return started >= weekStart;
  }
  if (period === 'month') {
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    return started >= monthStart;
  }
  return true;
}

function compareNullableDate(
  a?: string | null,
  b?: string | null,
  dir: ShiftSortDir = 'asc',
): number {
  const aMs = a ? new Date(a).getTime() : NaN;
  const bMs = b ? new Date(b).getTime() : NaN;
  const aMissing = Number.isNaN(aMs);
  const bMissing = Number.isNaN(bMs);
  if (aMissing && bMissing) return 0;
  if (aMissing) return 1;
  if (bMissing) return -1;
  return dir === 'asc' ? aMs - bMs : bMs - aMs;
}

export function applyShiftView(
  shifts: WorkShift[],
  view: ShiftViewState,
): WorkShift[] {
  const nowMs = Date.now();
  let filtered = shifts;

  if (view.user !== 'all') {
    const userId = Number(view.user);
    filtered = filtered.filter((s) => s.userId === userId);
  }
  if (view.status !== 'all') {
    filtered = filtered.filter((s) => s.status === view.status);
  }
  if (view.period !== 'all') {
    filtered = filtered.filter((s) => matchesPeriod(s, view.period));
  }

  const dir = view.sortDir;
  const mul = dir === 'asc' ? 1 : -1;

  return [...filtered].sort((a, b) => {
    switch (view.sortField) {
      case 'user': {
        const an = displayName(a.user).toLocaleLowerCase('ru');
        const bn = displayName(b.user).toLocaleLowerCase('ru');
        return mul * an.localeCompare(bn, 'ru');
      }
      case 'startedAt':
        return compareNullableDate(a.startedAt, b.startedAt, dir);
      case 'endedAt':
        return compareNullableDate(a.endedAt, b.endedAt, dir);
      case 'status':
        return mul * (STATUS_RANK[a.status] - STATUS_RANK[b.status]);
      case 'pauses':
        return mul * ((a.totalPauseSeconds ?? 0) - (b.totalPauseSeconds ?? 0));
      case 'withBreaks':
        return (
          mul *
          (shiftTotals(a, nowMs).withBreaks - shiftTotals(b, nowMs).withBreaks)
        );
      case 'withoutBreaks':
        return (
          mul *
          (shiftTotals(a, nowMs).withoutBreaks -
            shiftTotals(b, nowMs).withoutBreaks)
        );
      case 'comment': {
        const ac = (a.comment ?? '').trim().toLocaleLowerCase('ru');
        const bc = (b.comment ?? '').trim().toLocaleLowerCase('ru');
        if (!ac && !bc) return 0;
        if (!ac) return 1;
        if (!bc) return -1;
        return mul * ac.localeCompare(bc, 'ru');
      }
      default:
        return 0;
    }
  });
}

export function uniqueShiftUsers(shifts: WorkShift[]): PublicUser[] {
  const map = new Map<number, PublicUser>();
  for (const shift of shifts) {
    if (shift.user) {
      map.set(shift.user.id, shift.user);
    }
  }
  return [...map.values()].sort((a, b) =>
    displayName(a).localeCompare(displayName(b), 'ru'),
  );
}
