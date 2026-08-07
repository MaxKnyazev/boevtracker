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
  role: Role;
  createdAt: string;
};

export type PublicUser = {
  id: number;
  username: string;
  firstName: string;
  lastName: string;
  avatarColor: string;
  role?: Role;
};

export type Attachment = {
  id: number;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
};

export type ProjectStatus = {
  id: number;
  name: string;
  order: number;
  projectId: number;
  locked?: boolean;
};

export type TaskStatusHistory = {
  id: number;
  fromStatusName?: string | null;
  toStatusName: string;
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
  statusId: number;
  order?: number;
  assigneeId?: number | null;
  statusChangedAt: string;
  createdAt: string;
  updatedAt: string;
  assignee?: PublicUser | null;
  status?: ProjectStatus;
  files?: Attachment[];
  createdBy?: PublicUser;
  project?: {
    id: number;
    name: string;
    boardId: number;
    board?: { id: number; name: string };
  };
  comments?: Comment[];
  statusHistory?: TaskStatusHistory[];
  _count?: { comments: number };
};

export type CommentReplyTo = {
  id: number;
  body: string;
  author: PublicUser;
  hasFiles: boolean;
};

export type Comment = {
  id: number;
  body: string;
  createdAt: string;
  editedAt?: string | null;
  replyToId?: number | null;
  replyTo?: CommentReplyTo | null;
  author: PublicUser;
  files: Attachment[];
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

async function request<T>(
  path: string,
  options: RequestInit = {},
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

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      typeof data.error === 'string'
        ? data.error
        : data.error?.formErrors?.[0] || 'Ошибка запроса';
    throw new Error(message);
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

function parseErrorPayload(data: unknown): string {
  if (!data || typeof data !== 'object') return 'Ошибка запроса';
  const err = (data as { error?: unknown }).error;
  if (typeof err === 'string') return err;
  if (err && typeof err === 'object') {
    const formErrors = (err as { formErrors?: unknown }).formErrors;
    if (Array.isArray(formErrors) && typeof formErrors[0] === 'string') {
      return formErrors[0];
    }
  }
  return 'Ошибка запроса';
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

  for (let i = 0; i < files.length; i++) {
    if (signal?.aborted) {
      throw new UploadAbortedError();
    }

    const file = files[i];
    const form = new FormData();
    form.append('file', file);

    lastResult = await uploadFormData<T>(
      path,
      form,
      (filePercent) => {
        const loadedForFile = (filePercent / 100) * sizes[i];
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

    completedBytes += sizes[i];
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
    },
  ) =>
    request<{ task: Task }>(`/api/projects/${projectId}/tasks`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  tasks: () => request<{ tasks: Task[] }>('/api/tasks'),
  task: (id: number) => request<{ task: Task }>(`/api/tasks/${id}`),
  updateTask: (id: number, data: Record<string, unknown>) =>
    request<{ task: Task }>(`/api/tasks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  moveTaskPosition: (id: number, data: { statusId: number; index: number }) =>
    request<{ task: Task }>(`/api/tasks/${id}/position`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  takeTask: (id: number) =>
    request<{ task: Task }>(`/api/tasks/${id}/take`, { method: 'POST' }),
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
};
