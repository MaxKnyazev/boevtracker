<?php

namespace App\Http\Controllers;

use App\Models\Attachment;
use App\Models\DocumentationChapter;
use App\Models\DocumentationProduct;
use App\Models\HelpNote;
use App\Services\FileStorage;
use App\Support\ApiPresenter;
use App\Support\Constants;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

class HelpController extends Controller
{
    public function __construct(private FileStorage $files) {}

    public function products(Request $request): JsonResponse
    {
        if ($resp = $this->forbidPending($this->user($request))) {
            return $resp;
        }

        $products = DocumentationProduct::query()
            ->with(['createdBy', 'chapters'])
            ->withCount('chapters')
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get();

        return response()->json([
            'products' => $products
                ->map(fn (DocumentationProduct $p) => ApiPresenter::documentationProduct($p))
                ->values()
                ->all(),
        ]);
    }

    public function showProduct(Request $request, int $id): JsonResponse
    {
        if ($resp = $this->forbidPending($this->user($request))) {
            return $resp;
        }

        $product = DocumentationProduct::query()
            ->with(['createdBy', 'chapters.files', 'files'])
            ->withCount('chapters')
            ->find($id);

        if (! $product) {
            return response()->json(['error' => 'Продукт не найден'], 404);
        }

        return response()->json([
            'product' => ApiPresenter::documentationProduct($product, withChapters: true, withFiles: true),
        ]);
    }

    public function storeProduct(Request $request): JsonResponse
    {
        $user = $this->user($request);
        if ($resp = $this->forbidWrite($user)) {
            return $resp;
        }

        $validator = Validator::make($request->all(), [
            'name' => ['required', 'string', 'min:1', 'max:255'],
            'description' => ['nullable', 'string', 'max:100000'],
        ], [
            'name.required' => 'Укажите название продукта',
            'name.min' => 'Укажите название продукта',
        ]);
        if ($validator->fails()) {
            return response()->json(['error' => $validator->errors()->toArray()], 400);
        }

        $data = $validator->validated();
        $maxOrder = (int) DocumentationProduct::query()->max('sort_order');

        $product = DocumentationProduct::query()->create([
            'name' => trim($data['name']),
            'description' => $data['description'] ?? null,
            'sort_order' => $maxOrder + 1,
            'created_by_id' => $user->id,
        ]);

        $product->load(['createdBy', 'chapters'])->loadCount('chapters');

        return response()->json([
            'product' => ApiPresenter::documentationProduct($product),
        ], 201);
    }

    public function updateProduct(Request $request, int $id): JsonResponse
    {
        $user = $this->user($request);
        if ($resp = $this->forbidWrite($user)) {
            return $resp;
        }

        $validator = Validator::make($request->all(), [
            'name' => ['sometimes', 'string', 'min:1', 'max:255'],
            'description' => ['nullable', 'string', 'max:100000'],
        ]);
        if ($validator->fails()) {
            return response()->json(['error' => $validator->errors()->toArray()], 400);
        }

        $product = DocumentationProduct::query()->find($id);
        if (! $product) {
            return response()->json(['error' => 'Продукт не найден'], 404);
        }

        $data = $validator->validated();
        if (array_key_exists('name', $data)) {
            $product->name = trim($data['name']);
        }
        if (array_key_exists('description', $data)) {
            $product->description = $data['description'];
        }
        $product->save();

        $product->load(['createdBy', 'chapters.files', 'files'])->loadCount('chapters');

        return response()->json([
            'product' => ApiPresenter::documentationProduct($product, withChapters: true, withFiles: true),
        ]);
    }

    public function destroyProduct(Request $request, int $id): JsonResponse
    {
        $user = $this->user($request);
        if ($resp = $this->forbidWrite($user)) {
            return $resp;
        }

        $product = DocumentationProduct::query()->find($id);
        if (! $product) {
            return response()->json(['error' => 'Продукт не найден'], 404);
        }

        $this->deleteOwnedAttachments(
            Attachment::query()->where('documentation_product_id', $id)->get()
                ->concat(
                    Attachment::query()
                        ->whereIn(
                            'documentation_chapter_id',
                            DocumentationChapter::query()->where('product_id', $id)->pluck('id'),
                        )
                        ->get()
                )
        );

        $product->delete();

        return response()->json(['ok' => true]);
    }

    public function reorderProducts(Request $request): JsonResponse
    {
        $user = $this->user($request);
        if ($resp = $this->forbidWrite($user)) {
            return $resp;
        }

        $validator = Validator::make($request->all(), [
            'orderedIds' => ['required', 'array', 'min:1'],
            'orderedIds.*' => ['integer'],
        ]);
        if ($validator->fails()) {
            return response()->json(['error' => $validator->errors()->toArray()], 400);
        }

        foreach ($validator->validated()['orderedIds'] as $index => $productId) {
            DocumentationProduct::query()->whereKey($productId)->update(['sort_order' => $index]);
        }

        return $this->products($request);
    }

