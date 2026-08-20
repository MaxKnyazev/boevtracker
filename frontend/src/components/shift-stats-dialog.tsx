import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts';
import { ExternalLink } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { UserAvatar, displayName } from '@/components/user-avatar';
import {
  api,
  type ShiftStats,
  type ShiftStatsTask,
  type WorkShift,
} from '@/lib/api';
import { cn, formatDateTime, formatSeconds } from '@/lib/utils';
import { shiftTotals } from '@/lib/shift-view';

const PIE_COLORS = [
  '#0d9488',
  '#2563eb',
  '#d97706',
  '#dc2626',
  '#7c3aed',
  '#059669',
  '#db2777',
  '#0891b2',
  '#4f46e5',
  '#ca8a04',
];

export function ShiftStatsDialog({
  open,
  shift,
  onClose,
}: {
  open: boolean;
  shift: WorkShift | null;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const [stats, setStats] = useState<ShiftStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);

  useEffect(() => {
    if (!open || !shift) {
      setStats(null);
      setError('');
      setSelectedTaskId(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError('');
    setSelectedTaskId(null);

    void api
      .shiftStats(shift.id)
      .then((data) => {
        if (cancelled) return;
        setStats(data);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Ошибка загрузки');
        setStats(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, shift]);

  const chartShift = stats?.shift ?? shift;
  const totals = useMemo(
    () => (chartShift ? shiftTotals(chartShift) : { withBreaks: 0, withoutBreaks: 0 }),
    [chartShift],
  );

  const pieData = useMemo(
    () =>
      (stats?.tasks ?? []).map((task, index) => ({
        id: task.taskId,
        name: task.title,
        value: task.totalSeconds,
        color: PIE_COLORS[index % PIE_COLORS.length],
      })),
    [stats?.tasks],
  );

  const selectedTask: ShiftStatsTask | null = useMemo(() => {
    if (!stats?.tasks.length) return null;
    if (selectedTaskId == null) return stats.tasks[0] ?? null;
    return stats.tasks.find((t) => t.taskId === selectedTaskId) ?? stats.tasks[0];
  }, [stats, selectedTaskId]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Статистика смены</DialogTitle>
        </DialogHeader>

        {chartShift && (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <div className="flex items-center gap-2">
              <UserAvatar user={chartShift.user} size="sm" />
              <span className="font-medium">{displayName(chartShift.user)}</span>
            </div>
            <span className="text-muted-foreground">
              {formatDateTime(chartShift.startedAt)}
              {' — '}
              {formatDateTime(chartShift.endedAt)}
            </span>
          </div>
        )}

        {chartShift && (
          <div className="grid gap-2 rounded-xl border border-border bg-muted/20 px-3 py-3 text-sm sm:grid-cols-3">
            <StatLine
              label="Общее время"
              value={formatSeconds(totals.withBreaks)}
            />
            <StatLine
              label="Без перерывов"
              value={formatSeconds(totals.withoutBreaks)}
            />
            <StatLine
              label="Перерывы"
              value={formatSeconds(chartShift.totalPauseSeconds ?? 0, {
                withSeconds: true,
              })}
            />
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        {loading ? (
          <p className="text-sm text-muted-foreground">Загрузка статистики...</p>
        ) : !stats || stats.tasks.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
            Нет задач в работе за эту смену
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
            <div className="flex flex-col items-center">
              <div className="h-56 w-full max-w-[280px] [&_.recharts-wrapper]:outline-none [&_.recharts-surface]:outline-none [&_svg]:outline-none [&_*:focus]:outline-none [&_*:focus-visible]:outline-none">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart style={{ outline: 'none' }}>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={58}
                      outerRadius={(dataPoint) => {
                        const id = (dataPoint as { id?: number }).id;
                        return selectedTask && id === selectedTask.taskId
                          ? 90
                          : 84;
                      }}
                      paddingAngle={2}
                      isAnimationActive={false}
                      onClick={(_, index) => {
                        const item = pieData[index];
                        if (item) setSelectedTaskId(item.id);
                      }}
                      style={{ cursor: 'pointer', outline: 'none' }}
                    >
                      {pieData.map((entry) => (
                        <Cell
                          key={entry.id}
                          fill={entry.color}
                          stroke="transparent"
                          opacity={
                            selectedTask && selectedTask.taskId !== entry.id
                              ? 0.45
                              : 1
                          }
                        />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="min-w-0 space-y-3">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Задачи
              </div>
              <ul className="max-h-44 space-y-1 overflow-y-auto pr-1">
                {stats.tasks.map((task, index) => {
                  const active = selectedTask?.taskId === task.taskId;
                  const color = PIE_COLORS[index % PIE_COLORS.length];
                  const pct =
                    stats.totalSeconds > 0
                      ? Math.round((task.totalSeconds / stats.totalSeconds) * 100)
                      : 0;
                  return (
                    <li
                      key={task.taskId}
                      className={cn(
                        'flex items-center gap-1 rounded-lg pr-1 transition-colors',
                        active ? 'bg-accent' : 'hover:bg-accent/50',
                      )}
                    >
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left text-sm"
                        onClick={() => setSelectedTaskId(task.taskId)}
                      >
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: color }}
                        />
                        <span className="min-w-0 flex-1">
                          <span
                            className="block truncate font-medium"
                            title={task.title}
                          >
                            {task.title}
                          </span>
                          {task.project && (
                            <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                              {task.project.board?.name
                                ? `${task.project.board.name} · `
                                : ''}
                              {task.project.name}
                            </span>
                          )}
                        </span>
                        <span className="shrink-0 text-right tabular-nums text-muted-foreground">
                          <span className="block text-foreground">
                            {formatSeconds(task.totalSeconds)}
                          </span>
                          <span className="text-xs">{pct}%</span>
                        </span>
                      </button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 text-muted-foreground"
                        title="Открыть задачу в проекте"
                        disabled={!task.project?.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          const projectId = task.project?.id;
                          if (!projectId) return;
                          const boardId =
                            task.project?.boardId ?? task.project?.board?.id;
                          onClose();
                          if (boardId) {
                            navigate(
                              `/boards/${boardId}?tab=${projectId}&task=${task.taskId}`,
                            );
                          } else {
                            navigate(
                              `/projects/${projectId}?task=${task.taskId}`,
                            );
                          }
                        }}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </li>
                  );
                })}
              </ul>

              {selectedTask && (
                <div className="rounded-xl border border-border px-3 py-2.5">
                  <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    По статусам
                  </div>
                  <div className="h-36 overflow-y-auto overscroll-contain pr-1 [scrollbar-gutter:stable]">
                    <ul className="space-y-1.5 text-sm">
                      {selectedTask.statuses.map((slice) => (
                        <li
                          key={`${slice.user?.id ?? 'none'}-${slice.statusName}-${slice.toStatusName}`}
                          className="flex items-start gap-2"
                        >
                          <UserAvatar
                            user={slice.user}
                            size="sm"
                            title={displayName(slice.user)}
                            className="mt-0.5"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block text-muted-foreground">
                              {slice.statusName} → {slice.toStatusName}{' '}
                              <span className="text-foreground">
                                за {formatSeconds(slice.seconds)}
                              </span>
                            </span>
                            <span className="mt-0.5 block truncate text-[11px] text-muted-foreground/80">
                              {displayName(slice.user)}
                              {slice.isPeer ? ' · соавтор' : ''}
                            </span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {chartShift?.comment?.trim() && (
          <div className="rounded-xl border border-border px-3 py-2.5 text-sm">
            <div className="text-xs text-muted-foreground">Комментарий</div>
            <p className="mt-1 whitespace-pre-wrap">{chartShift.comment}</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function StatLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 sm:block">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium tabular-nums">{value}</div>
    </div>
  );
}
