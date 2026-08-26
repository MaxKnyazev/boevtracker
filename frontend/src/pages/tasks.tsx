import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowDown, ArrowUp, ArrowUpDown, ExternalLink, ListTodo } from 'lucide-react';
import { api, taskActiveAssignee, type Project, type Task, type User } from '@/lib/api';
import { canWrite, useAuthStore } from '@/store/auth';
import { EmptyState, PageHeader } from '@/components/layout';
import { TaskViewControls } from '@/components/task-view-controls';
import { TaskModal } from '@/components/task-modal';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { displayName } from '@/components/user-avatar';
import {
  DEFAULT_TASK_VIEW,
  applyTaskView,
  taskViewStorageKey,
  usePersistedTaskView,
  type TaskSortField,
  type TaskViewState,
} from '@/lib/task-view';
import { PRIORITY_LABELS, formatDate, formatDuration, cn } from '@/lib/utils';
import { AssigneeStack } from '@/components/assignee-stack';
import { PaginationControls } from '@/components/pagination-controls';
import { usePagination } from '@/hooks/use-pagination';
import { paginateList, PAGINATION_PAGE_SIZE_KEYS } from '@/lib/pagination';
import { ReleasesPanel } from '@/pages/releases';

const priorityColor: Record<string, string> = {
  LOW: 'border-slate-500/40 text-slate-600 dark:text-slate-300',
  MEDIUM: 'border-blue-500/40 text-blue-700 dark:text-blue-300',
  HIGH: 'border-amber-500/40 text-amber-700 dark:text-amber-300',
  CRITICAL: 'border-red-500/40 text-red-700 dark:text-red-300',
};

type TasksTab = 'list' | 'releases';

const TAB_STORAGE_KEY = 'boevtracker.tasks.tab';

function readTab(): TasksTab {
  try {
    const raw = localStorage.getItem(TAB_STORAGE_KEY);
    if (raw === 'list' || raw === 'releases') return raw;
  } catch {
    // ignore
  }
  return 'list';
}

