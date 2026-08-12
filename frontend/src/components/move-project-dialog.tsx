import { useEffect, useMemo, useState } from 'react';
import { api, type Project, type Task } from '@/lib/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/input';
import { AppSelect } from '@/components/ui/select';

const NONE = '__none__';

export function MoveProjectDialog({
  task,
  projects: projectsProp,
  currentBoardId,
  onClose,
  onMoved,
}: {
  task: Task;
  projects: Project[];
  currentBoardId?: number | null;
  onClose: () => void;
  onMoved: () => Promise<void>;
}) {
  const [projects, setProjects] = useState(projectsProp);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const boardId = currentBoardId ?? task.project?.boardId ?? null;

  useEffect(() => {
    setProjects(projectsProp);
  }, [projectsProp]);

  useEffect(() => {
    if (projectsProp.length > 0 || boardId == null) return;
    setLoadingProjects(true);
    void api
      .board(boardId)
      .then((data) => setProjects(data.board.projects || []))
      .finally(() => setLoadingProjects(false));
  }, [projectsProp.length, boardId]);

  const options = useMemo(
    () => projects.filter((p) => p.id !== task.projectId),
    [projects, task.projectId],
  );
  const [projectId, setProjectId] = useState<number | ''>('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const projectOptions = useMemo(
    () => [
      { value: NONE, label: 'Выберите проект' },
      ...options.map((p) => ({ value: String(p.id), label: p.name })),
    ],
    [options],
  );

  const submit = async () => {
    if (!projectId || boardId == null) {
      setError('Выберите проект');
      return;
    }
    setLoading(true);
    try {
      await api.moveTaskBoard(task.id, {
        boardId,
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
          <DialogTitle>Перенести в другой проект</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Задача «{task.title}». Проект в текущем рабочем пространстве
          {task.project?.board?.name ? ` «${task.project.board.name}»` : ''}.
          Если статуса с тем же именем нет, будет выбран «Открыта».
        </p>
        <div className="space-y-3">
          {loadingProjects ? (
            <p className="text-sm text-muted-foreground">Загрузка проектов…</p>
          ) : options.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              В этом рабочем пространстве нет других проектов.
            </p>
          ) : (
            <div className="space-y-2">
              <Label>Проект</Label>
              <AppSelect
                value={projectId === '' ? NONE : String(projectId)}
                onValueChange={(v) =>
                  setProjectId(v === NONE ? '' : Number(v))
                }
                options={projectOptions}
                className="w-full"
              />
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1 cursor-pointer"
              onClick={onClose}
            >
              Отмена
            </Button>
            <Button
              type="button"
              className="flex-1 cursor-pointer"
              onClick={() => void submit()}
              disabled={
                loading || loadingProjects || options.length === 0 || !projectId
              }
            >
              {loading ? 'Перенос...' : 'Перенести'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
