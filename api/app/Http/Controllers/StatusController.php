<?php

namespace App\Http\Controllers;

use App\Models\Project;
use App\Models\ProjectStatus;
use App\Support\ApiPresenter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;

class StatusController extends Controller
{
    public function store(Request $request, int $id): JsonResponse
    {
        if ($resp = $this->forbidWrite($this->user($request))) {
            return $resp;
        }

        $validator = Validator::make($request->all(), [
            'name' => ['required', 'string', 'min:1', 'max:128'],
        ]);
        if ($validator->fails()) {
            return response()->json(['error' => 'Укажите название статуса'], 400);
        }

        if (! Project::query()->whereKey($id)->exists()) {
            return response()->json(['error' => 'Проект не найден'], 404);
        }

        $max = (int) ProjectStatus::query()->where('project_id', $id)->max('order');

        try {
            $status = ProjectStatus::query()->create([
                'project_id' => $id,
                'name' => $validator->validated()['name'],
                'order' => $max + 1,
                'created_at' => now(),
            ]);
        } catch (\Throwable) {
            return response()->json(['error' => 'Статус с таким именем уже есть'], 409);
        }

        return response()->json(['status' => ApiPresenter::status($status)], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        if ($resp = $this->forbidWrite($this->user($request))) {
            return $resp;
        }

        $validator = Validator::make($request->all(), [
            'name' => ['sometimes', 'string', 'min:1', 'max:128'],
            'order' => ['sometimes', 'integer', 'min:0'],
        ]);
        if ($validator->fails()) {
            return response()->json(['error' => 'Неверные данные'], 400);
        }

        $status = ProjectStatus::query()->find($id);
        if (! $status) {
            return response()->json(['error' => 'Статус не найден'], 404);
        }

        try {
            $status->update($validator->validated());
        } catch (\Throwable) {
            return response()->json(['error' => 'Статус с таким именем уже есть'], 409);
        }

        return response()->json(['status' => ApiPresenter::status($status->fresh())]);
    }

    public function reorder(Request $request, int $id): JsonResponse
    {
        if ($resp = $this->forbidWrite($this->user($request))) {
            return $resp;
        }

        $validator = Validator::make($request->all(), [
            'orderedIds' => ['required', 'array', 'min:1'],
            'orderedIds.*' => ['integer'],
        ]);
        if ($validator->fails()) {
            return response()->json(['error' => 'Неверные данные'], 400);
        }

        DB::transaction(function () use ($validator, $id) {
            foreach ($validator->validated()['orderedIds'] as $order => $statusId) {
                ProjectStatus::query()
                    ->where('id', $statusId)
                    ->where('project_id', $id)
                    ->update(['order' => $order]);
            }
        });

        $statuses = ProjectStatus::query()
            ->where('project_id', $id)
            ->orderBy('order')
            ->get()
            ->map(fn (ProjectStatus $s) => ApiPresenter::status($s))
            ->values();

        return response()->json(['statuses' => $statuses]);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        if ($resp = $this->forbidWrite($this->user($request))) {
            return $resp;
        }

        $status = ProjectStatus::query()->withCount('tasks')->with('project.statuses')->find($id);
        if (! $status) {
            return response()->json(['error' => 'Статус не найден'], 404);
        }
        if ($status->tasks_count > 0) {
            return response()->json([
                'error' => 'Нельзя удалить статус с задачами. Сначала перенесите задачи.',
            ], 400);
        }
        if ($status->project->statuses->count() <= 1) {
            return response()->json(['error' => 'Должен остаться хотя бы один статус'], 400);
        }

        $status->delete();

        return response()->json(['ok' => true]);
    }
}
