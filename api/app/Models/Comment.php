<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Comment extends Model
{
    protected $fillable = ['body', 'kind', 'task_id', 'author_id', 'edited_at', 'reply_to_id'];

    protected $casts = [
        'edited_at' => 'datetime',
    ];

    public function task(): BelongsTo
    {
        return $this->belongsTo(Task::class);
    }

    public function author(): BelongsTo
    {
        return $this->belongsTo(User::class, 'author_id');
    }

    public function replyTo(): BelongsTo
    {
        return $this->belongsTo(Comment::class, 'reply_to_id');
    }

    public function files(): HasMany
    {
        return $this->hasMany(Attachment::class);
    }
}
