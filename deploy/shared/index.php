<?php

use Illuminate\Http\Request;

define('LARAVEL_START', microtime(true));

if (file_exists($maintenance = __DIR__.'/app_laravel/storage/framework/maintenance.php')) {
    require $maintenance;
}

require __DIR__.'/app_laravel/vendor/autoload.php';

(require_once __DIR__.'/app_laravel/bootstrap/app.php')
    ->handleRequest(Request::capture());
