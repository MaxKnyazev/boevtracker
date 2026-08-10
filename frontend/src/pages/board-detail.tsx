import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  Plus,
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  LayoutGrid,
  Eye,
  EyeOff,
  Settings,
} from 'lucide-react';
import { api, type Board, type Project, type User } from '@/lib/api';
import { canDeleteBoardProject, canWrite, useAuthStore } from '@/store/auth';
import { EmptyState, PageHeader } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input, Label } from '@/components/ui/input';
import { TaskViewControls } from '@/components/task-view-controls';
import { ProjectPage } from '@/pages/project';
import { cn } from '@/lib/utils';
import {
  taskViewStorageKey,
  usePersistedTaskView,
  type TaskViewState,
} from '@/lib/task-view';
import type { TaskBucketCounts } from '@/lib/task-buckets';

const OVERVIEW_TAB = 'overview';

function hiddenProjectsKey(boardId: string | undefined) {
  return `boevtracker.board.${boardId ?? '0'}.hiddenProjects`;
}

function readHiddenProjectIds(boardId: string | undefined): Set<number> {
  try {
    const raw = localStorage.getItem(hiddenProjectsKey(boardId));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(
      parsed.filter((id): id is number => typeof id === 'number'),
    );
  } catch {
    return new Set();
  }
}

