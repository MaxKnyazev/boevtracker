import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, GripVertical, Lock, Plus, Settings2, UploadCloud } from 'lucide-react';
import {
  DndContext,
  DragOverlay,
  MeasuringStrategy,
  PointerSensor,
  closestCenter,
  closestCorners,
  defaultDropAnimationSideEffects,
  getFirstCollision,
  pointerWithin,
  rectIntersection,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type DropAnimation,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { api, type Board, type Project, type ProjectStatus, type Task, type User } from '@/lib/api';
import { canWrite, useAuthStore } from '@/store/auth';
import { PageHeader } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input, Label } from '@/components/ui/input';
import { MentionsTextarea } from '@/components/mentions-textarea';
import { TaskCard } from '@/components/task-card';
import { TaskModal } from '@/components/task-modal';
import { MoveBoardDialog } from '@/components/move-board-dialog';
import { TaskViewControls } from '@/components/task-view-controls';
import { ChooseActiveAssigneeDialog } from '@/components/choose-active-assignee-dialog';
import {
  FileDropZone,
  MAX_UPLOAD_FILE_SIZE,
  PendingFileChip,
  extractClipboardFiles,
} from '@/components/file-drop-zone';
import { useUploadsStore } from '@/store/uploads';
import {
  applyTaskView,
  taskViewStorageKey,
  usePersistedTaskView,
  type TaskViewState,
} from '@/lib/task-view';
import {
  computeTaskBuckets,
  type TaskBucketCounts,
} from '@/lib/task-buckets';
import { MAX_TASK_TITLE_LENGTH } from '@/lib/utils';
import {
  isTaskAssignee,
  taskActiveAssignee,
  taskAssignees,
} from '@/lib/api';

const OPEN_STATUS_NAME = 'Открыта';
const CLOSED_STATUS_NAME = 'Закрыта';

function isStatusLocked(status: ProjectStatus): boolean {
  return (
    status.locked === true ||
    status.name === OPEN_STATUS_NAME ||
    status.name === CLOSED_STATUS_NAME
  );
}

function isClosedStatus(status: ProjectStatus): boolean {
  return status.name === CLOSED_STATUS_NAME;
}

/** Keep «Закрыта» at the end. */
function normalizeStatusOrder(statuses: ProjectStatus[]): ProjectStatus[] {
  const closed = statuses.filter(isClosedStatus);
  const rest = statuses.filter((s) => !isClosedStatus(s));
  return [...rest, ...closed].map((s, order) => ({ ...s, order }));
}

function isValidStatusOrder(statuses: ProjectStatus[]): boolean {
  const openIndex = statuses.findIndex((s) => s.name === OPEN_STATUS_NAME);
  const closedIndex = statuses.findIndex((s) => s.name === CLOSED_STATUS_NAME);
  if (closedIndex >= 0 && closedIndex !== statuses.length - 1) return false;
  if (openIndex < 0 || closedIndex < 0) return true;
  return openIndex < closedIndex;
}

type Columns = Record<string, string[]>;

const dropAnimation: DropAnimation = {
  sideEffects: defaultDropAnimationSideEffects({
    styles: { active: { opacity: '0.4' } },
  }),
};

function statusKey(statusId: number | string) {
  return `status-${statusId}`;
}

function taskKey(taskId: number | string) {
  return `task-${taskId}`;
}

function parseStatusKey(id: string): number | null {
  if (!id.startsWith('status-')) return null;
  const n = Number(id.slice('status-'.length));
  return Number.isNaN(n) ? null : n;
}

function parseTaskKey(id: string): number | null {
  if (!id.startsWith('task-')) return null;
  const n = Number(id.slice('task-'.length));
  return Number.isNaN(n) ? null : n;
}

function buildColumns(project: Project): Columns {
  const cols: Columns = {};
  for (const status of project.statuses) {
    cols[statusKey(status.id)] = [];
  }
  const sorted = [...(project.tasks || [])].sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0) || a.id - b.id,
  );
  for (const task of sorted) {
    const key = statusKey(task.statusId);
    if (!cols[key]) cols[key] = [];
    cols[key].push(taskKey(task.id));
  }
  return cols;
}

function findContainer(columns: Columns, id: string): string | undefined {
  if (id in columns) return id;
  return Object.keys(columns).find((key) => columns[key].includes(id));
}

