/** Same-origin by default. Set VITE_API_URL only if API is on another host. */
const API_URL = String(import.meta.env.VITE_API_URL ?? '').trim();

export type Role = 'ADMIN' | 'DEVELOPER' | 'READER' | 'PENDING';
export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type User = {
  id: number;
  username: string;
  firstName: string;
  lastName: string;
  avatarColor: string;
  avatarUrl?: string | null;
  avatarSourceUrl?: string | null;
  avatarCrop?: { zoom: number; panX: number; panY: number } | null;
  role: Role;
  createdAt: string;
};

export type PublicUser = {
  id: number;
  username: string;
  firstName: string;
  lastName: string;
  avatarColor: string;
  avatarUrl?: string | null;
  role?: Role;
};

export type Attachment = {
  id: number;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
  documentationProductId?: number | null;
  documentationChapterId?: number | null;
};

export type DocumentationTocItem = {
  id: number;
  title: string;
  sortOrder: number;
};

export type DocumentationChapter = {
  id: number;
  productId: number;
  title: string;
  body?: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  files?: Attachment[];
};

export type DocumentationProduct = {
  id: number;
  name: string;
  description?: string | null;
  sortOrder: number;
  createdById?: number | null;
  createdBy?: PublicUser | null;
  chaptersCount: number;
  toc?: DocumentationTocItem[];
  chapters?: DocumentationChapter[];
  files?: Attachment[];
  createdAt: string;
  updatedAt: string;
};

export type HelpNote = {
  id: number;
  title: string;
  body?: string | null;
  pinned: boolean;
  sortOrder: number;
  createdById?: number | null;
  createdBy?: PublicUser | null;
  createdAt: string;
  updatedAt: string;
};

export type ProjectStatus = {
  id: number;
  name: string;
  order: number;
  projectId: number;
  locked?: boolean;
};

export type TaskChangeHistoryType =
  | 'status'
  | 'deadline_set'
  | 'deadline_changed'
  | 'description_changed'
  | 'priority_changed'
  | 'file_added'
  | 'file_removed'
  | 'took_task'
  | 'assigned_assignee'
  | 'took_co_assignee'
  | 'assigned_co_assignee'
  | 'removed_assignee'
  | 'assigned_active_assignee';

export type TaskStatusHistory = {
  id: number;
  fromStatusName?: string | null;
  toStatusName: string;
  createdAt: string;
  user: PublicUser | null;
};

export type TaskChangeHistory = {
  id: number;
  type: TaskChangeHistoryType;
  payload: {
    fromStatusName?: string | null;
    toStatusName?: string | null;
    fromDeadline?: string | null;
    toDeadline?: string | null;
    fromPriority?: Priority | null;
    toPriority?: Priority | null;
    fileName?: string | null;
    targetUserId?: number | null;
    targetUserName?: string | null;
    targetUser?: Pick<
      PublicUser,
      'id' | 'username' | 'firstName' | 'lastName'
    > | null;
  };
  createdAt: string;
  user: PublicUser | null;
};

export type Task = {
  id: number;
  title: string;
  description?: string | null;
  priority: Priority;
  deadline?: string | null;
  projectId: number;
  releaseId?: number | null;
  statusId: number;
  order?: number;
  inBacklog?: boolean;
  activeAssigneeId?: number | null;
  statusChangedAt: string;
  createdAt: string;
  updatedAt: string;
  activeAssignee?: PublicUser | null;
  assignees?: PublicUser[];
  status?: ProjectStatus;
  files?: Attachment[];
  createdBy?: PublicUser;
  project?: {
    id: number;
    name: string;
    boardId: number;
    board?: { id: number; name: string };
  };
  release?: {
    id: number;
    name: string;
    status: ReleaseStatus;
  } | null;
  comments?: Comment[];
  statusHistory?: TaskStatusHistory[];
  changeHistory?: TaskChangeHistory[];
  _count?: { comments: number };
};

export function taskAssignees(task: Task): PublicUser[] {
  return task.assignees ?? [];
}

export function taskActiveAssignee(task: Task): PublicUser | null {
  if (task.activeAssignee) return task.activeAssignee;
  const list = taskAssignees(task);
  if (task.activeAssigneeId != null) {
    return list.find((u) => u.id === task.activeAssigneeId) ?? list[0] ?? null;
  }
  return list[0] ?? null;
}

