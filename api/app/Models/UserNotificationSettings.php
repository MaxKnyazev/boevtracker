<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class UserNotificationSettings extends Model
{
    protected $table = 'user_notification_settings';

    protected $fillable = [
        'user_id',
        'task_comment',
        'mention',
        'reply',
        'assignee',
        'status_assignee',
        'status_creator',
    ];

    protected $casts = [
        'task_comment' => 'boolean',
        'mention' => 'boolean',
        'reply' => 'boolean',
        'assignee' => 'boolean',
        'status_assignee' => 'boolean',
        'status_creator' => 'boolean',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public static function defaultsFor(int $userId): self
    {
        return static::query()->firstOrCreate(
            ['user_id' => $userId],
            [
                'task_comment' => false,
                'mention' => true,
                'reply' => true,
                'assignee' => true,
                'status_assignee' => true,
                'status_creator' => false,
            ],
        );
    }
}
