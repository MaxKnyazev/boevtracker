<?php

namespace App\Http\Controllers;

use App\Models\Board;
use App\Models\Project;
use App\Models\ProjectStatus;
use App\Support\ApiPresenter;
use App\Support\Constants;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;

class ProjectController extends Controller
{
    public function store(Request $request, int $boardId): JsonResponse
    {
        $user = $this->user($request);
        if ($resp = $this->forbidWrite($user)) {
            return $resp;
        }

        $validator = Validator::make($request->all(), [
            'name' => ['required', 'string', 'min:1', 'max:255'],
        ]);
        if ($validator->fails()) {
            return response()->json(['error' => 'Укажите название'], 400);
        }

        $board = Board::query()->find($boardId);
        if (! $board) {
            return response()->json(['error' => 'Доска не найдена'], 404);
        }

        $maxOrder = (int) Project::query()->where('board_id', $boardId)->max('sort_order');

        $project = DB::transaction(function () use ($validator, $boardId, $user, $maxOrder) {
            $project = Project::query()->create([
                'name' => $validator->validated()['name'],
                'board_id' => $boardId,
                'created_by_id' => $user->id,
                'sort_order' => $maxOrder + 1,
            ]);

            foreach (Constants::DEFAULT_STATUSES as $order => $name) {
                ProjectStatus::query()->create([
                    'project_id' => $project->id,
                    'name' => $name,
                    'order' => $order,
                    'created_at' => now(),
                ]);
            }

            return $project;
        });

        $project->load('statuses')->loadCount('tasks');

        return response()->json(['project' => ApiPresenter::project($project)], 201);
    }

    public function reorder(Request $request, int $boardId): JsonResponse
    {
        if ($resp = $this->forbidWrite($this->user($request))) {
            return $resp;
        }

        $validator = Validator::make($request->all(), [
            'orderedIds' => ['required', 'array', 'min:1'],
            'orderedIds.*' => ['integer'],
        ]);
        if ($validator->fails()) {
            return response()->json(['error' => 'Укажите порядок проектов'], 400);
        }

        $board = Board::query()->with('projects:id,board_id')->find($boardId);
        if (! $board) {
            return response()->json(['error' => 'Доска не найдена'], 404);
        }

        $existingIds = $board->projects->pluck('id')->all();
        $orderedIds = $validator->validated()['orderedIds'];
        sort($existingIds);
        $check = $orderedIds;
        sort($check);
        if ($existingIds !== $check) {
            return response()->json(['error' => 'Некорректный список проектов'], 400);
        }

        DB::transaction(function () use ($orderedIds) {
            foreach ($orderedIds as $order => $projectId) {
                Project::query()->where('id', $projectId)->update(['sort_order' => $order]);
            }
        });

        $projects = Project::query()
            ->where('board_id', $boardId)
            ->with('statuses')
            ->withCount('tasks')
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get()
            ->map(fn (Project $p) => ApiPresenter::project($p))
            ->values();

        return response()->json(['projects' => $projects]);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        if ($resp = $this->forbidPending($this->user($request))) {
            return $resp;
        }

        $project = Project::query()
            ->with([
                'board',
                'statuses',
                'tasks' => fn ($q) => $q
                    ->with(['assignee', 'status', 'files'])
                    ->withCount('comments'),
            ])
            ->find($id);

        if (! $project) {
            return response()->json(['error' => 'Проект не найден'], 404);
        }

        return response()->json(['project' => ApiPresenter::project($project, true)]);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        if ($resp = $this->forbidWrite($this->user($request))) {
            return $resp;
        }

        $validator = Validator::make($request->all(), [
            'name' => ['required', 'string', 'min:1', 'max:255'],
        ]);
        if ($validator->fails()) {
            return response()->json(['error' => 'Укажите название'], 400);
        }

        $project = Project::query()->find($id);
        if (! $project) {
            return response()->json(['error' => 'Проект не найден'], 404);
        }

        $project->update(['name' => $validator->validated()['name']]);
        $project->load('statuses')->loadCount('tasks');

        return response()->json(['project' => ApiPresenter::project($project)]);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        if (! $this->user($request)->canDeleteBoardOrProject()) {
            return response()->json(['error' => 'Только администратор может удалять проекты'], 403);
        }

        $project = Project::query()->find($id);
        if (! $project) {
            return response()->json(['error' => 'Проект не найден'], 404);
        }

        $project->delete();

        return response()->json(['ok' => true]);
    }
}
