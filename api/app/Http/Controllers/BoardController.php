<?php

namespace App\Http\Controllers;

use App\Models\Board;
use App\Support\ApiPresenter;
use App\Support\TaskBuckets;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

class BoardController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        if ($resp = $this->forbidPending($this->user($request))) {
            return $resp;
        }

        $boards = Board::query()
            ->with(['createdBy', 'projects.statuses'])
            ->withCount('projects')
            ->orderByDesc('created_at')
            ->get()
            ->map(function (Board $b) {
                TaskBuckets::attachToProjects($b->projects);
                $counts = [
                    'openTasks' => (int) $b->projects->sum('open_tasks_count'),
                    'inProgressTasks' => (int) $b->projects->sum('in_progress_tasks_count'),
                ];

                return ApiPresenter::board($b, true, $counts);
            })
            ->values();

        return response()->json(['boards' => $boards]);
    }

    public function store(Request $request): JsonResponse
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

        $board = Board::query()->create([
            'name' => $validator->validated()['name'],
            'created_by_id' => $user->id,
        ]);
        $board->load('createdBy')->loadCount('projects');

        return response()->json([
            'board' => ApiPresenter::board($board, false, [
                'openTasks' => 0,
                'inProgressTasks' => 0,
            ]),
        ], 201);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        if ($resp = $this->forbidPending($this->user($request))) {
            return $resp;
        }

        $board = Board::query()
            ->with([
                'createdBy',
                'projects' => fn ($q) => $q->withCount('tasks')->with('statuses'),
            ])
            ->find($id);

        if (! $board) {
            return response()->json(['error' => 'Доска не найдена'], 404);
        }

        $board->loadCount('projects');
        TaskBuckets::attachToProjects($board->projects);
        $counts = [
            'openTasks' => (int) $board->projects->sum('open_tasks_count'),
            'inProgressTasks' => (int) $board->projects->sum('in_progress_tasks_count'),
        ];

        return response()->json(['board' => ApiPresenter::board($board, true, $counts)]);
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

        $board = Board::query()->find($id);
        if (! $board) {
            return response()->json(['error' => 'Доска не найдена'], 404);
        }

        $board->update(['name' => $validator->validated()['name']]);
        $board->load(['createdBy', 'projects.statuses'])->loadCount('projects');
        TaskBuckets::attachToProjects($board->projects);
        $counts = [
            'openTasks' => (int) $board->projects->sum('open_tasks_count'),
            'inProgressTasks' => (int) $board->projects->sum('in_progress_tasks_count'),
        ];

        return response()->json(['board' => ApiPresenter::board($board, false, $counts)]);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        if (! $this->user($request)->canDeleteBoardOrProject()) {
            return response()->json(['error' => 'Только администратор может удалять доски'], 403);
        }

        $board = Board::query()->withCount('projects')->find($id);
        if (! $board) {
            return response()->json(['error' => 'Доска не найдена'], 404);
        }
        if ($board->projects_count > 0) {
            return response()->json([
                'error' => 'Нельзя удалить рабочее пространство с проектами. Сначала удалите проекты.',
            ], 400);
        }

        $board->delete();

        return response()->json(['ok' => true]);
    }
}
