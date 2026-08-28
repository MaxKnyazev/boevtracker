<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class HelpNote extends Model
{
    protected $fillable = [
        'title',
        'body',
        'pinned',
        'sort_order',
        'created_by_id',
    ];

    protected $casts = [
        'pinned' => 'boolean',
        'sort_order' => 'integer',
    ];

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by_id');
    }
}
