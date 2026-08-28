<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class DocumentationChapter extends Model
{
    protected $fillable = [
        'product_id',
        'title',
        'body',
        'sort_order',
    ];

    protected $casts = [
        'sort_order' => 'integer',
    ];

    public function product(): BelongsTo
    {
        return $this->belongsTo(DocumentationProduct::class, 'product_id');
    }

    public function files(): HasMany
    {
        return $this->hasMany(Attachment::class, 'documentation_chapter_id');
    }
}
