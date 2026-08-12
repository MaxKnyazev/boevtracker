<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Services\FileStorage;
use App\Support\ApiPresenter;
use App\Support\Constants;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

class ProfileController extends Controller
{
    private const AVATAR_MAX_BYTES = 5 * 1024 * 1024;

    /** @var list<string> */
    private const AVATAR_MIMES = [
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/webp',
    ];

    public function __construct(private FileStorage $files) {}

    public function update(Request $request): JsonResponse
    {
        if ($resp = $this->forbidPending($this->user($request))) {
            return $resp;
        }

        $validator = Validator::make($request->all(), [
            'firstName' => ['sometimes', 'required', 'string', 'min:1', 'max:64'],
            'lastName' => ['sometimes', 'required', 'string', 'min:1', 'max:64'],
            'avatarColor' => ['sometimes', 'required', 'string', 'regex:/^#[0-9A-Fa-f]{6}$/'],
        ]);

        if ($validator->fails()) {
            return response()->json(['error' => $validator->errors()->toArray()], 400);
        }

        $data = $validator->validated();
        $user = $this->user($request);
        $updates = [];

        if (array_key_exists('firstName', $data)) {
            $updates['first_name'] = trim($data['firstName']);
        }
        if (array_key_exists('lastName', $data)) {
            $updates['last_name'] = trim($data['lastName']);
        }
        if (array_key_exists('avatarColor', $data)) {
            if (! in_array($data['avatarColor'], Constants::AVATAR_COLORS, true)) {
                return response()->json(['error' => 'Недопустимый цвет'], 400);
            }
            $updates['avatar_color'] = $data['avatarColor'];
        }

        if ($updates !== []) {
            $user->update($updates);
        }

        return response()->json(['user' => ApiPresenter::user($user->fresh())]);
    }

    public function uploadAvatar(Request $request): JsonResponse
    {
        if ($resp = $this->forbidPending($this->user($request))) {
            return $resp;
        }

        $cropped = $request->file('file');
        if (! $cropped instanceof UploadedFile) {
            return response()->json(['error' => 'Файл не передан'], 400);
        }

        $error = $this->validateAvatarFile($cropped);
        if ($error !== null) {
            return response()->json(['error' => $error], 400);
        }

        $crop = $this->parseCrop($request->input('crop'));
        if ($crop === null) {
            return response()->json(['error' => 'Некорректные параметры обрезки'], 400);
        }

        $user = $this->user($request);
        $source = $request->file('source');
        $hasExistingSource = is_string($user->avatar_source_key)
            && $user->avatar_source_key !== ''
            && $this->files->exists($user->avatar_source_key);

        if ($source instanceof UploadedFile) {
            $sourceError = $this->validateAvatarFile($source);
            if ($sourceError !== null) {
                return response()->json(['error' => $sourceError], 400);
            }
        } elseif (! $hasExistingSource) {
            return response()->json(['error' => 'Исходное изображение не передано'], 400);
        }

        $oldCroppedKey = $user->avatar_key;
        $oldSourceKey = $user->avatar_source_key;

        $croppedKey = $this->storeAvatarFile($user->id, $cropped, 'avatars');
        $sourceKey = $hasExistingSource ? $user->avatar_source_key : null;

        if ($source instanceof UploadedFile) {
            $sourceKey = $this->storeAvatarFile($user->id, $source, 'avatar-sources');
        }

        $user->update([
            'avatar_key' => $croppedKey,
            'avatar_source_key' => $sourceKey,
            'avatar_crop' => $crop,
        ]);

        if ($oldCroppedKey && $oldCroppedKey !== $croppedKey && $this->files->exists($oldCroppedKey)) {
            $this->files->delete($oldCroppedKey);
        }
        if (
            $source instanceof UploadedFile
            && $oldSourceKey
            && $oldSourceKey !== $sourceKey
            && $this->files->exists($oldSourceKey)
        ) {
            $this->files->delete($oldSourceKey);
        }

        return response()->json(['user' => ApiPresenter::user($user->fresh())]);
    }

