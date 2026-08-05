<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Support\ApiPresenter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

class UserController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        if (! $this->user($request)->canManageUsers()) {
            return response()->json(['error' => 'Недостаточно прав'], 403);
        }

        $users = User::query()
            ->orderBy('role')
            ->orderByDesc('created_at')
            ->get()
            ->map(fn (User $u) => ApiPresenter::user($u))
            ->values();

        return response()->json(['users' => $users]);
    }

    public function assignable(): JsonResponse
    {
        $users = User::query()
            ->whereIn('role', ['ADMIN', 'DEVELOPER', 'READER'])
            ->orderBy('username')
            ->get()
            ->map(fn (User $u) => ApiPresenter::user($u))
            ->values();

        return response()->json(['users' => $users]);
    }

    public function setRole(Request $request, int $id): JsonResponse
    {
        $me = $this->user($request);
        if (! $me->canManageUsers()) {
            return response()->json(['error' => 'Недостаточно прав'], 403);
        }

        $validator = Validator::make($request->all(), [
            'role' => ['required', 'in:ADMIN,DEVELOPER,READER,PENDING'],
        ]);
        if ($validator->fails()) {
            return response()->json(['error' => 'Неверная роль'], 400);
        }

        $target = User::query()->find($id);
        if (! $target) {
            return response()->json(['error' => 'Пользователь не найден'], 404);
        }

        $role = $validator->validated()['role'];
        if ($me->id === $id && $role !== 'ADMIN') {
            return response()->json(['error' => 'Нельзя снять с себя роль администратора'], 400);
        }

        $target->update(['role' => $role]);

        return response()->json(['user' => ApiPresenter::user($target->fresh())]);
    }

    public function approve(Request $request, int $id): JsonResponse
    {
        if (! $this->user($request)->canManageUsers()) {
            return response()->json(['error' => 'Недостаточно прав'], 403);
        }

        $validator = Validator::make($request->all(), [
            'role' => ['nullable', 'in:ADMIN,DEVELOPER,READER'],
        ]);
        if ($validator->fails()) {
            return response()->json(['error' => 'Неверные данные'], 400);
        }

        $target = User::query()->find($id);
        if (! $target) {
            return response()->json(['error' => 'Пользователь не найден'], 404);
        }
        if ($target->role !== 'PENDING') {
            return response()->json(['error' => 'Пользователь уже подтверждён'], 400);
        }

        $target->update(['role' => $request->input('role', 'DEVELOPER')]);

        return response()->json(['user' => ApiPresenter::user($target->fresh())]);
    }

    public function reject(Request $request, int $id): JsonResponse
    {
        if (! $this->user($request)->canManageUsers()) {
            return response()->json(['error' => 'Недостаточно прав'], 403);
        }

        $target = User::query()->find($id);
        if (! $target) {
            return response()->json(['error' => 'Пользователь не найден'], 404);
        }
        if ($target->role !== 'PENDING') {
            return response()->json(['error' => 'Можно отклонить только ожидающих'], 400);
        }

        $target->delete();

        return response()->json(['ok' => true]);
    }
}
