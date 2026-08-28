import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { Pencil, Plus, Rocket, Trash2, UploadCloud, X } from 'lucide-react';
import {
  api,
  taskActiveAssignee,
  type Board,
  type Priority,
  type Project,
  type Release,
  type ReleaseStatus,
  type Task,
  type User,
} from '@/lib/api';
import { canWrite, useAuthStore } from '@/store/auth';
import { useUploadsStore } from '@/store/uploads';
import { EmptyState, PageHeader } from '@/components/layout';
import { TaskModal } from '@/components/task-modal';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input, Label, Textarea } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  AppSelect,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AssigneeStack } from '@/components/assignee-stack';
import { DeadlinePicker } from '@/components/deadline-picker';
import {
  FileDropZone,
  MAX_UPLOAD_FILE_SIZE,
  PendingFileChip,
  extractClipboardFiles,
} from '@/components/file-drop-zone';
import { PrioritySelect } from '@/components/priority-select';
import { displayName } from '@/components/user-avatar';
import { PaginationControls } from '@/components/pagination-controls';
import { usePagination } from '@/hooks/use-pagination';
import { paginateList, PAGINATION_PAGE_SIZE_KEYS } from '@/lib/pagination';
import { MAX_TASK_TITLE_LENGTH, PRIORITY_LABELS, cn, formatDate } from '@/lib/utils';

const RELEASE_STATUS_FILTER_KEY = 'boevtracker.releases.statusFilter';

const RELEASE_STATUS_LABELS: Record<ReleaseStatus, string> = {
  PLANNED: 'Запланирован',
  IN_PROGRESS: 'В работе',
  RELEASED: 'Выпущен',
  CANCELLED: 'Отменён',
};

const RELEASE_STATUS_CLASS: Record<ReleaseStatus, string> = {
  PLANNED: 'border-slate-500/40 text-slate-600 dark:text-slate-300',
  IN_PROGRESS: 'border-blue-500/40 text-blue-700 dark:text-blue-300',
  RELEASED: 'border-emerald-500/40 text-emerald-700 dark:text-emerald-300',
  CANCELLED: 'border-red-500/40 text-red-700 dark:text-red-300',
};

const priorityColor: Record<string, string> = {
  LOW: 'border-slate-500/40 text-slate-600 dark:text-slate-300',
  MEDIUM: 'border-blue-500/40 text-blue-700 dark:text-blue-300',
  HIGH: 'border-amber-500/40 text-amber-700 dark:text-amber-300',
  CRITICAL: 'border-red-500/40 text-red-700 dark:text-red-300',
};

type StatusFilter = 'all' | ReleaseStatus;

function readStatusFilter(): StatusFilter {
  try {
    const raw = localStorage.getItem(RELEASE_STATUS_FILTER_KEY);
    if (
      raw === 'PLANNED' ||
      raw === 'IN_PROGRESS' ||
      raw === 'RELEASED' ||
      raw === 'CANCELLED'
    ) {
      return raw;
    }
  } catch {
    // ignore
  }
  return 'all';
}

function writeStatusFilter(value: StatusFilter) {
  try {
    localStorage.setItem(RELEASE_STATUS_FILTER_KEY, value);
  } catch {
    // ignore
  }
}

export function ReleasesPage() {
  return (
    <div>
      <PageHeader
        title="Релизы"
        description="Группируйте задачи по релизам: добавляйте существующие или создавайте новые."
      />
      <ReleasesPanel />
    </div>
  );
}

