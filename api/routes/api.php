<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\BoardController;
use App\Http\Controllers\NotificationController;
use App\Http\Controllers\ProjectController;
use App\Http\Controllers\StatusController;
use App\Http\Controllers\TaskController;
use App\Http\Controllers\UserController;
use App\Http\Middleware\AuthenticateJwt;
use Illuminate\Support\Facades\Route;

Route::get('/health', fn () => response()->json(['ok' => true]));

Route::prefix('auth')->group(function () {
    Route::post('/register', [AuthController::class, 'register']);
    Route::post('/login', [AuthController::class, 'login']);
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/me', [AuthController::class, 'me'])->middleware(AuthenticateJwt::class);
});

Route::middleware(AuthenticateJwt::class)->group(function () {
    Route::get('/notifications', [NotificationController::class, 'index']);
    Route::get('/notifications/unread-count', [NotificationController::class, 'unreadCount']);
    Route::post('/notifications/read-all', [NotificationController::class, 'markAllRead']);
    Route::post('/notifications/{id}/read', [NotificationController::class, 'markRead'])->whereNumber('id');

    Route::get('/users', [UserController::class, 'index']);
    Route::get('/users/assignable', [UserController::class, 'assignable']);
    Route::patch('/users/{id}/role', [UserController::class, 'setRole'])->whereNumber('id');
    Route::post('/users/{id}/approve', [UserController::class, 'approve'])->whereNumber('id');
    Route::post('/users/{id}/reject', [UserController::class, 'reject'])->whereNumber('id');

    Route::get('/boards', [BoardController::class, 'index']);
    Route::post('/boards', [BoardController::class, 'store']);
    Route::get('/boards/{id}', [BoardController::class, 'show'])->whereNumber('id');
    Route::patch('/boards/{id}', [BoardController::class, 'update'])->whereNumber('id');
    Route::delete('/boards/{id}', [BoardController::class, 'destroy'])->whereNumber('id');

    Route::post('/boards/{boardId}/projects', [ProjectController::class, 'store'])->whereNumber('boardId');
    Route::put('/boards/{boardId}/projects/reorder', [ProjectController::class, 'reorder'])->whereNumber('boardId');

    Route::get('/projects/{id}', [ProjectController::class, 'show'])->whereNumber('id');
    Route::patch('/projects/{id}', [ProjectController::class, 'update'])->whereNumber('id');
    Route::delete('/projects/{id}', [ProjectController::class, 'destroy'])->whereNumber('id');

    Route::post('/projects/{id}/statuses', [StatusController::class, 'store'])->whereNumber('id');
    Route::put('/projects/{id}/statuses/reorder', [StatusController::class, 'reorder'])->whereNumber('id');
    Route::patch('/statuses/{id}', [StatusController::class, 'update'])->whereNumber('id');
    Route::delete('/statuses/{id}', [StatusController::class, 'destroy'])->whereNumber('id');

    Route::get('/tasks', [TaskController::class, 'index']);
    Route::post('/projects/{projectId}/tasks', [TaskController::class, 'store'])->whereNumber('projectId');
    Route::get('/tasks/{id}', [TaskController::class, 'show'])->whereNumber('id');
    Route::patch('/tasks/{id}', [TaskController::class, 'update'])->whereNumber('id');
    Route::post('/tasks/{id}/take', [TaskController::class, 'take'])->whereNumber('id');
    Route::put('/tasks/{id}/position', [TaskController::class, 'position'])->whereNumber('id');
    Route::post('/tasks/{id}/move-board', [TaskController::class, 'moveBoard'])->whereNumber('id');
    Route::delete('/tasks/{id}', [TaskController::class, 'destroy'])->whereNumber('id');
    Route::post('/tasks/{id}/comments', [TaskController::class, 'addComment'])->whereNumber('id');
    Route::patch('/comments/{id}', [TaskController::class, 'updateComment'])->whereNumber('id');
    Route::delete('/comments/{id}', [TaskController::class, 'deleteComment'])->whereNumber('id');
    Route::post('/tasks/{id}/files', [TaskController::class, 'uploadTaskFiles'])->whereNumber('id');

    Route::post('/comments/{id}/files', [TaskController::class, 'uploadCommentFiles'])->whereNumber('id');
    Route::get('/attachments/{id}', [TaskController::class, 'downloadAttachment'])->whereNumber('id');
    Route::delete('/attachments/{id}', [TaskController::class, 'deleteAttachment'])->whereNumber('id');
});
