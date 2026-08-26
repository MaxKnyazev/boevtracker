<?php

namespace App\Http\Controllers;

use App\Models\Release;
use App\Models\Task;
use App\Support\ApiPresenter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

class ReleaseController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        if ($resp = $this->forbidPending($this->user($request))) {
            return $resp;
        }

        $releases = Release::query()
            ->with(['createdBy'])
            ->withCount('tasks')
            ->orderByDesc('created_at')
            ->get();

        return response()->json([
            'releases' => $releases
                ->map(fn (Release $r) => ApiPresenter::release($r))
                ->values()
                ->all(),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $user = $this->user($request);
        if ($resp = $this->forbidWrite($user)) {
            return $resp;
        }

        $validator = Validator::make($request->all(), [
            'name' => ['required', 'string', 'min:1', 'max:255'],
            'description' => ['nullable', 'string', 'max:10000'],
            'status' => ['nullable', 'in:'.implode(',', Release::STATUSES)],
            'targetDate' => ['nullable', 'date'],
        ], [
            'name.required' => 'Укажите название релиза',
            'name.min' => 'Укажите название релиза',
        ]);
        if ($validator->fails()) {
            return response()->json(['error' => $validator->errors()->toArray()], 400);
        }

        $data = $validator->validated();
        $status = $data['status'] ?? 'PLANNED';
        $maxOrder = (int) Release::query()->max('sort_order');

        $release = Release::query()->create([
            'name' => trim($data['name']),
            'description' => $data['description'] ?? null,
            'status' => $status,
            'target_date' => $data['targetDate'] ?? null,
            'released_at' => $status === 'RELEASED' ? now() : null,
            'created_by_id' => $user->id,
            'sort_order' => $maxOrder + 1,
        ]);

        $release->load(['createdBy'])->loadCount('tasks');

        return response()->json(['release' => ApiPresenter::release($release)], 201);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        if ($resp = $this->forbidPending($this->user($request))) {
            return $resp;
        }

        $release = Release::query()
            ->with([
                'createdBy',
                'tasks.assignees',
                'tasks.activeAssignee',
                'tasks.status',
                'tasks.project.board',
                'tasks.createdBy',
            ])
            ->withCount('tasks')
            ->find($id);

        if (! $release) {
            return response()->json(['error' => 'Релиз не найден'], 404);
        }

        return response()->json([
            'release' => ApiPresenter::release($release, withTasks: true),
        ]);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $user = $this->user($request);
        if ($resp = $this->forbidWrite($user)) {
            return $resp;
        }

        $validator = Validator::make($request->all(), [
            'name' => ['sometimes', 'string', 'min:1', 'max:255'],
            'description' => ['nullable', 'string', 'max:10000'],
            'status' => ['sometimes', 'in:'.implode(',', Release::STATUSES)],
            'targetDate' => ['nullable', 'date'],
        ]);
        if ($validator->fails()) {
            return response()->json(['error' => $validator->errors()->toArray()], 400);
        }

        $release = Release::query()->find($id);
        if (! $release) {
            return response()->json(['error' => 'Релиз не найден'], 404);
        }

        $data = $validator->validated();
        $update = [];
        if (array_key_exists('name', $data)) {
            $update['name'] = trim($data['name']);
        }
        if (array_key_exists('description', $data)) {
            $update['description'] = $data['description'];
        }
        if (array_key_exists('targetDate', $data)) {
            $update['target_date'] = $data['targetDate'];
        }
        if (array_key_exists('status', $data)) {
            $update['status'] = $data['status'];
            if ($data['status'] === 'RELEASED' && $release->released_at === null) {
                $update['released_at'] = now();
            }
            if ($data['status'] !== 'RELEASED') {
                $update['released_at'] = null;
            }
        }

        if ($update !== []) {
            $release->update($update);
        }

        $release->load(['createdBy'])->loadCount('tasks');

        return response()->json(['release' => ApiPresenter::release($release)]);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $user = $this->user($request);
        if ($resp = $this->forbidWrite($user)) {
            return $resp;
        }

        $release = Release::query()->find($id);
        if (! $release) {
            return response()->json(['error' => 'Релиз не найден'], 404);
        }

        $release->delete();

        return response()->json(['ok' => true]);
    }

    public function attachTasks(Request $request, int $id): JsonResponse
    {
        $user = $this->user($request);
        if ($resp = $this->forbidWrite($user)) {
            return $resp;
        }

        $validator = Validator::make($request->all(), [
            'taskIds' => ['required', 'array', 'min:1'],
            'taskIds.*' => ['integer'],
        ], [
            'taskIds.required' => 'Выберите задачи',
            'taskIds.min' => 'Выберите задачи',
        ]);
        if ($validator->fails()) {
            return response()->json(['error' => $validator->errors()->toArray()], 400);
        }

        $release = Release::query()->find($id);
        if (! $release) {
            return response()->json(['error' => 'Релиз не найден'], 404);
        }

        $ids = array_values(array_unique(array_map('intval', $validator->validated()['taskIds'])));
        Task::query()->whereIn('id', $ids)->update(['release_id' => $release->id]);

        $release->load([
            'createdBy',
            'tasks.assignees',
            'tasks.activeAssignee',
            'tasks.status',
            'tasks.project.board',
            'tasks.createdBy',
        ])->loadCount('tasks');

        return response()->json([
            'release' => ApiPresenter::release($release, withTasks: true),
        ]);
    }

    public function detachTask(Request $request, int $id, int $taskId): JsonResponse
    {
        $user = $this->user($request);
        if ($resp = $this->forbidWrite($user)) {
            return $resp;
        }

        $release = Release::query()->find($id);
        if (! $release) {
            return response()->json(['error' => 'Релиз не найден'], 404);
        }

        $task = Task::query()->where('id', $taskId)->where('release_id', $id)->first();
        if (! $task) {
            return response()->json(['error' => 'Задача не найдена в релизе'], 404);
        }

        $task->update(['release_id' => null]);

        return response()->json(['ok' => true]);
    }
}
