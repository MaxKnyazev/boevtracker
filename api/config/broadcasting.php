<?php

return [

    'default' => env('BROADCAST_CONNECTION', 'log'),

    'connections' => [

        'pusher' => [
            'driver' => 'pusher',
            'key' => env('PUSHER_APP_KEY'),
            'secret' => env('PUSHER_APP_SECRET'),
            'app_id' => env('PUSHER_APP_ID'),
            // Do not pass host=null: pusher-php-server then uses empty host
            // and never falls back to api-{cluster}.pusher.com (auth still works,
            // but trigger/broadcast silently fails).
            'options' => array_filter([
                'cluster' => env('PUSHER_APP_CLUSTER', 'mt1'),
                'useTLS' => true,
                'host' => env('PUSHER_HOST') ?: null,
                'port' => env('PUSHER_PORT') ?: null,
                'scheme' => env('PUSHER_SCHEME') ?: null,
            ], static fn ($value) => $value !== null && $value !== ''),
            'client_options' => [],
        ],

        'log' => [
            'driver' => 'log',
        ],

        'null' => [
            'driver' => 'null',
        ],

    ],

];
