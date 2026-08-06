import type { ProjectStatus, Task } from '@/lib/api';

export const OPEN_STATUS_NAME = 'Открыта';
export const CLOSED_STATUS_NAME = 'Закрыта';

export type TaskBucketCounts = {
  openTasks: number;
  inProgressTasks: number;
};

/** Open = status «Открыта»; in progress = statuses strictly between «Открыта» and «Закрыта». */
export function computeTaskBuckets(project: {
  statuses: ProjectStatus[];
  tasks?: Task[];
}): TaskBucketCounts {
  const statuses = [...(project.statuses || [])].sort(
    (a, b) => a.order - b.order || a.id - b.id,
  );
  const open = statuses.find((s) => s.name === OPEN_STATUS_NAME);
  const closed = statuses.find((s) => s.name === CLOSED_STATUS_NAME);

  const openId = open?.id ?? null;
  const inProgressIds = new Set<number>();

  if (open && closed) {
    for (const status of statuses) {
      if (status.order > open.order && status.order < closed.order) {
        inProgressIds.add(status.id);
      }
    }
  }

  let openTasks = 0;
  let inProgressTasks = 0;

  for (const task of project.tasks || []) {
    if (openId != null && task.statusId === openId) {
      openTasks += 1;
    } else if (inProgressIds.has(task.statusId)) {
      inProgressTasks += 1;
    }
  }

  return { openTasks, inProgressTasks };
}
