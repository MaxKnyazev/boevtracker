import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ListTodo } from 'lucide-react';
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
  type TaskViewState,
} from '@/lib/task-view';
import { PRIORITY_LABELS, formatDate, formatDuration, cn } from '@/lib/utils';

const priorityColor: Record<string, string> = {
  LOW: 'border-slate-500/40 text-slate-300',
  MEDIUM: 'border-blue-500/40 text-blue-300',
  HIGH: 'border-amber-500/40 text-amber-300',
  CRITICAL: 'border-red-500/40 text-red-300',
};

const selectClass =
  'h-9 rounded-md border border-input bg-background px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export function TasksPage() {
  const user = useAuthStore((s) => s.user);
  const writable = canWrite(user?.role);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [view, setView] = useState<TaskViewState>(DEFAULT_TASK_VIEW);
  const [boardFilter, setBoardFilter] = useState('all');
  const [projectFilter, setProjectFilter] = useState('all');
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

  const boards = useMemo(() => {
    const map = new Map<number, string>();
    for (const task of tasks) {
      const board = task.project?.board;
      if (board) map.set(board.id, board.name);
    }
    return [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  }, [tasks]);

  const projects = useMemo(() => {
    const map = new Map<number, { id: number; name: string; boardId: number }>();
    for (const task of tasks) {
      const project = task.project;
      if (!project) continue;
      if (boardFilter !== 'all' && String(project.boardId) !== boardFilter) {
        continue;
      }
      map.set(project.id, {
        id: project.id,
        name: project.name,
        boardId: project.boardId,
      });
    }
    return [...map.values()].sort((a, b) =>
      a.name.localeCompare(b.name, 'ru'),
    );
  }, [tasks, boardFilter]);

  useEffect(() => {
    if (
      projectFilter !== 'all' &&
      !projects.some((p) => String(p.id) === projectFilter)
    ) {
      setProjectFilter('all');
    }
  }, [projects, projectFilter]);

  const visibleTasks = useMemo(() => {
    let list = tasks;
    if (boardFilter !== 'all') {
      list = list.filter(
        (t) => String(t.project?.boardId) === boardFilter,
      );
    }
    if (projectFilter !== 'all') {
      list = list.filter((t) => String(t.projectId) === projectFilter);
    }
    return applyTaskView(list, view);
  }, [tasks, boardFilter, projectFilter, view]);

  const openTask = async (task: Task) => {
    setSelectedTaskId(task.id);
    try {
      const data = await api.project(task.projectId);
      setSelectedProject(data.project);
    } catch {
      setSelectedProject(null);
    }
  };

  return (
    <div>
      <PageHeader
        title="Задачи"
        description="Все задачи на всех досках и проектах"
      />

      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="shrink-0">Доска</span>
          <select
            className={selectClass}
            value={boardFilter}
            onChange={(e) => {
              setBoardFilter(e.target.value);
              setProjectFilter('all');
            }}
          >
            <option value="all">Все</option>
            {boards.map((b) => (
              <option key={b.id} value={String(b.id)}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="shrink-0">Проект</span>
          <select
            className={selectClass}
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
          >
            <option value="all">Все</option>
            {projects.map((p) => (
              <option key={p.id} value={String(p.id)}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <TaskViewControls
        view={view}
        onChange={setView}
        users={users}
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
                <th className="px-3 py-2.5 font-medium">Задача</th>
                <th className="px-3 py-2.5 font-medium">Доска</th>
                <th className="px-3 py-2.5 font-medium">Проект</th>
                <th className="px-3 py-2.5 font-medium">Статус</th>
                <th className="px-3 py-2.5 font-medium">Приоритет</th>
                <th className="px-3 py-2.5 font-medium">Исполнитель</th>
                <th className="px-3 py-2.5 font-medium">Дедлайн</th>
                <th className="px-3 py-2.5 font-medium">В статусе</th>
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
