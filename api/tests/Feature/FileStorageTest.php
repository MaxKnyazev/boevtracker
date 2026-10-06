<?php

namespace Tests\Feature;

use App\Services\FileStorage;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class FileStorageTest extends TestCase
{
    public function test_upload_is_moved_with_its_content_and_metadata(): void
    {
        Storage::fake('local');
        $file = UploadedFile::fake()->createWithContent('example.txt', 'Upload content');
        $temporaryPath = $file->getPathname();
        $size = $file->getSize();
        $mime = $file->getMimeType();
        $storage = new FileStorage;

        $stored = $storage->store($file);

        $this->assertFileDoesNotExist($temporaryPath);
        Storage::disk('local')->assertExists($stored['key']);
        $this->assertSame('Upload content', Storage::disk('local')->get($stored['key']));
        $this->assertSame('example.txt', $stored['originalName']);
        $this->assertSame($size, $stored['size']);
        $this->assertSame($mime, $stored['mime']);
        $this->assertStringEndsWith('.txt', $stored['filename']);
        $this->assertTrue($storage->exists($stored['key']));

        $storage->delete($stored['key']);
        Storage::disk('local')->assertMissing($stored['key']);
    }
}
