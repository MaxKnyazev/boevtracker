<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
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
        'active_assignee_id',
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

    public function assignees(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'task_assignees')
            ->withPivot('created_at')
            ->orderBy('task_assignees.created_at');
    }

    public function activeAssignee(): BelongsTo
    {
        return $this->belongsTo(User::class, 'active_assignee_id');
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

    public function statusHistories(): HasMany
    {
        return $this->hasMany(TaskStatusHistory::class)->orderByDesc('created_at');
    }

    public function workIntervals(): HasMany
    {
        return $this->hasMany(TaskWorkInterval::class);
    }

    public function assigneeIds(): array
    {
        if ($this->relationLoaded('assignees')) {
            return $this->assignees->pluck('id')->map(fn ($id) => (int) $id)->all();
        }

        return $this->assignees()->pluck('users.id')->map(fn ($id) => (int) $id)->all();
    }

    public function isAssignee(int $userId): bool
    {
        return in_array($userId, $this->assigneeIds(), true);
    }
}
