<?php

namespace App\Support;

class Broadcasting
{
    public static function enabled(): bool
    {
        if (config('broadcasting.default') !== 'pusher') {
            return false;
        }

        return filled(config('broadcasting.connections.pusher.key'))
            && filled(config('broadcasting.connections.pusher.secret'))
            && filled(config('broadcasting.connections.pusher.app_id'));
    }
}
