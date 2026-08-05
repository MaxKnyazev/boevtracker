<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Board extends Model
{
    protected $fillable = ['name', 'created_by_id'];

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by_id');
    }

    public function projects(): HasMany
    {
        return $this->hasMany(Project::class)->orderBy('sort_order')->orderBy('id');
    }
}
