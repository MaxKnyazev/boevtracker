import { useEffect, useState } from 'react';
import { Coffee, Play, Square, Timer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EndShiftDialog } from '@/components/end-shift-dialog';
import { useShiftStore } from '@/store/shifts';
import { cn } from '@/lib/utils';

function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (h > 0) return `${h}:${pad(m)}:${pad(sec)}`;
  return `${pad(m)}:${pad(sec)}`;
}

export function ShiftControls({ collapsed }: { collapsed: boolean }) {
  const { shift, initialized, fetchCurrent, start, pause, resume, end } =
    useShiftStore();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [endOpen, setEndOpen] = useState(false);
  const [pauseTick, setPauseTick] = useState(0);

  useEffect(() => {
    if (!initialized) void fetchCurrent();
  }, [initialized, fetchCurrent]);

  useEffect(() => {
    if (shift?.status !== 'paused' || !shift.pausedAt) return;
    const id = window.setInterval(() => setPauseTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [shift?.status, shift?.pausedAt]);

  const pauseElapsedSeconds =
    shift?.status === 'paused' && shift.pausedAt
      ? Math.max(
          0,
          Math.floor((Date.now() - new Date(shift.pausedAt).getTime()) / 1000),
        )
      : shift?.pauseElapsedSeconds ?? 0;

  // keep pauseTick referenced so timer re-renders
  void pauseTick;

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  };

  if (!initialized) return null;

  return (
    <div className={cn('mb-4', collapsed ? 'px-0' : '')}>
      {!shift ? (
        <Button
          type="button"
          className={cn('w-full', collapsed && 'h-9 w-9 px-0')}
          disabled={busy}
          title="Выйти на смену"
          onClick={() => void run(() => start())}
        >
          <Play className="h-4 w-4" />
          {!collapsed && (busy ? 'Запуск…' : 'Выйти на смену')}
        </Button>
      ) : (
        <div className={cn('space-y-2', collapsed && 'flex flex-col items-center')}>
          {shift.status === 'paused' && (
            <div
              className={cn(
                'flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-amber-700 dark:text-amber-300',
                collapsed && 'w-full justify-center px-1',
              )}
              title={`Пауза ${formatDuration(pauseElapsedSeconds)}`}
            >
              <Coffee className="h-4 w-4 shrink-0" />
              {!collapsed && (
                <div className="min-w-0">
                  <div className="text-xs font-medium">Пауза</div>
                  <div className="font-mono text-sm tabular-nums">
                    {formatDuration(pauseElapsedSeconds)}
                  </div>
                </div>
              )}
              {collapsed && (
                <span className="font-mono text-[10px] tabular-nums">
                  {formatDuration(pauseElapsedSeconds)}
                </span>
              )}
            </div>
          )}

          {shift.status === 'active' && !collapsed && (
            <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
              <Timer className="h-3.5 w-3.5" />
              <span>
                Смена с{' '}
                {new Date(shift.startedAt).toLocaleTimeString('ru-RU', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
          )}

          <div
            className={cn(
              'flex gap-2',
              collapsed ? 'flex-col items-center' : 'flex-wrap',
            )}
          >
            {shift.status === 'paused' ? (
              <Button
                type="button"
                variant="outline"
                className={cn(collapsed ? 'h-9 w-9 px-0' : 'flex-1')}
                disabled={busy}
                title="Продолжить"
                onClick={() => void run(() => resume())}
              >
                <Play className="h-4 w-4" />
                {!collapsed && 'Продолжить'}
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                className={cn(collapsed ? 'h-9 w-9 px-0' : 'flex-1')}
                disabled={busy}
                title="Пауза"
                onClick={() => void run(() => pause())}
              >
                <Coffee className="h-4 w-4" />
                {!collapsed && 'Пауза'}
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              className={cn(collapsed ? 'h-9 w-9 px-0' : 'flex-1')}
              disabled={busy}
              title="Завершить смену"
              onClick={() => setEndOpen(true)}
            >
              <Square className="h-4 w-4" />
              {!collapsed && 'Завершить'}
            </Button>
          </div>
        </div>
      )}

      {error && (
        <p
          className={cn(
            'mt-2 text-xs text-destructive',
            collapsed && 'text-center',
          )}
          role="alert"
        >
          {error}
        </p>
      )}

      <EndShiftDialog
        open={endOpen}
        shift={shift}
        onCancel={() => setEndOpen(false)}
        onConfirm={async ({ endedAt, comment }) => {
          await end({ endedAt, comment: comment || undefined });
          setEndOpen(false);
        }}
      />
    </div>
  );
}
