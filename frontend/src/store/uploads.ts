import { create } from 'zustand';
import { api, UploadAbortedError, type UploadProgressEvent } from '@/lib/api';

export type UploadFileItem = {
  id: string;
  name: string;
  progress: number;
  status: 'pending' | 'uploading' | 'done' | 'error';
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
  cancelFile: (jobId: string, fileId: string) => void;
  dismissJob: (id: string) => void;
  clearFinished: () => void;
};

type JobRuntime = {
  jobAbort: AbortController;
  fileAbort: AbortController | null;
  skippedFileIds: Set<string>;
};

const runtimes = new Map<string, JobRuntime>();

function makeId() {
  return `upload-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
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

function calcOverallPercent(files: UploadFileItem[]): number {
  if (!files.length) return 100;
  const sum = files.reduce((acc, f) => acc + f.progress, 0);
  return Math.min(100, Math.round(sum / files.length));
}

function updateFileProgress(
  files: UploadFileItem[],
  fileId: string,
  progress: number,
  status?: UploadFileItem['status'],
): UploadFileItem[] {
  return files.map((f) =>
    f.id === fileId
      ? {
          ...f,
          progress,
          status:
            status ??
            (progress >= 100 ? 'done' : progress > 0 ? 'uploading' : f.status),
        }
      : f,
  );
}

async function runSequentialUploads(opts: {
  jobId: string;
  files: File[];
  fileItems: UploadFileItem[];
  uploadOne: (
    file: File,
    onProgress: (event: UploadProgressEvent) => void,
    signal: AbortSignal,
  ) => Promise<unknown>;
  onComplete?: () => void | Promise<void>;
  get: () => UploadsState;
  set: (
    partial:
      | Partial<UploadsState>
      | ((state: UploadsState) => Partial<UploadsState>),
  ) => void;
}) {
  const { jobId, files, fileItems, uploadOne, onComplete, get, set } = opts;
  const runtime = runtimes.get(jobId);
  if (!runtime) return;

  let uploadedAny = false;

  try {
    for (let i = 0; i < files.length; i++) {
      const item = fileItems[i];
      if (runtime.skippedFileIds.has(item.id)) continue;
      if (runtime.jobAbort.signal.aborted) {
        throw new UploadAbortedError();
      }
      if (!get().jobs.some((j) => j.id === jobId)) return;

      const fileController = new AbortController();
      runtime.fileAbort = fileController;
      const onJobAbort = () => fileController.abort();
      runtime.jobAbort.signal.addEventListener('abort', onJobAbort);

      set({
        jobs: patchJob(get().jobs, jobId, {
          files: updateFileProgress(
            get().jobs.find((j) => j.id === jobId)?.files ?? fileItems,
            item.id,
            0,
            'uploading',
          ),
        }),
      });

      try {
        await uploadOne(
          files[i],
          (event) => {
            if (!get().jobs.some((j) => j.id === jobId)) return;
            if (runtime.skippedFileIds.has(item.id)) return;
            const current =
              get().jobs.find((j) => j.id === jobId)?.files ?? fileItems;
            const nextFiles = updateFileProgress(
              current,
              item.id,
              event.filePercent,
              event.filePercent >= 100 ? 'done' : 'uploading',
            );
            set({
              jobs: patchJob(get().jobs, jobId, {
                files: nextFiles,
                overallPercent: calcOverallPercent(nextFiles),
              }),
            });
          },
          fileController.signal,
        );

        uploadedAny = true;
        if (!get().jobs.some((j) => j.id === jobId)) return;
        if (runtime.skippedFileIds.has(item.id)) continue;

        const current =
          get().jobs.find((j) => j.id === jobId)?.files ?? fileItems;
        const nextFiles = updateFileProgress(current, item.id, 100, 'done');
        set({
          jobs: patchJob(get().jobs, jobId, {
            files: nextFiles,
            overallPercent: calcOverallPercent(nextFiles),
          }),
        });
      } catch (err) {
        if (isAbortError(err)) {
          if (runtime.jobAbort.signal.aborted) throw err;
          // Single file cancelled — continue with the rest.
          continue;
        }
        throw err;
      } finally {
        runtime.jobAbort.signal.removeEventListener('abort', onJobAbort);
        runtime.fileAbort = null;
      }
    }

    if (!get().jobs.some((j) => j.id === jobId)) return;

    const remaining = get().jobs.find((j) => j.id === jobId)?.files ?? [];
    if (remaining.length === 0) {
      set({ jobs: get().jobs.filter((j) => j.id !== jobId) });
      return;
    }

    set({
      jobs: patchJob(get().jobs, jobId, {
        overallPercent: 100,
        status: 'done',
        files: remaining.map((f) => ({
          ...f,
          progress: 100,
          status: 'done' as const,
        })),
      }),
    });

    if (uploadedAny) {
      try {
        await onComplete?.();
      } catch {
        // ignore refresh errors
      }
    }

    window.setTimeout(() => {
      const job = get().jobs.find((j) => j.id === jobId);
      if (job?.status === 'done') get().dismissJob(jobId);
    }, 2500);
  } catch (err) {
    if (isAbortError(err) || !get().jobs.some((j) => j.id === jobId)) {
      set({ jobs: get().jobs.filter((job) => job.id !== jobId) });
      return;
    }
    set({
      jobs: patchJob(get().jobs, jobId, {
        status: 'error',
        error: err instanceof Error ? err.message : 'Ошибка загрузки файла',
      }),
    });
  } finally {
    runtimes.delete(jobId);
  }
}

export const useUploadsStore = create<UploadsState>((set, get) => ({
  jobs: [],

  cancelJob: (id) => {
    const runtime = runtimes.get(id);
    if (runtime) {
      runtime.jobAbort.abort();
      runtime.fileAbort?.abort();
      runtimes.delete(id);
    }
    set({ jobs: get().jobs.filter((job) => job.id !== id) });
  },

  cancelFile: (jobId, fileId) => {
    const job = get().jobs.find((j) => j.id === jobId);
    if (!job || job.status !== 'uploading') return;

    const runtime = runtimes.get(jobId);
    runtime?.skippedFileIds.add(fileId);

    const target = job.files.find((f) => f.id === fileId);
    const isCurrent =
      !!target && target.status === 'uploading' && target.progress < 100;

    const nextFiles = job.files.filter((f) => f.id !== fileId);
    if (nextFiles.length === 0) {
      get().cancelJob(jobId);
      return;
    }

    set({
      jobs: patchJob(get().jobs, jobId, {
        files: nextFiles,
        overallPercent: calcOverallPercent(nextFiles),
      }),
    });

    if (isCurrent) {
      runtime?.fileAbort?.abort();
    }
  },

  dismissJob: (id) => {
    runtimes.delete(id);
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
    const jobAbort = new AbortController();
    runtimes.set(id, {
      jobAbort,
      fileAbort: null,
      skippedFileIds: new Set(),
    });

    const fileItems: UploadFileItem[] = files.map((file, index) => ({
      id: `${id}-${index}`,
      name: file.name,
      progress: 0,
      status: 'pending' as const,
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

    await runSequentialUploads({
      jobId: id,
      files,
      fileItems,
      onComplete,
      get,
      set,
      uploadOne: (file, onProgress, signal) =>
        api.uploadTaskFile(taskId, file, onProgress, signal),
    });
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
    const jobAbort = new AbortController();
    runtimes.set(id, {
      jobAbort,
      fileAbort: null,
      skippedFileIds: new Set(),
    });

    const fileItems: UploadFileItem[] = files.map((file, index) => ({
      id: `${id}-${index}`,
      name: file.name,
      progress: 0,
      status: 'pending' as const,
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

    await runSequentialUploads({
      jobId: id,
      files,
      fileItems,
      onComplete,
      get,
      set,
      uploadOne: (file, onProgress, signal) =>
        api.uploadCommentFile(commentId, file, onProgress, signal),
    });
  },
}));
