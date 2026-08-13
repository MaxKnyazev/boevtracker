<?php

namespace App\Http\Controllers;

use App\Models\Attachment;
use App\Models\Comment;
use App\Models\Notification;
use App\Models\Task;
use App\Models\WorkShift;
use App\Models\WorkShiftPause;
use App\Support\ApiPresenter;
use App\Support\Broadcasting;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class RealtimeController extends Controller
{
    public function config(Request $request): JsonResponse
    {
        $user = $this->user($request);
        if ($resp = $this->forbidPending($user)) {
            return $resp;
        }

        if (! Broadcasting::enabled()) {
            return response()->json([
                'driver' => 'poll',
                'pollIntervalMs' => 4000,
                'pusher' => null,
            ]);
        }

        return response()->json([
            'driver' => 'pusher',
            'pollIntervalMs' => null,
            'pusher' => [
                'key' => config('broadcasting.connections.pusher.key'),
                'cluster' => config('broadcasting.connections.pusher.options.cluster', 'mt1'),
            ],
        ]);
    }

    /**
     * Lightweight one-shot poll (fallback when Pusher is not configured).
     * Does not hold the PHP worker in a sleep loop.
     */
    public function poll(Request $request): JsonResponse
    {
        $user = $this->user($request);
        if ($resp = $this->forbidPending($user)) {
            return $resp;
        }

        $afterNotificationId = max(0, (int) $request->query('afterNotificationId', 0));
        $taskId = $request->query('taskId');
        $taskId = ($taskId !== null && $taskId !== '' && ctype_digit((string) $taskId))
            ? (int) $taskId
            : null;
        $clientTaskVersion = (string) $request->query('taskVersion', '');
        $watchShifts = filter_var($request->query('watchShifts', false), FILTER_VALIDATE_BOOLEAN);
        $clientShiftsVersion = (string) $request->query('shiftsVersion', '');

        $notifications = Notification::query()
            ->with(['actor', 'task'])
            ->where('user_id', $user->id)
            ->where('id', '>', $afterNotificationId)
            ->orderBy('id')
            ->limit(50)
            ->get();

        $taskVersion = $taskId ? $this->taskVersion($taskId) : null;
        $taskChanged = $taskId !== null
            && ($clientTaskVersion === '' || $taskVersion !== $clientTaskVersion);

        $shiftsVersion = $watchShifts ? $this->shiftsVersion() : null;
        $shiftsChanged = $watchShifts
            && ($clientShiftsVersion === '' || $shiftsVersion !== $clientShiftsVersion);

        $maxNotificationId = $afterNotificationId;
        foreach ($notifications as $n) {
            $maxNotificationId = max($maxNotificationId, (int) $n->id);
        }

        $unreadCount = Notification::query()
            ->where('user_id', $user->id)
            ->whereNull('read_at')
            ->count();

        $taskPayload = null;
        if ($taskChanged && $taskId !== null) {
            $task = Task::query()
                ->with([
                    'assignees',
                    'activeAssignee',
                    'status',
                    'files',
                    'createdBy',
                    'project.board',
                    'comments.author',
                    'comments.files',
                    'comments.replyTo.author',
                    'comments.replyTo.files',
                    'statusHistories.user',
                ])
                ->find($taskId);

            if ($task) {
                $taskPayload = ApiPresenter::task($task, true);
                $taskVersion = $this->taskVersion($taskId);
            }
        }

        return response()->json([
            'notifications' => $notifications
                ->map(fn (Notification $n) => ApiPresenter::notification($n))
                ->values()
                ->all(),
            'unreadCount' => $unreadCount,
            'afterNotificationId' => $maxNotificationId,
            'task' => $taskPayload,
            'taskVersion' => $taskVersion,
            'shiftsVersion' => $shiftsVersion,
            'shiftsChanged' => $shiftsChanged,
        ]);
    }

    private function shiftsVersion(): string
    {
        $shiftStats = WorkShift::query()
            ->selectRaw('COUNT(*) as cnt')
            ->selectRaw('COALESCE(MAX(id), 0) as max_id')
            ->selectRaw('MAX(updated_at) as latest')
            ->first();

        $pauseStats = WorkShiftPause::query()
            ->selectRaw('COUNT(*) as cnt')
            ->selectRaw('COALESCE(MAX(id), 0) as max_id')
            ->selectRaw('MAX(COALESCE(ended_at, started_at)) as latest')
            ->first();

        return implode(':', [
            (int) ($shiftStats->cnt ?? 0),
            (int) ($shiftStats->max_id ?? 0),
            (string) ($shiftStats->latest ?? '0'),
            (int) ($pauseStats->cnt ?? 0),
            (int) ($pauseStats->max_id ?? 0),
            (string) ($pauseStats->latest ?? '0'),
        ]);
    }

    private function taskVersion(int $taskId): string
    {
        $task = Task::query()->whereKey($taskId)->first(['id', 'updated_at']);
        if (! $task) {
            return 'missing';
        }

        $stats = Comment::query()
            ->where('task_id', $taskId)
            ->selectRaw('COUNT(*) as cnt')
            ->selectRaw('COALESCE(MAX(id), 0) as max_id')
            ->selectRaw('MAX(COALESCE(edited_at, created_at)) as latest')
            ->first();

        $fileMax = (int) (Attachment::query()
            ->whereNotNull('comment_id')
            ->whereIn(
                'comment_id',
                Comment::query()->where('task_id', $taskId)->select('id'),
            )
            ->max('id') ?? 0);

        $taskFileMax = (int) (Attachment::query()
            ->where('task_id', $taskId)
            ->whereNull('comment_id')
            ->max('id') ?? 0);

        return implode(':', [
            $task->updated_at?->toISOString() ?? '0',
            (int) ($stats->cnt ?? 0),
            (int) ($stats->max_id ?? 0),
            (string) ($stats->latest ?? '0'),
            $fileMax,
            $taskFileMax,
        ]);
    }
}
