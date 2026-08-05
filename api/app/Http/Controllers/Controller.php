<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Support\Constants;
use App\Support\JwtToken;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Cookie;

abstract class Controller
{
    protected function user(Request $request): User
    {
        return $request->attributes->get('authUser');
    }

    protected function authCookie(string $token): Cookie
    {
        return cookie(
            Constants::COOKIE_NAME,
            $token,
            60 * 24 * 7,
            '/',
            null,
            app()->environment('production'),
            true,
            false,
            'Lax'
        );
    }

    protected function clearAuthCookie(): Cookie
    {
        return cookie(
            Constants::COOKIE_NAME,
            '',
            -1,
            '/',
            null,
            app()->environment('production'),
            true,
            false,
            'Lax'
        );
    }

    protected function forbidWrite(User $user): ?JsonResponse
    {
        if (! $user->canWrite()) {
            return response()->json(['error' => 'Недостаточно прав'], 403);
        }

        return null;
    }

    protected function forbidPending(User $user): ?JsonResponse
    {
        if ($user->isPending()) {
            return response()->json(['error' => 'Ожидайте подтверждения'], 403);
        }

        return null;
    }

    protected function issueToken(User $user): string
    {
        return JwtToken::sign($user->id, $user->role);
    }
}
