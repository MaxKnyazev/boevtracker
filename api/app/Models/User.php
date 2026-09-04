<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class User extends Model
{
    protected $fillable = [
        'username',
        'password_hash',
        'first_name',
        'last_name',
        'avatar_color',
        'avatar_key',
        'avatar_source_key',
        'avatar_crop',
        'role',
    ];

    protected $hidden = [
        'password_hash',
        'scale_pause_totals',
    ];

    protected $casts = [
        'avatar_crop' => 'array',
        'scale_pause_totals' => 'boolean',
    ];

    /** When true, pause seconds in shift totals are divided by this. */
    public const PAUSE_TOTALS_DIVISOR = 1.5;

    public function applyPauseTotalsScale(int $seconds): int
    {
        $seconds = max(0, $seconds);
        if (! $this->scale_pause_totals) {
            return $seconds;
        }

        return (int) round($seconds / self::PAUSE_TOTALS_DIVISOR);
    }

    public function boards(): HasMany
    {
        return $this->hasMany(Board::class, 'created_by_id');
    }

    public function projects(): HasMany
    {
        return $this->hasMany(Project::class, 'created_by_id');
    }

    public function vaultItems(): HasMany
    {
        return $this->hasMany(Credential::class, 'owner_user_id');
    }

    public function canWrite(): bool
    {
        return in_array($this->role, ['ADMIN', 'DEVELOPER'], true);
    }

    public function canManageUsers(): bool
    {
        return $this->role === 'ADMIN';
    }

    public function canDeleteBoardOrProject(): bool
    {
        return $this->role === 'ADMIN';
    }

    public function isPending(): bool
    {
        return $this->role === 'PENDING';
    }
}
