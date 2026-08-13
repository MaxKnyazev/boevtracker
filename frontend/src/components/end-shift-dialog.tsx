import { useEffect, useMemo, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label, Textarea } from '@/components/ui/input';
import { DateTimePicker } from '@/components/ui/datetime-picker';
import type { WorkShift } from '@/lib/api';
import { formatDateTime, formatSeconds } from '@/lib/utils';

export function EndShiftDialog({
  open,
  shift,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  shift: WorkShift | null;
  onCancel: () => void;
  onConfirm: (payload: {
    endedAt: string;
    comment: string;
  }) => void | Promise<void>;
}) {
  const [anchorAt, setAnchorAt] = useState<Date | null>(null);
  const [endedAt, setEndedAt] = useState<Date | null>(null);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [completedPauseSeconds, setCompletedPauseSeconds] = useState(0);

  useEffect(() => {
    if (!open || !shift) return;
    const now = new Date();
    setAnchorAt(now);
    setEndedAt(now);
    setComment('');
    setError('');
    setSaving(false);
    const openPauseSeconds =
      shift.status === 'paused' && shift.pausedAt
        ? Math.max(
            0,
            Math.floor(
              (now.getTime() - new Date(shift.pausedAt).getTime()) / 1000,
            ),
          )
        : 0;
    setCompletedPauseSeconds(
      Math.max(0, (shift.totalPauseSeconds ?? 0) - openPauseSeconds),
    );
  }, [open, shift]);

  const totalPauseSeconds = useMemo(() => {
    if (!shift) return 0;
    let openSeconds = 0;
    if (shift.status === 'paused' && shift.pausedAt && endedAt) {
      const pauseStart = new Date(shift.pausedAt).getTime();
      openSeconds = Math.max(
        0,
        Math.floor((endedAt.getTime() - pauseStart) / 1000),
      );
    }
    return completedPauseSeconds + openSeconds;
  }, [shift, endedAt, completedPauseSeconds]);

  const totals = useMemo(() => {
    if (!shift || !endedAt) {
      return { withBreaks: 0, withoutBreaks: 0 };
    }
    const startMs = new Date(shift.startedAt).getTime();
    const endMs = endedAt.getTime();
    const withBreaks = Math.max(0, Math.floor((endMs - startMs) / 1000));
    const withoutBreaks = Math.max(0, withBreaks - totalPauseSeconds);
    return { withBreaks, withoutBreaks };
  }, [shift, endedAt, totalPauseSeconds]);

  const minDate = shift ? new Date(shift.startedAt) : undefined;
  const maxDate = anchorAt ?? undefined;

  const resetToOpenMoment = () => {
    if (!anchorAt) return;
    setEndedAt(new Date(anchorAt));
    setError('');
  };

  const submit = async () => {
    if (!shift || !endedAt || !anchorAt) return;

    if (endedAt.getTime() < new Date(shift.startedAt).getTime()) {
      setError('Время окончания не может быть раньше начала смены');
      return;
    }
    if (endedAt.getTime() > anchorAt.getTime()) {
      setError('Время окончания не может быть позже момента завершения');
      return;
    }

    setSaving(true);
    setError('');
    try {
      await onConfirm({
        endedAt: endedAt.toISOString(),
        comment: comment.trim(),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка завершения смены');
    } finally {
      setSaving(false);
    }
  };

  const dirty =
    !!anchorAt &&
    !!endedAt &&
    (endedAt.getFullYear() !== anchorAt.getFullYear() ||
      endedAt.getMonth() !== anchorAt.getMonth() ||
      endedAt.getDate() !== anchorAt.getDate() ||
      endedAt.getHours() !== anchorAt.getHours() ||
      endedAt.getMinutes() !== anchorAt.getMinutes());

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !saving) onCancel();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Завершить смену</DialogTitle>
        </DialogHeader>

        {shift && (
          <div className="space-y-4">
            <div>
              <Label>Начало смены</Label>
              <div className="mt-1.5 text-sm text-muted-foreground">
                {formatDateTime(shift.startedAt)}
              </div>
            </div>

            <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-3">
              <div className="flex items-center justify-between gap-2">
                <Label>Конец смены</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-xs"
                  disabled={saving || !dirty}
                  onClick={resetToOpenMoment}
                  title="Вернуть время нажатия «Завершить»"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Сбросить
                </Button>
              </div>

              <DateTimePicker
                value={endedAt}
                onChange={setEndedAt}
                min={minDate}
                max={maxDate}
                disabled={saving}
              />

              <p className="text-xs text-muted-foreground">
                Не раньше начала смены
                {anchorAt ? ` и не позже ${formatDateTime(anchorAt)}` : ''}.
              </p>
            </div>

            <div className="rounded-xl border border-border bg-muted/20 px-3 py-3">
              <Label>Итоговое рабочее время</Label>
              <div className="mt-2 space-y-1.5 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Общее время</span>
                  <span className="font-medium tabular-nums">
                    {formatSeconds(totals.withoutBreaks)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">С перерывами</span>
                  <span className="font-medium tabular-nums">
                    {formatSeconds(totals.withBreaks)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Перерывы</span>
                  <span className="font-medium tabular-nums">
                    {formatSeconds(totalPauseSeconds, { withSeconds: true })}
                  </span>
                </div>
              </div>
            </div>

            <div>
              <Label htmlFor="shift-comment">Комментарий</Label>
              <Textarea
                id="shift-comment"
                className="mt-1.5"
                rows={3}
                maxLength={2000}
                placeholder="Необязательно"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
            </div>

            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={onCancel}
              >
                Отмена
              </Button>
              <Button
                type="button"
                disabled={saving || !endedAt}
                onClick={() => void submit()}
              >
                {saving ? 'Завершение…' : 'Завершить смену'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
