<?php

namespace App\Support;

class Constants
{
    public const DEFAULT_STATUSES = [
        'Требует информации',
        'Открыта',
        'В работе',
        'Тестируется',
        'Готова к релизу',
        'Закрыта',
    ];

    public const OPEN_STATUS_NAME = 'Открыта';

    public const CLOSED_STATUS_NAME = 'Закрыта';

    /** @return list<string> */
    public static function protectedStatusNames(): array
    {
        return [self::OPEN_STATUS_NAME, self::CLOSED_STATUS_NAME];
    }

    public static function isProtectedStatusName(string $name): bool
    {
        return in_array($name, self::protectedStatusNames(), true);
    }

    public const AVATAR_COLORS = [
        '#EF4444', '#F97316', '#EAB308', '#22C55E',
        '#14B8A6', '#06B6D4', '#3B82F6', '#6366F1',
        '#8B5CF6', '#D946EF', '#EC4899', '#F43F5E',
        '#84CC16', '#0EA5E9', '#A855F7', '#10B981',
    ];

    public const MAX_FILE_SIZE = 500 * 1024 * 1024;

    public const COOKIE_NAME = 'bt_token';
}
