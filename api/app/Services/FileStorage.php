<?php

namespace App\Services;

use App\Support\Constants;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class FileStorage
{
    /** @return array{filename: string, key: string, url: string, size: int, mime: string, originalName: string} */
    public function store(UploadedFile $file): array
    {
        $originalName = $file->getClientOriginalName();
        $ext = $file->getClientOriginalExtension();
        $filename = Str::uuid()->toString().($ext !== '' ? '.'.$ext : '');
        $key = 'uploads/'.$filename;
        $size = $file->getSize() ?: 0;
        $mime = $file->getMimeType() ?: 'application/octet-stream';

        // Move PHP's temporary upload instead of streaming another full copy.
        $file->move(Storage::disk('local')->path('uploads'), $filename);

        return [
            'filename' => $filename,
            'key' => $key,
            'url' => '/api/attachments/pending',
            'size' => $size,
            'mime' => $mime,
            'originalName' => $originalName,
        ];
    }

    public function absolutePath(string $key): string
    {
        return Storage::disk('local')->path($key);
    }

    public function exists(string $key): bool
    {
        return Storage::disk('local')->exists($key);
    }

    public function delete(string $key): void
    {
        Storage::disk('local')->delete($key);
    }

    public function maxBytes(): int
    {
        return Constants::MAX_FILE_SIZE;
    }
}
