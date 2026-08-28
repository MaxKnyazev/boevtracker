<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\BoardController;
use App\Http\Controllers\BroadcastAuthController;
use App\Http\Controllers\NotificationController;
use App\Http\Controllers\ProfileController;
use App\Http\Controllers\ProjectController;
use App\Http\Controllers\RealtimeController;
use App\Http\Controllers\ReleaseController;
use App\Http\Controllers\HelpController;
use App\Http\Controllers\ShiftController;
use App\Http\Controllers\StatusController;
use App\Http\Controllers\TaskController;
use App\Http\Controllers\UserController;
use App\Http\Middleware\AuthenticateJwt;
use Illuminate\Support\Facades\Route;

Route::get('/health', fn () => response()->json(['ok' => true]));

Route::prefix('auth')->group(function () {
    Route::post('/register', [AuthController::class, 'register']);
    Route::post('/login', [AuthController::class, 'login']);
    Route::post('/refresh', [AuthController::class, 'refresh']);
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/me', [AuthController::class, 'me'])->middleware(AuthenticateJwt::class);
});

Route::middleware(AuthenticateJwt::class)->group(function () {
    Route::get('/realtime/config', [RealtimeController::class, 'config']);
    Route::get('/realtime/poll', [RealtimeController::class, 'poll']);
    Route::post('/broadcasting/auth', [BroadcastAuthController::class, 'auth']);

    Route::get('/notifications', [NotificationController::class, 'index']);
    Route::get('/notifications/unread-count', [NotificationController::class, 'unreadCount']);
    Route::post('/notifications/read-all', [NotificationController::class, 'markAllRead']);
    Route::post('/notifications/{id}/read', [NotificationController::class, 'markRead'])->whereNumber('id');

    Route::get('/notification-settings', [NotificationController::class, 'settings']);
    Route::put('/notification-settings', [NotificationController::class, 'updateSettings']);
    Route::get('/notification-subscriptions', [NotificationController::class, 'subscriptions']);
    Route::post('/notification-subscriptions', [NotificationController::class, 'storeSubscription']);
    Route::patch('/notification-subscriptions/{id}', [NotificationController::class, 'updateSubscription'])->whereNumber('id');
    Route::delete('/notification-subscriptions/{id}', [NotificationController::class, 'destroySubscription'])->whereNumber('id');

    Route::patch('/profile', [ProfileController::class, 'update']);
    Route::post('/profile/avatar', [ProfileController::class, 'uploadAvatar']);
    Route::delete('/profile/avatar', [ProfileController::class, 'deleteAvatar']);
    Route::get('/profile/avatar-source', [ProfileController::class, 'showAvatarSource']);

    Route::get('/shifts', [ShiftController::class, 'index']);
    Route::get('/shifts/current', [ShiftController::class, 'current']);
    Route::get('/shifts/{id}/stats', [ShiftController::class, 'stats'])->whereNumber('id');
    Route::post('/shifts/start', [ShiftController::class, 'start']);
    Route::post('/shifts/pause', [ShiftController::class, 'pause']);
    Route::post('/shifts/resume', [ShiftController::class, 'resume']);
    Route::post('/shifts/end', [ShiftController::class, 'end']);

    Route::get('/users', [UserController::class, 'index']);
    Route::get('/users/assignable', [UserController::class, 'assignable']);
    Route::get('/users/{id}/avatar', [ProfileController::class, 'showAvatar'])->whereNumber('id');
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
    Route::get('/tasks/backlog', [TaskController::class, 'backlog']);
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

    Route::get('/releases', [ReleaseController::class, 'index']);
    Route::post('/releases', [ReleaseController::class, 'store']);
    Route::get('/releases/{id}', [ReleaseController::class, 'show'])->whereNumber('id');
    Route::patch('/releases/{id}', [ReleaseController::class, 'update'])->whereNumber('id');
    Route::delete('/releases/{id}', [ReleaseController::class, 'destroy'])->whereNumber('id');
    Route::post('/releases/{id}/tasks', [ReleaseController::class, 'attachTasks'])->whereNumber('id');
    Route::delete('/releases/{id}/tasks/{taskId}', [ReleaseController::class, 'detachTask'])
        ->whereNumber('id')
        ->whereNumber('taskId');

    Route::get('/help/products', [HelpController::class, 'products']);
    Route::post('/help/products', [HelpController::class, 'storeProduct']);
    Route::put('/help/products/reorder', [HelpController::class, 'reorderProducts']);
    Route::get('/help/products/{id}', [HelpController::class, 'showProduct'])->whereNumber('id');
    Route::patch('/help/products/{id}', [HelpController::class, 'updateProduct'])->whereNumber('id');
    Route::delete('/help/products/{id}', [HelpController::class, 'destroyProduct'])->whereNumber('id');
    Route::post('/help/products/{id}/chapters', [HelpController::class, 'storeChapter'])->whereNumber('id');
    Route::put('/help/products/{id}/chapters/reorder', [HelpController::class, 'reorderChapters'])->whereNumber('id');
    Route::post('/help/products/{id}/files', [HelpController::class, 'uploadProductFiles'])->whereNumber('id');
    Route::patch('/help/chapters/{id}', [HelpController::class, 'updateChapter'])->whereNumber('id');
    Route::delete('/help/chapters/{id}', [HelpController::class, 'destroyChapter'])->whereNumber('id');
    Route::post('/help/chapters/{id}/files', [HelpController::class, 'uploadChapterFiles'])->whereNumber('id');

    Route::get('/help/notes', [HelpController::class, 'notes']);
    Route::post('/help/notes', [HelpController::class, 'storeNote']);
    Route::put('/help/notes/reorder', [HelpController::class, 'reorderNotes']);
    Route::patch('/help/notes/{id}', [HelpController::class, 'updateNote'])->whereNumber('id');
    Route::delete('/help/notes/{id}', [HelpController::class, 'destroyNote'])->whereNumber('id');

    Route::post('/comments/{id}/files', [TaskController::class, 'uploadCommentFiles'])->whereNumber('id');
    Route::get('/attachments/{id}', [TaskController::class, 'downloadAttachment'])->whereNumber('id');
    Route::delete('/attachments/{id}', [TaskController::class, 'deleteAttachment'])->whereNumber('id');
});