function ReleasesPanel() {
  const user = useAuthStore((s) => s.user);
  const writable = canWrite(user?.role);

  const [releases, setReleases] = useState<Release[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(readStatusFilter);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selected, setSelected] = useState<Release | null>(null);
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [boards, setBoards] = useState<Board[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [newTaskOpen, setNewTaskOpen] = useState(false);

  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);

  const filteredReleases = useMemo(() => {
    if (statusFilter === 'all') return releases;
    return releases.filter((r) => r.status === statusFilter);
  }, [releases, statusFilter]);

  const { page, setPage, pageSize, setPageSize } = usePagination(
    PAGINATION_PAGE_SIZE_KEYS.releases,
    [statusFilter],
  );
  const releasePage = useMemo(
    () => paginateList(filteredReleases, page, pageSize),
    [filteredReleases, page, pageSize],
  );

  useEffect(() => {
    if (selectedId == null) return;
    if (!filteredReleases.some((r) => r.id === selectedId)) {
      setSelectedId(null);
    }
  }, [filteredReleases, selectedId]);

  const setStatusFilterAndStore = (next: StatusFilter) => {
    setStatusFilter(next);
    writeStatusFilter(next);
  };

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const [rel, tasks, boardsData, assignable] = await Promise.all([
        api.releases(),
        api.tasks(),
        api.boards(),
        api.assignableUsers(),
      ]);
      setReleases(rel.releases);
      setAllTasks(tasks.tasks);
      setBoards(boardsData.boards);
      setUsers(assignable.users);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async (id: number) => {
    setDetailLoading(true);
    try {
      const data = await api.release(id);
      setSelected(data.release);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка загрузки релиза');
      setSelected(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    if (selectedId == null) {
      setSelected(null);
      return;
    }
    void loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  const refreshAfterChange = async () => {
    await loadList();
    if (selectedId != null) await loadDetail(selectedId);
  };

  const openTask = async (task: Task) => {
    setSelectedTaskId(task.id);
    try {
      const data = await api.project(task.projectId);
      setSelectedProject(data.project);
    } catch {
      setSelectedProject(null);
    }
  };

  const detachTask = async (taskId: number) => {
    if (!selected || !writable) return;
    try {
      await api.detachReleaseTask(selected.id, taskId);
      await refreshAfterChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось убрать задачу');
    }
  };

  const deleteRelease = async () => {
    if (!selected || !writable) return;
    if (!window.confirm(`Удалить релиз «${selected.name}»? Задачи останутся без релиза.`)) {
      return;
    }
    try {
      await api.deleteRelease(selected.id);
      setSelectedId(null);
      await loadList();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось удалить релиз');
    }
  };

  const updateStatus = async (status: ReleaseStatus) => {
    if (!selected || !writable) return;
    try {
      await api.updateRelease(selected.id, { status });
      await refreshAfterChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось обновить статус');
    }
  };

  return (
    <div className="space-y-4">
      {writable && (
        <div className="flex flex-wrap items-center justify-end gap-3">
          <Button type="button" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            Создать релиз
          </Button>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      {!loading && releases.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="shrink-0">Статус</span>
            <AppSelect
              value={statusFilter}
              onValueChange={(v) => setStatusFilterAndStore(v as StatusFilter)}
              options={[
                { value: 'all', label: 'Все' },
                ...(Object.keys(RELEASE_STATUS_LABELS) as ReleaseStatus[]).map(
                  (status) => ({
                    value: status,
                    label: RELEASE_STATUS_LABELS[status],
                  }),
                ),
              ]}
              className="w-[11rem] text-xs"
            />
          </label>
        </div>
      )}

      {loading ? (
        <p className="text-muted-foreground">Загрузка...</p>
      ) : releases.length === 0 ? (
        <EmptyState
          title="Нет релизов"
          description={
            writable
              ? 'Создайте первый релиз, чтобы собрать в него задачи'
              : 'Пока никто не создал релизы'
          }
          icon={<Rocket className="h-10 w-10" />}
        />
      ) : filteredReleases.length === 0 ? (
        <EmptyState
          title="Ничего не найдено"
          description="Измените фильтр по статусу"
          icon={<Rocket className="h-10 w-10" />}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(240px,320px)_1fr]">
          <div className="min-w-0">
            <div className="overflow-hidden rounded-xl border border-border">
              <ul className="divide-y divide-border">
                {releasePage.items.map((release) => {
                  const active = release.id === selectedId;
                  return (
                    <li key={release.id}>
                      <button
                        type="button"
                        className={cn(
                          'flex w-full flex-col gap-1 px-3 py-3 text-left transition-colors',
                          active ? 'bg-accent/60' : 'hover:bg-accent/40',
                        )}
                        onClick={() => setSelectedId(release.id)}
                      >
                        <span className="truncate font-medium">{release.name}</span>
                        <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <Badge className={cn(RELEASE_STATUS_CLASS[release.status])}>
                            {RELEASE_STATUS_LABELS[release.status]}
                          </Badge>
                          <span>{release.tasksCount} задач</span>
                          {release.targetDate && (
                            <span>до {formatDate(release.targetDate)}</span>
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
            <PaginationControls
              result={releasePage}
              page={page}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
            />
          </div>

          <div className="min-w-0 rounded-xl border border-border p-4">
            {selectedId == null ? (
              <p className="text-sm text-muted-foreground">Выберите релиз слева</p>
            ) : detailLoading || !selected ? (
              <p className="text-muted-foreground">Загрузка...</p>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <h2 className="truncate text-lg font-semibold">{selected.name}</h2>
                    {selected.description && (
                      <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                        {selected.description}
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      {selected.targetDate && (
                        <span>
                          Планируемая дата релиза: {formatDate(selected.targetDate)}
                        </span>
                      )}
                      {selected.createdBy && (
                        <span>Создал: {displayName(selected.createdBy)}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {writable && (
                      <Select
                        value={selected.status}
                        onValueChange={(v) => void updateStatus(v as ReleaseStatus)}
                      >
                        <SelectTrigger className="w-[160px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(Object.keys(RELEASE_STATUS_LABELS) as ReleaseStatus[]).map(
                            (status) => (
                              <SelectItem key={status} value={status}>
                                {RELEASE_STATUS_LABELS[status]}
                              </SelectItem>
                            ),
                          )}
                        </SelectContent>
                      </Select>
                    )}
                    {!writable && (
                      <Badge className={cn(RELEASE_STATUS_CLASS[selected.status])}>
                        {RELEASE_STATUS_LABELS[selected.status]}
                      </Badge>
                    )}
                    {writable && (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          title="Редактировать релиз"
                          onClick={() => setEditOpen(true)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          title="Удалить релиз"
                          onClick={() => void deleteRelease()}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                {writable && (
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" onClick={() => setAttachOpen(true)}>
                      Добавить задачи
                    </Button>
                    <Button type="button" onClick={() => setNewTaskOpen(true)}>
                      <Plus className="mr-1.5 h-4 w-4" />
                      Создать задачу
                    </Button>
                  </div>
                )}

                {(selected.tasks ?? []).length === 0 ? (
                  <EmptyState
                    title="В релизе пока нет задач"
                    description={
                      writable
                        ? 'Добавьте существующие задачи или создайте новые'
                        : undefined
                    }
                    icon={<Rocket className="h-8 w-8" />}
                  />
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-border">
                    <table className="w-full min-w-[720px] border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-border bg-muted/30 text-left text-xs text-muted-foreground">
                          <th className="px-3 py-2.5 font-medium">Задача</th>
                          <th className="px-3 py-2.5 font-medium">Доска</th>
                          <th className="px-3 py-2.5 font-medium">Проект</th>
                          <th className="px-3 py-2.5 font-medium">Статус</th>
                          <th className="px-3 py-2.5 font-medium">Приоритет</th>
                          <th className="px-3 py-2.5 font-medium">Исполнитель</th>
                          {writable && <th className="w-10 px-2 py-2.5" />}
                        </tr>
                      </thead>
                      <tbody>
                        {(selected.tasks ?? []).map((task) => (
                          <tr
                            key={task.id}
                            className="cursor-pointer border-b border-border/70 transition-colors hover:bg-accent/40"
                            onClick={() => void openTask(task)}
                          >
                            <td className="max-w-[240px] px-3 py-2.5">
                              <div className="truncate font-medium" title={task.title}>
                                {task.title}
                              </div>
                            </td>
                            <td className="px-3 py-2.5 text-muted-foreground">
                              {task.project?.board ? (
                                <Link
                                  to={`/boards/${task.project.board.id}`}
                                  className="hover:text-primary"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {task.project.board.name}
                                </Link>
                              ) : (
                                '—'
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-muted-foreground">
                              {task.project ? (
                                <Link
                                  to={`/boards/${task.project.boardId}?tab=${task.project.id}`}
                                  className="hover:text-primary"
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
                            {writable && (
                              <td className="px-2 py-2.5">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-muted-foreground"
                                  title="Убрать из релиза"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void detachTask(task.id);
                                  }}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <ReleaseFormDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSaved={async (release) => {
          setCreateOpen(false);
          await loadList();
          setSelectedId(release.id);
        }}
      />

      {selected && (
        <>
          <ReleaseFormDialog
            open={editOpen}
            release={selected}
            onClose={() => setEditOpen(false)}
            onSaved={async () => {
              setEditOpen(false);
              await refreshAfterChange();
            }}
          />
          <AttachTasksDialog
            open={attachOpen}
            release={selected}
            allTasks={allTasks}
            onClose={() => setAttachOpen(false)}
            onAttached={async () => {
              setAttachOpen(false);
              await refreshAfterChange();
            }}
          />
          <CreateReleaseTaskDialog
            open={newTaskOpen}
            release={selected}
            boards={boards}
            onClose={() => setNewTaskOpen(false)}
            onCreated={async () => {
              setNewTaskOpen(false);
              await refreshAfterChange();
            }}
          />
        </>
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
          onChanged={refreshAfterChange}
        />
      )}
    </div>
  );
}

function ReleaseFormDialog({
  open,
  release,
  onClose,
  onSaved,
}: {
  open: boolean;
  release?: Release;
  onClose: () => void;
  onSaved: (release: Release) => void | Promise<void>;
}) {
  const editing = release != null;
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [status, setStatus] = useState<ReleaseStatus>('PLANNED');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const selectedTargetDate = useMemo(() => {
    if (!targetDate) return undefined;
    const d = parseISO(targetDate);
    return Number.isNaN(d.getTime()) ? undefined : d;
  }, [targetDate]);

  useEffect(() => {
    if (!open) return;
    setName(release?.name ?? '');
    setDescription(release?.description ?? '');
    setTargetDate(release?.targetDate ?? '');
    setStatus(release?.status ?? 'PLANNED');
    setError('');
  }, [open, release]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Укажите название релиза');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = {
        name: trimmed,
        description: description.trim() || null,
        targetDate: targetDate || null,
        ...(editing ? { status } : {}),
      };
      const data = editing
        ? await api.updateRelease(release.id, payload)
        : await api.createRelease({
            name: payload.name,
            description: payload.description ?? undefined,
            targetDate: payload.targetDate,
          });
      await onSaved(data.release);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : editing
            ? 'Не удалось сохранить релиз'
            : 'Не удалось создать релиз',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? 'Редактировать релиз' : 'Новый релиз'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={(e) => void submit(e)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="release-name">Название</Label>
            <Input
              id="release-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Например, v1.4"
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="release-desc">Описание</Label>
            <Textarea
              id="release-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Кратко о составе релиза"
              rows={3}
            />
          </div>
          <div className="space-y-2">
            <Label>Планируемая дата релиза</Label>
            <div className="flex gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 flex-1 justify-start px-3 text-sm font-normal"
                  >
                    {selectedTargetDate
                      ? format(selectedTargetDate, 'dd.MM.yyyy')
                      : 'Выберите дату'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={selectedTargetDate}
                    defaultMonth={selectedTargetDate}
                    onSelect={(day) => {
                      if (!day) return;
                      setTargetDate(format(day, 'yyyy-MM-dd'));
                    }}
                  />
                </PopoverContent>
              </Popover>
              {targetDate && (
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 shrink-0"
                  onClick={() => setTargetDate('')}
                >
                  Очистить
                </Button>
              )}
            </div>
          </div>
          {editing && (
            <div className="space-y-2">
              <Label>Статус</Label>
              <Select
                value={status}
                onValueChange={(v) => setStatus(v as ReleaseStatus)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(RELEASE_STATUS_LABELS) as ReleaseStatus[]).map(
                    (item) => (
                      <SelectItem key={item} value={item}>
                        {RELEASE_STATUS_LABELS[item]}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Отмена
            </Button>
            <Button type="submit" disabled={saving}>
              {saving
                ? editing
                  ? 'Сохранение...'
                  : 'Создание...'
                : editing
                  ? 'Сохранить'
                  : 'Создать'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AttachTasksDialog({
  open,
  release,
  allTasks,
  onClose,
  onAttached,
}: {
  open: boolean;
  release: Release;
  allTasks: Task[];
  onClose: () => void;
  onAttached: () => void | Promise<void>;
}) {
  const [query, setQuery] = useState('');
  const [board, setBoard] = useState('all');
  const [project, setProject] = useState('all');
  const [status, setStatus] = useState('all');
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const inRelease = useMemo(
    () => new Set((release.tasks ?? []).map((t) => t.id)),
    [release.tasks],
  );

  const available = useMemo(
    () => allTasks.filter((t) => !inRelease.has(t.id)),
    [allTasks, inRelease],
  );

  const boardOptions = useMemo(() => {
    const map = new Map<number, string>();
    for (const task of available) {
      const b = task.project?.board;
      if (b) map.set(b.id, b.name);
    }
    return [...map.entries()]
      .map(([id, name]) => ({ value: String(id), label: name }))
      .sort((a, b) => a.label.localeCompare(b.label, 'ru'));
  }, [available]);

  const projectOptions = useMemo(() => {
    const map = new Map<number, string>();
    for (const task of available) {
      const p = task.project;
      if (!p) continue;
      if (board !== 'all' && String(p.boardId) !== board) continue;
      map.set(p.id, p.name);
    }
    return [...map.entries()]
      .map(([id, name]) => ({ value: String(id), label: name }))
      .sort((a, b) => a.label.localeCompare(b.label, 'ru'));
  }, [available, board]);

  const statusOptions = useMemo(() => {
    const names = new Set<string>();
    for (const task of available) {
      if (board !== 'all' && String(task.project?.boardId) !== board) continue;
      if (project !== 'all' && String(task.projectId) !== project) continue;
      if (task.status?.name) names.add(task.status.name);
    }
    return [...names]
      .sort((a, b) => a.localeCompare(b, 'ru'))
      .map((name) => ({ value: name, label: name }));
  }, [available, board, project]);

  useEffect(() => {
    if (board === 'all') return;
    if (!boardOptions.some((o) => o.value === board)) {
      setBoard('all');
      setProject('all');
    }
  }, [board, boardOptions]);

  useEffect(() => {
    if (project === 'all') return;
    if (!projectOptions.some((o) => o.value === project)) {
      setProject('all');
    }
  }, [project, projectOptions]);

  useEffect(() => {
    if (status === 'all') return;
    if (!statusOptions.some((o) => o.value === status)) {
      setStatus('all');
    }
  }, [status, statusOptions]);

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return available
      .filter((t) => {
        if (board !== 'all' && String(t.project?.boardId) !== board) return false;
        if (project !== 'all' && String(t.projectId) !== project) return false;
        if (status !== 'all' && t.status?.name !== status) return false;
        if (!q) return true;
        const hay = [
          t.title,
          t.project?.name,
          t.project?.board?.name,
          t.status?.name,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 120);
  }, [available, board, project, status, query]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setBoard('all');
    setProject('all');
    setStatus('all');
    setPicked(new Set());
    setError('');
  }, [open]);

  const toggle = (id: number) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (picked.size === 0) {
      setError('Выберите хотя бы одну задачу');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api.attachReleaseTasks(release.id, [...picked]);
      await onAttached();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось добавить задачи');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl overflow-hidden">
        <DialogHeader>
          <DialogTitle>Добавить задачи в «{release.name}»</DialogTitle>
        </DialogHeader>
        <form onSubmit={(e) => void submit(e)} className="min-w-0 space-y-4">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск по названию..."
          />
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="shrink-0">Доска</span>
              <AppSelect
                value={board}
                onValueChange={(v) => {
                  setBoard(v);
                  setProject('all');
                  setStatus('all');
                }}
                options={[{ value: 'all', label: 'Все' }, ...boardOptions]}
                className="w-[10.5rem] text-xs"
              />
            </label>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="shrink-0">Проект</span>
              <AppSelect
                value={project}
                onValueChange={(v) => {
                  setProject(v);
                  setStatus('all');
                }}
                options={[{ value: 'all', label: 'Все' }, ...projectOptions]}
                className="w-[10.5rem] text-xs"
              />
            </label>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="shrink-0">Статус</span>
              <AppSelect
                value={status}
                onValueChange={setStatus}
                options={[{ value: 'all', label: 'Все' }, ...statusOptions]}
                className="w-[10.5rem] text-xs"
              />
            </label>
          </div>
          <div className="max-h-72 space-y-1 overflow-x-hidden overflow-y-auto rounded-md border border-border p-2">
            {candidates.length === 0 ? (
              <p className="px-2 py-4 text-center text-sm text-muted-foreground">
                Нет подходящих задач
              </p>
            ) : (
              candidates.map((task) => {
                const checked = picked.has(task.id);
                return (
                  <label
                    key={task.id}
                    className={cn(
                      'flex w-full min-w-0 cursor-pointer items-start gap-2 overflow-hidden rounded-md px-2 py-1.5 text-sm hover:bg-accent/50',
                      checked && 'bg-accent/40',
                    )}
                  >
                    <input
                      type="checkbox"
                      className="mt-1 shrink-0"
                      checked={checked}
                      onChange={() => toggle(task.id)}
                    />
                    <span className="min-w-0 flex-1 overflow-hidden">
                      <span
                        className="block truncate font-medium"
                        title={task.title}
                      >
                        {task.title}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {[task.project?.board?.name, task.project?.name, task.status?.name]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </span>
                  </label>
                );
              })
            )}
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Отмена
            </Button>
            <Button type="submit" disabled={saving || picked.size === 0}>
              {saving ? 'Добавление...' : `Добавить (${picked.size})`}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CreateReleaseTaskDialog({
  open,
  release,
  boards,
  onClose,
  onCreated,
}: {
  open: boolean;
  release: Release;
  boards: Board[];
  onClose: () => void;
  onCreated: () => void | Promise<void>;
}) {
  const [boardId, setBoardId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Priority>('MEDIUM');
  const [deadline, setDeadline] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const boardProjects = useMemo(() => {
    const board = boards.find((b) => String(b.id) === boardId);
    return board?.projects ?? [];
  }, [boards, boardId]);

  useEffect(() => {
    if (!open) return;
    setBoardId(boards[0] ? String(boards[0].id) : '');
    setProjectId('');
    setTitle('');
    setDescription('');
    setPriority('MEDIUM');
    setDeadline(null);
    setFiles([]);
    setError('');
  }, [open, boards]);

  useEffect(() => {
    if (!boardId) {
      setProjectId('');
      return;
    }
    const first = boardProjects[0];
    setProjectId(first ? String(first.id) : '');
  }, [boardId, boardProjects]);

  const addFiles = (incoming: File[]) => {
    const ok: File[] = [];
    for (const file of incoming) {
      if (file.size > MAX_UPLOAD_FILE_SIZE) {
        setError(`Файл «${file.name}» больше 500 МБ`);
        continue;
      }
      ok.push(file);
    }
    if (!ok.length) return;
    setFiles((prev) => {
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

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) {
      setError('Укажите название задачи');
      return;
    }
    if (trimmed.length > MAX_TASK_TITLE_LENGTH) {
      setError(
        `Название задачи не длиннее ${MAX_TASK_TITLE_LENGTH} символов`,
      );
      return;
    }
    const pid = Number(projectId);
    if (!pid) {
      setError('Выберите доску и проект');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const filesToUpload = [...files];
      const res = await api.createTask(pid, {
        title: trimmed,
        description: description.trim() || undefined,
        priority,
        deadline: deadline || null,
        releaseId: release.id,
      });
      if (filesToUpload.length > 0) {
        void useUploadsStore.getState().uploadTaskFiles({
          taskId: res.task.id,
          title: trimmed,
          files: filesToUpload,
          onComplete: async () => {
            await onCreated();
          },
        });
      }
      await onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось создать задачу');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Новая задача в релизе «{release.name}»</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => void submit(e)}
          className="space-y-4"
          onPaste={(e) => {
            if (saving) return;
            const pasted = extractClipboardFiles(e.clipboardData);
            if (!pasted.length) return;
            e.preventDefault();
            addFiles(pasted);
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Доска</Label>
              <Select value={boardId || undefined} onValueChange={setBoardId}>
                <SelectTrigger>
                  <SelectValue placeholder="Выберите доску" />
                </SelectTrigger>
                <SelectContent>
                  {boards.map((board) => (
                    <SelectItem key={board.id} value={String(board.id)}>
                      {board.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Проект</Label>
              <Select
                value={projectId || undefined}
                onValueChange={setProjectId}
                disabled={boardProjects.length === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Выберите проект" />
                </SelectTrigger>
                <SelectContent>
                  {boardProjects.map((project) => (
                    <SelectItem key={project.id} value={String(project.id)}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="rel-task-title">Название</Label>
            <Input
              id="rel-task-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={MAX_TASK_TITLE_LENGTH}
              disabled={saving}
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="rel-task-desc">Описание</Label>
            <Textarea
              id="rel-task-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              disabled={saving}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Приоритет</Label>
              <PrioritySelect
                value={priority}
                onChange={setPriority}
                disabled={saving}
                className="h-10"
              />
            </div>
            <div className="space-y-2">
              <Label>Дедлайн</Label>
              <DeadlinePicker
                value={deadline}
                disabled={saving}
                onChange={setDeadline}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Файлы</Label>
            <FileDropZone
              disabled={saving}
              onFiles={addFiles}
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
            {files.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {files.map((file, index) => (
                  <PendingFileChip
                    key={`${file.name}-${file.size}-${index}`}
                    name={file.name}
                    progress={null}
                    status="pending"
                    disabled={saving}
                    onRemove={
                      saving
                        ? undefined
                        : () =>
                            setFiles((prev) =>
                              prev.filter((_, i) => i !== index),
                            )
                    }
                    className="min-w-[10rem] max-w-full sm:max-w-[14rem]"
                  />
                ))}
              </div>
            )}
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Отмена
            </Button>
            <Button type="submit" disabled={saving || !projectId}>
              {saving ? 'Создание...' : 'Создать'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