    public function storeChapter(Request $request, int $productId): JsonResponse
    {
        $user = $this->user($request);
        if ($resp = $this->forbidWrite($user)) {
            return $resp;
        }

        $product = DocumentationProduct::query()->find($productId);
        if (! $product) {
            return response()->json(['error' => 'Продукт не найден'], 404);
        }

        $validator = Validator::make($request->all(), [
            'title' => ['required', 'string', 'min:1', 'max:255'],
            'body' => ['nullable', 'string', 'max:200000'],
        ], [
            'title.required' => 'Укажите название главы',
            'title.min' => 'Укажите название главы',
        ]);
        if ($validator->fails()) {
            return response()->json(['error' => $validator->errors()->toArray()], 400);
        }

        $data = $validator->validated();
        $maxOrder = (int) DocumentationChapter::query()->where('product_id', $productId)->max('sort_order');

        $chapter = DocumentationChapter::query()->create([
            'product_id' => $productId,
            'title' => trim($data['title']),
            'body' => $data['body'] ?? null,
            'sort_order' => $maxOrder + 1,
        ]);

        $chapter->load('files');

        return response()->json([
            'chapter' => ApiPresenter::documentationChapter($chapter, withFiles: true),
        ], 201);
    }

    public function updateChapter(Request $request, int $id): JsonResponse
    {
        $user = $this->user($request);
        if ($resp = $this->forbidWrite($user)) {
            return $resp;
        }

        $validator = Validator::make($request->all(), [
            'title' => ['sometimes', 'string', 'min:1', 'max:255'],
            'body' => ['nullable', 'string', 'max:200000'],
        ]);
        if ($validator->fails()) {
            return response()->json(['error' => $validator->errors()->toArray()], 400);
        }

        $chapter = DocumentationChapter::query()->find($id);
        if (! $chapter) {
            return response()->json(['error' => 'Глава не найдена'], 404);
        }

        $data = $validator->validated();
        if (array_key_exists('title', $data)) {
            $chapter->title = trim($data['title']);
        }
        if (array_key_exists('body', $data)) {
            $chapter->body = $data['body'];
        }
        $chapter->save();
        $chapter->load('files');

        return response()->json([
            'chapter' => ApiPresenter::documentationChapter($chapter, withFiles: true),
        ]);
    }

    public function destroyChapter(Request $request, int $id): JsonResponse
    {
        $user = $this->user($request);
        if ($resp = $this->forbidWrite($user)) {
            return $resp;
        }

        $chapter = DocumentationChapter::query()->find($id);
        if (! $chapter) {
            return response()->json(['error' => 'Глава не найдена'], 404);
        }

        $this->deleteOwnedAttachments($chapter->files()->get());
        $chapter->delete();

        return response()->json(['ok' => true]);
    }

    public function reorderChapters(Request $request, int $productId): JsonResponse
    {
        $user = $this->user($request);
        if ($resp = $this->forbidWrite($user)) {
            return $resp;
        }

        if (! DocumentationProduct::query()->whereKey($productId)->exists()) {
            return response()->json(['error' => 'Продукт не найден'], 404);
        }

        $validator = Validator::make($request->all(), [
            'orderedIds' => ['required', 'array', 'min:1'],
            'orderedIds.*' => ['integer'],
        ]);
        if ($validator->fails()) {
            return response()->json(['error' => $validator->errors()->toArray()], 400);
        }

        foreach ($validator->validated()['orderedIds'] as $index => $chapterId) {
            DocumentationChapter::query()
                ->whereKey($chapterId)
                ->where('product_id', $productId)
                ->update(['sort_order' => $index]);
        }

        $product = DocumentationProduct::query()
            ->with(['createdBy', 'chapters.files', 'files'])
            ->withCount('chapters')
            ->find($productId);

        return response()->json([
            'product' => ApiPresenter::documentationProduct($product, withChapters: true, withFiles: true),
        ]);
    }

    public function uploadProductFiles(Request $request, int $id): JsonResponse
    {
        if ($resp = $this->forbidWrite($this->user($request))) {
            return $resp;
        }

        if (! DocumentationProduct::query()->whereKey($id)->exists()) {
            return response()->json(['error' => 'Продукт не найден'], 404);
        }

        return $this->storeUploads($request, ['documentation_product_id' => $id]);
    }

    public function uploadChapterFiles(Request $request, int $id): JsonResponse
    {
        if ($resp = $this->forbidWrite($this->user($request))) {
            return $resp;
        }

        if (! DocumentationChapter::query()->whereKey($id)->exists()) {
            return response()->json(['error' => 'Глава не найдена'], 404);
        }

        return $this->storeUploads($request, ['documentation_chapter_id' => $id]);
    }

    public function notes(Request $request): JsonResponse
    {
        if ($resp = $this->forbidPending($this->user($request))) {
            return $resp;
        }

        $notes = HelpNote::query()
            ->with('createdBy')
            ->orderByDesc('pinned')
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get();

        return response()->json([
            'notes' => $notes
                ->map(fn (HelpNote $n) => ApiPresenter::helpNote($n))
                ->values()
                ->all(),
        ]);
    }

