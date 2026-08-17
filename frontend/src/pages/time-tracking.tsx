import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Clock,
  MessageSquare,
  MessageSquareOff,
} from 'lucide-react';
import { api, type WorkShift, type WorkShiftStatus } from '@/lib/api';
import { EmptyState, PageHeader } from '@/components/layout';
import { ShiftViewControls } from '@/components/shift-view-controls';
import { ShiftStatsDialog } from '@/components/shift-stats-dialog';
import { ShiftPeriodSummary } from '@/components/shift-period-summary';
import { Badge } from '@/components/ui/badge';
import { UserAvatar, displayName } from '@/components/user-avatar';
import { realtimeClient } from '@/lib/realtime';
import { useShiftStore } from '@/store/shifts';
import { cn, formatDateTime, formatSeconds } from '@/lib/utils';
import {
  DEFAULT_SHIFT_VIEW,
  SHIFT_VIEW_STORAGE_KEY,
  applyShiftView,
  shiftTotals,
  uniqueShiftUsers,
  usePersistedShiftView,
  type ShiftSortField,
  type ShiftViewState,
} from '@/lib/shift-view';

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

type TimeTab = 'list' | 'summary';

const TAB_STORAGE_KEY = 'boevtracker.timeTracking.tab';

function readTab(): TimeTab {
  try {
    const raw = localStorage.getItem(TAB_STORAGE_KEY);
    if (raw === 'list' || raw === 'summary') return raw;
  } catch {
    // ignore
  }
  return 'list';
}

