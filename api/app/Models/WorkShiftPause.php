<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class WorkShiftPause extends Model
{
    public const UPDATED_AT = null;

    protected $fillable = [
        'work_shift_id',
        'started_at',
        'ended_at',
        'created_at',
    ];

    protected function casts(): array
    {
        return [
            'started_at' => 'datetime',
            'ended_at' => 'datetime',
            'created_at' => 'datetime',
        ];
    }

    public function shift(): BelongsTo
    {
        return $this->belongsTo(WorkShift::class, 'work_shift_id');
    }
}
