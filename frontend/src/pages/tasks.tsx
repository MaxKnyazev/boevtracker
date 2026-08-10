import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowUp, ArrowUpDown, ListTodo } from 'lucide-react';
import { api, type Project, type Task, type User } from '@/lib/api';
import { canWrite, useAuthStore } from '@/store/auth';
import { EmptyState, PageHeader } from '@/components/layout';
import { TaskViewControls } from '@/components/task-view-controls';
import { TaskModal } from '@/components/task-modal';
import { Badge } from '@/components/ui/badge';
import {
  EmptyAssigneeAvatar,
  UserAvatar,
  displayName,
} from '@/components/user-avatar';
import {
  DEFAULT_TASK_VIEW,
  applyTaskView,
  taskViewStorageKey,
  usePersistedTaskView,
  type TaskSortField,
  type TaskViewState,
} from '@/lib/task-view';
import { PRIORITY_LABELS, formatDate, formatDuration, cn } from '@/lib/utils';

const priorityColor: Record<string, string> = {
  LOW: 'border-slate-500/40 text-slate-600 dark:text-slate-300',
  MEDIUM: 'border-blue-500/40 text-blue-700 dark:text-blue-300',
  HIGH: 'border-amber-500/40 text-amber-700 dark:text-amber-300',
  CRITICAL: 'border-red-500/40 text-red-700 dark:text-red-300',
};

export function TasksPage() {
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
    }
  }, [loading, boards, projects, view.board, view.project, setView]);

  const visibleTasks = useMemo(
    () => applyTaskView(tasks, view),
    [tasks, view],
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
      <PageHeader
        title="Задачи"
        description="Все задачи на всех досках и проектах"
      />

      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}

      <TaskViewControls
        view={view}
        onChange={setView}
        users={users}
        boards={boards}
        projects={projects}
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
              {visibleTasks.map((task) => (
                <tr
                  key={task.id}
                  className="cursor-pointer border-b border-border/70 transition-colors hover:bg-accent/40"
                  onClick={() => void openTask(task)}
                >
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
                      {task.assignee ? (
                        <UserAvatar user={task.assignee} size="sm" />
                      ) : (
                        <EmptyAssigneeAvatar size="sm" />
                      )}
                      <span className="truncate text-muted-foreground">
                        {task.assignee
                          ? displayName(task.assignee)
                          : 'Без исполнителя'}
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
        <p className="mt-3 text-xs text-muted-foreground">
          Показано {visibleTasks.length} из {tasks.length}
        </p>
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
