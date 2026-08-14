<?php

namespace App\Support;

use App\Models\WorkShift;
use Illuminate\Support\Carbon;

/**
 * Single source of truth for shift / interval timestamps.
 *
 * App stores wall-clock values in APP_TIMEZONE (Europe/Moscow). Clients send
 * UTC ISO strings; always parse through {@see parseClient()} before save.
 */
final class AppDateTime
{
    public static function timezone(): string
    {
        return (string) (config('app.timezone') ?: 'Europe/Moscow');
    }

    public static function now(): Carbon
    {
        return now(self::timezone());
    }

    /**
     * Parse a client/API datetime (usually UTC ISO) into app timezone.
     */
    public static function parseClient(string $value): Carbon
    {
        return Carbon::parse($value)->timezone(self::timezone());
    }

    public static function toApi(mixed $value): ?string
    {
        if ($value === null) {
            return null;
        }

        $carbon = $value instanceof Carbon ? $value->copy() : Carbon::parse($value);

        return $carbon->timezone(self::timezone())->toIso8601String();
    }

    /**
     * SQL-safe wall-clock string in app timezone (for query bindings).
     */
    public static function toDb(Carbon $value): string
    {
        return $value->copy()->timezone(self::timezone())->format('Y-m-d H:i:s');
    }

    /**
     * Inclusive shift window [start, end] with repair for legacy bad ended_at.
     *
     * Legacy bug: client sent UTC ISO, server saved the UTC wall clock while
     * started_at was Moscow — for shifts shorter than ~3h, ended_at < started_at
     * and stats clamped to an empty window.
     *
     * @return array{0: Carbon, 1: Carbon}
     */
    public static function shiftWindow(WorkShift $shift): array
    {
        $tz = self::timezone();
        $start = $shift->started_at->copy()->timezone($tz);
        $end = $shift->ended_at
            ? $shift->ended_at->copy()->timezone($tz)
            : self::now();

        if ($shift->ended_at && $end->lte($start)) {
            $end = Carbon::createFromFormat(
                'Y-m-d H:i:s',
                $shift->ended_at->format('Y-m-d H:i:s'),
                'UTC',
            )->timezone($tz);
        }

        if ($end->lt($start)) {
            $end = $start->copy();
        }

        return [$start, $end];
    }
}