export function isTaskAssignee(task: Task, userId: number | null | undefined): boolean {
  if (userId == null) return false;
  return taskAssignees(task).some((u) => u.id === userId);
}

export type CommentReplyTo = {
  id: number;
  body: string;
  author: PublicUser;
  hasFiles: boolean;
};

export type Comment = {
  id: number;
  body: string;
  kind?: 'user' | 'status_change';
  createdAt: string;
  editedAt?: string | null;
  replyToId?: number | null;
  replyTo?: CommentReplyTo | null;
  author: PublicUser;
  files: Attachment[];
};

export type AppNotificationType =
  | 'mention'
  | 'reply'
  | 'assignee'
  | 'task_comment'
  | 'status_assignee'
  | 'status_creator'
  | 'subscription_task'
  | 'subscription_status';

export type AppNotification = {
  id: number;
  type: AppNotificationType;
  title: string;
  body?: string | null;
  taskId?: number | null;
  taskTitle?: string | null;
  commentId?: number | null;
  readAt?: string | null;
  createdAt: string;
  actor?: PublicUser | null;
};

export type NotificationSettings = {
  taskComment: boolean;
  mention: boolean;
  reply: boolean;
  assignee: boolean;
  statusAssignee: boolean;
  statusCreator: boolean;
};

export type NotificationSubscription = {
  id: number;
  boardId?: number | null;
  projectId?: number | null;
  notifyNewTasks: boolean;
  notifyStatusChanges: boolean;
  board?: { id: number; name: string } | null;
  project?: {
    id: number;
    name: string;
    boardId: number;
    board?: { id: number; name: string } | null;
  } | null;
};

export type WorkShiftStatus = 'active' | 'paused' | 'completed';

export type WorkShift = {
  id: number;
  userId: number;
  user?: PublicUser | null;
  startedAt: string;
  endedAt?: string | null;
  comment?: string | null;
  status: WorkShiftStatus;
  pausedAt?: string | null;
  pauseElapsedSeconds: number;
  totalPauseSeconds: number;
};

export type ShiftStatsStatusSlice = {
  statusName: string;
  toStatusName: string;
  seconds: number;
  user?: PublicUser | null;
  /** Co-author time: shown in «По статусам», excluded from pie / task totals. */
  isPeer?: boolean;
};

export type ShiftStatsTask = {
  taskId: number;
  title: string;
  project?: {
    id: number;
    name: string;
    boardId?: number;
    board?: { id: number; name: string } | null;
  } | null;
  totalSeconds: number;
  statuses: ShiftStatsStatusSlice[];
};

export type ShiftStats = {
  shift: WorkShift;
  totalSeconds: number;
  tasks: ShiftStatsTask[];
};

export type Project = {
  id: number;
  name: string;
  boardId: number;
  order?: number;
  statuses: ProjectStatus[];
  tasks?: Task[];
  _count?: {
    tasks?: number;
    openTasks?: number;
    inProgressTasks?: number;
  };
  board?: { id: number; name: string };
};

export type Board = {
  id: number;
  name: string;
  createdAt: string;
  createdBy?: PublicUser;
  projects?: Project[];
  _count?: {
    projects: number;
    openTasks?: number;
    inProgressTasks?: number;
  };
};

export type ReleaseStatus = 'PLANNED' | 'IN_PROGRESS' | 'RELEASED' | 'CANCELLED';

export type Release = {
  id: number;
  name: string;
  description?: string | null;
  status: ReleaseStatus;
  targetDate?: string | null;
  releasedAt?: string | null;
  createdById?: number | null;
  createdBy?: PublicUser | null;
  sortOrder: number;
  tasksCount: number;
  createdAt: string;
  updatedAt: string;
  tasks?: Task[];
};

let refreshRequestPromise: Promise<boolean> | null = null;

function canRetryWithRefresh(path: string): boolean {
  return !path.startsWith('/api/auth/login') &&
    !path.startsWith('/api/auth/register') &&
    !path.startsWith('/api/auth/logout') &&
    !path.startsWith('/api/auth/refresh');
}

