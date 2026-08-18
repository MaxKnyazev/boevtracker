import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label, Textarea } from '@/components/ui/input';

export function CloseTaskDialog({
  open,
  taskTitle,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  taskTitle?: string;
  onCancel: () => void;
  onConfirm: (comment: string) => void | Promise<void>;
}) {
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setComment('');
    setError('');
    setSaving(false);
  }, [open]);

  const submit = async () => {
    setSaving(true);
    setError('');
    try {
      await onConfirm(comment.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка завершения');
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !saving) onCancel();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Завершить задачу</DialogTitle>
        </DialogHeader>
        {taskTitle ? (
          <p className="text-sm text-muted-foreground">
            Подтвердите закрытие задачи «{taskTitle}». Комментарий появится в
            чате.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Подтвердите закрытие задачи. Комментарий появится в чате.
          </p>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="close-task-comment">Комментарий</Label>
          <Textarea
            id="close-task-comment"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Что сделано, на что обратить внимание…"
            rows={4}
            disabled={saving}
            maxLength={5000}
          />
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={saving}
          >
            Отмена
          </Button>
          <Button type="button" onClick={() => void submit()} disabled={saving}>
            {saving ? 'Завершение…' : 'Завершить'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
