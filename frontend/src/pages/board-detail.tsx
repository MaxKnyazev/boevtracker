import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Plus, Trash2, ArrowLeft, ArrowUp, ArrowDown, LayoutGrid } from 'lucide-react';
import { api, type Board, type Project, type User } from '@/lib/api';
import { canDeleteBoardProject, canWrite, useAuthStore } from '@/store/auth';
import { EmptyState, PageHeader } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input, Label } from '@/components/ui/input';
import { TaskViewControls } from '@/components/task-view-controls';
import { ProjectPage } from '@/pages/project';
import { cn } from '@/lib/utils';
import { DEFAULT_TASK_VIEW, type TaskViewState } from '@/lib/task-view';

const OVERVIEW_TAB = 'overview';

export function BoardDetailPage() {
  const { boardId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const user = useAuthStore((s) => s.user);
  const writable = canWrite(user?.role);

  const [board, setBoard] = useState<Board | null>(null);
  const [projectOrder, setProjectOrder] = useState<number[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [overviewView, setOverviewView] =
    useState<TaskViewState>(DEFAULT_TASK_VIEW);

  const activeTab = searchParams.get('tab') || OVERVIEW_TAB;

  const load = async () => {
    try {
      const [data, assignable] = await Promise.all([
        api.board(Number(boardId)),
        api.assignableUsers(),
      ]);
      setBoard(data.board);
      setUsers(assignable.users);
      const ordered = [...(data.board.projects || [])]
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.id - b.id)
        .map((p) => p.id);
      setProjectOrder(ordered);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    }
  };

  useEffect(() => {
    void load();
  }, [boardId]);

  const projectsById = useMemo(() => {
    const map = new Map<number, Project>();
    for (const p of board?.projects || []) {
      map.set(p.id, p);
    }
    return map;
  }, [board]);

  const orderedProjects = projectOrder
    .map((id) => projectsById.get(id))
    .filter((p): p is Project => !!p);

  const setTab = (tab: string) => {
    setSearchParams(tab === OVERVIEW_TAB ? {} : { tab });
  };

  const create = async (e: FormEvent) => {
    e.preventDefault();
    const res = await api.createProject(Number(boardId), name.trim());
    setName('');
    setOpen(false);
    await load();
    setTab(String(res.project.id));
  };

  const remove = async (id: number) => {
    if (!confirm('Удалить проект?')) return;
    await api.deleteProject(id);
    if (activeTab === String(id)) setTab(OVERVIEW_TAB);
    await load();
  };

  const moveProject = async (projectId: number, direction: 'up' | 'down') => {
    if (!writable) return;
    const index = projectOrder.indexOf(projectId);
    if (index < 0) return;
    const swapWith = direction === 'up' ? index - 1 : index + 1;
    if (swapWith < 0 || swapWith >= projectOrder.length) return;

    const next = [...projectOrder];
    [next[index], next[swapWith]] = [next[swapWith], next[index]];
    setProjectOrder(next);

    try {
      await api.reorderProjects(Number(boardId), next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка сортировки');
      await load();
    }
  };

  if (!board && !error) {
    return <p className="text-muted-foreground">Загрузка...</p>;
  }

  const selectedProjectId =
    activeTab !== OVERVIEW_TAB ? Number(activeTab) : null;
  const selectedExists =
    selectedProjectId != null && projectsById.has(selectedProjectId);

  return (
    <div>
      <Link
        to="/"
        className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        К доскам
      </Link>

      <PageHeader
        title={board?.name || 'Доска'}
        description="Рабочее пространство и проекты"
        actions={
          writable ? (
            <Button onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4" />
              Создать проект
            </Button>
          ) : undefined
        }
      />

      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}

      <div className="mb-6 flex flex-wrap items-center gap-2 border-b border-border pb-3">
        <TabButton
          active={activeTab === OVERVIEW_TAB}
          onClick={() => setTab(OVERVIEW_TAB)}
        >
          <LayoutGrid className="h-3.5 w-3.5" />
          Общее пространство
        </TabButton>
        {orderedProjects.map((project) => (
          <TabButton
            key={project.id}
            active={activeTab === String(project.id)}
            onClick={() => setTab(String(project.id))}
          >
            {project.name}
            {canDeleteBoardProject(user?.role) && (
              <span
                role="button"
                tabIndex={0}
                className="ml-1 rounded p-0.5 text-muted-foreground hover:bg-destructive/20 hover:text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  void remove(project.id);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.stopPropagation();
                    void remove(project.id);
                  }
                }}
                title="Удалить проект"
              >
                <Trash2 className="h-3 w-3" />
              </span>
            )}
          </TabButton>
        ))}
      </div>

      {activeTab === OVERVIEW_TAB && (
        <>
          {!orderedProjects.length ? (
            <EmptyState
              title="Нет проектов"
              description="Создайте проект внутри доски"
            />
          ) : (
            <div className="flex flex-col gap-8">
              <TaskViewControls
                view={overviewView}
                onChange={setOverviewView}
                users={users}
              />
              {orderedProjects.map((project, index) => (
                <ProjectBlock
                  key={project.id}
                  project={project}
                  writable={writable}
                  canMoveUp={index > 0}
                  canMoveDown={index < orderedProjects.length - 1}
                  taskView={overviewView}
                  filterUsers={users}
                  onOpenTab={() => setTab(String(project.id))}
                  onMoveUp={() => void moveProject(project.id, 'up')}
                  onMoveDown={() => void moveProject(project.id, 'down')}
                />
              ))}
            </div>
          )}
        </>
      )}

      {activeTab !== OVERVIEW_TAB && selectedExists && (
        <ProjectPage
          projectId={selectedProjectId!}
          embedded
          hideSiblingProjects
        />
      )}

      {activeTab !== OVERVIEW_TAB && !selectedExists && (
        <EmptyState
          title="Проект не найден"
          description="Выберите другой проект или общее пространство"
        />
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Новый проект</DialogTitle>
          </DialogHeader>
          <form onSubmit={create} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="project-name">Название</Label>
              <Input
                id="project-name"
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

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm transition-colors',
        active
          ? 'bg-primary text-primary-foreground'
          : 'bg-muted/40 text-muted-foreground hover:bg-accent hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}

function ProjectBlock({
  project,
  writable,
  canMoveUp,
  canMoveDown,
  taskView,
  filterUsers,
  onOpenTab,
  onMoveUp,
  onMoveDown,
}: {
  project: Project;
  writable: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  taskView: TaskViewState;
  filterUsers: User[];
  onOpenTab: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  return (
    <section>
      <ProjectPage
        projectId={project.id}
        embedded
        hideSiblingProjects
        showTaskViewControls={false}
        taskView={taskView}
        filterUsers={filterUsers}
        embeddedToolbar={
          <>
            <button
              type="button"
              onClick={onOpenTab}
              className="cursor-pointer truncate text-left text-lg font-semibold hover:text-primary"
              title="Открыть вкладку проекта"
            >
              {project.name}
            </button>
            {writable && canMoveUp && (
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={onMoveUp}
                title="Переместить вверх"
              >
                <ArrowUp className="h-4 w-4" />
              </Button>
            )}
            {writable && canMoveDown && (
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={onMoveDown}
                title="Переместить вниз"
              >
                <ArrowDown className="h-4 w-4" />
              </Button>
            )}
          </>
        }
      />
    </section>
  );
}
