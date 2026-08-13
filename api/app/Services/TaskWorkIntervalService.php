<?php

namespace App\Services;

use App\Models\ProjectStatus;
use App\Models\Task;
use App\Models\TaskWorkInterval;
use App\Support\TaskBuckets;
use Illuminate\Support\Carbon;

class TaskWorkIntervalService
{
    public function onStatusChange(
        Task $task,
        ProjectStatus $to,
        ?int $workerUserId,
        ?Carbon $at = null,
    ): void {
        $at ??= now();
        $this->closeOpenIntervalsForTask((int) $task->id, $at);

        if ($workerUserId === null) {
            return;
        }

        $statuses = $this->projectStatuses($task);
        if (! TaskBuckets::isInProgressStatus($to, $statuses)) {
            return;
        }

        $this->openInterval($task, $workerUserId, $to, $at);
    }

    public function onActiveAssigneeChange(
        Task $task,
        ?int $prevUserId,
        ?int $nextUserId,
        ?Carbon $at = null,
    ): void {
        $at ??= now();
        if ((int) ($prevUserId ?? 0) === (int) ($nextUserId ?? 0)) {
            return;
        }

        $status = $task->relationLoaded('status')
            ? $task->status
            : $task->status()->first();
        if (! $status) {
            return;
        }

        $statuses = $this->projectStatuses($task);
        if (! TaskBuckets::isInProgressStatus($status, $statuses)) {
            $this->closeOpenIntervalsForTask((int) $task->id, $at);

            return;
        }

        $this->closeOpenIntervalsForTask((int) $task->id, $at);

        if ($nextUserId !== null) {
            $this->openInterval($task, $nextUserId, $status, $at);
        }
    }

    /**
     * Resolve the worker who should own the interval for the task.
     */
    public function resolveWorkerUserId(Task $task, ?int $preferredActiveId = null): ?int
    {
        $ids = $task->assigneeIds();
        if ($ids === []) {
            return null;
        }

        if ($preferredActiveId !== null && in_array($preferredActiveId, $ids, true)) {
            return $preferredActiveId;
        }

        if (count($ids) === 1) {
            return $ids[0];
        }

        if ($task->active_assignee_id !== null && in_array((int) $task->active_assignee_id, $ids, true)) {
            return (int) $task->active_assignee_id;
        }

        return null;
    }

    public function closeOpenIntervalsForTask(int $taskId, ?Carbon $at = null): void
    {
        $at ??= now();
        $open = TaskWorkInterval::query()
            ->where('task_id', $taskId)
            ->whereNull('ended_at')
            ->get();

        foreach ($open as $interval) {
            $end = $interval->started_at && $interval->started_at->gt($at)
                ? $interval->started_at
                : $at;
            $interval->update(['ended_at' => $end]);
        }
    }

    private function openInterval(
        Task $task,
        int $userId,
        ProjectStatus $status,
        Carbon $at,
    ): void {
        $exists = TaskWorkInterval::query()
            ->where('task_id', $task->id)
            ->whereNull('ended_at')
            ->exists();
        if ($exists) {
            return;
        }

        TaskWorkInterval::query()->create([
            'task_id' => $task->id,
            'user_id' => $userId,
            'status_id' => $status->id,
            'status_name' => $status->name,
            'started_at' => $at,
            'ended_at' => null,
        ]);
    }

    /**
     * @return \Illuminate\Support\Collection<int, ProjectStatus>
     */
    private function projectStatuses(Task $task)
    {
        if ($task->relationLoaded('project') && $task->project?->relationLoaded('statuses')) {
            return $task->project->statuses;
        }

        return ProjectStatus::query()
            ->where('project_id', $task->project_id)
            ->orderBy('order')
            ->get();
    }
}