async function tryRefreshSession(): Promise<boolean> {
  if (refreshRequestPromise) return refreshRequestPromise;
  refreshRequestPromise = (async () => {
    try {
      const res = await fetch(`${API_URL}/api/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      return res.ok;
    } catch {
      return false;
    } finally {
      refreshRequestPromise = null;
    }
  })();
  return refreshRequestPromise;
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  opts: { allowRefreshRetry?: boolean } = {},
): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> | undefined),
  };
  // Don't send Content-Type without a body — Fastify rejects empty JSON POSTs with 400
  if (options.body && !(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers,
  });

  if (
    res.status === 401 &&
    opts.allowRefreshRetry !== false &&
    canRetryWithRefresh(path)
  ) {
    const refreshed = await tryRefreshSession();
    if (refreshed) {
      return request<T>(path, options, { allowRefreshRetry: false });
    }
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(parseErrorPayload(data));
  }
  return data as T;
}

export type UploadProgressEvent = {
  /** 0-based index of the file currently uploading */
  fileIndex: number;
  /** Progress of the current file, 0–100 */
  filePercent: number;
  /** Overall progress across all files by bytes, 0–100 */
  overallPercent: number;
  fileName: string;
  filesCount: number;
};

export class UploadAbortedError extends Error {
  constructor() {
    super('Загрузка отменена');
    this.name = 'UploadAbortedError';
  }
}

function firstValidationMessage(err: unknown): string | null {
  if (typeof err === 'string' && err.trim()) return err;
  if (!err || typeof err !== 'object') return null;

  const obj = err as Record<string, unknown>;
  if (Array.isArray(obj.formErrors) && typeof obj.formErrors[0] === 'string') {
    return obj.formErrors[0];
  }

  for (const value of Object.values(obj)) {
    if (Array.isArray(value) && typeof value[0] === 'string' && value[0].trim()) {
      return value[0];
    }
    if (typeof value === 'string' && value.trim()) return value;
  }

  return null;
}

function parseErrorPayload(data: unknown): string {
  if (!data || typeof data !== 'object') return 'Ошибка запроса';
  return (
    firstValidationMessage((data as { error?: unknown }).error) ||
    'Ошибка запроса'
  );
}

function uploadFormData<T>(
  path: string,
  form: FormData,
  onProgress?: (percent: number) => void,
  signal?: AbortSignal,
): Promise<T> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new UploadAbortedError());
      return;
    }

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_URL}${path}`);
    xhr.withCredentials = true;

    const onAbort = () => {
      xhr.abort();
    };
    signal?.addEventListener('abort', onAbort);

    const cleanup = () => {
      signal?.removeEventListener('abort', onAbort);
    };

    xhr.upload.onprogress = (event) => {
      if (!onProgress || !event.lengthComputable || event.total <= 0) return;
      onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
    };

    xhr.onload = () => {
      cleanup();
      let data: unknown = {};
      try {
        data = xhr.responseText ? JSON.parse(xhr.responseText) : {};
      } catch {
        data = {};
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(data as T);
        return;
      }
      reject(new Error(parseErrorPayload(data)));
    };

    xhr.onerror = () => {
      cleanup();
      reject(new Error('Ошибка сети при загрузке файла'));
    };
    xhr.onabort = () => {
      cleanup();
      reject(new UploadAbortedError());
    };
    xhr.send(form);
  });
}

async function uploadFilesSequential<T>(
  path: string,
  files: File[],
  onProgress?: (event: UploadProgressEvent) => void,
  signal?: AbortSignal,
): Promise<T> {
  if (!files.length) {
    throw new Error('Нет файлов для загрузки');
  }

  const sizes = files.map((f) => f.size);
  const totalBytes = sizes.reduce((sum, n) => sum + n, 0) || 1;
  let completedBytes = 0;
  let lastResult: T | undefined;
  const allUploaded: Attachment[] = [];

  for (let i = 0; i < files.length; i++) {
    if (signal?.aborted) {
      throw new UploadAbortedError();
    }

    const file = files[i]!;
    const form = new FormData();
    form.append('file', file);

    lastResult = await uploadFormData<T>(
      path,
      form,
      (filePercent) => {
        const loadedForFile = (filePercent / 100) * sizes[i]!;
        const overallPercent = Math.min(
          100,
          Math.round(((completedBytes + loadedForFile) / totalBytes) * 100),
        );
        onProgress?.({
          fileIndex: i,
          filePercent,
          overallPercent,
          fileName: file.name,
          filesCount: files.length,
        });
      },
      signal,
    );

    const batch = (lastResult as { files?: Attachment[] } | undefined)?.files;
    if (Array.isArray(batch)) {
      allUploaded.push(...batch);
    }

    completedBytes += sizes[i]!;
    onProgress?.({
      fileIndex: i,
      filePercent: 100,
      overallPercent: Math.min(
        100,
        Math.round((completedBytes / totalBytes) * 100),
      ),
      fileName: file.name,
      filesCount: files.length,
    });
  }

  if (allUploaded.length > 0 && lastResult && typeof lastResult === 'object') {
    return {
      ...(lastResult as object),
      files: allUploaded,
      file: allUploaded[0],
    } as T;
  }

  return lastResult as T;
}

export const api = {
  register: (body: {
    username: string;
    firstName: string;
    lastName: string;
    password: string;
    confirmPassword: string;
  }) =>
    request<{ user: User }>('/api/auth/register', { method: 'POST', body: JSON.stringify(body) }),
  login: (body: { username: string; password: string }) =>
    request<{ user: User }>('/api/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  logout: () => request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),
  me: () => request<{ user: User }>('/api/auth/me'),

  updateProfile: (body: {
    firstName?: string;
    lastName?: string;
    avatarColor?: string;
  }) =>
    request<{ user: User }>('/api/profile', {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  uploadProfileAvatar: (payload: {
    cropped: File;
    source?: File | null;
    crop: { zoom: number; panX: number; panY: number };
  }) => {
    const form = new FormData();
    form.append('file', payload.cropped);
    form.append('crop', JSON.stringify(payload.crop));
    if (payload.source) {
      form.append('source', payload.source);
    }
    return uploadFormData<{ user: User }>('/api/profile/avatar', form);
  },
  deleteProfileAvatar: () =>
    request<{ user: User }>('/api/profile/avatar', { method: 'DELETE' }),

  shifts: () => request<{ shifts: WorkShift[] }>('/api/shifts'),
  shiftStats: (id: number) => request<ShiftStats>(`/api/shifts/${id}/stats`),
  currentShift: () => request<{ shift: WorkShift | null }>('/api/shifts/current'),
  startShift: () =>
    request<{ shift: WorkShift }>('/api/shifts/start', { method: 'POST' }),
  pauseShift: () =>
    request<{ shift: WorkShift }>('/api/shifts/pause', { method: 'POST' }),
  resumeShift: () =>
    request<{ shift: WorkShift }>('/api/shifts/resume', { method: 'POST' }),
  endShift: (body: { endedAt: string; comment?: string }) =>
    request<{ shift: WorkShift }>('/api/shifts/end', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  users: () => request<{ users: User[] }>('/api/users'),
  assignableUsers: () => request<{ users: User[] }>('/api/users/assignable'),
  approveUser: (id: number, role: Role) =>
    request<{ user: User }>(`/api/users/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify({ role }),
    }),
  rejectUser: (id: number) =>
    request<{ ok: boolean }>(`/api/users/${id}/reject`, { method: 'POST' }),
  setRole: (id: number, role: Role) =>
    request<{ user: User }>(`/api/users/${id}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    }),

  boards: () => request<{ boards: Board[] }>('/api/boards'),
  board: (id: number) => request<{ board: Board }>(`/api/boards/${id}`),
  createBoard: (name: string) =>
    request<{ board: Board }>('/api/boards', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
  updateBoard: (id: number, name: string) =>
    request<{ board: Board }>(`/api/boards/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    }),
  deleteBoard: (id: number) =>
    request<{ ok: boolean }>(`/api/boards/${id}`, { method: 'DELETE' }),

  createProject: (boardId: number, name: string) =>
    request<{ project: Project }>(`/api/boards/${boardId}/projects`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
  reorderProjects: (boardId: number, orderedIds: number[]) =>
    request<{ projects: Project[] }>(`/api/boards/${boardId}/projects/reorder`, {
      method: 'PUT',
      body: JSON.stringify({ orderedIds }),
    }),
  project: (id: number) => request<{ project: Project }>(`/api/projects/${id}`),
  updateProject: (id: number, name: string) =>
    request<{ project: Project }>(`/api/projects/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    }),
  deleteProject: (id: number) =>
    request<{ ok: boolean }>(`/api/projects/${id}`, { method: 'DELETE' }),

  createStatus: (projectId: number, name: string) =>
    request<{ status: ProjectStatus }>(`/api/projects/${projectId}/statuses`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
  updateStatus: (id: number, data: { name?: string; order?: number }) =>
    request<{ status: ProjectStatus }>(`/api/statuses/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  reorderStatuses: (projectId: number, orderedIds: number[]) =>
    request<{ statuses: ProjectStatus[] }>(`/api/projects/${projectId}/statuses/reorder`, {
      method: 'PUT',
      body: JSON.stringify({ orderedIds }),
    }),
  deleteStatus: (id: number) =>
    request<{ ok: boolean }>(`/api/statuses/${id}`, { method: 'DELETE' }),

  createTask: (
    projectId: number,
    data: {
      title: string;
      description?: string;
      priority?: Priority;
      deadline?: string | null;
      statusId?: number;
      assigneeId?: number | null;
      assigneeIds?: number[];
      activeAssigneeId?: number | null;
      releaseId?: number | null;
    },
  ) =>
    request<{ task: Task }>(`/api/projects/${projectId}/tasks`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  tasks: () => request<{ tasks: Task[] }>('/api/tasks'),
  backlogTasks: () => request<{ tasks: Task[] }>('/api/tasks/backlog'),
  task: (id: number) => request<{ task: Task }>(`/api/tasks/${id}`),
  updateTask: (id: number, data: Record<string, unknown>) =>
    request<{ task: Task; needsActiveChoice?: boolean }>(`/api/tasks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  moveTaskPosition: (
    id: number,
    data: {
      statusId: number;
      index: number;
      activeAssigneeId?: number;
      closeComment?: string;
    },
  ) =>
    request<{ task: Task }>(`/api/tasks/${id}/position`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  takeTask: (id: number) =>
    request<{ task: Task; needsActiveChoice?: boolean }>(`/api/tasks/${id}/take`, {
      method: 'POST',
    }),
  moveTaskBoard: (
    id: number,
    data: { boardId: number; projectId: number; statusId?: number },
  ) =>
    request<{ task: Task }>(`/api/tasks/${id}/move-board`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  deleteTask: (id: number) =>
    request<{ ok: boolean }>(`/api/tasks/${id}`, { method: 'DELETE' }),

  releases: () => request<{ releases: Release[] }>('/api/releases'),
  release: (id: number) => request<{ release: Release }>(`/api/releases/${id}`),
  createRelease: (data: {
    name: string;
    description?: string;
    status?: ReleaseStatus;
    targetDate?: string | null;
  }) =>
    request<{ release: Release }>('/api/releases', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateRelease: (
    id: number,
    data: {
      name?: string;
      description?: string | null;
      status?: ReleaseStatus;
      targetDate?: string | null;
    },
  ) =>
    request<{ release: Release }>(`/api/releases/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  deleteRelease: (id: number) =>
    request<{ ok: boolean }>(`/api/releases/${id}`, { method: 'DELETE' }),
  attachReleaseTasks: (id: number, taskIds: number[]) =>
    request<{ release: Release }>(`/api/releases/${id}/tasks`, {
      method: 'POST',
      body: JSON.stringify({ taskIds }),
    }),
  detachReleaseTask: (id: number, taskId: number) =>
    request<{ ok: boolean }>(`/api/releases/${id}/tasks/${taskId}`, {
      method: 'DELETE',
    }),

  helpProducts: () =>
    request<{ products: DocumentationProduct[] }>('/api/help/products'),
  helpProduct: (id: number) =>
    request<{ product: DocumentationProduct }>(`/api/help/products/${id}`),
  createHelpProduct: (data: { name: string; description?: string }) =>
    request<{ product: DocumentationProduct }>('/api/help/products', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateHelpProduct: (
    id: number,
    data: { name?: string; description?: string | null },
  ) =>
    request<{ product: DocumentationProduct }>(`/api/help/products/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  deleteHelpProduct: (id: number) =>
    request<{ ok: boolean }>(`/api/help/products/${id}`, { method: 'DELETE' }),
  reorderHelpProducts: (orderedIds: number[]) =>
    request<{ products: DocumentationProduct[] }>('/api/help/products/reorder', {
      method: 'PUT',
      body: JSON.stringify({ orderedIds }),
    }),
  createHelpChapter: (
    productId: number,
    data: { title: string; body?: string },
  ) =>
    request<{ chapter: DocumentationChapter }>(
      `/api/help/products/${productId}/chapters`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      },
    ),
  updateHelpChapter: (
    id: number,
    data: { title?: string; body?: string | null },
  ) =>
    request<{ chapter: DocumentationChapter }>(`/api/help/chapters/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  deleteHelpChapter: (id: number) =>
    request<{ ok: boolean }>(`/api/help/chapters/${id}`, { method: 'DELETE' }),
  reorderHelpChapters: (productId: number, orderedIds: number[]) =>
    request<{ product: DocumentationProduct }>(
      `/api/help/products/${productId}/chapters/reorder`,
      {
        method: 'PUT',
        body: JSON.stringify({ orderedIds }),
      },
    ),
  uploadHelpProductFiles: (
    productId: number,
    files: File[],
    onProgress?: (event: UploadProgressEvent) => void,
    signal?: AbortSignal,
  ) =>
    uploadFilesSequential<{ file: Attachment; files: Attachment[] }>(
      `/api/help/products/${productId}/files`,
      files,
      onProgress,
      signal,
    ),
  uploadHelpChapterFiles: (
    chapterId: number,
    files: File[],
    onProgress?: (event: UploadProgressEvent) => void,
    signal?: AbortSignal,
  ) =>
    uploadFilesSequential<{ file: Attachment; files: Attachment[] }>(
      `/api/help/chapters/${chapterId}/files`,
      files,
      onProgress,
      signal,
    ),

  helpNotes: () => request<{ notes: HelpNote[] }>('/api/help/notes'),
  createHelpNote: (data: {
    title: string;
    body?: string;
    pinned?: boolean;
  }) =>
    request<{ note: HelpNote }>('/api/help/notes', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateHelpNote: (
    id: number,
    data: { title?: string; body?: string | null; pinned?: boolean },
  ) =>
    request<{ note: HelpNote }>(`/api/help/notes/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  deleteHelpNote: (id: number) =>
    request<{ ok: boolean }>(`/api/help/notes/${id}`, { method: 'DELETE' }),
  reorderHelpNotes: (orderedIds: number[]) =>
    request<{ notes: HelpNote[] }>('/api/help/notes/reorder', {
      method: 'PUT',
      body: JSON.stringify({ orderedIds }),
    }),

  addComment: (taskId: number, body: string, replyToId?: number | null) =>
    request<{ comment: Comment }>(`/api/tasks/${taskId}/comments`, {
      method: 'POST',
      body: JSON.stringify({
        body,
        ...(replyToId != null ? { replyToId } : {}),
      }),
    }),
  updateComment: (id: number, body: string) =>
    request<{ comment?: Comment; ok?: boolean; deleted?: boolean }>(
      `/api/comments/${id}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ body }),
      },
    ),
  deleteComment: (id: number) =>
    request<{ ok: boolean }>(`/api/comments/${id}`, { method: 'DELETE' }),
  uploadTaskFile: (
    taskId: number,
    file: File,
    onProgress?: (event: UploadProgressEvent) => void,
    signal?: AbortSignal,
  ) =>
    uploadFilesSequential<{ file: Attachment; files: Attachment[] }>(
      `/api/tasks/${taskId}/files`,
      [file],
      onProgress,
      signal,
    ),
  uploadTaskFiles: (
    taskId: number,
    files: File[],
    onProgress?: (event: UploadProgressEvent) => void,
    signal?: AbortSignal,
  ) =>
    uploadFilesSequential<{ file: Attachment; files: Attachment[] }>(
      `/api/tasks/${taskId}/files`,
      files,
      onProgress,
      signal,
    ),
  uploadCommentFile: (
    commentId: number,
    file: File,
    onProgress?: (event: UploadProgressEvent) => void,
    signal?: AbortSignal,
  ) =>
    uploadFilesSequential<{ file: Attachment; files: Attachment[] }>(
      `/api/comments/${commentId}/files`,
      [file],
      onProgress,
      signal,
    ),
  uploadCommentFiles: (
    commentId: number,
    files: File[],
    onProgress?: (event: UploadProgressEvent) => void,
    signal?: AbortSignal,
  ) =>
    uploadFilesSequential<{ file: Attachment; files: Attachment[] }>(
      `/api/comments/${commentId}/files`,
      files,
      onProgress,
      signal,
    ),
  attachmentUrl: (id: number, download = false) =>
    `${API_URL}/api/attachments/${id}${download ? '?download=1' : ''}`,
  deleteAttachment: (id: number) =>
    request<{ ok: boolean; commentDeleted?: boolean }>(
      `/api/attachments/${id}`,
      { method: 'DELETE' },
    ),

  notifications: (sinceId?: number) =>
    request<{ notifications: AppNotification[]; unreadCount: number }>(
      `/api/notifications${sinceId != null ? `?sinceId=${sinceId}` : ''}`,
    ),
  notificationsUnreadCount: () =>
    request<{ unreadCount: number }>('/api/notifications/unread-count'),
  markNotificationRead: (id: number) =>
    request<{ notification: AppNotification }>(`/api/notifications/${id}/read`, {
      method: 'POST',
    }),
  markAllNotificationsRead: () =>
    request<{ ok: boolean }>('/api/notifications/read-all', { method: 'POST' }),

  notificationSettings: () =>
    request<{ settings: NotificationSettings }>('/api/notification-settings'),
  updateNotificationSettings: (data: Partial<NotificationSettings>) =>
    request<{ settings: NotificationSettings }>('/api/notification-settings', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  notificationSubscriptions: () =>
    request<{ subscriptions: NotificationSubscription[] }>(
      '/api/notification-subscriptions',
    ),
  createNotificationSubscription: (data: {
    boardId?: number;
    projectId?: number;
    notifyNewTasks?: boolean;
    notifyStatusChanges?: boolean;
  }) =>
    request<{ subscription: NotificationSubscription }>(
      '/api/notification-subscriptions',
      { method: 'POST', body: JSON.stringify(data) },
    ),
  updateNotificationSubscription: (
    id: number,
    data: { notifyNewTasks?: boolean; notifyStatusChanges?: boolean },
  ) =>
    request<{ subscription: NotificationSubscription }>(
      `/api/notification-subscriptions/${id}`,
      { method: 'PATCH', body: JSON.stringify(data) },
    ),
  deleteNotificationSubscription: (id: number) =>
    request<{ ok: boolean }>(`/api/notification-subscriptions/${id}`, {
      method: 'DELETE',
    }),

  realtimeConfig: () =>
    request<{
      driver: 'pusher' | 'poll';
      pollIntervalMs: number | null;
      pusher: { key: string; cluster: string } | null;
    }>('/api/realtime/config'),

  realtimePoll: (
    params: {
      afterNotificationId?: number;
      taskId?: number | null;
      taskVersion?: string;
      watchShifts?: boolean;
      shiftsVersion?: string;
    },
    signal?: AbortSignal,
  ) => {
    const q = new URLSearchParams();
    if (params.afterNotificationId != null) {
      q.set('afterNotificationId', String(params.afterNotificationId));
    }
    if (params.taskId != null) {
      q.set('taskId', String(params.taskId));
    }
    if (params.taskVersion) {
      q.set('taskVersion', params.taskVersion);
    }
    if (params.watchShifts) {
      q.set('watchShifts', '1');
    }
    if (params.shiftsVersion) {
      q.set('shiftsVersion', params.shiftsVersion);
    }
    return request<{
      notifications: AppNotification[];
      unreadCount: number;
      afterNotificationId: number;
      task: Task | null;
      taskVersion: string | null;
      shiftsVersion: string | null;
      shiftsChanged: boolean;
    }>(`/api/realtime/poll?${q.toString()}`, { signal });
  },
};
