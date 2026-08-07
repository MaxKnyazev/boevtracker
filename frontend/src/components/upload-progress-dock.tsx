import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import {
  PendingFileChip,
  UploadProgressBar,
} from '@/components/file-drop-zone';
import { Button } from '@/components/ui/button';
import { useUploadsStore } from '@/store/uploads';

export function UploadProgressDock() {
  const jobs = useUploadsStore((s) => s.jobs);
  const cancelJob = useUploadsStore((s) => s.cancelJob);
  const dismissJob = useUploadsStore((s) => s.dismissJob);

  const visible = jobs.filter(
    (job) =>
      job.status === 'uploading' ||
      job.status === 'error' ||
      job.status === 'done',
  );

  if (!visible.length) return null;

  return createPortal(
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(100vw-2rem,22rem)] flex-col gap-2">
      {visible.map((job) => (
        <div
          key={job.id}
          className="pointer-events-auto rounded-xl border border-border bg-card p-3 shadow-xl"
        >
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{job.title}</div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">
                {job.status === 'error'
                  ? job.error || 'Ошибка загрузки'
                  : job.status === 'done'
                    ? 'Загрузка завершена'
                    : `Загрузка файлов… ${Math.round(job.overallPercent)}%`}
              </div>
            </div>
            {job.status === 'uploading' ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 shrink-0 px-2 text-xs"
                onClick={() => cancelJob(job.id)}
              >
                Отменить
              </Button>
            ) : (
              <button
                type="button"
                className="rounded-sm p-1 opacity-70 hover:bg-accent hover:opacity-100"
                title="Закрыть"
                onClick={() => dismissJob(job.id)}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {job.status === 'uploading' && (
            <UploadProgressBar
              value={job.overallPercent}
              className="mt-2"
            />
          )}
          {job.status === 'done' && (
            <UploadProgressBar value={100} className="mt-2" />
          )}
          {job.files.length > 0 && job.status !== 'done' && (
            <div className="mt-2 max-h-32 space-y-1.5 overflow-y-auto">
              {job.files.map((file) => (
                <PendingFileChip
                  key={file.id}
                  name={file.name}
                  progress={file.progress}
                  status={
                    file.status === 'error'
                      ? 'error'
                      : file.progress >= 100
                        ? 'done'
                        : 'uploading'
                  }
                />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>,
    document.body,
  );
}
