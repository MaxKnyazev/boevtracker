<?php

namespace App\Http\Middleware;

use App\Models\User;
use App\Support\Constants;
use App\Support\JwtToken;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class AuthenticateJwt
{
    public function handle(Request $request, Closure $next): Response
    {
        $token = $request->cookie(Constants::COOKIE_NAME);
        if (! $token) {
            return response()->json(['error' => 'Не авторизован'], 401);
        }

        try {
            $payload = JwtToken::verify($token);
            if (($payload['type'] ?? 'access') !== 'access') {
                return response()->json(['error' => 'Недействительный токен'], 401);
            }
            $user = User::query()->find($payload['userId']);
            if (! $user) {
                return response()->json(['error' => 'Пользователь не найден'], 401);
            }
            $request->attributes->set('authUser', $user);
        } catch (\Throwable) {
            return response()->json(['error' => 'Недействительный токен'], 401);
        }

        return $next($request);
    }
}