export function TimeTrackingPage() {
  const [tab, setTabState] = useState<TimeTab>(() => readTab());
  const [shifts, setShifts] = useState<WorkShift[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [view, setView] = usePersistedShiftView(SHIFT_VIEW_STORAGE_KEY);
  const ownShift = useShiftStore((s) => s.shift);
  const [selectedShift, setSelectedShift] = useState<WorkShift | null>(null);

  const setTab = (next: TimeTab) => {
    setTabState(next);
    try {
      localStorage.setItem(TAB_STORAGE_KEY, next);
    } catch {
      // ignore
    }
  };

  const load = useCallback(async (opts?: { soft?: boolean }) => {
    if (!opts?.soft) setLoading(true);
    try {
      const data = await api.shifts();
      setShifts(data.shifts);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка загрузки');
    } finally {
      if (!opts?.soft) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    realtimeClient.watchShiftsList(() => {
      void load({ soft: true });
    });
    return () => {
      realtimeClient.unwatchShiftsList();
    };
  }, [load]);

  const ownShiftKey = [
    ownShift?.id ?? 'none',
    ownShift?.status ?? '',
    ownShift?.endedAt ?? '',
    ownShift?.totalPauseSeconds ?? 0,
    ownShift?.pausedAt ?? '',
  ].join('|');
  const prevOwnShiftKey = useRef<string | null>(null);
  useEffect(() => {
    if (prevOwnShiftKey.current === null) {
      prevOwnShiftKey.current = ownShiftKey;
      return;
    }
    if (prevOwnShiftKey.current === ownShiftKey) return;
    prevOwnShiftKey.current = ownShiftKey;
    void load({ soft: true });
  }, [ownShiftKey, load]);

  const users = useMemo(() => uniqueShiftUsers(shifts), [shifts]);

  useEffect(() => {
    if (loading) return;
    if (view.user !== 'all' && !users.some((u) => String(u.id) === view.user)) {
      setView((prev) => ({ ...prev, user: 'all' }));
    }
  }, [loading, users, view.user, setView]);

  const visibleShifts = useMemo(
    () => applyShiftView(shifts, view),
    [shifts, view],
  );

  const cycleSort = (field: ShiftSortField) => {
    setView((prev) => {
      if (prev.sortField !== field) {
        return {
          ...prev,
          sortField: field,
          sortDir: field === 'startedAt' || field === 'endedAt' ? 'desc' : 'asc',
        };
      }
      const defaultDir =
        field === 'startedAt' || field === 'endedAt' ? 'desc' : 'asc';
      if (prev.sortDir === defaultDir) {
        return {
          ...prev,
          sortDir: defaultDir === 'asc' ? 'desc' : 'asc',
        };
      }
      return {
        ...prev,
        sortField: DEFAULT_SHIFT_VIEW.sortField,
        sortDir: DEFAULT_SHIFT_VIEW.sortDir,
      };
    });
  };

  return (
    <div>
      <PageHeader
        title="Учет времени"
        description="Рабочие смены и сводка за период"
      />

      <div
        className="mb-4 inline-flex rounded-lg border border-border bg-muted/30 p-1"
        role="tablist"
        aria-label="Разделы учёта времени"
      >
        <TabButton
          active={tab === 'list'}
          onClick={() => setTab('list')}
        >
          Список смен
        </TabButton>
        <TabButton
          active={tab === 'summary'}
          onClick={() => setTab('summary')}
        >
          Сводка за период
        </TabButton>
      </div>

      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}

      {tab === 'list' ? (
        <>
          <ShiftViewControls
            view={view}
            onChange={setView}
            users={users}
            className="mb-4"
          />

          {loading ? (
            <p className="text-muted-foreground">Загрузка...</p>
          ) : visibleShifts.length === 0 ? (
            <EmptyState
              title={shifts.length === 0 ? 'Смен пока нет' : 'Ничего не найдено'}
              description={
                shifts.length === 0
                  ? 'Начните смену в боковой панели — она появится здесь'
                  : 'Измените фильтры или сортировку'
              }
              icon={<Clock className="h-10 w-10" />}
            />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full min-w-[960px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
                    <SortableTh
                      label="Сотрудник"
                      field="user"
                      view={view}
                      onCycle={cycleSort}
                    />
                    <SortableTh
                      label="Начало"
                      field="startedAt"
                      view={view}
                      onCycle={cycleSort}
                    />
                    <SortableTh
                      label="Окончание"
                      field="endedAt"
                      view={view}
                      onCycle={cycleSort}
                    />
                    <SortableTh
                      label="Статус"
                      field="status"
                      view={view}
                      onCycle={cycleSort}
                    />
                    <SortableTh
                      label="Общее время"
                      field="withBreaks"
                      view={view}
                      onCycle={cycleSort}
                    />
                    <SortableTh
                      label="Без перерывов"
                      field="withoutBreaks"
                      view={view}
                      onCycle={cycleSort}
                    />
                    <SortableTh
                      label="Перерывы"
                      field="pauses"
                      view={view}
                      onCycle={cycleSort}
                    />
                    <SortableTh
                      label="Комментарий"
                      field="comment"
                      view={view}
                      onCycle={cycleSort}
                    />
                  </tr>
                </thead>
                <tbody>
                  {visibleShifts.map((shift) => {
                    const totals = shiftTotals(shift);
                    return (
                      <tr
                        key={shift.id}
                        className="cursor-pointer border-b border-border/70 transition-colors hover:bg-accent/40"
                        onClick={() => setSelectedShift(shift)}
                      >
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            <UserAvatar user={shift.user} size="sm" />
                            <span className="truncate">
                              {displayName(shift.user)}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 tabular-nums text-muted-foreground">
                          {formatDateTime(shift.startedAt)}
                        </td>
                        <td className="px-3 py-2.5 tabular-nums text-muted-foreground">
                          {formatDateTime(shift.endedAt)}
                        </td>
                        <td className="px-3 py-2.5">
                          <Badge className={cn(STATUS_CLASS[shift.status])}>
                            {STATUS_LABELS[shift.status]}
                          </Badge>
                        </td>
                        <td className="px-3 py-2.5 tabular-nums font-medium">
                          {formatSeconds(totals.withBreaks)}
                        </td>
                        <td className="px-3 py-2.5 tabular-nums font-medium">
                          {formatSeconds(totals.withoutBreaks)}
                        </td>
                        <td className="px-3 py-2.5 tabular-nums text-muted-foreground">
                          {formatSeconds(shift.totalPauseSeconds ?? 0, {
                            withSeconds: true,
                          })}
                        </td>
                        <td className="px-3 py-2.5">
                          {shift.comment?.trim() ? (
                            <span
                              className="inline-flex text-foreground"
                              title={shift.comment}
                            >
                              <MessageSquare
                                className="h-4 w-4"
                                aria-label="Есть комментарий"
                              />
                            </span>
                          ) : (
                            <span
                              className="inline-flex text-muted-foreground/50"
                              title="Без комментария"
                            >
                              <MessageSquareOff
                                className="h-4 w-4"
                                aria-label="Нет комментария"
                              />
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {!loading && visibleShifts.length > 0 && (
            <p className="mt-3 text-xs text-muted-foreground">
              Показано {visibleShifts.length} из {shifts.length}
            </p>
          )}
        </>
      ) : loading ? (
        <p className="text-muted-foreground">Загрузка...</p>
      ) : (
        <ShiftPeriodSummary shifts={shifts} users={users} />
      )}

      <ShiftStatsDialog
        open={selectedShift != null}
        shift={selectedShift}
        onClose={() => setSelectedShift(null)}
      />
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={cn(
        'rounded-md px-3 py-1.5 text-sm transition-colors',
        active
          ? 'bg-background text-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground',
      )}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function SortableTh({
  label,
  field,
  view,
  onCycle,
}: {
  label: string;
  field: ShiftSortField;
  view: ShiftViewState;
  onCycle: (field: ShiftSortField) => void;
}) {
  const active = view.sortField === field;
  const Icon = !active
    ? ArrowUpDown
    : view.sortDir === 'asc'
      ? ArrowUp
      : ArrowDown;

  return (
    <th className="px-3 py-2.5 font-medium">
      <button
        type="button"
        className={cn(
          'inline-flex items-center gap-1 rounded-sm transition-colors hover:text-foreground',
          active ? 'text-foreground' : 'text-muted-foreground',
        )}
        onClick={() => onCycle(field)}
        title={
          !active
            ? 'Сортировать'
            : view.sortDir === 'asc'
              ? 'По возрастанию'
              : 'По убыванию'
        }
      >
        <span>{label}</span>
        <Icon
          className={cn(
            'h-3.5 w-3.5 shrink-0',
            active ? 'opacity-90' : 'opacity-45',
          )}
          aria-hidden
        />
      </button>
    </th>
  );
}