    public function deleteAvatar(Request $request): JsonResponse
    {
        if ($resp = $this->forbidPending($this->user($request))) {
            return $resp;
        }

        $user = $this->user($request);
        $this->deleteAvatarFiles($user);
        $user->update([
            'avatar_key' => null,
            'avatar_source_key' => null,
            'avatar_crop' => null,
        ]);

        return response()->json(['user' => ApiPresenter::user($user->fresh())]);
    }

    public function showAvatar(Request $request, int $id): BinaryFileResponse|JsonResponse
    {
        if ($resp = $this->forbidPending($this->user($request))) {
            return $resp;
        }

        $user = User::query()->find($id);
        if (! $user || ! $user->avatar_key || ! $this->files->exists($user->avatar_key)) {
            return response()->json(['error' => 'Аватар не найден'], 404);
        }

        return $this->fileResponse($user->avatar_key);
    }

    public function showAvatarSource(Request $request): BinaryFileResponse|JsonResponse
    {
        if ($resp = $this->forbidPending($this->user($request))) {
            return $resp;
        }

        $user = $this->user($request);
        $key = $user->avatar_source_key ?: $user->avatar_key;
        if (! $key || ! $this->files->exists($key)) {
            return response()->json(['error' => 'Исходное изображение не найдено'], 404);
        }

        return $this->fileResponse($key);
    }

    /** @return array{zoom: float, panX: float, panY: float}|null */
    private function parseCrop(mixed $raw): ?array
    {
        if (is_string($raw)) {
            $decoded = json_decode($raw, true);
        } elseif (is_array($raw)) {
            $decoded = $raw;
        } else {
            return null;
        }

        if (! is_array($decoded)) {
            return null;
        }

        foreach (['zoom', 'panX', 'panY'] as $key) {
            if (! array_key_exists($key, $decoded) || ! is_numeric($decoded[$key])) {
                return null;
            }
        }

        $zoom = (float) $decoded['zoom'];
        if ($zoom < 1 || $zoom > 3) {
            return null;
        }

        return [
            'zoom' => $zoom,
            'panX' => (float) $decoded['panX'],
            'panY' => (float) $decoded['panY'],
        ];
    }

    private function storeAvatarFile(int $userId, UploadedFile $file, string $directory): string
    {
        $ext = $file->getClientOriginalExtension();
        $filename = $userId.'-'.Str::uuid()->toString().($ext !== '' ? '.'.$ext : '');
        Storage::disk('local')->putFileAs($directory, $file, $filename);

        return $directory.'/'.$filename;
    }

    private function validateAvatarFile(UploadedFile $file): ?string
    {
        if (! $file->isValid()) {
            return 'Не удалось загрузить файл';
        }

        $size = $file->getSize() ?: 0;
        if ($size > self::AVATAR_MAX_BYTES) {
            return 'Изображение больше 5 МБ';
        }

        $mime = $file->getMimeType() ?: '';
        if (! in_array($mime, self::AVATAR_MIMES, true)) {
            return 'Допустимы только изображения JPEG, PNG, GIF и WebP';
        }

        return null;
    }

    private function deleteAvatarFiles(User $user): void
    {
        foreach ([$user->avatar_key, $user->avatar_source_key] as $key) {
            if ($key && $this->files->exists($key)) {
                $this->files->delete($key);
            }
        }
    }

    private function fileResponse(string $key): BinaryFileResponse
    {
        $mime = $this->guessAvatarMime($key);

        return response()->file($this->files->absolutePath($key), [
            'Content-Type' => $mime,
            'Content-Disposition' => 'inline',
            'Cache-Control' => 'private, max-age=3600',
        ]);
    }

    private function guessAvatarMime(string $key): string
    {
        $ext = strtolower(pathinfo($key, PATHINFO_EXTENSION));

        return match ($ext) {
            'jpg', 'jpeg' => 'image/jpeg',
            'png' => 'image/png',
            'gif' => 'image/gif',
            'webp' => 'image/webp',
            default => 'application/octet-stream',
        };
    }
}
