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
    protected const ACCESS_TOKEN_TTL_MINUTES = 60 * 12; // 12 hours
    protected const REFRESH_TOKEN_TTL_MINUTES = 60 * 24 * 30; // 30 days

    protected function user(Request $request): User
    {
        return $request->attributes->get('authUser');
    }

    protected function authCookie(string $token): Cookie
    {
        return cookie(
            Constants::COOKIE_NAME,
            $token,
            self::ACCESS_TOKEN_TTL_MINUTES,
            '/',
            null,
            app()->environment('production'),
            true,
            false,
            'Lax'
        );
    }

    protected function refreshAuthCookie(string $token): Cookie
    {
        return cookie(
            Constants::REFRESH_COOKIE_NAME,
            $token,
            self::REFRESH_TOKEN_TTL_MINUTES,
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

    protected function clearRefreshAuthCookie(): Cookie
    {
        return cookie(
            Constants::REFRESH_COOKIE_NAME,
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
        return JwtToken::sign(
            $user->id,
            $user->role,
            self::ACCESS_TOKEN_TTL_MINUTES * 60,
            'access'
        );
    }

    protected function issueRefreshToken(User $user): string
    {
        return JwtToken::sign(
            $user->id,
            $user->role,
            self::REFRESH_TOKEN_TTL_MINUTES * 60,
            'refresh'
        );
    }
}
