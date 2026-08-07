<?php

namespace App\Http\Controllers;

use App\Models\Notification;
use App\Support\ApiPresenter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

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
                ->limit(100)
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
}
