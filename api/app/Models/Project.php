<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Project extends Model
{
    protected $fillable = [
        'name',
        'board_id',
        'created_by_id',
        'sort_order',
    ];

    public function board(): BelongsTo
    {
        return $this->belongsTo(Board::class);
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by_id');
    }

    public function statuses(): HasMany
    {
        return $this->hasMany(ProjectStatus::class)->orderBy('order');
    }

    public function tasks(): HasMany
    {
        return $this->hasMany(Task::class)->orderBy('sort_order')->orderBy('id');
    }
}
