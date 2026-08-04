/** Empty string = same-origin (production behind Caddy). */
const API_URL =
  import.meta.env.VITE_API_URL !== undefined
    ? String(import.meta.env.VITE_API_URL)
    : import.meta.env.DEV
      ? 'http://localhost:3001'
      : '';

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
  _count?: { comments: number };
};

export type Comment = {
  id: number;
  body: string;
  createdAt: string;
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
  _count?: { tasks: number };
  board?: { id: number; name: string };
};

export type Board = {
  id: number;
  name: string;
  createdAt: string;
  createdBy?: PublicUser;
  projects?: Project[];
  _count?: { projects: number };
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
  addComment: (taskId: number, body: string) =>
    request<{ comment: Comment }>(`/api/tasks/${taskId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ body }),
    }),
  uploadTaskFile: (taskId: number, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return request<{ file: Attachment; files: Attachment[] }>(
      `/api/tasks/${taskId}/files`,
      { method: 'POST', body: form },
    );
  },
  uploadTaskFiles: (taskId: number, files: File[]) => {
    const form = new FormData();
    for (const file of files) form.append('file', file);
    return request<{ file: Attachment; files: Attachment[] }>(
      `/api/tasks/${taskId}/files`,
      { method: 'POST', body: form },
    );
  },
  uploadCommentFile: (commentId: number, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return request<{ file: Attachment; files: Attachment[] }>(
      `/api/comments/${commentId}/files`,
      { method: 'POST', body: form },
    );
  },
  uploadCommentFiles: (commentId: number, files: File[]) => {
    const form = new FormData();
    for (const file of files) form.append('file', file);
    return request<{ file: Attachment; files: Attachment[] }>(
      `/api/comments/${commentId}/files`,
      { method: 'POST', body: form },
    );
  },
  attachmentUrl: (id: number, download = false) =>
    `${API_URL}/api/attachments/${id}${download ? '?download=1' : ''}`,
};
