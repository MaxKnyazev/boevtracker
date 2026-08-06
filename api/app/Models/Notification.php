<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Notification extends Model
{
    public const UPDATED_AT = null;

    protected $fillable = [
        'user_id',
        'actor_id',
        'type',
        'title',
        'body',
        'task_id',
        'comment_id',
        'read_at',
        'created_at',
    ];

    protected function casts(): array
    {
        return [
            'read_at' => 'datetime',
            'created_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function actor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'actor_id');
    }

    public function task(): BelongsTo
    {
        return $this->belongsTo(Task::class);
    }

    public function comment(): BelongsTo
    {
        return $this->belongsTo(Comment::class);
    }
}
