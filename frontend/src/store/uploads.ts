import { create } from 'zustand';
import { api, UploadAbortedError, type UploadProgressEvent } from '@/lib/api';

export type UploadFileItem = {
  id: string;
  name: string;
  progress: number;
  status: 'uploading' | 'done' | 'error';
};

export type UploadJob = {
  id: string;
  kind: 'task' | 'comment';
  title: string;
  taskId: number;
  overallPercent: number;
  files: UploadFileItem[];
  error?: string;
  status: 'uploading' | 'done' | 'error';
};

type StartTaskUploadArgs = {
  taskId: number;
  title: string;
  files: File[];
  onComplete?: () => void | Promise<void>;
};

type StartCommentUploadArgs = {
  taskId: number;
  commentId: number;
  title: string;
  files: File[];
  onComplete?: () => void | Promise<void>;
};

type UploadsState = {
  jobs: UploadJob[];
  uploadTaskFiles: (args: StartTaskUploadArgs) => Promise<void>;
  uploadCommentFiles: (args: StartCommentUploadArgs) => Promise<void>;
  cancelJob: (id: string) => void;
  dismissJob: (id: string) => void;
  clearFinished: () => void;
};

const abortControllers = new Map<string, AbortController>();

function makeId() {
  return `upload-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function applyProgress(
  files: UploadFileItem[],
  event: UploadProgressEvent,
): UploadFileItem[] {
  return files.map((item, index) => {
    if (index < event.fileIndex) {
      return { ...item, progress: 100, status: 'done' };
    }
    if (index === event.fileIndex) {
      return {
        ...item,
        progress: event.filePercent,
        status: event.filePercent >= 100 ? 'done' : 'uploading',
      };
    }
    return item;
  });
}

function patchJob(
  jobs: UploadJob[],
  id: string,
  patch: Partial<UploadJob>,
): UploadJob[] {
  return jobs.map((job) => (job.id === id ? { ...job, ...patch } : job));
}

function isAbortError(err: unknown): boolean {
  return (
    err instanceof UploadAbortedError ||
    (err instanceof Error && err.name === 'UploadAbortedError')
  );
}

export const useUploadsStore = create<UploadsState>((set, get) => ({
  jobs: [],

  cancelJob: (id) => {
    const controller = abortControllers.get(id);
    if (controller) {
      controller.abort();
      abortControllers.delete(id);
    }
    set({ jobs: get().jobs.filter((job) => job.id !== id) });
  },

  dismissJob: (id) => {
    abortControllers.delete(id);
    set({ jobs: get().jobs.filter((job) => job.id !== id) });
  },

  clearFinished: () => {
    set({
      jobs: get().jobs.filter((job) => job.status === 'uploading'),
    });
  },

  uploadTaskFiles: async ({ taskId, title, files, onComplete }) => {
    if (!files.length) return;

    const id = makeId();
    const controller = new AbortController();
    abortControllers.set(id, controller);

    const fileItems: UploadFileItem[] = files.map((file, index) => ({
      id: `${id}-${index}`,
      name: file.name,
      progress: 0,
      status: 'uploading',
    }));

    set({
      jobs: [
        ...get().jobs,
        {
          id,
          kind: 'task',
          title,
          taskId,
          overallPercent: 0,
          files: fileItems,
          status: 'uploading',
        },
      ],
    });

    try {
      await api.uploadTaskFiles(
        taskId,
        files,
        (event) => {
          if (!get().jobs.some((j) => j.id === id)) return;
          set({
            jobs: patchJob(get().jobs, id, {
              overallPercent: event.overallPercent,
              files: applyProgress(
                get().jobs.find((j) => j.id === id)?.files ?? fileItems,
                event,
              ),
            }),
          });
        },
        controller.signal,
      );

      if (!get().jobs.some((j) => j.id === id)) return;

      set({
        jobs: patchJob(get().jobs, id, {
          overallPercent: 100,
          status: 'done',
          files: (get().jobs.find((j) => j.id === id)?.files ?? fileItems).map(
            (f) => ({ ...f, progress: 100, status: 'done' }),
          ),
        }),
      });

      try {
        await onComplete?.();
      } catch {
        // Upload succeeded; refresh errors are non-fatal for the dock.
      }

      window.setTimeout(() => {
        const job = get().jobs.find((j) => j.id === id);
        if (job?.status === 'done') get().dismissJob(id);
      }, 2500);
    } catch (err) {
      abortControllers.delete(id);
      if (isAbortError(err) || !get().jobs.some((j) => j.id === id)) {
        set({ jobs: get().jobs.filter((job) => job.id !== id) });
        return;
      }
      set({
        jobs: patchJob(get().jobs, id, {
          status: 'error',
          error:
            err instanceof Error ? err.message : 'Ошибка загрузки файла',
        }),
      });
    } finally {
      abortControllers.delete(id);
    }
  },

  uploadCommentFiles: async ({
    taskId,
    commentId,
    title,
    files,
    onComplete,
  }) => {
    if (!files.length) return;

    const id = makeId();
    const controller = new AbortController();
    abortControllers.set(id, controller);

    const fileItems: UploadFileItem[] = files.map((file, index) => ({
      id: `${id}-${index}`,
      name: file.name,
      progress: 0,
      status: 'uploading',
    }));

    set({
      jobs: [
        ...get().jobs,
        {
          id,
          kind: 'comment',
          title,
          taskId,
          overallPercent: 0,
          files: fileItems,
          status: 'uploading',
        },
      ],
    });

    try {
      await api.uploadCommentFiles(
        commentId,
        files,
        (event) => {
          if (!get().jobs.some((j) => j.id === id)) return;
          set({
            jobs: patchJob(get().jobs, id, {
              overallPercent: event.overallPercent,
              files: applyProgress(
                get().jobs.find((j) => j.id === id)?.files ?? fileItems,
                event,
              ),
            }),
          });
        },
        controller.signal,
      );

      if (!get().jobs.some((j) => j.id === id)) return;

      set({
        jobs: patchJob(get().jobs, id, {
          overallPercent: 100,
          status: 'done',
          files: (get().jobs.find((j) => j.id === id)?.files ?? fileItems).map(
            (f) => ({ ...f, progress: 100, status: 'done' }),
          ),
        }),
      });

      try {
        await onComplete?.();
      } catch {
        // ignore
      }

      window.setTimeout(() => {
        const job = get().jobs.find((j) => j.id === id);
        if (job?.status === 'done') get().dismissJob(id);
      }, 2500);
    } catch (err) {
      abortControllers.delete(id);
      if (isAbortError(err) || !get().jobs.some((j) => j.id === id)) {
        set({ jobs: get().jobs.filter((job) => job.id !== id) });
        return;
      }
      set({
        jobs: patchJob(get().jobs, id, {
          status: 'error',
          error:
            err instanceof Error ? err.message : 'Ошибка загрузки файла',
        }),
      });
    } finally {
      abortControllers.delete(id);
    }
  },
}));
