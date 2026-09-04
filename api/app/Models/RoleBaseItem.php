<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class RoleBaseItem extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'tracker_role',
        'vault_item_id',
    ];

    public function vaultItem(): BelongsTo
    {
        return $this->belongsTo(Credential::class, 'vault_item_id');
    }
}