/** Prefer tasks under the pointer; otherwise the status column itself (helps empty columns). */
const kanbanCollisionDetection: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args);
  const intersections =
    pointerCollisions.length > 0 ? pointerCollisions : rectIntersection(args);

  if (intersections.length > 0) {
    const taskHit = intersections.find((c) =>
      String(c.id).startsWith('task-'),
    );
    if (taskHit) return [taskHit];

    const columnHit = intersections.find((c) =>
      String(c.id).startsWith('status-'),
    );
    if (columnHit) return [columnHit];

    const first = getFirstCollision(intersections);
    if (first) return [first];
  }

  return closestCorners(args);
};

export function ProjectPage({
  projectId: projectIdProp,
  embedded = false,
  hideSiblingProjects = false,
  embeddedToolbar,
  taskView: taskViewProp,
  onTaskViewChange,
  showTaskViewControls = true,
  filterUsers,
  onTasksChanged,
}: {
  projectId?: number;
  embedded?: boolean;
  hideSiblingProjects?: boolean;
  /** Left side of the embedded header row (e.g. project title + move controls). */
  embeddedToolbar?: ReactNode;
  /** Controlled task view (e.g. shared overview filters). */
  taskView?: TaskViewState;
  onTaskViewChange?: (view: TaskViewState) => void;
  showTaskViewControls?: boolean;
  /** Users for assignee filter when controls are shown without local load yet. */
  filterUsers?: User[];
  /** Fires when open / in-progress counts may have changed. */
  onTasksChanged?: (projectId: number, counts: TaskBucketCounts) => void;
} = {}) {
  const params = useParams();
  const projectId = String(projectIdProp ?? params.projectId);
  const user = useAuthStore((s) => s.user);
  const writable = canWrite(user?.role);

  const [project, setProject] = useState<Project | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [boards, setBoards] = useState<Board[]>([]);
  const [columns, setColumns] = useState<Columns>({});
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [moveTask, setMoveTask] = useState<Task | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [statusName, setStatusName] = useState('');
  const [statusDraft, setStatusDraft] = useState<ProjectStatus[]>([]);
  const [activeStatusId, setActiveStatusId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const [localTaskView, setLocalTaskView] = usePersistedTaskView(
    taskViewStorageKey.project(projectId),
  );

  const taskView = taskViewProp ?? localTaskView;
  const setTaskView = onTaskViewChange ?? setLocalTaskView;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('MEDIUM');
  const [deadline, setDeadline] = useState('');
  const [createFiles, setCreateFiles] = useState<File[]>([]);
  const [creating, setCreating] = useState(false);
  const [pendingMove, setPendingMove] = useState<{
    task: Task;
    statusId: number;
    index: number;
  } | null>(null);
  const [pendingAssign, setPendingAssign] = useState<{
    taskId: number;
    assigneeIds: number[];
    assignees: NonNullable<Task['assignees']>;
  } | null>(null);

  const columnsRef = useRef(columns);
  columnsRef.current = columns;

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
  );

  const reportBuckets = useCallback(
    (p: Project) => {
      onTasksChanged?.(Number(projectId), computeTaskBuckets(p));
    },
    [onTasksChanged, projectId],
  );

  const load = async () => {
    try {
      const [proj, assignable, boardList] = await Promise.all([
        api.project(Number(projectId)),
        api.assignableUsers(),
        api.boards(),
      ]);
      setProject(proj.project);
      setColumns(buildColumns(proj.project));
      setUsers(assignable.users);
      setBoards(boardList.boards);
      reportBuckets(proj.project);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка загрузки');
    }
  };

  useEffect(() => {
    void load();
  }, [projectId]);

  useEffect(() => {
    if (statusOpen && project && activeStatusId == null) {
      setStatusDraft([...project.statuses]);
    }
  }, [statusOpen, project, activeStatusId]);

  const tasksById = useMemo(() => {
    const map = new Map<number, Task>();
    for (const task of project?.tasks || []) {
      map.set(task.id, task);
    }
    return map;
  }, [project]);

  const visibleColumns = useMemo(() => {
    const result: Columns = {};
    for (const [columnId, taskIds] of Object.entries(columns)) {
      const tasks = taskIds
        .map((id) => tasksById.get(parseTaskKey(id) ?? -1))
        .filter((t): t is Task => !!t);
      result[columnId] = applyTaskView(tasks, taskView).map((t) =>
        taskKey(t.id),
      );
    }
    return result;
  }, [columns, tasksById, taskView]);

  const viewUsers = filterUsers ?? users;

  const activeTask = activeId ? tasksById.get(parseTaskKey(activeId) ?? -1) : null;

  const applyLocalMove = useCallback(
    (taskId: number, statusId: number, index: number, orderedTaskKeys: string[]) => {
      setProject((prev) => {
        if (!prev?.tasks) return prev;
        const tasks = prev.tasks.map((t) => {
          if (t.id === taskId) {
            const statusChanged = t.statusId !== statusId;
            return {
              ...t,
              statusId,
              order: index,
              status: prev.statuses.find((s) => s.id === statusId) || t.status,
              statusChangedAt: statusChanged
                ? new Date().toISOString()
                : t.statusChangedAt,
            };
          }
          if (t.statusId !== statusId) return t;
          const order = orderedTaskKeys.indexOf(taskKey(t.id));
          return order >= 0 ? { ...t, order } : t;
        });
        const next = { ...prev, tasks };
        reportBuckets(next);
        return next;
      });
    },
    [reportBuckets],
  );

  const onDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id));
    const width = event.active.rect.current.initial?.width;
    setDragWidth(width && width > 0 ? width : null);
  };

  const onDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeItemId = String(active.id);
    const overId = String(over.id);

    if (overId.startsWith('project-')) return;
    if (parseTaskKey(activeItemId) == null) return;

    const activeContainer = findContainer(columnsRef.current, activeItemId);
    const overContainer = findContainer(columnsRef.current, overId);

    if (!activeContainer || !overContainer) return;
    if (activeContainer === overContainer) return;

    setColumns((prev) => {
      const activeItems = prev[activeContainer];
      const overItems = prev[overContainer];
      if (!activeItems?.includes(activeItemId)) return prev;

      const overIndex = parseStatusKey(overId) != null
        ? overItems.length
        : overItems.indexOf(overId);

      const isBelowOverItem =
        !!active.rect.current.translated &&
        active.rect.current.translated.top > over.rect.top + over.rect.height;

      const newIndex =
        overIndex < 0
          ? overItems.length
          : parseStatusKey(overId) != null
            ? overItems.length
            : overIndex + (isBelowOverItem ? 1 : 0);

      const next: Columns = {
        ...prev,
        [activeContainer]: activeItems.filter((id) => id !== activeItemId),
        [overContainer]: [
          ...overItems.slice(0, newIndex),
          activeItemId,
          ...overItems.slice(newIndex),
        ],
      };
      columnsRef.current = next;
      return next;
    });
  };

  const onDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    setDragWidth(null);

    if (!over || !writable) {
      if (project) {
        const rebuilt = buildColumns(project);
        columnsRef.current = rebuilt;
        setColumns(rebuilt);
      }
      return;
    }

    const activeItemId = String(active.id);
    const overId = String(over.id);
    const taskId = parseTaskKey(activeItemId);
    if (taskId == null) return;

    if (overId.startsWith('project-')) {
      const targetProjectId = Number(overId.replace('project-', ''));
      if (!Number.isNaN(targetProjectId) && targetProjectId !== Number(projectId)) {
        try {
          await api.updateTask(taskId, { projectId: targetProjectId });
          await load();
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Ошибка переноса');
          if (project) {
            const rebuilt = buildColumns(project);
            columnsRef.current = rebuilt;
            setColumns(rebuilt);
          }
        }
      }
      return;
    }

    let next = { ...columnsRef.current };
    const activeContainer = findContainer(next, activeItemId);
    const overContainer = findContainer(next, overId);

    if (!activeContainer || !overContainer) {
      if (project) {
        const rebuilt = buildColumns(project);
        columnsRef.current = rebuilt;
        setColumns(rebuilt);
      }
      return;
    }

    const activeIndex = next[activeContainer].indexOf(activeItemId);
    const overIndex =
      parseStatusKey(overId) != null
        ? next[overContainer].indexOf(activeItemId)
        : next[overContainer].indexOf(overId);

    if (
      activeContainer === overContainer &&
      activeIndex >= 0 &&
      overIndex >= 0 &&
      activeIndex !== overIndex
    ) {
      next = {
        ...next,
        [overContainer]: arrayMove(next[overContainer], activeIndex, overIndex),
      };
    }

    columnsRef.current = next;
    setColumns(next);

    const orderedIds = next[overContainer];
    const index = orderedIds.indexOf(activeItemId);
    const statusId = parseStatusKey(overContainer);
    if (index < 0 || statusId == null) return;

    const original = project?.tasks?.find((t) => t.id === taskId);
    const originalIndex = (project?.tasks || [])
      .filter((t) => t.statusId === statusId)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.id - b.id)
      .findIndex((t) => t.id === taskId);

    if (original?.statusId === statusId && originalIndex === index) {
      return;
    }

    applyLocalMove(taskId, statusId, index, orderedIds);

    const assignees = original ? taskAssignees(original) : [];
    const statusChanged = original != null && original.statusId !== statusId;
    const targetStatus = project?.statuses.find((s) => s.id === statusId);

    if (
      statusChanged &&
      assignees.length > 0 &&
      targetStatus &&
      !isClosedStatus(targetStatus)
    ) {
      if (!isTaskAssignee(original!, user?.id)) {
        setError('Менять статус может только исполнитель задачи');
        await load();
        return;
      }
      setPendingMove({ task: original!, statusId, index });
      return;
    }

    if (statusChanged && assignees.length > 0 && !isTaskAssignee(original!, user?.id)) {
      setError('Менять статус может только исполнитель задачи');
      await load();
      return;
    }

    try {
      await api.moveTaskPosition(taskId, { statusId, index });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка переноса');
      await load();
    }
  };

  const onDragCancel = () => {
    setActiveId(null);
    setDragWidth(null);
    if (project) {
      const rebuilt = buildColumns(project);
      columnsRef.current = rebuilt;
      setColumns(rebuilt);
    }
  };

  const resetCreateForm = () => {
    setTitle('');
    setDescription('');
    setPriority('MEDIUM');
    setDeadline('');
    setCreateFiles([]);
  };

  const addCreateFiles = (incoming: File[]) => {
    const ok: File[] = [];
    for (const file of incoming) {
      if (file.size > MAX_UPLOAD_FILE_SIZE) {
        setError(`Файл «${file.name}» больше 500 МБ`);
        continue;
      }
      ok.push(file);
    }
    if (!ok.length) return;
    setCreateFiles((prev) => {
      const keys = new Set(prev.map((f) => `${f.name}:${f.size}`));
      const next = [...prev];
      for (const file of ok) {
        const key = `${file.name}:${file.size}`;
        if (!keys.has(key)) {
          keys.add(key);
          next.push(file);
        }
      }
      return next;
    });
  };

  const createTask = async (e: FormEvent) => {
    e.preventDefault();
    if (!project) return;
    const taskTitle = title.trim();
    if (!taskTitle) return;
    if (taskTitle.length > MAX_TASK_TITLE_LENGTH) {
      setError(
        `Название задачи не длиннее ${MAX_TASK_TITLE_LENGTH} символов`,
      );
      return;
    }
    setCreating(true);
    try {
      const filesToUpload = [...createFiles];
      const res = await api.createTask(project.id, {
        title: taskTitle,
        description: description.trim() || undefined,
        priority: priority as Task['priority'],
        deadline: deadline ? new Date(deadline).toISOString() : null,
      });
      resetCreateForm();
      setCreateOpen(false);
      setError('');
      await load();

      if (filesToUpload.length > 0) {
        void useUploadsStore.getState().uploadTaskFiles({
          taskId: res.task.id,
          title: taskTitle,
          files: filesToUpload,
          onComplete: async () => {
            await load();
          },
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка создания задачи');
    } finally {
      setCreating(false);
    }
  };

  const addStatus = async (e: FormEvent) => {
    e.preventDefault();
    if (!project) return;
    await api.createStatus(project.id, statusName.trim());
    setStatusName('');
    setStatusOpen(false);
    await load();
  };

  const onStatusDragStart = (event: DragStartEvent) => {
    setActiveStatusId(String(event.active.id));
  };

  const onStatusDragCancel = () => {
    setActiveStatusId(null);
    if (project) setStatusDraft([...project.statuses]);
  };

  const onStatusDragEnd = async (event: DragEndEvent) => {
    setActiveStatusId(null);
    const { active, over } = event;
    if (!over || !project || !writable || active.id === over.id) return;

    const activeStatus = statusDraft.find(
      (s) => String(s.id) === String(active.id),
    );
    if (activeStatus && isClosedStatus(activeStatus)) return;

    const oldIndex = statusDraft.findIndex(
      (s) => String(s.id) === String(active.id),
    );
    const newIndex = statusDraft.findIndex(
      (s) => String(s.id) === String(over.id),
    );
    if (oldIndex < 0 || newIndex < 0) return;

    const next = normalizeStatusOrder(
      arrayMove(statusDraft, oldIndex, newIndex),
    );
    if (!isValidStatusOrder(next)) {
      alert('Статус «Открыта» не может стоять после «Закрыта»');
      if (project) setStatusDraft([...project.statuses]);
      return;
    }
    setStatusDraft(next);
    setProject({ ...project, statuses: next });

    try {
      await api.reorderStatuses(
        project.id,
        next.map((s) => s.id),
      );
      await load();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Ошибка сортировки статусов',
      );
      await load();
    }
  };

  if (!project && !error) {
    return <p className="text-muted-foreground">Загрузка...</p>;
  }

  const statusCount = project?.statuses.length ?? 0;
  const projectShellStyle =
    statusCount > 0
      ? {
          width: statusCount * 360,
          maxWidth: '100%',
          minWidth: statusCount * 220,
        }
      : undefined;

  const statusTaskActions = writable ? (
    <div className="flex shrink-0 flex-wrap gap-2">
      <Button variant="outline" onClick={() => setStatusOpen(true)}>
        <Settings2 className="h-4 w-4" />
        Статусы
      </Button>
      <Button onClick={() => setCreateOpen(true)}>
        <Plus className="h-4 w-4" />
        Задача
      </Button>
    </div>
  ) : null;

  return (
    <div className={embedded ? '' : undefined}>
      {!embedded && (
        <Link
          to={project ? `/boards/${project.boardId}` : '/'}
          className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          К проектам доски
        </Link>
      )}

      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}

      <DndContext
        sensors={writable ? sensors : []}
        collisionDetection={kanbanCollisionDetection}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={(e) => void onDragEnd(e)}
        onDragCancel={onDragCancel}
      >
        {project?.boardId && !embedded && !hideSiblingProjects && (
          <SiblingProjects
            boardId={project.boardId}
            currentId={project.id}
            dragging={activeId != null}
            writable={writable}
          />
        )}

        <div className="w-full">
          {embedded ? (
            embeddedToolbar || writable || showTaskViewControls ? (
              <div className="mb-4 space-y-3">
                {(embeddedToolbar || writable) && (
                  <div className="flex flex-wrap items-center gap-2">
                    {embeddedToolbar ? (
                      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                        {embeddedToolbar}
                      </div>
                    ) : (
                      <div className="min-w-0 flex-1" />
                    )}
                    {statusTaskActions}
                  </div>
                )}
                {showTaskViewControls && (
                  <TaskViewControls
                    view={taskView}
                    onChange={setTaskView}
                    users={viewUsers}
                  />
                )}
              </div>
            ) : null
          ) : (
            <>
              <PageHeader
                title={project?.name || 'Проект'}
                description={
                  project?.board ? `Доска: ${project.board.name}` : undefined
                }
                actions={statusTaskActions || undefined}
              />
              {showTaskViewControls && (
                <TaskViewControls
                  view={taskView}
                  onChange={setTaskView}
                  users={viewUsers}
                  className="mb-4"
                />
              )}
            </>
          )}

          <div className="kanban-scroll w-full overflow-x-auto pb-4">
            <div className="mx-auto flex flex-col" style={projectShellStyle}>
              <div className="flex w-full items-stretch overflow-hidden rounded-xl border border-border bg-card/60">
                {project?.statuses.map((status, index) => {
                  const columnId = statusKey(status.id);
                  const taskIds = visibleColumns[columnId] || [];
                  const isLast = index === project.statuses.length - 1;
                  return (
                    <KanbanColumn
                      key={status.id}
                      id={columnId}
                      title={status.name}
                      count={taskIds.length}
                      isLast={isLast}
                      isEmpty={taskIds.length === 0}
                    >
                      <SortableContext
                        items={taskIds}
                        strategy={verticalListSortingStrategy}
                        disabled={!writable}
                      >
                        <div className="flex min-h-full flex-1 flex-col gap-2">
                          {taskIds.map((id) => {
                            const task = tasksById.get(parseTaskKey(id) ?? -1);
                            if (!task) return null;
                            return (
                              <SortableTask
                                key={id}
                                id={id}
                                task={task}
                                users={users}
                                writable={writable}
                                onOpen={() => setSelectedTaskId(task.id)}
                                onMoveBoard={() => setMoveTask(task)}
                                onAssign={async (assigneeIds) => {
                                  const res = await api.updateTask(task.id, {
                                    assigneeIds,
                                  });
                                  if (
                                    res.needsActiveChoice &&
                                    taskAssignees(res.task).length > 1
                                  ) {
                                    setPendingAssign({
                                      taskId: task.id,
                                      assigneeIds,
                                      assignees: taskAssignees(res.task),
                                    });
                                  }
                                  await load();
                                }}
                              />
                            );
                          })}
                          {taskIds.length === 0 && (
                            <div className="flex min-h-[240px] flex-1 items-center justify-center px-2 py-8 text-center text-xs text-muted-foreground">
                              {(columns[columnId] || []).length > 0
                                ? 'Нет задач по фильтру'
                                : 'Перетащите задачу сюда'}
                            </div>
                          )}
                        </div>
                      </SortableContext>
                    </KanbanColumn>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
        <DragOverlay dropAnimation={dropAnimation}>
          {activeTask ? (
            <div
              className="box-border"
              style={{ width: dragWidth ?? undefined, maxWidth: dragWidth ?? undefined }}
            >
              <TaskCard
                task={activeTask}
                users={users}
                writable={false}
                preview
              />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {selectedTaskId && (
        <TaskModal
          taskId={selectedTaskId}
          users={users}
          project={project}
          writable={writable}
          onClose={() => setSelectedTaskId(null)}
          onChanged={load}
        />
      )}

      {moveTask && (
        <MoveBoardDialog
          task={moveTask}
          boards={boards}
          onClose={() => setMoveTask(null)}
          onMoved={async () => {
            setMoveTask(null);
            await load();
          }}
        />
      )}

      {pendingMove && (
        <ChooseActiveAssigneeDialog
          open
          title="Кто работает в следующем статусе?"
          description="Выберите активного исполнителя для нового статуса задачи."
          assignees={taskAssignees(pendingMove.task)}
          initialUserId={taskActiveAssignee(pendingMove.task)?.id}
          confirmLabel="Перевести"
          onCancel={() => {
            setPendingMove(null);
            void load();
          }}
          onConfirm={async (userId) => {
            const move = pendingMove;
            setPendingMove(null);
            try {
              await api.moveTaskPosition(move.task.id, {
                statusId: move.statusId,
                index: move.index,
                activeAssigneeId: userId,
              });
              await load();
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Ошибка переноса');
              await load();
            }
          }}
        />
      )}

      {pendingAssign && pendingAssign.assignees && pendingAssign.assignees.length > 0 && (
        <ChooseActiveAssigneeDialog
          open
          title="Кто активный исполнитель?"
          description="У задачи несколько исполнителей. Выберите активного для текущего статуса."
          assignees={pendingAssign.assignees}
          initialUserId={pendingAssign.assignees[0]?.id}
          onCancel={() => setPendingAssign(null)}
          onConfirm={async (userId) => {
            const pending = pendingAssign;
            setPendingAssign(null);
            await api.updateTask(pending.taskId, {
              assigneeIds: pending.assigneeIds,
              activeAssigneeId: userId,
            });
            await load();
          }}
        />
      )}

      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) resetCreateForm();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Новая задача</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => void createTask(e)}
            className="space-y-4"
            onPaste={(e) => {
              if (creating) return;
              const files = extractClipboardFiles(e.clipboardData);
              if (!files.length) return;
              e.preventDefault();
              addCreateFiles(files);
            }}
          >
            <div className="space-y-2">
              <Label>Название</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                maxLength={MAX_TASK_TITLE_LENGTH}
                disabled={creating}
              />
              <p className="text-xs text-muted-foreground">
                Не больше {MAX_TASK_TITLE_LENGTH} символов
              </p>
            </div>
            <div className="space-y-2">
              <Label>Описание</Label>
              <MentionsTextarea
                value={description}
                onChange={setDescription}
                users={users}
                disabled={creating}
                className="min-h-[120px] resize-y"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Приоритет</Label>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  disabled={creating}
                >
                  <option value="LOW">Низкий</option>
                  <option value="MEDIUM">Средний</option>
                  <option value="HIGH">Высокий</option>
                  <option value="CRITICAL">Критический</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>Дедлайн</Label>
                <Input
                  type="date"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  disabled={creating}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Файлы</Label>
              <FileDropZone
                disabled={creating}
                onFiles={addCreateFiles}
                className="min-h-[88px]"
              >
                <UploadCloud className="h-5 w-5 text-muted-foreground" />
                <div className="text-sm">
                  Перетащите файлы сюда, нажмите для выбора или вставьте из
                  буфера
                </div>
                <div className="text-[11px] text-muted-foreground">
                  Можно несколько файлов, до 500 МБ каждый · Ctrl+V
                </div>
              </FileDropZone>
              {createFiles.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {createFiles.map((file, index) => (
                    <PendingFileChip
                      key={`${file.name}-${file.size}-${index}`}
                      name={file.name}
                      progress={null}
                      status="pending"
                      disabled={creating}
                      onRemove={
                        creating
                          ? undefined
                          : () =>
                              setCreateFiles((prev) =>
                                prev.filter((_, i) => i !== index),
                              )
                      }
                      className="min-w-[10rem] max-w-full sm:max-w-[14rem]"
                    />
                  ))}
                </div>
              )}
            </div>
            <Button type="submit" className="w-full" disabled={creating}>
              {creating ? 'Создание...' : 'Создать'}
            </Button>
          </form>        </DialogContent>
      </Dialog>

      <Dialog
        open={statusOpen}
        onOpenChange={(open) => {
          setStatusOpen(open);
          if (open && project) {
            setStatusDraft(normalizeStatusOrder([...project.statuses]));
            setActiveStatusId(null);
          }
        }}
      >
        <DialogContent className="max-w-lg overflow-x-hidden">
          <DialogHeader>
            <DialogTitle>Статусы проекта</DialogTitle>
          </DialogHeader>
          <DndContext
            sensors={writable ? sensors : []}
            collisionDetection={closestCenter}
            measuring={{
              droppable: { strategy: MeasuringStrategy.Always },
            }}
            onDragStart={onStatusDragStart}
            onDragEnd={(e) => void onStatusDragEnd(e)}
            onDragCancel={onStatusDragCancel}
          >
            <SortableContext
              items={statusDraft.map((s) => String(s.id))}
              strategy={verticalListSortingStrategy}
              disabled={!writable}
            >
              <div className="max-h-[50vh] space-y-2 overflow-x-hidden overflow-y-auto pr-1">
                {statusDraft.map((s) => (
                  <SortableStatusRow
                    key={s.id}
                    status={s}
                    writable={writable}
                    isDragging={activeStatusId === String(s.id)}
                    onDelete={async () => {
                      try {
                        await api.deleteStatus(s.id);
                        await load();
                      } catch (err) {
                        alert(err instanceof Error ? err.message : 'Ошибка');
                      }
                    }}
                  />
                ))}
              </div>
            </SortableContext>
            <DragOverlay dropAnimation={null}>
              {activeStatusId ? (
                <div className="flex w-full max-w-[calc(32rem-3rem)] items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm shadow-xl ring-2 ring-primary/40">
                  <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate font-medium">
                    {statusDraft.find((s) => String(s.id) === activeStatusId)
                      ?.name || ''}
                  </span>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
          <form onSubmit={addStatus} className="mt-4 flex gap-2">
            <Input
              placeholder="Новый статус"
              value={statusName}
              onChange={(e) => setStatusName(e.target.value)}
              required
            />
            <Button type="submit">Добавить</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SortableStatusRow({
  status,
  writable,
  isDragging,
  onDelete,
}: {
  status: ProjectStatus;
  writable: boolean;
  isDragging: boolean;
  onDelete: () => void;
}) {
  const locked = isStatusLocked(status);
  const closed = isClosedStatus(status);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({
    id: String(status.id),
    disabled: !writable || closed,
  });

  const style: CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex touch-none items-center justify-between gap-2 rounded-md border border-border bg-background/80 px-2 py-2 text-sm"
    >
      {writable && !closed ? (
        <button
          type="button"
          className="cursor-grab touch-none rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground active:cursor-grabbing"
          title="Перетащить"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
      ) : writable && closed ? (
        <span className="inline-flex h-8 w-8 shrink-0" aria-hidden />
      ) : null}
      <span className="min-w-0 flex-1 truncate">{status.name}</span>
      {writable &&
        (locked ? (
          <span
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center text-muted-foreground"
            title={
              closed
                ? 'Системный статус — всегда последний, нельзя удалить'
                : 'Системный статус — нельзя удалить'
            }
          >
            <Lock className="h-4 w-4" />
          </span>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            className="shrink-0 text-destructive"
            onClick={onDelete}
          >
            Удалить
          </Button>
        ))}
    </div>
  );
}

function KanbanColumn({
  id,
  title,
  count,
  isLast,
  isEmpty,
  children,
}: {
  id: string;
  title: string;
  count: number;
  isLast: boolean;
  isEmpty?: boolean;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id,
    data: { type: 'column' },
  });

  return (
    <div
      className={`flex min-w-[220px] max-w-[360px] flex-1 flex-col self-stretch transition-colors ${
        !isLast ? 'border-r border-border' : ''
      } ${isOver ? 'bg-primary/5' : ''}`}
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-3">
        <h3 className="truncate text-sm font-semibold" title={title}>
          {title}
        </h3>
        <span className="shrink-0 text-xs text-muted-foreground">{count}</span>
      </div>
      <div
        ref={setNodeRef}
        className={`flex flex-1 flex-col p-2 ${
          isEmpty ? 'min-h-[280px]' : 'min-h-[120px]'
        }`}
      >
        {children}
      </div>
    </div>
  );
}

function SortableTask({
  id,
  task,
  users,
  writable,
  onOpen,
  onMoveBoard,
  onAssign,
}: {
  id: string;
  task: Task;
  users: User[];
  writable: boolean;
  onOpen: () => void;
  onMoveBoard: () => void;
  onAssign: (assigneeIds: number[]) => Promise<void>;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id,
    disabled: !writable,
    data: { type: 'task' },
  });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <TaskCard
      task={task}
      users={users}
      writable={writable}
      isDragging={isDragging}
      dragStyle={style}
      setDragRef={setNodeRef}
      dragAttributes={attributes}
      dragListeners={listeners}
      onOpen={onOpen}
      onMoveBoard={onMoveBoard}
      onAssign={onAssign}
    />
  );
}

function SiblingProjects({
  boardId,
  currentId,
  dragging,
  writable,
}: {
  boardId: number;
  currentId: number;
  dragging: boolean;
  writable: boolean;
}) {
  const [projects, setProjects] = useState<{ id: number; name: string }[]>([]);

  useEffect(() => {
    void api.board(boardId).then((data) => {
      setProjects(
        (data.board.projects || [])
          .filter((p) => p.id !== currentId)
          .map((p) => ({ id: p.id, name: p.name })),
      );
    });
  }, [boardId, currentId]);

  if (!writable || projects.length === 0) return null;

  return (
    <div className="mb-4 rounded-xl border border-dashed border-border bg-card/30 p-3">
      <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Перетащить задачу в другой проект этой доски
      </div>
      <div className="flex flex-wrap gap-2">
        {projects.map((p) => (
          <ProjectDropZone key={p.id} id={p.id} name={p.name} dragging={dragging} />
        ))}
      </div>
    </div>
  );
}

function ProjectDropZone({
  id,
  name,
  dragging,
}: {
  id: number;
  name: string;
  dragging: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `project-${id}` });
  return (
    <div
      ref={setNodeRef}
      className={`rounded-md border px-3 py-2 text-sm transition-colors ${
        isOver
          ? 'border-primary bg-primary/20'
          : dragging
            ? 'border-primary/50 bg-primary/10'
            : 'border-border bg-background'
      }`}
    >
      {name}
    </div>
  );
}
