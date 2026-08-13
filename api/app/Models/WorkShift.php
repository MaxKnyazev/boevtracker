<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class WorkShift extends Model
{
    protected $fillable = [
        'user_id',
        'started_at',
        'ended_at',
        'comment',
    ];

    protected function casts(): array
    {
        return [
            'started_at' => 'datetime',
            'ended_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function pauses(): HasMany
    {
        return $this->hasMany(WorkShiftPause::class);
    }

    public function openPause(): ?WorkShiftPause
    {
        if ($this->relationLoaded('pauses')) {
            return $this->pauses->first(fn (WorkShiftPause $p) => $p->ended_at === null);
        }

        return $this->pauses()->whereNull('ended_at')->latest('started_at')->first();
    }

    public function isOpen(): bool
    {
        return $this->ended_at === null;
    }
}