    public function storeNote(Request $request): JsonResponse
    {
        $user = $this->user($request);
        if ($resp = $this->forbidWrite($user)) {
            return $resp;
        }

        $validator = Validator::make($request->all(), [
            'title' => ['required', 'string', 'min:1', 'max:255'],
            'body' => ['nullable', 'string', 'max:100000'],
            'pinned' => ['nullable', 'boolean'],
        ], [
            'title.required' => 'Укажите название заметки',
            'title.min' => 'Укажите название заметки',
        ]);
        if ($validator->fails()) {
            return response()->json(['error' => $validator->errors()->toArray()], 400);
        }

        $data = $validator->validated();
        $maxOrder = (int) HelpNote::query()->max('sort_order');

        $note = HelpNote::query()->create([
            'title' => trim($data['title']),
            'body' => $data['body'] ?? null,
            'pinned' => (bool) ($data['pinned'] ?? false),
            'sort_order' => $maxOrder + 1,
            'created_by_id' => $user->id,
        ]);

        $note->load('createdBy');

        return response()->json(['note' => ApiPresenter::helpNote($note)], 201);
    }

    public function updateNote(Request $request, int $id): JsonResponse
    {
        $user = $this->user($request);
        if ($resp = $this->forbidWrite($user)) {
            return $resp;
        }

        $validator = Validator::make($request->all(), [
            'title' => ['sometimes', 'string', 'min:1', 'max:255'],
            'body' => ['nullable', 'string', 'max:100000'],
            'pinned' => ['sometimes', 'boolean'],
        ]);
        if ($validator->fails()) {
            return response()->json(['error' => $validator->errors()->toArray()], 400);
        }

        $note = HelpNote::query()->find($id);
        if (! $note) {
            return response()->json(['error' => 'Заметка не найдена'], 404);
        }

        $data = $validator->validated();
        if (array_key_exists('title', $data)) {
            $note->title = trim($data['title']);
        }
        if (array_key_exists('body', $data)) {
            $note->body = $data['body'];
        }
        if (array_key_exists('pinned', $data)) {
            $note->pinned = (bool) $data['pinned'];
        }
        $note->save();
        $note->load('createdBy');

        return response()->json(['note' => ApiPresenter::helpNote($note)]);
    }

    public function destroyNote(Request $request, int $id): JsonResponse
    {
        $user = $this->user($request);
        if ($resp = $this->forbidWrite($user)) {
            return $resp;
        }

        $note = HelpNote::query()->find($id);
        if (! $note) {
            return response()->json(['error' => 'Заметка не найдена'], 404);
        }

        $note->delete();

        return response()->json(['ok' => true]);
    }

    public function reorderNotes(Request $request): JsonResponse
    {
        $user = $this->user($request);
        if ($resp = $this->forbidWrite($user)) {
            return $resp;
        }

        $validator = Validator::make($request->all(), [
            'orderedIds' => ['required', 'array', 'min:1'],
            'orderedIds.*' => ['integer'],
        ]);
        if ($validator->fails()) {
            return response()->json(['error' => $validator->errors()->toArray()], 400);
        }

        foreach ($validator->validated()['orderedIds'] as $index => $noteId) {
            HelpNote::query()->whereKey($noteId)->update(['sort_order' => $index]);
        }

        return $this->notes($request);
    }

    private function storeUploads(Request $request, array $owner): JsonResponse
    {
        $uploaded = $request->allFiles();
        $files = [];
        foreach ($uploaded as $item) {
            if (is_array($item)) {
                foreach ($item as $f) {
                    $files[] = $f;
                }
            } else {
                $files[] = $item;
            }
        }

        if (! count($files)) {
            return response()->json(['error' => 'Не выбраны файлы'], 400);
        }
        if (count($files) > 20) {
            return response()->json(['error' => 'За один раз не больше 20 файлов'], 400);
        }

        $created = [];
        foreach ($files as $file) {
            if ($file->getSize() > Constants::MAX_FILE_SIZE) {
                return response()->json(['error' => 'Файл больше 500 МБ'], 400);
            }

            $stored = $this->files->store($file);
            $attachment = Attachment::query()->create([
                ...$owner,
                'filename' => $stored['filename'],
                'original_name' => $stored['originalName'],
                'mime_type' => $stored['mime'],
                'size' => $stored['size'],
                'key' => $stored['key'],
                'url' => '',
                'created_at' => now(),
            ]);
            $attachment->url = '/api/attachments/'.$attachment->id;
            $attachment->save();
            $created[] = ApiPresenter::attachment($attachment);
        }

        return response()->json([
            'files' => $created,
            'file' => $created[0] ?? null,
        ], 201);
    }

    /** @param  \Illuminate\Support\Collection<int, Attachment>  $attachments */
    private function deleteOwnedAttachments($attachments): void
    {
        foreach ($attachments as $attachment) {
            if ($this->files->exists($attachment->key)) {
                $this->files->delete($attachment->key);
            }
            $attachment->delete();
        }
    }
}
