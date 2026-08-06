<?php

namespace App\Http\Controllers;

use App\Models\Project;
use App\Models\ProjectStatus;
use App\Support\ApiPresenter;
use App\Support\Constants;
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

        $name = $validator->validated()['name'];
        if (Constants::isProtectedStatusName($name)) {
            return response()->json([
                'error' => 'Имена «Открыта» и «Закрыта» зарезервированы',
            ], 400);
        }

        $closed = ProjectStatus::query()
            ->where('project_id', $id)
            ->where('name', Constants::CLOSED_STATUS_NAME)
            ->first();

        try {
            $status = DB::transaction(function () use ($id, $name, $closed) {
                if ($closed) {
                    $insertOrder = (int) $closed->order;
                    ProjectStatus::query()
                        ->where('project_id', $id)
                        ->where('order', '>=', $insertOrder)
                        ->increment('order');

                    return ProjectStatus::query()->create([
                        'project_id' => $id,
                        'name' => $name,
                        'order' => $insertOrder,
                        'created_at' => now(),
                    ]);
                }

                $max = (int) ProjectStatus::query()->where('project_id', $id)->max('order');

                return ProjectStatus::query()->create([
                    'project_id' => $id,
                    'name' => $name,
                    'order' => $max + 1,
                    'created_at' => now(),
                ]);
            });
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

        $data = $validator->validated();
        if (array_key_exists('name', $data)) {
            if (Constants::isProtectedStatusName($status->name) && $data['name'] !== $status->name) {
                return response()->json([
                    'error' => 'Системный статус нельзя переименовать',
                ], 400);
            }
            if (
                Constants::isProtectedStatusName($data['name'])
                && $data['name'] !== $status->name
            ) {
                return response()->json([
                    'error' => 'Имена «Открыта» и «Закрыта» зарезервированы',
                ], 400);
            }
        }

        try {
            $status->update($data);
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

        $statuses = ProjectStatus::query()
            ->where('project_id', $id)
            ->get()
            ->keyBy('id');

        $orderedIds = $validator->validated()['orderedIds'];
        $openIndex = null;
        $closedId = null;
        $normalizedIds = [];

        foreach ($orderedIds as $index => $statusId) {
            $row = $statuses->get($statusId);
            if (! $row) {
                return response()->json(['error' => 'Некорректный список статусов'], 400);
            }
            if ($row->name === Constants::CLOSED_STATUS_NAME) {
                $closedId = $statusId;
                continue;
            }
            if ($row->name === Constants::OPEN_STATUS_NAME) {
                $openIndex = count($normalizedIds);
            }
            $normalizedIds[] = $statusId;
        }

        if ($closedId !== null) {
            $normalizedIds[] = $closedId;
        }

        $closedIndex = $closedId !== null ? count($normalizedIds) - 1 : null;

        if (
            $openIndex !== null
            && $closedIndex !== null
            && $openIndex > $closedIndex
        ) {
            return response()->json([
                'error' => 'Статус «Открыта» не может стоять после «Закрыта»',
            ], 400);
        }

        DB::transaction(function () use ($normalizedIds, $id) {
            foreach ($normalizedIds as $order => $statusId) {
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
        if (Constants::isProtectedStatusName($status->name)) {
            return response()->json([
                'error' => 'Системный статус нельзя удалить',
            ], 400);
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
