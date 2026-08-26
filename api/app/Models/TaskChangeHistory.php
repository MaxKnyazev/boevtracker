<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class TaskChangeHistory extends Model
{
    public const TYPE_STATUS = 'status';

    public const TYPE_DEADLINE_SET = 'deadline_set';

    public const TYPE_DEADLINE_CHANGED = 'deadline_changed';

    public const TYPE_DESCRIPTION_CHANGED = 'description_changed';

    public const TYPE_PRIORITY_CHANGED = 'priority_changed';

    public const TYPE_FILE_ADDED = 'file_added';

    public const TYPE_FILE_REMOVED = 'file_removed';

    public const TYPE_TOOK_TASK = 'took_task';

    public const TYPE_ASSIGNED_ASSIGNEE = 'assigned_assignee';

    public const TYPE_TOOK_CO_ASSIGNEE = 'took_co_assignee';

    public const TYPE_ASSIGNED_CO_ASSIGNEE = 'assigned_co_assignee';

    public const TYPE_REMOVED_ASSIGNEE = 'removed_assignee';

    public const TYPE_ASSIGNED_ACTIVE_ASSIGNEE = 'assigned_active_assignee';

    public $timestamps = false;

    protected $fillable = [
        'task_id',
        'user_id',
        'type',
        'payload',
        'created_at',
    ];

    protected function casts(): array
    {
        return [
            'payload' => 'array',
            'created_at' => 'datetime',
        ];
    }

    public function task(): BelongsTo
    {
        return $this->belongsTo(Task::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
