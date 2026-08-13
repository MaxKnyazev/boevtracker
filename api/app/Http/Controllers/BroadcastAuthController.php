<?php

namespace App\Http\Controllers;

use App\Models\Task;
use App\Support\Broadcasting;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Pusher\Pusher;

class BroadcastAuthController extends Controller
{
    public function auth(Request $request): JsonResponse
    {
        $user = $this->user($request);
        if ($resp = $this->forbidPending($user)) {
            return $resp;
        }

        if (! Broadcasting::enabled()) {
            return response()->json(['error' => 'Broadcasting отключён'], 503);
        }

        $channelName = (string) $request->input('channel_name', '');
        $socketId = (string) $request->input('socket_id', '');

        if ($channelName === '' || $socketId === '') {
            return response()->json(['error' => 'Некорректный запрос'], 400);
        }

        if (preg_match('/^private-user\.(\d+)$/', $channelName, $matches)) {
            if ((int) $matches[1] !== (int) $user->id) {
                return response()->json(['error' => 'Нет доступа'], 403);
            }
        } elseif (preg_match('/^private-task\.(\d+)$/', $channelName, $matches)) {
            $taskId = (int) $matches[1];
            if (! Task::query()->whereKey($taskId)->exists()) {
                return response()->json(['error' => 'Задача не найдена'], 404);
            }
        } elseif ($channelName === 'private-shifts') {
            // Any authenticated non-pending user may watch shift updates.
        } else {
            return response()->json(['error' => 'Неизвестный канал'], 403);
        }

        if (! class_exists(Pusher::class)) {
            return response()->json([
                'error' => 'Pusher SDK не установлен. На сервере выполните: composer install --no-dev',
            ], 500);
        }

        try {
            $options = config('broadcasting.connections.pusher.options', []);
            // Empty host breaks cluster resolution in some SDK setups.
            if (! filled($options['host'] ?? null)) {
                unset($options['host']);
            }

            $pusher = new Pusher(
                (string) config('broadcasting.connections.pusher.key'),
                (string) config('broadcasting.connections.pusher.secret'),
                (string) config('broadcasting.connections.pusher.app_id'),
                $options,
            );

            $auth = $pusher->authorizeChannel($channelName, $socketId);

            return response()->json(json_decode($auth, true, 512, JSON_THROW_ON_ERROR));
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'error' => 'Ошибка авторизации канала',
                'detail' => config('app.debug') ? $e->getMessage() : null,
            ], 500);
        }
    }
}
