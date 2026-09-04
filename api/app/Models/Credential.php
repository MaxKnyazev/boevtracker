<?php

namespace App\Models;

use Illuminate\Contracts\Encryption\DecryptException;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Facades\Crypt;

class Credential extends Model
{
    public const KIND_PERSONAL = 'personal';

    public const KIND_BASE = 'base';

    protected $table = 'vault_items';

    protected $fillable = [
        'service_id',
        'owner_user_id',
        'account',
        'level',
        'login',
        'password_encrypted',
    ];

    protected $hidden = ['password_encrypted'];

    public function service(): BelongsTo
    {
        return $this->belongsTo(Service::class);
    }

    public function owner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'owner_user_id');
    }

    public function roleLinks(): HasMany
    {
        return $this->hasMany(RoleBaseItem::class, 'vault_item_id');
    }

    public function isBase(): bool
    {
        return $this->owner_user_id === null;
    }

    public function kind(): string
    {
        return $this->isBase() ? self::KIND_BASE : self::KIND_PERSONAL;
    }

    public function setPlainPassword(string $password): void
    {
        $this->password_encrypted = Crypt::encryptString($password);
    }

    public function plainPassword(): string
    {
        try {
            return Crypt::decryptString((string) $this->password_encrypted);
        } catch (DecryptException) {
            return (string) $this->password_encrypted;
        }
    }

    /** @return list<string> */
    public function trackerRoles(): array
    {
        if (! $this->isBase()) {
            return [];
        }

        return $this->roleLinks
            ->pluck('tracker_role')
            ->map(fn ($role) => (string) $role)
            ->unique()
            ->values()
            ->all();
    }

    public function toApiArray(): array
    {
        $kind = $this->kind();

        return [
            'id' => $this->id,
            'service' => $this->service?->name,
            'url' => $this->service?->url,
            'role' => $this->account,
            'level' => $this->level,
            'login' => $this->login,
            'password' => $this->plainPassword(),
            'kind' => $kind,
            'source' => $kind,
            'ownerId' => $this->owner_user_id,
            'baseRoles' => $this->trackerRoles(),
        ];
    }
}
