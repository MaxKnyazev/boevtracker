<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Support\ApiPresenter;
use App\Support\Constants;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Validator;

class AuthController extends Controller
{
    public function register(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'username' => ['required', 'string', 'min:3', 'max:64', 'regex:/^[a-zA-Z0-9_]+$/'],
            'firstName' => ['required', 'string', 'min:1', 'max:64'],
            'lastName' => ['required', 'string', 'min:1', 'max:64'],
            'password' => ['required', 'string', 'min:6', 'max:128'],
            'confirmPassword' => ['required', 'string', 'min:6', 'max:128'],
        ]);

        if ($validator->fails()) {
            return response()->json(['error' => $validator->errors()->toArray()], 400);
        }

        $data = $validator->validated();
        if ($data['password'] !== $data['confirmPassword']) {
            return response()->json([
                'error' => ['confirmPassword' => ['Пароли не совпадают']],
            ], 400);
        }

        if (User::query()->where('username', $data['username'])->exists()) {
            return response()->json(['error' => 'Логин уже занят'], 409);
        }

        $used = User::query()->pluck('avatar_color')->all();
        $unused = array_values(array_diff(Constants::AVATAR_COLORS, $used));
        $pool = $unused !== [] ? $unused : Constants::AVATAR_COLORS;
        $avatarColor = $pool[array_rand($pool)];

        $user = User::query()->create([
            'username' => $data['username'],
            'first_name' => trim($data['firstName']),
            'last_name' => trim($data['lastName']),
            'avatar_color' => $avatarColor,
            'password_hash' => Hash::make($data['password']),
            'role' => 'PENDING',
        ]);

        $token = $this->issueToken($user);

        return response()
            ->json(['user' => ApiPresenter::user($user)], 201)
            ->withCookie($this->authCookie($token));
    }

    public function login(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'username' => ['required', 'string'],
            'password' => ['required', 'string'],
        ]);
        if ($validator->fails()) {
            return response()->json(['error' => 'Неверные данные'], 400);
        }

        $user = User::query()->where('username', $request->input('username'))->first();
        if (! $user || ! Hash::check($request->input('password'), $user->password_hash)) {
            return response()->json(['error' => 'Неверный логин или пароль'], 401);
        }

        $token = $this->issueToken($user);

        return response()
            ->json(['user' => ApiPresenter::user($user)])
            ->withCookie($this->authCookie($token));
    }

    public function logout(): JsonResponse
    {
        return response()
            ->json(['ok' => true])
            ->withCookie($this->clearAuthCookie());
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json(['user' => ApiPresenter::user($this->user($request))]);
    }
}
