<?php

namespace App\Support;

use App\Models\User;
use Firebase\JWT\JWT;
use Firebase\JWT\Key;

class JwtToken
{
    public static function sign(
        int $userId,
        string $role,
        int $ttlSeconds = 60 * 60 * 24 * 7,
        string $tokenType = 'access'
    ): string
    {
        $payload = [
            'userId' => $userId,
            'role' => $role,
            'type' => $tokenType,
            'iat' => time(),
            'exp' => time() + $ttlSeconds,
        ];

        return JWT::encode($payload, self::secret(), 'HS256');
    }

    /** @return array{userId: int, role: string, type: string, exp: int} */
    public static function verify(string $token): array
    {
        $decoded = JWT::decode($token, new Key(self::secret(), 'HS256'));

        return [
            'userId' => (int) $decoded->userId,
            'role' => (string) $decoded->role,
            'type' => isset($decoded->type) ? (string) $decoded->type : 'access',
            'exp' => (int) $decoded->exp,
        ];
    }

    private static function secret(): string
    {
        $configured = (string) config('app.jwt_secret');
        if (strlen($configured) >= 32) {
            return $configured;
        }

        $appKey = (string) config('app.key');
        if (str_starts_with($appKey, 'base64:')) {
            $decoded = base64_decode(substr($appKey, 7), true);
            if (is_string($decoded) && strlen($decoded) >= 32) {
                return $decoded;
            }
        }

        // Fallback: derive a stable 32-byte key
        return hash('sha256', $configured !== '' ? $configured : $appKey, true);
    }
}