function writeHiddenProjectIds(boardId: string | undefined, ids: Set<number>) {
  try {
    localStorage.setItem(
      hiddenProjectsKey(boardId),
      JSON.stringify([...ids]),
    );
  } catch {
    // ignore
  }
}

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
  const [overviewView, setOverviewView] = usePersistedTaskView(
    taskViewStorageKey.board(boardId ?? '0'),
  );
  const [hiddenProjectIds, setHiddenProjectIds] = useState<Set<number>>(
    () => readHiddenProjectIds(boardId),
  );
  const [settingsProject, setSettingsProject] = useState<Project | null>(null);
  const [settingsName, setSettingsName] = useState('');
  const [settingsError, setSettingsError] = useState('');
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [deleteConfirmStep, setDeleteConfirmStep] = useState(0);

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

  const patchProjectCounts = (projectId: number, counts: TaskBucketCounts) => {
    setBoard((prev) => {
      if (!prev?.projects) return prev;
      return {
        ...prev,
        projects: prev.projects.map((p) =>
          p.id === projectId
            ? {
                ...p,
                _count: {
                  ...p._count,
                  openTasks: counts.openTasks,
                  inProgressTasks: counts.inProgressTasks,
                },
              }
            : p,
        ),
      };
    });
  };

  useEffect(() => {
    void load();
  }, [boardId]);

  useEffect(() => {
    setHiddenProjectIds(readHiddenProjectIds(boardId));
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

  const overviewProjects = orderedProjects.filter(
    (p) => !hiddenProjectIds.has(p.id),
  );

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

  const toggleOverviewVisibility = (projectId: number) => {
    setHiddenProjectIds((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      writeHiddenProjectIds(boardId, next);
      return next;
    });
  };

  const openSettings = (project: Project) => {
    setSettingsProject(project);
    setSettingsName(project.name);
    setSettingsError('');
    setDeleteConfirmStep(0);
  };

  const closeSettings = () => {
    setSettingsProject(null);
    setSettingsName('');
    setSettingsError('');
    setDeleteConfirmStep(0);
  };

  const saveProjectName = async (e: FormEvent) => {
    e.preventDefault();
    if (!settingsProject) return;
    const nextName = settingsName.trim();
    if (!nextName) {
      setSettingsError('Укажите название');
      return;
    }
    setSettingsSaving(true);
    setSettingsError('');
    try {
      await api.updateProject(settingsProject.id, nextName);
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

  const deleteProject = async () => {
    if (!settingsProject) return;
    const taskCount = settingsProject._count?.tasks ?? 0;
    if (taskCount > 0) {
      setSettingsError(
        'Нельзя удалить проект с задачами. Сначала удалите или перенесите задачи.',
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
      const id = settingsProject.id;
      await api.deleteProject(id);
      if (activeTab === String(id)) setTab(OVERVIEW_TAB);
      setHiddenProjectIds((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        writeHiddenProjectIds(boardId, next);
        return next;
      });
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

  const moveProject = async (projectId: number, direction: 'up' | 'down') => {
    if (!writable) return;
    const visibleIds = overviewProjects.map((p) => p.id);
    const visibleIndex = visibleIds.indexOf(projectId);
    if (visibleIndex < 0) return;
    const swapVisible =
      direction === 'up' ? visibleIndex - 1 : visibleIndex + 1;
    if (swapVisible < 0 || swapVisible >= visibleIds.length) return;

    const a = projectId;
    const b = visibleIds[swapVisible];
    const indexA = projectOrder.indexOf(a);
    const indexB = projectOrder.indexOf(b);
    if (indexA < 0 || indexB < 0) return;

    const next = [...projectOrder];
    [next[indexA], next[indexB]] = [next[indexB], next[indexA]];
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
        {orderedProjects.map((project) => {
          const isActive = activeTab === String(project.id);
          const openTasks = project._count?.openTasks ?? 0;
          const inProgressTasks = project._count?.inProgressTasks ?? 0;
          const hiddenFromOverview = hiddenProjectIds.has(project.id);
          return (
            <TabButton
              key={project.id}
              active={isActive}
              onClick={() => setTab(String(project.id))}
              title={`Количество открытых задач - ${openTasks}, Количество задач в работе - ${inProgressTasks}`}
            >
              <span className="truncate">{project.name}</span>
              <span
                className={cn(
                  'ml-2 inline-flex shrink-0 items-center tabular-nums',
                  isActive
                    ? 'text-primary-foreground/85'
                    : 'text-muted-foreground',
                )}
              >
                {openTasks}
                <span
                  className="mx-1.5 inline-block h-1 w-1 rounded-full bg-current opacity-70"
                  aria-hidden
                />
                {inProgressTasks}
              </span>
              <span
                role="button"
                tabIndex={0}
                className={cn(
                  'ml-0.5 cursor-pointer rounded p-0.5 transition-colors',
                  isActive
                    ? 'text-primary-foreground/80 hover:bg-primary-foreground/15 hover:text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleOverviewVisibility(project.id);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.stopPropagation();
                    toggleOverviewVisibility(project.id);
                  }
                }}
                title={
                  hiddenFromOverview
                    ? 'Показать в общем пространстве'
                    : 'Скрыть из общего пространства'
                }
              >
                {hiddenFromOverview ? (
                  <EyeOff className="h-3.5 w-3.5" />
                ) : (
                  <Eye className="h-3.5 w-3.5" />
                )}
              </span>
            </TabButton>
          );
        })}
      </div>

      {activeTab === OVERVIEW_TAB && (
        <>
          {!orderedProjects.length ? (
            <EmptyState
              title="Нет проектов"
              description="Создайте проект внутри доски"
            />
          ) : !overviewProjects.length ? (
            <EmptyState
              title="Все проекты скрыты"
              description="Нажмите на иконку глаза у проекта в меню, чтобы снова показать его здесь"
            />
          ) : (
            <div className="flex flex-col gap-8">
              <TaskViewControls
                view={overviewView}
                onChange={setOverviewView}
                users={users}
              />
              {overviewProjects.map((project, index) => (
                <ProjectBlock
                  key={project.id}
                  project={project}
                  writable={writable}
                  canMoveUp={index > 0}
                  canMoveDown={index < overviewProjects.length - 1}
                  taskView={overviewView}
                  filterUsers={users}
                  onOpenTab={() => setTab(String(project.id))}
                  onOpenSettings={() => openSettings(project)}
                  onMoveUp={() => void moveProject(project.id, 'up')}
                  onMoveDown={() => void moveProject(project.id, 'down')}
                  onTasksChanged={patchProjectCounts}
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
          onTasksChanged={patchProjectCounts}
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

      <Dialog
        open={settingsProject != null}
        onOpenChange={(next) => {
          if (!next) closeSettings();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Настройки проекта</DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => void saveProjectName(e)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="settings-project-name">Название</Label>
              <Input
                id="settings-project-name"
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

          {canDeleteBoardProject(user?.role) && settingsProject && (
            <div className="mt-6 space-y-3 border-t border-border pt-4">
              <div className="text-sm font-medium text-destructive">
                Удаление проекта
              </div>
              {(settingsProject._count?.tasks ?? 0) > 0 ? (
                <p className="text-sm text-muted-foreground">
                  Удаление недоступно: в проекте есть задачи (
                  {settingsProject._count?.tasks ?? 0}).
                </p>
              ) : deleteConfirmStep === 0 ? (
                <Button
                  type="button"
                  variant="destructive"
                  className="w-full"
                  disabled={settingsSaving}
                  onClick={() => void deleteProject()}
                >
                  Удалить проект
                </Button>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Подтвердите удаление проекта «{settingsProject.name}».
                    Это действие нельзя отменить.
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
                      onClick={() => void deleteProject()}
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

function TabButton({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        'inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-2 text-sm transition-colors',
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
  onOpenSettings,
  onMoveUp,
  onMoveDown,
  onTasksChanged,
}: {
  project: Project;
  writable: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  taskView: TaskViewState;
  filterUsers: User[];
  onOpenTab: () => void;
  onOpenSettings: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onTasksChanged?: (projectId: number, counts: TaskBucketCounts) => void;
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
        onTasksChanged={onTasksChanged}
        embeddedToolbar={
          <>
            {writable && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-muted-foreground"
                onClick={onOpenSettings}
                title="Настройки проекта"
              >
                <Settings className="h-4 w-4" />
              </Button>
            )}
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
