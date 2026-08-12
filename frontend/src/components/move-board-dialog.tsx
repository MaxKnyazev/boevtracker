import { useEffect, useMemo, useState } from 'react';
import { api, type Board, type Project, type Task } from '@/lib/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/input';
import { AppSelect } from '@/components/ui/select';

const NONE = '__none__';

export function MoveBoardDialog({
  task,
  boards,
  currentBoardId,
  onClose,
  onMoved,
}: {
  task: Task;
  boards: Board[];
  currentBoardId?: number | null;
  onClose: () => void;
  onMoved: () => Promise<void>;
}) {
  const activeBoardId = currentBoardId ?? task.project?.boardId ?? null;
  const otherBoards = useMemo(
    () =>
      boards.filter((b) => activeBoardId == null || b.id !== activeBoardId),
    [boards, activeBoardId],
  );
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

  const boardOptions = useMemo(
    () => [
      { value: NONE, label: 'Выберите доску' },
      ...otherBoards.map((b) => ({ value: String(b.id), label: b.name })),
    ],
    [otherBoards],
  );

  const projectOptions = useMemo(
    () => [
      { value: NONE, label: 'Выберите проект' },
      ...projects.map((p) => ({ value: String(p.id), label: p.name })),
    ],
    [projects],
  );

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
          Задача «{task.title}». Если статуса с тем же именем нет, будет выбран
          «Открыта».
        </p>
        <div className="space-y-3">
          {otherBoards.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Других рабочих пространств нет.
            </p>
          ) : (
            <>
              <div className="space-y-2">
                <Label>Доска</Label>
                <AppSelect
                  value={boardId === '' ? NONE : String(boardId)}
                  onValueChange={(v) =>
                    setBoardId(v === NONE ? '' : Number(v))
                  }
                  options={boardOptions}
                  className="w-full"
                />
              </div>
              <div className="space-y-2">
                <Label>Проект</Label>
                <AppSelect
                  value={projectId === '' ? NONE : String(projectId)}
                  onValueChange={(v) =>
                    setProjectId(v === NONE ? '' : Number(v))
                  }
                  options={projectOptions}
                  className="w-full"
                  disabled={!boardId}
                />
              </div>
            </>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button
            className="w-full cursor-pointer"
            onClick={() => void submit()}
            disabled={loading || otherBoards.length === 0 || !boardId || !projectId}
          >
            {loading ? 'Перенос...' : 'Перенести'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
