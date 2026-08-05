<?php

use Illuminate\Support\Facades\Route;

Route::get('/{any?}', function () {
    $candidates = [
        // Shared hosting: Laravel lives in /app_laravel, SPA is in site root
        base_path('../index.html'),
        public_path('index.html'),
    ];

    foreach ($candidates as $index) {
        $real = realpath($index);
        if ($real && is_file($real)) {
            return response()->file($real, [
                'Content-Type' => 'text/html; charset=UTF-8',
                'Cache-Control' => 'no-cache, no-store, must-revalidate',
            ]);
        }
    }

    return response(
        'Frontend not found. Upload index.html to the site root.',
        503
    );
})->where('any', '^(?!api).*$');
