<?php

namespace App\Services;

use App\Models\TaskWorkInterval;
use App\Models\WorkShift;
use App\Support\ApiPresenter;
use App\Support\AppDateTime;
use Illuminate\Support\Carbon;

class ShiftStatsService
{
    /**
     * @return array{
     *   shift: array,
     *   totalSeconds: int,
     *   tasks: list<array{
     *     taskId: int,
     *     title: string,
     *     project: array{id: int, name: string, boardId?: int}|null,
     *     totalSeconds: int,
     *     statuses: list<array{statusName: string, seconds: int, user: ?array}>
     *   }>
     * }
     */
    public function build(WorkShift $shift): array
    {
        $shift->loadMissing(['user', 'pauses']);

        [$shiftStart, $shiftEnd] = AppDateTime::shiftWindow($shift);
        $startDb = AppDateTime::toDb($shiftStart);
        $endDb = AppDateTime::toDb($shiftEnd);

        $pauseRanges = [];
        foreach ($shift->pauses as $pause) {
            $pStart = $pause->started_at->copy()->timezone(AppDateTime::timezone());
            $pEnd = ($pause->ended_at ?? $shiftEnd)->copy()->timezone(AppDateTime::timezone());
            if ($pEnd->lt($pStart)) {
                $pEnd = $pStart->copy();
            }
            // Clip pauses to the shift window.
            if ($pEnd->lte($shiftStart) || $pStart->gte($shiftEnd)) {
                continue;
            }
            if ($pStart->lt($shiftStart)) {
                $pStart = $shiftStart->copy();
            }
            if ($pEnd->gt($shiftEnd)) {
                $pEnd = $shiftEnd->copy();
            }
            $pauseRanges[] = [$pStart, $pEnd];
        }

        $ownerIntervals = TaskWorkInterval::query()
            ->with(['task.project.board', 'user'])
            ->where('user_id', $shift->user_id)
            ->where('started_at', '<', $endDb)
            ->where(function ($q) use ($startDb) {
                $q->whereNull('ended_at')
                    ->orWhere('ended_at', '>', $startDb);
            })
            ->orderBy('started_at')
            ->get();

        /** @var array<int, array{taskId: int, title: string, project: ?array, totalSeconds: int, statusMap: array<string, array{statusName: string, seconds: int, user: ?array}>}> $byTask */
        $byTask = [];
        /** @var array<int, array{ids: array<int, true>, names: array<string, true>}> $ownerStatusesByTask */
        $ownerStatusesByTask = [];

        foreach ($ownerIntervals as $interval) {
            $seconds = $this->workedSeconds($interval, $shiftStart, $shiftEnd, $pauseRanges);
            if ($seconds <= 0) {
                continue;
            }

            $taskId = (int) $interval->task_id;
            $this->ensureTaskBucket($byTask, $interval);
            $byTask[$taskId]['totalSeconds'] += $seconds;
            $this->addStatusSeconds(
                $byTask[$taskId]['statusMap'],
                $interval,
                $seconds,
            );

            if (! isset($ownerStatusesByTask[$taskId])) {
                $ownerStatusesByTask[$taskId] = ['ids' => [], 'names' => []];
            }
            if ($interval->status_id !== null) {
                $ownerStatusesByTask[$taskId]['ids'][(int) $interval->status_id] = true;
            }
            $statusName = $interval->status_name !== ''
                ? $interval->status_name
                : 'Без статуса';
            $ownerStatusesByTask[$taskId]['names'][$statusName] = true;
        }

        $taskIds = array_keys($byTask);
        if ($taskIds !== []) {
            // Co-dev: peers on the same tasks, but only on statuses the shift owner worked.
            $peerIntervals = TaskWorkInterval::query()
                ->with(['task.project.board', 'user'])
                ->whereIn('task_id', $taskIds)
                ->where('user_id', '!=', $shift->user_id)
                ->where('started_at', '<', $endDb)
                ->where(function ($q) use ($startDb) {
                    $q->whereNull('ended_at')
                        ->orWhere('ended_at', '>', $startDb);
                })
                ->orderBy('started_at')
                ->get();

            foreach ($peerIntervals as $interval) {
                $taskId = (int) $interval->task_id;
                $allowed = $ownerStatusesByTask[$taskId] ?? null;
                if ($allowed === null || ! $this->peerMatchesOwnerStatus($interval, $allowed)) {
                    continue;
                }

                $seconds = $this->workedSeconds($interval, $shiftStart, $shiftEnd, []);
                if ($seconds <= 0) {
                    continue;
                }
                $this->ensureTaskBucket($byTask, $interval);
                $this->addStatusSeconds(
                    $byTask[$taskId]['statusMap'],
                    $interval,
                    $seconds,
                );
            }
        }

        $tasks = [];
        $totalSeconds = 0;
        foreach ($byTask as $row) {
            $statuses = array_values($row['statusMap']);
            usort($statuses, fn ($a, $b) => $b['seconds'] <=> $a['seconds']);

            $tasks[] = [
                'taskId' => $row['taskId'],
                'title' => $row['title'],
                'project' => $row['project'],
                'totalSeconds' => $row['totalSeconds'],
                'statuses' => $statuses,
            ];
            $totalSeconds += $row['totalSeconds'];
        }

        usort($tasks, fn ($a, $b) => $b['totalSeconds'] <=> $a['totalSeconds']);

        return [
            'shift' => ApiPresenter::workShift($shift),
            'totalSeconds' => $totalSeconds,
            'tasks' => $tasks,
        ];
    }

