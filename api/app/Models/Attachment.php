<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Attachment extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'filename',
        'original_name',
        'mime_type',
        'size',
        'key',
        'url',
        'task_id',
        'comment_id',
        'documentation_product_id',
        'documentation_chapter_id',
        'created_at',
    ];

    protected $casts = [
        'created_at' => 'datetime',
    ];

    public function task(): BelongsTo
    {
        return $this->belongsTo(Task::class);
    }

    public function comment(): BelongsTo
    {
        return $this->belongsTo(Comment::class);
    }

    public function documentationProduct(): BelongsTo
    {
        return $this->belongsTo(DocumentationProduct::class, 'documentation_product_id');
    }

    public function documentationChapter(): BelongsTo
    {
        return $this->belongsTo(DocumentationChapter::class, 'documentation_chapter_id');
    }
}
