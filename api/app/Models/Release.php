<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Release extends Model
{
    public const STATUSES = ['PLANNED', 'IN_PROGRESS', 'RELEASED', 'CANCELLED'];

    protected $fillable = [
        'name',
        'description',
        'status',
        'target_date',
        'released_at',
        'created_by_id',
        'sort_order',
    ];

    protected function casts(): array
    {
        return [
            'target_date' => 'date',
            'released_at' => 'datetime',
        ];
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by_id');
    }

    public function tasks(): HasMany
    {
        return $this->hasMany(Task::class)->orderByDesc('updated_at');
    }
}
