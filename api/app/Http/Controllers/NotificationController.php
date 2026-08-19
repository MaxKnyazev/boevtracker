<?php

namespace App\Http\Controllers;

use App\Models\Board;
use App\Models\Notification;
use App\Models\NotificationSubscription;
use App\Models\Project;
use App\Models\UserNotificationSettings;
use App\Support\ApiPresenter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

class NotificationController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $this->user($request);
        if ($resp = $this->forbidPending($user)) {
            return $resp;
        }

        $sinceId = $request->query('sinceId');
        $base = Notification::query()
            ->with(['actor', 'task'])
            ->where('user_id', $user->id);

        if ($sinceId !== null && $sinceId !== '' && ctype_digit((string) $sinceId)) {
            $notifications = (clone $base)
                ->where('id', '>', (int) $sinceId)
                ->orderBy('id')
                ->limit(100)
                ->get();
        } else {
            $notifications = (clone $base)
                ->orderByDesc('id')
                ->get();
        }

        $unreadCount = Notification::query()
            ->where('user_id', $user->id)
            ->whereNull('read_at')
            ->count();

        return response()->json([
            'notifications' => $notifications
                ->map(fn (Notification $n) => ApiPresenter::notification($n))
                ->values()
                ->all(),
            'unreadCount' => $unreadCount,
        ]);
    }

    public function unreadCount(Request $request): JsonResponse
    {
        $user = $this->user($request);
        if ($resp = $this->forbidPending($user)) {
            return $resp;
        }

        $unreadCount = Notification::query()
            ->where('user_id', $user->id)
            ->whereNull('read_at')
            ->count();

        return response()->json(['unreadCount' => $unreadCount]);
    }

    public function markRead(Request $request, int $id): JsonResponse
    {
        $user = $this->user($request);
        if ($resp = $this->forbidPending($user)) {
            return $resp;
        }

        $notification = Notification::query()
            ->where('user_id', $user->id)
            ->whereKey($id)
            ->first();

        if (! $notification) {
            return response()->json(['error' => 'Уведомление не найдено'], 404);
        }

        if ($notification->read_at === null) {
            $notification->read_at = now();
            $notification->save();
        }

        $notification->load(['actor', 'task']);

        return response()->json([
            'notification' => ApiPresenter::notification($notification),
        ]);
    }

    public function markAllRead(Request $request): JsonResponse
    {
        $user = $this->user($request);
        if ($resp = $this->forbidPending($user)) {
            return $resp;
        }

        Notification::query()
            ->where('user_id', $user->id)
            ->whereNull('read_at')
            ->update(['read_at' => now()]);

        return response()->json(['ok' => true]);
    }

    public function settings(Request $request): JsonResponse
    {
        $user = $this->user($request);
        if ($resp = $this->forbidPending($user)) {
            return $resp;
        }

        $settings = UserNotificationSettings::defaultsFor((int) $user->id);

        return response()->json([
            'settings' => ApiPresenter::notificationSettings($settings),
        ]);
    }

    public function updateSettings(Request $request): JsonResponse
    {
        $user = $this->user($request);
        if ($resp = $this->forbidPending($user)) {
            return $resp;
        }

        $validator = Validator::make($request->all(), [
            'taskComment' => ['sometimes', 'boolean'],
            'mention' => ['sometimes', 'boolean'],
            'reply' => ['sometimes', 'boolean'],
            'assignee' => ['sometimes', 'boolean'],
            'statusAssignee' => ['sometimes', 'boolean'],
            'statusCreator' => ['sometimes', 'boolean'],
        ]);
        if ($validator->fails()) {
            return response()->json(['error' => 'Некорректные настройки'], 400);
        }

        $data = $validator->validated();
        $settings = UserNotificationSettings::defaultsFor((int) $user->id);
        $map = [
            'taskComment' => 'task_comment',
            'mention' => 'mention',
            'reply' => 'reply',
            'assignee' => 'assignee',
            'statusAssignee' => 'status_assignee',
            'statusCreator' => 'status_creator',
        ];
        foreach ($map as $camel => $column) {
            if (array_key_exists($camel, $data)) {
                $settings->{$column} = (bool) $data[$camel];
            }
        }
        $settings->save();

        return response()->json([
            'settings' => ApiPresenter::notificationSettings($settings),
        ]);
    }

    public function subscriptions(Request $request): JsonResponse
    {
        $user = $this->user($request);
        if ($resp = $this->forbidPending($user)) {
            return $resp;
        }

        $items = NotificationSubscription::query()
            ->with(['board', 'project.board'])
            ->where('user_id', $user->id)
            ->orderByDesc('id')
            ->get()
            ->map(fn (NotificationSubscription $s) => ApiPresenter::notificationSubscription($s))
            ->values()
            ->all();

        return response()->json(['subscriptions' => $items]);
    }

    public function storeSubscription(Request $request): JsonResponse
    {
        $user = $this->user($request);
        if ($resp = $this->forbidPending($user)) {
            return $resp;
        }

        $validator = Validator::make($request->all(), [
            'boardId' => ['nullable', 'integer'],
            'projectId' => ['nullable', 'integer'],
            'notifyNewTasks' => ['sometimes', 'boolean'],
            'notifyStatusChanges' => ['sometimes', 'boolean'],
        ]);
        if ($validator->fails()) {
            return response()->json(['error' => 'Некорректные данные подписки'], 400);
        }

        $data = $validator->validated();
        $boardId = isset($data['boardId']) ? (int) $data['boardId'] : null;
        $projectId = isset($data['projectId']) ? (int) $data['projectId'] : null;

        if (($boardId === null && $projectId === null) || ($boardId !== null && $projectId !== null)) {
            return response()->json([
                'error' => 'Укажите либо рабочее пространство, либо проект',
            ], 400);
        }

        if ($boardId !== null) {
            if (! Board::query()->whereKey($boardId)->exists()) {
                return response()->json(['error' => 'Рабочее пространство не найдено'], 404);
            }
            $exists = NotificationSubscription::query()
                ->where('user_id', $user->id)
                ->where('board_id', $boardId)
                ->exists();
            if ($exists) {
                return response()->json(['error' => 'Подписка уже существует'], 409);
            }
        } else {
            if (! Project::query()->whereKey($projectId)->exists()) {
                return response()->json(['error' => 'Проект не найден'], 404);
            }
            $exists = NotificationSubscription::query()
                ->where('user_id', $user->id)
                ->where('project_id', $projectId)
                ->exists();
            if ($exists) {
                return response()->json(['error' => 'Подписка уже существует'], 409);
            }
        }

        $sub = NotificationSubscription::query()->create([
            'user_id' => $user->id,
            'board_id' => $boardId,
            'project_id' => $projectId,
            'notify_new_tasks' => array_key_exists('notifyNewTasks', $data)
                ? (bool) $data['notifyNewTasks']
                : true,
            'notify_status_changes' => array_key_exists('notifyStatusChanges', $data)
                ? (bool) $data['notifyStatusChanges']
                : true,
        ]);
        $sub->load(['board', 'project.board']);

        return response()->json([
            'subscription' => ApiPresenter::notificationSubscription($sub),
        ], 201);
    }

    public function updateSubscription(Request $request, int $id): JsonResponse
    {
        $user = $this->user($request);
        if ($resp = $this->forbidPending($user)) {
            return $resp;
        }

        $sub = NotificationSubscription::query()
            ->where('user_id', $user->id)
            ->whereKey($id)
            ->first();
        if (! $sub) {
            return response()->json(['error' => 'Подписка не найдена'], 404);
        }

        $validator = Validator::make($request->all(), [
            'notifyNewTasks' => ['sometimes', 'boolean'],
            'notifyStatusChanges' => ['sometimes', 'boolean'],
        ]);
        if ($validator->fails()) {
            return response()->json(['error' => 'Некорректные данные подписки'], 400);
        }

        $data = $validator->validated();
        if (array_key_exists('notifyNewTasks', $data)) {
            $sub->notify_new_tasks = (bool) $data['notifyNewTasks'];
        }
        if (array_key_exists('notifyStatusChanges', $data)) {
            $sub->notify_status_changes = (bool) $data['notifyStatusChanges'];
        }
        $sub->save();
        $sub->load(['board', 'project.board']);

        return response()->json([
            'subscription' => ApiPresenter::notificationSubscription($sub),
        ]);
    }

    public function destroySubscription(Request $request, int $id): JsonResponse
    {
        $user = $this->user($request);
        if ($resp = $this->forbidPending($user)) {
            return $resp;
        }

        $sub = NotificationSubscription::query()
            ->where('user_id', $user->id)
            ->whereKey($id)
            ->first();
        if (! $sub) {
            return response()->json(['error' => 'Подписка не найдена'], 404);
        }

        $sub->delete();

        return response()->json(['ok' => true]);
    }
}
