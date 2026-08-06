import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Settings } from 'lucide-react';
import { api, type Board } from '@/lib/api';
import { canDeleteBoardProject, canWrite, useAuthStore } from '@/store/auth';
import { EmptyState, PageHeader } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input, Label } from '@/components/ui/input';

export function BoardsPage() {
  const user = useAuthStore((s) => s.user);
  const [boards, setBoards] = useState<Board[]>([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const [settingsBoard, setSettingsBoard] = useState<Board | null>(null);
  const [settingsName, setSettingsName] = useState('');
  const [settingsError, setSettingsError] = useState('');
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [deleteConfirmStep, setDeleteConfirmStep] = useState(0);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.boards();
      setBoards(data.boards);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api.createBoard(name.trim());
      setName('');
      setOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка создания');
    }
  };

  const openSettings = (board: Board) => {
    setSettingsBoard(board);
    setSettingsName(board.name);
    setSettingsError('');
    setDeleteConfirmStep(0);
  };

  const closeSettings = () => {
    setSettingsBoard(null);
    setSettingsName('');
    setSettingsError('');
    setDeleteConfirmStep(0);
  };

  const saveBoardName = async (e: FormEvent) => {
    e.preventDefault();
    if (!settingsBoard) return;
    const nextName = settingsName.trim();
    if (!nextName) {
      setSettingsError('Укажите название');
      return;
    }
    setSettingsSaving(true);
    setSettingsError('');
    try {
      await api.updateBoard(settingsBoard.id, nextName);
      await load();
      closeSettings();
    } catch (err) {
      setSettingsError(
        err instanceof Error ? err.message : 'Не удалось сохранить',
      );
    } finally {
      setSettingsSaving(false);
    }
  };

  const deleteBoard = async () => {
    if (!settingsBoard) return;
    const projectCount = settingsBoard._count?.projects ?? 0;
    if (projectCount > 0) {
      setSettingsError(
        'Нельзя удалить рабочее пространство с проектами. Сначала удалите проекты.',
      );
      setDeleteConfirmStep(0);
      return;
    }
    if (deleteConfirmStep < 1) {
      setDeleteConfirmStep(1);
      setSettingsError('');
      return;
    }
    setSettingsSaving(true);
    setSettingsError('');
    try {
      await api.deleteBoard(settingsBoard.id);
      closeSettings();
      await load();
    } catch (err) {
      setSettingsError(
        err instanceof Error ? err.message : 'Не удалось удалить',
      );
      setDeleteConfirmStep(0);
    } finally {
      setSettingsSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Рабочие пространства"
        description="Доски с проектами и задачами"
        actions={
          canWrite(user?.role) ? (
            <Button onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4" />
              Создать доску
            </Button>
          ) : undefined
        }
      />

      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}

      {loading ? (
        <p className="text-muted-foreground">Загрузка...</p>
      ) : boards.length === 0 ? (
        <EmptyState
          title="Пока нет досок"
          description="Создайте первое рабочее пространство"
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {boards.map((board) => (
            <div
              key={board.id}
              className="group relative rounded-xl border border-border bg-card p-5 transition hover:border-primary/50"
            >
              <Link to={`/boards/${board.id}`} className="block pr-10">
                <h2 className="text-lg font-semibold group-hover:text-primary">
                  {board.name}
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Проектов: {board._count?.projects ?? 0}
                </p>
                <div className="mt-3 flex flex-col gap-1 text-sm">
                  <span className="text-foreground">
                    Открытых задач:{' '}
                    <span className="font-medium tabular-nums">
                      {board._count?.openTasks ?? 0}
                    </span>
                  </span>
                  <span className="text-foreground">
                    Задач в работе:{' '}
                    <span className="font-medium tabular-nums">
                      {board._count?.inProgressTasks ?? 0}
                    </span>
                  </span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Создал:{' '}
                  {board.createdBy
                    ? `${board.createdBy.firstName} ${board.createdBy.lastName}`.trim() ||
                      board.createdBy.username
                    : '—'}
                </p>
              </Link>
              {canWrite(user?.role) && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
                  onClick={() => openSettings(board)}
                  title="Настройки"
                >
                  <Settings className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Новая доска</DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => void create(e)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="board-name">Название</Label>
              <Input
                id="board-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoFocus
              />
            </div>
            <Button type="submit" className="w-full">
              Создать
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={settingsBoard != null}
        onOpenChange={(next) => {
          if (!next) closeSettings();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Настройки рабочего пространства</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => void saveBoardName(e)}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="settings-board-name">Название</Label>
              <Input
                id="settings-board-name"
                value={settingsName}
                onChange={(e) => {
                  setSettingsName(e.target.value);
                  setDeleteConfirmStep(0);
                }}
                required
                disabled={settingsSaving}
                autoFocus
              />
            </div>
            {settingsError && (
              <p className="text-sm text-destructive">{settingsError}</p>
            )}
            <Button
              type="submit"
              className="w-full"
              disabled={settingsSaving || !settingsName.trim()}
            >
              {settingsSaving ? 'Сохранение...' : 'Сохранить название'}
            </Button>
          </form>

          {canDeleteBoardProject(user?.role) && settingsBoard && (
            <div className="mt-6 space-y-3 border-t border-border pt-4">
              <div className="text-sm font-medium text-destructive">
                Удаление рабочего пространства
              </div>
              {(settingsBoard._count?.projects ?? 0) > 0 ? (
                <p className="text-sm text-muted-foreground">
                  Удаление недоступно: есть проекты (
                  {settingsBoard._count?.projects ?? 0}).
                </p>
              ) : deleteConfirmStep === 0 ? (
                <Button
                  type="button"
                  variant="destructive"
                  className="w-full"
                  disabled={settingsSaving}
                  onClick={() => void deleteBoard()}
                >
                  Удалить
                </Button>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Подтвердите удаление «{settingsBoard.name}». Это действие
                    нельзя отменить.
                  </p>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="flex-1"
                      disabled={settingsSaving}
                      onClick={() => setDeleteConfirmStep(0)}
                    >
                      Отмена
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      className="flex-1"
                      disabled={settingsSaving}
                      onClick={() => void deleteBoard()}
                    >
                      {settingsSaving ? 'Удаление...' : 'Да, удалить'}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
