import { useEffect, useState } from 'react';
import { api, type Board, type Project, type Task } from '@/lib/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/input';

export function MoveBoardDialog({
  task,
  boards,
  onClose,
  onMoved,
}: {
  task: Task;
  boards: Board[];
  onClose: () => void;
  onMoved: () => Promise<void>;
}) {
  const [boardId, setBoardId] = useState<number | ''>('');
  const [projectId, setProjectId] = useState<number | ''>('');
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!boardId) {
      setProjects([]);
      setProjectId('');
      return;
    }
    void api.board(boardId).then((data) => {
      setProjects(data.board.projects || []);
      setProjectId('');
    });
  }, [boardId]);

  const submit = async () => {
    if (!boardId || !projectId) {
      setError('Выберите доску и проект');
      return;
    }
    setLoading(true);
    try {
      await api.moveTaskBoard(task.id, {
        boardId: Number(boardId),
        projectId: Number(projectId),
      });
      await onMoved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка переноса');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Перенести на другую доску</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Задача «{task.title}». Если статуса с тем же именем нет, будет выбран «Открыта».
        </p>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Доска</Label>
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={boardId}
              onChange={(e) => setBoardId(e.target.value ? Number(e.target.value) : '')}
            >
              <option value="">Выберите доску</option>
              {boards.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>Проект</Label>
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value ? Number(e.target.value) : '')}
              disabled={!boardId}
            >
              <option value="">Выберите проект</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button className="w-full" onClick={submit} disabled={loading}>
            {loading ? 'Перенос...' : 'Перенести'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
