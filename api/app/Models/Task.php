<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Task extends Model
{
    protected $fillable = [
        'title',
        'description',
        'priority',
        'deadline',
        'project_id',
        'status_id',
        'assignee_id',
        'created_by_id',
        'sort_order',
        'status_changed_at',
    ];

    protected $casts = [
        'deadline' => 'datetime',
        'status_changed_at' => 'datetime',
    ];

    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    public function status(): BelongsTo
    {
        return $this->belongsTo(ProjectStatus::class, 'status_id');
    }

    public function assignee(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assignee_id');
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by_id');
    }

    public function comments(): HasMany
    {
        return $this->hasMany(Comment::class)->orderBy('created_at');
    }

    public function files(): HasMany
    {
        return $this->hasMany(Attachment::class);
    }
}
