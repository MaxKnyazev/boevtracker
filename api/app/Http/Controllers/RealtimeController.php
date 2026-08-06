<?php

namespace App\Http\Controllers;

use App\Models\Attachment;
use App\Models\Comment;
use App\Models\Notification;
use App\Models\Task;
use App\Support\ApiPresenter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class RealtimeController extends Controller
{
    private const MAX_WAIT_SECONDS = 22;

    private const POLL_INTERVAL_US = 400_000;

    public function wait(Request $request): JsonResponse
    {
        $user = $this->user($request);
        if ($resp = $this->forbidPending($user)) {
            return $resp;
        }

        @set_time_limit(self::MAX_WAIT_SECONDS + 5);
        ignore_user_abort(true);

        $afterNotificationId = max(0, (int) $request->query('afterNotificationId', 0));
        $taskId = $request->query('taskId');
        $taskId = ($taskId !== null && $taskId !== '' && ctype_digit((string) $taskId))
            ? (int) $taskId
            : null;
        $clientTaskVersion = (string) $request->query('taskVersion', '');
        $timeout = (int) $request->query('timeout', self::MAX_WAIT_SECONDS);
        $timeout = max(1, min(self::MAX_WAIT_SECONDS, $timeout));

        $deadline = microtime(true) + $timeout;
        $taskVersion = $taskId ? $this->taskVersion($taskId) : null;

        while (microtime(true) < $deadline) {
            if (connection_aborted()) {
                break;
            }

            $notifications = Notification::query()
                ->with(['actor', 'task'])
                ->where('user_id', $user->id)
                ->where('id', '>', $afterNotificationId)
                ->orderBy('id')
                ->limit(50)
                ->get();

            $taskChanged = false;
            if ($taskId !== null) {
                $taskVersion = $this->taskVersion($taskId);
                $taskChanged = $clientTaskVersion === '' || $taskVersion !== $clientTaskVersion;
            }

            if ($notifications->isNotEmpty() || $taskChanged) {
                return $this->payload(
                    $user->id,
                    $notifications,
                    $afterNotificationId,
                    $taskId,
                    $taskChanged,
                    $taskVersion,
                );
            }

            usleep(self::POLL_INTERVAL_US);
        }

        return $this->payload(
            $user->id,
            collect(),
            $afterNotificationId,
            $taskId,
            false,
            $taskVersion,
        );
    }

    private function payload(
        int $userId,
        $notifications,
        int $afterNotificationId,
        ?int $taskId,
        bool $includeTask,
        ?string $taskVersion,
    ): JsonResponse {
        $maxNotificationId = $afterNotificationId;
        foreach ($notifications as $n) {
            $maxNotificationId = max($maxNotificationId, (int) $n->id);
        }

        $unreadCount = Notification::query()
            ->where('user_id', $userId)
            ->whereNull('read_at')
            ->count();

        $taskPayload = null;
        if ($includeTask && $taskId !== null) {
            $task = Task::query()
                ->with([
                    'assignee',
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
