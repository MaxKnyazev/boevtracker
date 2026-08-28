<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class DocumentationProduct extends Model
{
    protected $fillable = [
        'name',
        'description',
        'sort_order',
        'created_by_id',
    ];

    protected $casts = [
        'sort_order' => 'integer',
    ];

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by_id');
    }

    public function chapters(): HasMany
    {
        return $this->hasMany(DocumentationChapter::class, 'product_id')->orderBy('sort_order')->orderBy('id');
    }

    public function files(): HasMany
    {
        return $this->hasMany(Attachment::class, 'documentation_product_id');
    }
}