    /**
     * @param  array<int, array{taskId: int, title: string, project: ?array, totalSeconds: int, statusMap: array<string, array{statusName: string, seconds: int, user: ?array}>}>  $byTask
     */
    private function ensureTaskBucket(array &$byTask, TaskWorkInterval $interval): void
    {
        $taskId = (int) $interval->task_id;
        if (isset($byTask[$taskId])) {
            return;
        }

        $task = $interval->task;
        $project = $task?->project;
        $byTask[$taskId] = [
            'taskId' => $taskId,
            'title' => $task?->title ?? ('Задача #'.$taskId),
            'project' => $project ? [
                'id' => (int) $project->id,
                'name' => $project->name,
                'boardId' => (int) $project->board_id,
                'board' => $project->board ? [
                    'id' => (int) $project->board->id,
                    'name' => $project->board->name,
                ] : null,
            ] : null,
            'totalSeconds' => 0,
            'statusMap' => [],
        ];
    }

    /**
     * @param  array{ids: array<int, true>, names: array<string, true>}  $allowed
     */
    private function peerMatchesOwnerStatus(TaskWorkInterval $interval, array $allowed): bool
    {
        if ($interval->status_id !== null && isset($allowed['ids'][(int) $interval->status_id])) {
            return true;
        }

        $statusName = $interval->status_name !== ''
            ? $interval->status_name
            : 'Без статуса';

        return isset($allowed['names'][$statusName]);
    }

    /**
     * @param  array<string, array{statusName: string, seconds: int, user: ?array}>  $statusMap
     */
    private function addStatusSeconds(
        array &$statusMap,
        TaskWorkInterval $interval,
        int $seconds,
    ): void {
        $statusName = $interval->status_name !== ''
            ? $interval->status_name
            : 'Без статуса';
        $userId = (int) $interval->user_id;
        $key = $userId.'|'.$statusName;

        if (! isset($statusMap[$key])) {
            $statusMap[$key] = [
                'statusName' => $statusName,
                'seconds' => 0,
                'user' => ApiPresenter::publicUser($interval->user),
            ];
        }

        $statusMap[$key]['seconds'] += $seconds;
    }

    /**
     * @param  list<array{0: Carbon, 1: Carbon}>  $pauseRanges
     */
    private function workedSeconds(
        TaskWorkInterval $interval,
        Carbon $shiftStart,
        Carbon $shiftEnd,
        array $pauseRanges,
    ): int {
        $tz = AppDateTime::timezone();
        $iStart = $interval->started_at->copy()->timezone($tz);
        $iEnd = $interval->ended_at
            ? $interval->ended_at->copy()->timezone($tz)
            : $shiftEnd->copy();
        if ($iEnd->lt($iStart)) {
            $iEnd = $iStart->copy();
        }

        $clipStartTs = max($iStart->getTimestamp(), $shiftStart->getTimestamp());
        $clipEndTs = min($iEnd->getTimestamp(), $shiftEnd->getTimestamp());
        if ($clipEndTs <= $clipStartTs) {
            return 0;
        }

        $seconds = $clipEndTs - $clipStartTs;

        foreach ($pauseRanges as [$pStart, $pEnd]) {
            $overlapStart = max($pStart->getTimestamp(), $clipStartTs);
            $overlapEnd = min($pEnd->getTimestamp(), $clipEndTs);
            if ($overlapEnd > $overlapStart) {
                $seconds -= $overlapEnd - $overlapStart;
            }
        }

        return max(0, $seconds);
    }
}