export function TasksPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTabState] = useState<TasksTab>(() => {
    const fromUrl = searchParams.get('tab');
    if (fromUrl === 'list' || fromUrl === 'releases') return fromUrl;
    return readTab();
  });

  const setTab = useCallback(
    (next: TasksTab) => {
      setTabState(next);
      try {
        localStorage.setItem(TAB_STORAGE_KEY, next);
      } catch {
        // ignore
      }
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev);
          params.set('tab', next);
          return params;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  useEffect(() => {
    const fromUrl = searchParams.get('tab');
    if (fromUrl === 'list' || fromUrl === 'releases') {
      setTabState((current) => (current === fromUrl ? current : fromUrl));
      try {
        localStorage.setItem(TAB_STORAGE_KEY, fromUrl);
      } catch {
        // ignore
      }
      return;
    }
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        if (params.get('tab') === tab) return prev;
        params.set('tab', tab);
        return params;
      },
      { replace: true },
    );
  }, [searchParams, setSearchParams, tab]);

  return (
    <div>
      <PageHeader
        title="Задачи"
        description="Список задач и релизы"
      />

      <div
        className="mb-4 inline-flex rounded-lg border border-border bg-muted/30 p-1"
        role="tablist"
        aria-label="Разделы задач"
      >
        <TabButton active={tab === 'list'} onClick={() => setTab('list')}>
          Список задач
        </TabButton>
        <TabButton
          active={tab === 'releases'}
          onClick={() => setTab('releases')}
        >
          Релизы
        </TabButton>
      </div>

      {tab === 'releases' ? <ReleasesPanel /> : <TasksListPanel />}
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
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={cn(
        'rounded-md px-3 py-1.5 text-sm transition-colors',
        active
          ? 'bg-background text-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground',
      )}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function TasksListPanel() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const writable = canWrite(user?.role);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [view, setView] = usePersistedTaskView(taskViewStorageKey.tasks);
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [taskData, assignable] = await Promise.all([
        api.tasks(),
        api.assignableUsers(),
      ]);
      setTasks(taskData.tasks);
      setUsers(assignable.users);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const boards = useMemo(
    () => {
      const map = new Map<number, string>();
      for (const task of tasks) {
        const board = task.project?.board;
        if (board) map.set(board.id, board.name);
      }
      return [...map.entries()]
        .map(([id, name]) => ({ value: String(id), label: name }))
        .sort((a, b) => a.label.localeCompare(b.label, 'ru'));
    },
    [tasks],
  );

  const projects = useMemo(() => {
    const map = new Map<number, { id: number; name: string; boardId: number }>();
    for (const task of tasks) {
      const project = task.project;
      if (!project) continue;
      if (view.board !== 'all' && String(project.boardId) !== view.board) {
        continue;
      }
      map.set(project.id, {
        id: project.id,
        name: project.name,
        boardId: project.boardId,
      });
    }
    return [...map.values()]
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
      .map((p) => ({ value: String(p.id), label: p.name }));
  }, [tasks, view.board]);

  const statuses = useMemo(() => {
    const names = new Set<string>();
    for (const task of tasks) {
      const name = task.status?.name?.trim();
      if (name) names.add(name);
    }
    return [...names]
      .sort((a, b) => a.localeCompare(b, 'ru'))
      .map((name) => ({ value: name, label: name }));
  }, [tasks]);

  useEffect(() => {
    if (loading) return;

    if (
      view.board !== 'all' &&
      !boards.some((b) => b.value === view.board)
    ) {
      setView((prev) => ({ ...prev, board: 'all', project: 'all' }));
      return;
    }

    if (
      view.project !== 'all' &&
      !projects.some((p) => p.value === view.project)
    ) {
      setView((prev) => ({ ...prev, project: 'all' }));
      return;
    }

    if (
      view.status !== 'all' &&
      !statuses.some((s) => s.value === view.status)
    ) {
      setView((prev) => ({ ...prev, status: 'all' }));
    }
  }, [
    loading,
    boards,
    projects,
    statuses,
    view.board,
    view.project,
    view.status,
    setView,
  ]);

  const visibleTasks = useMemo(
    () => applyTaskView(tasks, view),
    [tasks, view],
  );

  const { page, setPage, pageSize, setPageSize } = usePagination(
    PAGINATION_PAGE_SIZE_KEYS.tasks,
    [view],
  );
  const taskPage = useMemo(
    () => paginateList(visibleTasks, page, pageSize),
    [visibleTasks, page, pageSize],
  );

  const openTask = async (task: Task) => {
    setSelectedTaskId(task.id);
    try {
      const data = await api.project(task.projectId);
      setSelectedProject(data.project);
    } catch {
      setSelectedProject(null);
    }
  };

  const cycleSort = (field: Exclude<TaskSortField, 'order'>) => {
    setView((prev) => {
      if (prev.sortField !== field) {
        return {
          ...prev,
          sortField: field,
          sortDir: field === 'createdAt' ? 'desc' : 'asc',
        };
      }
      if (
        field === 'createdAt'
          ? prev.sortDir === 'desc'
          : prev.sortDir === 'asc'
      ) {
        return {
          ...prev,
          sortDir: prev.sortDir === 'asc' ? 'desc' : 'asc',
        };
      }
      return {
        ...prev,
        sortField: DEFAULT_TASK_VIEW.sortField,
        sortDir: DEFAULT_TASK_VIEW.sortDir,
      };
    });
  };

  return (
    <div>
      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}

      <TaskViewControls
        view={view}
        onChange={setView}
        users={users}
        boards={boards}
        projects={projects}
        statuses={statuses}
        showSort={false}
        className="mb-4"
      />

      {loading ? (
        <p className="text-muted-foreground">Загрузка...</p>
      ) : visibleTasks.length === 0 ? (
        <EmptyState
          title={tasks.length === 0 ? 'Нет задач' : 'Ничего не найдено'}
          description={
            tasks.length === 0
              ? 'Создайте задачу в любом проекте'
              : 'Измените фильтры или сортировку'
          }
          icon={<ListTodo className="h-10 w-10" />}
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[960px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-left text-xs text-muted-foreground">
                <th className="w-10 px-2 py-2.5" aria-label="Открыть в проекте" />
                <SortableTh
                  label="Задача"
                  field="title"
                  view={view}
                  onCycle={cycleSort}
                />
                <SortableTh
                  label="Доска"
                  field="board"
                  view={view}
                  onCycle={cycleSort}
                />
                <SortableTh
                  label="Проект"
                  field="project"
                  view={view}
                  onCycle={cycleSort}
                />
                <SortableTh
                  label="Статус"
                  field="status"
                  view={view}
                  onCycle={cycleSort}
                />
                <SortableTh
                  label="Приоритет"
                  field="priority"
                  view={view}
                  onCycle={cycleSort}
                />
                <SortableTh
                  label="Исполнитель"
                  field="assignee"
                  view={view}
                  onCycle={cycleSort}
                />
                <SortableTh
                  label="Создана"
                  field="createdAt"
                  view={view}
                  onCycle={cycleSort}
                />
                <SortableTh
                  label="Дедлайн"
                  field="deadline"
                  view={view}
                  onCycle={cycleSort}
                />
                <SortableTh
                  label="В статусе"
                  field="statusTime"
                  view={view}
                  onCycle={cycleSort}
                />
              </tr>
            </thead>
            <tbody>
              {taskPage.items.map((task) => (
                <tr
                  key={task.id}
                  className="cursor-pointer border-b border-border/70 transition-colors hover:bg-accent/40"
                  onClick={() => void openTask(task)}
                >
                  <td className="px-2 py-2.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground"
                      title="Открыть задачу в проекте"
                      disabled={!task.project?.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        const projectId = task.project?.id;
                        if (!projectId) return;
                        const boardId =
                          task.project?.boardId ?? task.project?.board?.id;
                        if (boardId) {
                          navigate(
                            `/boards/${boardId}?tab=${projectId}&task=${task.id}`,
                          );
                        } else {
                          navigate(`/projects/${projectId}?task=${task.id}`);
                        }
                      }}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </td>
                  <td className="max-w-[280px] px-3 py-2.5">
                    <div className="truncate font-medium" title={task.title}>
                      {task.title}
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    {task.project?.board ? (
                      <Link
                        to={`/boards/${task.project.board.id}`}
                        className="text-muted-foreground hover:text-primary"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {task.project.board.name}
                      </Link>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    {task.project ? (
                      <Link
                        to={`/boards/${task.project.boardId}?tab=${task.project.id}`}
                        className="text-muted-foreground hover:text-primary"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {task.project.name}
                      </Link>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">
                    {task.status?.name || '—'}
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge className={cn(priorityColor[task.priority])}>
                      {PRIORITY_LABELS[task.priority]}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <AssigneeStack task={task} size="sm" />
                      <span className="truncate text-muted-foreground">
                        {taskActiveAssignee(task)
                          ? displayName(taskActiveAssignee(task))
                          : 'Нет исполнителя'}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">
                    {formatDate(task.createdAt)}
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">
                    {formatDate(task.deadline)}
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">
                    {formatDuration(task.statusChangedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && visibleTasks.length > 0 && (
        <PaginationControls
          result={taskPage}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      )}

      {selectedTaskId != null && (
        <TaskModal
          taskId={selectedTaskId}
          users={users}
          project={selectedProject}
          writable={writable}
          onClose={() => {
            setSelectedTaskId(null);
            setSelectedProject(null);
          }}
          onChanged={load}
        />
      )}
    </div>
  );
}

function SortableTh({
  label,
  field,
  view,
  onCycle,
}: {
  label: string;
  field: Exclude<TaskSortField, 'order'>;
  view: TaskViewState;
  onCycle: (field: Exclude<TaskSortField, 'order'>) => void;
}) {
  const active = view.sortField === field;
  const Icon = !active
    ? ArrowUpDown
    : view.sortDir === 'asc'
      ? ArrowUp
      : ArrowDown;

  return (
    <th className="px-3 py-2.5 font-medium">
      <button
        type="button"
        className={cn(
          'inline-flex items-center gap-1 rounded-sm transition-colors hover:text-foreground',
          active ? 'text-foreground' : 'text-muted-foreground',
        )}
        onClick={() => onCycle(field)}
        title={
          !active
            ? 'По умолчанию'
            : view.sortDir === 'asc'
              ? 'По возрастанию'
              : 'По убыванию'
        }
      >
        <span>{label}</span>
        <Icon
          className={cn(
            'h-3.5 w-3.5 shrink-0',
            active ? 'opacity-90' : 'opacity-45',
          )}
          aria-hidden
        />
      </button>
    </th>
  );
}
