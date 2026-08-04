import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Trash2 } from 'lucide-react';
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

  const remove = async (id: number) => {
    if (!confirm('Удалить доску и все проекты?')) return;
    await api.deleteBoard(id);
    await load();
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
              <Link to={`/boards/${board.id}`} className="block">
                <h2 className="text-lg font-semibold group-hover:text-primary">{board.name}</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Проектов: {board._count?.projects ?? 0}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Создал: {board.createdBy ? `${board.createdBy.firstName} ${board.createdBy.lastName}`.trim() || board.createdBy.username : '—'}
                </p>
              </Link>
              {canDeleteBoardProject(user?.role) && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-2 top-2 text-muted-foreground hover:text-destructive"
                  onClick={() => remove(board.id)}
                >
                  <Trash2 className="h-4 w-4" />
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
          <form onSubmit={create} className="space-y-4">
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
    </div>
  );
}
