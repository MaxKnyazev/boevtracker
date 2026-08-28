<?php

namespace App\Http\Controllers;

use App\Events\TaskUpdated;
use App\Models\Attachment;
use App\Models\Comment;
use App\Models\Project;
use App\Models\ProjectStatus;
use App\Models\Release;
use App\Models\Task;
use App\Models\TaskChangeHistory;
use App\Models\TaskStatusHistory;
use App\Models\User;
use App\Services\FileStorage;
use App\Services\NotificationService;
use App\Services\TaskWorkIntervalService;
use App\Support\ApiPresenter;
use App\Support\Broadcasting;
use App\Support\Constants;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

class TaskController extends Controller
{
    public function __construct(
        private FileStorage $files,
        private NotificationService $notifications,
        private TaskWorkIntervalService $workIntervals,
    ) {}

    private function broadcastTaskUpdated(int $taskId): void
    {
        if (Broadcasting::enabled()) {
            try {
                broadcast(new TaskUpdated($taskId));
            } catch (\Throwable $e) {
                report($e);
            }
        }
    }

    private function taskRelations(): array
    {
        return [
            'assignees',
            'activeAssignee',
            'status',
            'files',
            'createdBy',
            'project.board',
            'release',
            'comments.author',
            'comments.files',
            'comments.replyTo.author',
            'comments.replyTo.files',
            'statusHistories.user',
            'changeHistories.user',
        ];
    }

    /**
     * @param  list<int>  $ids
     * @return list<int>
     */
    private function normalizeAssigneeIds(array $ids): array
    {
        $unique = [];
        foreach ($ids as $id) {
            $n = (int) $id;
            if ($n > 0) {
                $unique[$n] = $n;
            }
        }

        return array_values($unique);
    }

    /**
     * Sync pivot and optionally active assignee. Returns newly added user ids.
     *
     * @param  list<int>  $assigneeIds
     * @return list<int>
     */
    private function syncAssignees(Task $task, array $assigneeIds, ?int $activeAssigneeId = null): array
    {
        $assigneeIds = $this->normalizeAssigneeIds($assigneeIds);
        $previous = $task->assigneeIds();
        $task->assignees()->sync($assigneeIds);

        $active = $activeAssigneeId;
        if ($assigneeIds === []) {
            $active = null;
        } elseif ($active !== null && ! in_array($active, $assigneeIds, true)) {
            $active = $assigneeIds[0];
        } elseif ($active === null) {
            if (count($assigneeIds) === 1) {
                $active = $assigneeIds[0];
            } elseif ($task->active_assignee_id && in_array((int) $task->active_assignee_id, $assigneeIds, true)) {
                $active = (int) $task->active_assignee_id;
            } else {
                $active = $assigneeIds[0];
            }
        }

        if ((int) ($task->active_assignee_id ?? 0) !== (int) ($active ?? 0)) {
            $task->active_assignee_id = $active;
            $task->save();
        }

        return array_values(array_diff($assigneeIds, $previous));
    }

    private function resolveActiveForStatusChange(
        Request $request,
        Task $task,
        bool $statusChanging,
        ?ProjectStatus $toStatus = null,
    ): array {
        $assigneeIds = $task->assigneeIds();
        $toClosed = $toStatus !== null
            && $toStatus->name === Constants::CLOSED_STATUS_NAME;

        // No picker: no status change, no assignees, closed status, or a single assignee.
        if (! $statusChanging || $assigneeIds === [] || $toClosed || count($assigneeIds) === 1) {
            if ($request->has('activeAssigneeId')) {
                $raw = $request->input('activeAssigneeId');
                $active = $raw !== null ? (int) $raw : null;
            } elseif (count($assigneeIds) === 1) {
                $active = $assigneeIds[0];
            } else {
                $active = $task->active_assignee_id !== null
                    ? (int) $task->active_assignee_id
                    : null;
            }

            return [null, $active];
        }

        if (! $request->has('activeAssigneeId') || $request->input('activeAssigneeId') === null) {
            return [
                response()->json([
                    'error' => 'Укажите активного исполнителя для нового статуса',
                ], 400),
                null,
            ];
        }

        $active = (int) $request->input('activeAssigneeId');
        if (! in_array($active, $assigneeIds, true)) {
            return [
                response()->json([
                    'error' => 'Активный исполнитель должен быть в списке исполнителей задачи',
                ], 400),
                null,
            ];
        }

        return [null, $active];
    }

    /**
     * @param  array<string, mixed>|null  $payload
     */
    private function recordTaskChange(
        Task $task,
        User $user,
        string $type,
        ?array $payload = null,
    ): void {
        TaskChangeHistory::query()->create([
            'task_id' => $task->id,
            'user_id' => $user->id,
            'type' => $type,
            'payload' => $payload,
            'created_at' => now(),
        ]);
    }

    private function userDisplayName(User $user): string
    {
        $name = trim(($user->first_name ?? '').' '.($user->last_name ?? ''));

        return $name !== '' ? $name : (string) ($user->username ?: '—');
    }

    /**
     * @param  list<int>  $addedIds
     */
    private function recordAssigneeAdditions(
        Task $task,
        User $actor,
        array $addedIds,
        ?int $activeId,
    ): void {
        $addedIds = array_values(array_unique(array_map('intval', $addedIds)));
        if ($addedIds === []) {
            return;
        }

        $users = User::query()->whereIn('id', $addedIds)->get()->keyBy('id');
        $actorId = (int) $actor->id;
        $activeId = $activeId !== null ? (int) $activeId : null;

        foreach ($addedIds as $addedId) {
            $isSelf = $addedId === $actorId;
            $isActive = $activeId !== null && $addedId === $activeId;

            if ($isSelf) {
                $this->recordTaskChange(
                    $task,
                    $actor,
                    $isActive
                        ? TaskChangeHistory::TYPE_TOOK_TASK
                        : TaskChangeHistory::TYPE_TOOK_CO_ASSIGNEE,
                );
                continue;
            }

            $target = $users->get($addedId);
            $this->recordTaskChange(
                $task,
                $actor,
                $isActive
                    ? TaskChangeHistory::TYPE_ASSIGNED_ASSIGNEE
                    : TaskChangeHistory::TYPE_ASSIGNED_CO_ASSIGNEE,
                $this->assigneeTargetPayload($addedId, $target),
            );
        }
    }

    /**
     * @param  list<int>  $removedIds
     */
    private function recordAssigneeRemovals(
        Task $task,
        User $actor,
        array $removedIds,
    ): void {
        $removedIds = array_values(array_unique(array_map('intval', $removedIds)));
        if ($removedIds === []) {
            return;
        }

        $users = User::query()->whereIn('id', $removedIds)->get()->keyBy('id');

        foreach ($removedIds as $removedId) {
            $target = $users->get($removedId);
            $this->recordTaskChange(
                $task,
                $actor,
                TaskChangeHistory::TYPE_REMOVED_ASSIGNEE,
                $this->assigneeTargetPayload($removedId, $target),
            );
        }
    }

    /**
     * @param  list<int>  $justAddedIds  Assignees already logged as took/assigned in this request
     */
    private function recordActiveAssigneeIfChanged(
        Task $task,
        User $actor,
        ?int $prevActiveId,
        ?int $nextActiveId,
        array $justAddedIds = [],
    ): void {
        $prevActiveId = $prevActiveId !== null ? (int) $prevActiveId : null;
        $nextActiveId = $nextActiveId !== null ? (int) $nextActiveId : null;
        if ($nextActiveId === null || $prevActiveId === $nextActiveId) {
            return;
        }

        $justAddedIds = array_map('intval', $justAddedIds);
        // Newly added primary assignee already gets took_task / assigned_assignee.
        if (in_array($nextActiveId, $justAddedIds, true)) {
            return;
        }

        $target = User::query()->find($nextActiveId);
        $this->recordTaskChange(
            $task,
            $actor,
            TaskChangeHistory::TYPE_ASSIGNED_ACTIVE_ASSIGNEE,
            $this->assigneeTargetPayload($nextActiveId, $target),
        );
    }

    /**
     * @return array{targetUserId: int, targetUserName: string, targetUser: array<string, mixed>|null}
     */
    private function assigneeTargetPayload(int $userId, ?User $target): array
    {
        return [
            'targetUserId' => $userId,
            'targetUserName' => $target
                ? $this->userDisplayName($target)
                : '—',
            'targetUser' => $target
                ? [
                    'id' => $target->id,
                    'username' => $target->username,
                    'firstName' => $target->first_name,
                    'lastName' => $target->last_name,
                ]
                : null,
        ];
    }

    private function deadlineDateKey(mixed $value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }
        if ($value instanceof \DateTimeInterface) {
            return $value->format('Y-m-d');
        }

        $raw = (string) $value;
        if (preg_match('/^\d{4}-\d{2}-\d{2}/', $raw, $m)) {
            return substr($raw, 0, 10);
        }

        try {
            return \Carbon\Carbon::parse($raw)->format('Y-m-d');
        } catch (\Throwable) {
            return null;
        }
    }

    private function recordStatusChange(
        Task $task,
        User $user,
        ?int $fromStatusId,
        int $toStatusId,
        string $closeComment = '',
    ): void {
        if ($fromStatusId !== null && $fromStatusId === $toStatusId) {
            return;
        }

        $from = $fromStatusId
            ? ProjectStatus::query()->find($fromStatusId)
            : null;
        $to = ProjectStatus::query()->find($toStatusId);
        if (! $to) {
            return;
        }

        TaskStatusHistory::query()->create([
            'task_id' => $task->id,
            'user_id' => $user->id,
            'from_status_id' => $from?->id,
            'to_status_id' => $to->id,
            'from_status_name' => $from?->name,
            'to_status_name' => $to->name,
            'created_at' => now(),
        ]);

        $this->recordTaskChange($task, $user, TaskChangeHistory::TYPE_STATUS, [
            'fromStatusName' => $from?->name,
            'toStatusName' => $to->name,
        ]);

        if ($fromStatusId !== null) {
            $fromLabel = $from?->name ?: '—';
            $body = 'Статус изменён: «'.$fromLabel.'» → «'.$to->name.'»';
            $note = trim($closeComment);
            if (
                $note !== ''
                && $to->name === Constants::CLOSED_STATUS_NAME
            ) {
                $body .= "\n".$note;
            }
            Comment::query()->create([
                'body' => $body,
                'kind' => 'status_change',
                'task_id' => $task->id,
                'author_id' => $user->id,
            ]);
        }

        // Skip notifications for the initial status on task create (from is null).
        if ($fromStatusId !== null) {
            if (! $task->relationLoaded('assignees')) {
                $task->load('assignees');
            }
            if (! $task->relationLoaded('project')) {
                $task->load('project');
            }
            $this->notifications->notifyStatusChange(
                $user,
                $task,
                $from?->name,
                $to->name,
            );
        }
    }

    private function closeCommentFromRequest(Request $request): string
    {
        return trim((string) $request->input('closeComment', ''));
    }

    private function resolveOpenStatus(int $projectId, ?string $preferredName = null): ?ProjectStatus
    {
        if ($preferredName) {
            $byName = ProjectStatus::query()
                ->where('project_id', $projectId)
                ->where('name', $preferredName)
                ->first();
            if ($byName) {
                return $byName;
            }
        }

        $open = ProjectStatus::query()
            ->where('project_id', $projectId)
            ->where('name', Constants::OPEN_STATUS_NAME)
            ->first();
        if ($open) {
            return $open;
        }

        return ProjectStatus::query()
            ->where('project_id', $projectId)
            ->orderBy('order')
            ->first();
    }

    public function index(Request $request): JsonResponse
    {
        if ($resp = $this->forbidPending($this->user($request))) {
            return $resp;
        }

        $tasks = Task::query()
            ->onBoard()
            ->with(['assignees', 'activeAssignee', 'status', 'createdBy', 'project.board'])
            ->orderByDesc('updated_at')
            ->orderByDesc('id')
            ->get()
            ->map(fn (Task $t) => ApiPresenter::task($t))
            ->values();

        return response()->json(['tasks' => $tasks]);
    }

    public function backlog(Request $request): JsonResponse
    {
        if ($resp = $this->forbidPending($this->user($request))) {
            return $resp;
        }

        $tasks = Task::query()
            ->where('in_backlog', true)
            ->with(['assignees', 'activeAssignee', 'status', 'createdBy', 'project.board'])
            ->orderByDesc('updated_at')
            ->orderByDesc('id')
            ->get()
            ->map(fn (Task $t) => ApiPresenter::task($t))
            ->values();

        return response()->json(['tasks' => $tasks]);
    }

    public function store(Request $request, int $projectId): JsonResponse
    {
        $user = $this->user($request);
        if ($resp = $this->forbidWrite($user)) {
            return $resp;
        }

        $validator = Validator::make($request->all(), [
            'title' => ['required', 'string', 'min:1', 'max:255'],
            'description' => ['nullable', 'string', 'max:10000'],
            'priority' => ['nullable', 'in:LOW,MEDIUM,HIGH,CRITICAL'],
            'deadline' => ['nullable', 'date', 'after_or_equal:today'],
            'statusId' => ['nullable', 'integer'],
            'assigneeId' => ['nullable', 'integer'],
            'assigneeIds' => ['nullable', 'array'],
            'assigneeIds.*' => ['integer'],
            'activeAssigneeId' => ['nullable', 'integer'],
            'releaseId' => ['nullable', 'integer'],
        ], [
            'title.required' => 'Укажите название задачи',
            'title.min' => 'Укажите название задачи',
            'title.max' => 'Название задачи не длиннее 255 символов',
            'description.max' => 'Описание не длиннее 10000 символов',
            'deadline.after_or_equal' => 'Дедлайн можно поставить только на сегодня или позже',
        ]);
        if ($validator->fails()) {
            return response()->json(['error' => $validator->errors()->toArray()], 400);
        }

        $project = Project::query()->with('statuses')->find($projectId);
        if (! $project) {
            return response()->json(['error' => 'Проект не найден'], 404);
        }

        $data = $validator->validated();
        $statusId = $data['statusId'] ?? null;
        if (! $statusId) {
            $open = $this->resolveOpenStatus($projectId);
            if (! $open) {
                return response()->json(['error' => 'У проекта нет статусов'], 400);
            }
            $statusId = $open->id;
        } elseif (! $project->statuses->contains('id', $statusId)) {
            return response()->json(['error' => 'Статус не принадлежит проекту'], 400);
        }

        $maxOrder = (int) Task::query()->where('status_id', $statusId)->max('sort_order');

        $assigneeIds = [];
        if (isset($data['assigneeIds']) && is_array($data['assigneeIds'])) {
            $assigneeIds = $this->normalizeAssigneeIds($data['assigneeIds']);
        } elseif (! empty($data['assigneeId'])) {
            $assigneeIds = [(int) $data['assigneeId']];
        }

        $activeId = isset($data['activeAssigneeId'])
            ? (int) $data['activeAssigneeId']
            : ($assigneeIds[0] ?? null);
        if ($assigneeIds !== [] && ($activeId === null || ! in_array($activeId, $assigneeIds, true))) {
            $activeId = $assigneeIds[0];
        }
        if ($assigneeIds === []) {
            $activeId = null;
        }

        $releaseId = isset($data['releaseId']) ? (int) $data['releaseId'] : null;
        if ($releaseId !== null && ! Release::query()->whereKey($releaseId)->exists()) {
            return response()->json(['error' => 'Релиз не найден'], 404);
        }

        $task = Task::query()->create([
            'title' => $data['title'],
            'description' => $data['description'] ?? null,
            'priority' => $data['priority'] ?? 'MEDIUM',
            'deadline' => $data['deadline'] ?? null,
            'project_id' => $projectId,
            'release_id' => $releaseId,
            'status_id' => $statusId,
            'sort_order' => $maxOrder + 1,
            'active_assignee_id' => $activeId,
            'created_by_id' => $user->id,
            'status_changed_at' => now(),
        ]);

        if ($assigneeIds !== []) {
            $task->assignees()->sync($assigneeIds);
            $this->notifications->notifyNewAssignees($user, $task, $assigneeIds);
            $this->recordAssigneeAdditions($task, $user, $assigneeIds, $activeId);
        }

        $this->recordStatusChange($task, $user, null, (int) $statusId);

        $toStatus = $project->statuses->firstWhere('id', (int) $statusId)
            ?? ProjectStatus::query()->find((int) $statusId);
        if ($toStatus) {
            $this->workIntervals->onStatusChange(
                $task,
                $toStatus,
                $this->workIntervals->resolveWorkerUserId($task, $activeId),
                null,
                null,
            );
        }

        $task->loadMissing('project');
        $this->notifications->notifyTaskCreated($user, $task);

        $task->load($this->taskRelations());

        return response()->json(['task' => ApiPresenter::task($task, true)], 201);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        if ($resp = $this->forbidPending($this->user($request))) {
            return $resp;
        }

        $task = Task::query()->with($this->taskRelations())->find($id);
        if (! $task) {
            return response()->json(['error' => 'Задача не найдена'], 404);
        }

        return response()->json(['task' => ApiPresenter::task($task, true)]);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $user = $this->user($request);
        if ($resp = $this->forbidWrite($user)) {
            return $resp;
        }

        $validator = Validator::make($request->all(), [
            'title' => ['sometimes', 'string', 'min:1', 'max:255'],
            'description' => ['nullable', 'string', 'max:10000'],
            'priority' => ['sometimes', 'in:LOW,MEDIUM,HIGH,CRITICAL'],
            'deadline' => ['nullable', 'date', 'after_or_equal:today'],
            'statusId' => ['sometimes', 'integer'],
            'assigneeId' => ['nullable', 'integer'],
            'assigneeIds' => ['nullable', 'array'],
            'assigneeIds.*' => ['integer'],
            'activeAssigneeId' => ['nullable', 'integer'],
            'projectId' => ['sometimes', 'integer'],
            'releaseId' => ['nullable', 'integer'],
            'inBacklog' => ['sometimes', 'boolean'],
            'closeComment' => ['nullable', 'string', 'max:5000'],
        ], [
            'title.min' => 'Укажите название задачи',
            'title.max' => 'Название задачи не длиннее 255 символов',
            'description.max' => 'Описание не длиннее 10000 символов',
            'deadline.after_or_equal' => 'Дедлайн можно поставить только на сегодня или позже',
        ]);
        if ($validator->fails()) {
            return response()->json(['error' => $validator->errors()->toArray()], 400);
        }

        $task = Task::query()->with(['status', 'assignees'])->find($id);
        if (! $task) {
            return response()->json(['error' => 'Задача не найдена'], 404);
        }

        $prevActiveId = $task->active_assignee_id !== null
            ? (int) $task->active_assignee_id
            : null;

        $data = $validator->validated();
        $prevDescription = $task->description;
        $prevPriority = $task->priority;
        $prevDeadlineKey = $this->deadlineDateKey($task->deadline);

        $update = [];
        if (array_key_exists('title', $data)) {
            $update['title'] = $data['title'];
        }
        if (array_key_exists('description', $data)) {
            $update['description'] = $data['description'];
        }
        if (array_key_exists('priority', $data)) {
            $update['priority'] = $data['priority'];
        }
        if (array_key_exists('deadline', $data)) {
            $update['deadline'] = $data['deadline'];
        }
        if (array_key_exists('releaseId', $data)) {
            if ($data['releaseId'] === null) {
                $update['release_id'] = null;
            } else {
                $releaseId = (int) $data['releaseId'];
                if (! Release::query()->whereKey($releaseId)->exists()) {
                    return response()->json(['error' => 'Релиз не найден'], 404);
                }
                $update['release_id'] = $releaseId;
            }
        }

        if (array_key_exists('inBacklog', $data)) {
            $update['in_backlog'] = (bool) $data['inBacklog'];
        }

        $fromStatusId = (int) $task->status_id;
        $toStatusId = $fromStatusId;

        $targetProjectId = $task->project_id;
        if (isset($data['projectId']) && (int) $data['projectId'] !== $task->project_id) {
            $targetProject = Project::query()->with('statuses')->find($data['projectId']);
            if (! $targetProject) {
                return response()->json(['error' => 'Целевой проект не найден'], 404);
            }
            $targetProjectId = $targetProject->id;
            $update['project_id'] = $targetProjectId;
            $mapped = $this->resolveOpenStatus($targetProjectId, $task->status?->name);
            if (! $mapped) {
                return response()->json(['error' => 'У целевого проекта нет статусов'], 400);
            }
            $update['status_id'] = $mapped->id;
            $update['status_changed_at'] = now();
            $update['in_backlog'] = false;
            $toStatusId = (int) $mapped->id;
        }

        if (isset($data['statusId'])) {
            $status = ProjectStatus::query()
                ->where('id', $data['statusId'])
                ->where('project_id', $targetProjectId)
                ->first();
            if (! $status) {
                return response()->json(['error' => 'Статус не принадлежит проекту'], 400);
            }
            if ($status->id !== $task->status_id) {
                $update['status_id'] = $status->id;
                $update['status_changed_at'] = now();
                $update['in_backlog'] = false;
                $toStatusId = (int) $status->id;
            }
        }

        $statusChanging = $toStatusId !== $fromStatusId;

        // Sync assignees before resolving active for status change (list may change in same request).
        $needsActiveChoice = false;
        $addedAssigneeIds = [];
        $removedAssigneeIds = [];
        $assigneesTouched = array_key_exists('assigneeIds', $data)
            || array_key_exists('assigneeId', $data);

        if ($assigneesTouched) {
            $nextIds = array_key_exists('assigneeIds', $data)
                ? $this->normalizeAssigneeIds($data['assigneeIds'] ?? [])
                : ($data['assigneeId'] !== null ? [(int) $data['assigneeId']] : []);

            $explicitActive = array_key_exists('activeAssigneeId', $data)
                ? ($data['activeAssigneeId'] !== null ? (int) $data['activeAssigneeId'] : null)
                : null;

            $previousAssigneeIds = $task->assigneeIds();
            $addedAssigneeIds = $this->syncAssignees($task, $nextIds, $explicitActive);
            $removedAssigneeIds = array_values(array_diff($previousAssigneeIds, $nextIds));
            $task->unsetRelation('assignees');
            $task->load('assignees');
            if ($addedAssigneeIds !== []) {
                $this->notifications->notifyNewAssignees($user, $task, $addedAssigneeIds);
            }
            if (count($nextIds) > 1 && ! array_key_exists('activeAssigneeId', $data)) {
                $needsActiveChoice = true;
            }
        }

        [$activeErr, $activeForStatus] = $this->resolveActiveForStatusChange(
            $request,
            $task->fresh(['assignees']) ?? $task,
            $statusChanging,
            $statusChanging
                ? (
                    isset($status) && (int) $status->id === $toStatusId
                        ? $status
                        : ProjectStatus::query()->find($toStatusId)
                )
                : null,
        );
        if ($activeErr) {
            return $activeErr;
        }

        if ($statusChanging && $activeForStatus !== null) {
            $update['active_assignee_id'] = $activeForStatus;
        } elseif (array_key_exists('activeAssigneeId', $data) && ! $assigneesTouched) {
            $active = $data['activeAssigneeId'] !== null ? (int) $data['activeAssigneeId'] : null;
            $ids = $task->assigneeIds();
            if ($active !== null && ! in_array($active, $ids, true)) {
                return response()->json([
                    'error' => 'Активный исполнитель должен быть в списке исполнителей задачи',
                ], 400);
            }
            if ($ids === []) {
                $active = null;
            }
            $update['active_assignee_id'] = $active;
        }

        if ($update !== []) {
            $task->update($update);
        }

        $task->refresh();
        $task->load(['assignees', 'status', 'project.statuses']);

        if (array_key_exists('description', $update)) {
            $prev = trim((string) ($prevDescription ?? ''));
            $next = trim((string) ($task->description ?? ''));
            if ($prev !== $next) {
                $this->recordTaskChange(
                    $task,
                    $user,
                    TaskChangeHistory::TYPE_DESCRIPTION_CHANGED,
                );
            }
        }

        if (array_key_exists('priority', $update) && $prevPriority !== $task->priority) {
            $this->recordTaskChange(
                $task,
                $user,
                TaskChangeHistory::TYPE_PRIORITY_CHANGED,
                [
                    'fromPriority' => $prevPriority,
                    'toPriority' => $task->priority,
                ],
            );
        }

        if (array_key_exists('deadline', $update)) {
            $nextDeadlineKey = $this->deadlineDateKey($task->deadline);
            if ($prevDeadlineKey !== $nextDeadlineKey) {
                if ($prevDeadlineKey === null && $nextDeadlineKey !== null) {
                    $this->recordTaskChange(
                        $task,
                        $user,
                        TaskChangeHistory::TYPE_DEADLINE_SET,
                        ['toDeadline' => $nextDeadlineKey],
                    );
                } else {
                    $this->recordTaskChange(
                        $task,
                        $user,
                        TaskChangeHistory::TYPE_DEADLINE_CHANGED,
                        [
                            'fromDeadline' => $prevDeadlineKey,
                            'toDeadline' => $nextDeadlineKey,
                        ],
                    );
                }
            }
        }

        if ($addedAssigneeIds !== []) {
            $this->recordAssigneeAdditions(
                $task,
                $user,
                $addedAssigneeIds,
                $task->active_assignee_id !== null
                    ? (int) $task->active_assignee_id
                    : null,
            );
        }

        if ($removedAssigneeIds !== []) {
            $this->recordAssigneeRemovals($task, $user, $removedAssigneeIds);
        }

        $this->recordActiveAssigneeIfChanged(
            $task,
            $user,
            $prevActiveId,
            $task->active_assignee_id !== null
                ? (int) $task->active_assignee_id
                : null,
            $addedAssigneeIds,
        );

        if ($statusChanging) {
            $this->recordStatusChange(
                $task,
                $user,
                $fromStatusId,
                $toStatusId,
                $this->closeCommentFromRequest($request),
            );
            $toStatus = $task->status
                ?? ProjectStatus::query()->find($toStatusId);
            if ($toStatus) {
                $worker = $this->workIntervals->resolveWorkerUserId(
                    $task,
                    array_key_exists('active_assignee_id', $update)
                        ? ($update['active_assignee_id'] !== null ? (int) $update['active_assignee_id'] : null)
                        : $activeForStatus,
                );
                $fromStatus = ProjectStatus::query()->find($fromStatusId);
                $this->workIntervals->onStatusChange($task, $toStatus, $worker, null, $fromStatus);
            }
        } else {
            $nextActiveId = $task->active_assignee_id !== null
                ? (int) $task->active_assignee_id
                : null;
            if ($prevActiveId !== $nextActiveId) {
                $this->workIntervals->onActiveAssigneeChange(
                    $task,
                    $prevActiveId,
                    $nextActiveId,
                );
            }
        }

        $task->load($this->taskRelations());
        $this->broadcastTaskUpdated((int) $task->id);

        return response()->json([
            'task' => ApiPresenter::task($task, true),
            'needsActiveChoice' => $needsActiveChoice,
        ]);
    }

    public function take(Request $request, int $id): JsonResponse
    {
        $user = $this->user($request);
        if ($resp = $this->forbidWrite($user)) {
            return $resp;
        }

        $task = Task::query()->with(['assignees', 'status', 'project.statuses'])->find($id);
        if (! $task) {
            return response()->json(['error' => 'Задача не найдена'], 404);
        }

        $prevActiveId = $task->active_assignee_id !== null
            ? (int) $task->active_assignee_id
            : null;

        $ids = $task->assigneeIds();
        $already = in_array((int) $user->id, $ids, true);
        if (! $already) {
            $ids[] = (int) $user->id;
            $task->assignees()->sync($ids);
        }

        $needsActiveChoice = false;
        if ($task->active_assignee_id === null) {
            $task->active_assignee_id = $user->id;
            $task->save();
        }

        if (count($ids) > 1) {
            $needsActiveChoice = true;
        }

        $nextActiveId = $task->active_assignee_id !== null
            ? (int) $task->active_assignee_id
            : null;

        $addedOnTake = $already ? [] : [(int) $user->id];
        if (! $already) {
            $this->recordAssigneeAdditions(
                $task,
                $user,
                $addedOnTake,
                $nextActiveId,
            );
        }

        $this->recordActiveAssigneeIfChanged(
            $task,
            $user,
            $prevActiveId,
            $nextActiveId,
            $addedOnTake,
        );

        if ($prevActiveId !== $nextActiveId) {
            $task->load(['assignees', 'status', 'project.statuses']);
            $this->workIntervals->onActiveAssigneeChange(
                $task,
                $prevActiveId,
                $nextActiveId,
            );
        }

        $task->load($this->taskRelations());
        $this->broadcastTaskUpdated((int) $task->id);

        return response()->json([
            'task' => ApiPresenter::task($task, true),
            'needsActiveChoice' => $needsActiveChoice,
        ]);
    }

    public function position(Request $request, int $id): JsonResponse
    {
        $user = $this->user($request);
        if ($resp = $this->forbidWrite($user)) {
            return $resp;
        }

        $validator = Validator::make($request->all(), [
            'statusId' => ['required', 'integer'],
            'index' => ['required', 'integer', 'min:0'],
            'activeAssigneeId' => ['nullable', 'integer'],
            'closeComment' => ['nullable', 'string', 'max:5000'],
        ]);
        if ($validator->fails()) {
            return response()->json(['error' => 'Укажите statusId и index'], 400);
        }

        $task = Task::query()->with('assignees')->find($id);
        if (! $task) {
            return response()->json(['error' => 'Задача не найдена'], 404);
        }

        $status = ProjectStatus::query()
            ->where('id', $validator->validated()['statusId'])
            ->where('project_id', $task->project_id)
            ->first();
        if (! $status) {
            return response()->json(['error' => 'Статус не принадлежит проекту'], 400);
        }

        $fromStatusId = (int) $task->status_id;
        $statusChanged = $status->id !== $task->status_id;
        $prevActiveId = $task->active_assignee_id !== null
            ? (int) $task->active_assignee_id
            : null;

        if ($statusChanged) {
            [$activeErr, $activeForStatus] = $this->resolveActiveForStatusChange(
                $request,
                $task,
                true,
                $status,
            );
            if ($activeErr) {
                return $activeErr;
            }
        } else {
            $activeForStatus = $task->active_assignee_id
                ? (int) $task->active_assignee_id
                : null;
        }

        $siblings = Task::query()
            ->onBoard()
            ->where('status_id', $status->id)
            ->where('id', '!=', $id)
            ->orderBy('sort_order')
            ->orderBy('id')
            ->pluck('id')
            ->all();

        $index = min($validator->validated()['index'], count($siblings));
        $orderedIds = array_merge(
            array_slice($siblings, 0, $index),
            [$id],
            array_slice($siblings, $index)
        );

        $closeComment = $this->closeCommentFromRequest($request);

        DB::transaction(function () use (
            $task,
            $status,
            $statusChanged,
            $index,
            $orderedIds,
            $user,
            $fromStatusId,
            $activeForStatus,
            $closeComment,
        ) {
            $payload = [
                'status_id' => $status->id,
                'sort_order' => $index,
                'in_backlog' => false,
            ];
            if ($statusChanged) {
                $payload['status_changed_at'] = now();
                if ($activeForStatus !== null) {
                    $payload['active_assignee_id'] = $activeForStatus;
                }
            }
            $task->update($payload);

            foreach ($orderedIds as $order => $taskId) {
                Task::query()->where('id', $taskId)->update(['sort_order' => $order]);
            }

            if ($statusChanged) {
                $this->recordStatusChange(
                    $task,
                    $user,
                    $fromStatusId,
                    (int) $status->id,
                    $closeComment,
                );
            }
        });

        $task = Task::query()->with($this->taskRelations())->find($id);
        if ($task) {
            $this->recordActiveAssigneeIfChanged(
                $task,
                $user,
                $prevActiveId,
                $task->active_assignee_id !== null
                    ? (int) $task->active_assignee_id
                    : null,
            );
        }
        if ($statusChanged && $task) {
            $task->loadMissing(['assignees', 'status', 'project.statuses']);
            $worker = $this->workIntervals->resolveWorkerUserId(
                $task,
                $activeForStatus,
            );
            $this->workIntervals->onStatusChange(
                $task,
                $status,
                $worker,
                null,
                ProjectStatus::query()->find($fromStatusId),
            );
        }

        $this->broadcastTaskUpdated((int) $id);

        return response()->json(['task' => ApiPresenter::task($task, true)]);
    }

    public function moveBoard(Request $request, int $id): JsonResponse
    {
        $user = $this->user($request);
        if ($resp = $this->forbidWrite($user)) {
            return $resp;
        }

        $validator = Validator::make($request->all(), [
            'boardId' => ['required', 'integer'],
            'projectId' => ['required', 'integer'],
            'statusId' => ['nullable', 'integer'],
        ]);
        if ($validator->fails()) {
            return response()->json(['error' => 'Укажите доску и проект'], 400);
        }

        $task = Task::query()->with('status')->find($id);
        if (! $task) {
            return response()->json(['error' => 'Задача не найдена'], 404);
        }

        $data = $validator->validated();
        $project = Project::query()
            ->where('id', $data['projectId'])
            ->where('board_id', $data['boardId'])
            ->with('statuses')
            ->first();
        if (! $project) {
            return response()->json(['error' => 'Проект на указанной доске не найден'], 404);
        }

        $statusId = $data['statusId'] ?? null;
        if ($statusId) {
            if (! $project->statuses->contains('id', $statusId)) {
                return response()->json(['error' => 'Статус не принадлежит проекту'], 400);
            }
        } else {
            $mapped = $this->resolveOpenStatus($project->id, $task->status?->name);
            if (! $mapped) {
                return response()->json(['error' => 'У проекта нет статусов'], 400);
            }
            $statusId = $mapped->id;
        }

        $fromStatusId = (int) $task->status_id;
        $toStatusId = (int) $statusId;

        $task->update([
            'project_id' => $project->id,
            'status_id' => $statusId,
            'status_changed_at' => now(),
        ]);

        if ($toStatusId !== $fromStatusId) {
            $this->recordStatusChange($task, $user, $fromStatusId, $toStatusId);
            $task->load(['assignees', 'status', 'project.statuses']);
            $toStatus = $task->status ?? ProjectStatus::query()->find($toStatusId);
            if ($toStatus) {
                $worker = $this->workIntervals->resolveWorkerUserId($task);
                $fromStatus = ProjectStatus::query()->find($fromStatusId);
                $this->workIntervals->onStatusChange($task, $toStatus, $worker, null, $fromStatus);
            }
        }

        $task->load($this->taskRelations());

        return response()->json(['task' => ApiPresenter::task($task, true)]);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        if ($resp = $this->forbidWrite($this->user($request))) {
            return $resp;
        }

        $task = Task::query()->find($id);
        if (! $task) {
            return response()->json(['error' => 'Задача не найдена'], 404);
        }

        $task->delete();

        return response()->json(['ok' => true]);
    }

    public function addComment(Request $request, int $id): JsonResponse
    {
        $user = $this->user($request);
        if ($resp = $this->forbidWrite($user)) {
            return $resp;
        }

        $validator = Validator::make($request->all(), [
            'body' => ['nullable', 'string', 'max:5000'],
            'replyToId' => ['nullable', 'integer'],
        ]);
        if ($validator->fails()) {
            return response()->json(['error' => 'Некорректный текст комментария'], 400);
        }

        if (! Task::query()->whereKey($id)->exists()) {
            return response()->json(['error' => 'Задача не найдена'], 404);
        }

        $replyToId = $request->input('replyToId');
        if ($replyToId !== null && $replyToId !== '') {
            $replyToId = (int) $replyToId;
            $replyExists = Comment::query()
                ->whereKey($replyToId)
                ->where('task_id', $id)
                ->exists();
            if (! $replyExists) {
                return response()->json(['error' => 'Сообщение для ответа не найдено'], 404);
            }
        } else {
            $replyToId = null;
        }

        $comment = Comment::query()->create([
            'body' => trim((string) ($request->input('body') ?? '')),
            'task_id' => $id,
            'author_id' => $user->id,
            'reply_to_id' => $replyToId,
        ]);
        $comment->load(['author', 'files', 'replyTo.author', 'replyTo.files']);

        $task = Task::query()->find($id);
        if ($task) {
            $this->notifications->notifyComment($user, $task, $comment);
        }
        $this->broadcastTaskUpdated($id);

        return response()->json(['comment' => ApiPresenter::comment($comment)], 201);
    }

    public function updateComment(Request $request, int $id): JsonResponse
    {
        $user = $this->user($request);
        if ($resp = $this->forbidWrite($user)) {
            return $resp;
        }

        $comment = Comment::query()->with('files')->find($id);
        if (! $comment) {
            return response()->json(['error' => 'Комментарий не найден'], 404);
        }
        if ($comment->kind === 'status_change') {
            return response()->json(['error' => 'Системное сообщение нельзя изменить'], 403);
        }
        if ($comment->author_id !== $user->id) {
            return response()->json(['error' => 'Можно редактировать только свои сообщения'], 403);
        }

        $validator = Validator::make($request->all(), [
            'body' => ['nullable', 'string', 'max:5000'],
        ]);
        if ($validator->fails()) {
            return response()->json(['error' => 'Некорректный текст комментария'], 400);
        }

        $body = trim((string) ($request->input('body') ?? ''));
        if ($body === '' && $comment->files->isEmpty()) {
            $taskId = (int) $comment->task_id;
            foreach ($comment->files as $file) {
                if ($this->files->exists($file->key)) {
                    $this->files->delete($file->key);
                }
            }
            $comment->delete();
            $this->broadcastTaskUpdated($taskId);

            return response()->json(['ok' => true, 'deleted' => true]);
        }

        if ($body !== $comment->body) {
            $oldMentions = $this->notifications->mentionedUserIds((string) $comment->body);
            $comment->body = $body;
            $comment->edited_at = now();
            $comment->save();

            $newMentions = array_values(array_diff(
                $this->notifications->mentionedUserIds($body),
                $oldMentions,
            ));

            if ($newMentions !== []) {
                $task = Task::query()->find($comment->task_id);
                if ($task) {
                    $this->notifications->notifyMentions(
                        $user,
                        $task,
                        $comment,
                        onlyUserIds: $newMentions,
                    );
                }
            }
        }

        $comment->load(['author', 'files', 'replyTo.author', 'replyTo.files']);
        $this->broadcastTaskUpdated((int) $comment->task_id);

        return response()->json(['comment' => ApiPresenter::comment($comment)]);
    }

    public function deleteComment(Request $request, int $id): JsonResponse
    {
        $user = $this->user($request);
        if ($resp = $this->forbidWrite($user)) {
            return $resp;
        }

        $comment = Comment::query()->with('files')->find($id);
        if (! $comment) {
            return response()->json(['error' => 'Комментарий не найден'], 404);
        }
        if ($comment->kind === 'status_change') {
            return response()->json(['error' => 'Системное сообщение нельзя удалить'], 403);
        }
        if ($comment->author_id !== $user->id) {
            return response()->json(['error' => 'Можно удалять только свои сообщения'], 403);
        }

        $taskId = (int) $comment->task_id;
        foreach ($comment->files as $file) {
            if ($this->files->exists($file->key)) {
                $this->files->delete($file->key);
            }
        }
        $comment->delete();
        $this->broadcastTaskUpdated($taskId);

        return response()->json(['ok' => true]);
    }

    public function downloadAttachment(Request $request, int $id): BinaryFileResponse|JsonResponse
    {
        if ($resp = $this->forbidPending($this->user($request))) {
            return $resp;
        }

        $attachment = Attachment::query()->find($id);
        if (! $attachment || ! $this->files->exists($attachment->key)) {
            return response()->json(['error' => 'Файл не найден'], 404);
        }

        $disposition = $request->query('download') === '1' ? 'attachment' : 'inline';

        return response()->file($this->files->absolutePath($attachment->key), [
            'Content-Type' => $attachment->mime_type ?: 'application/octet-stream',
            'Content-Disposition' => $disposition.'; filename*=UTF-8\'\''.rawurlencode($attachment->original_name),
            'Cache-Control' => 'private, max-age=3600',
        ]);
    }

    public function deleteAttachment(Request $request, int $id): JsonResponse
    {
        $user = $this->user($request);
        if ($resp = $this->forbidWrite($user)) {
            return $resp;
        }

        $attachment = Attachment::query()->find($id);
        if (! $attachment) {
            return response()->json(['error' => 'Файл не найден'], 404);
        }

        $commentId = $attachment->comment_id;
        $taskId = $attachment->task_id ? (int) $attachment->task_id : null;
        $fileName = $attachment->original_name;
        $isTaskFile = $attachment->task_id !== null && $attachment->comment_id === null;

        if ($this->files->exists($attachment->key)) {
            $this->files->delete($attachment->key);
        }
        $attachment->delete();

        $commentDeleted = false;
        if ($commentId) {
            $comment = Comment::query()->withCount('files')->find($commentId);
            if ($comment) {
                $taskId = (int) $comment->task_id;
                if (trim((string) $comment->body) === '' && (int) $comment->files_count === 0) {
                    $comment->delete();
                    $commentDeleted = true;
                } else {
                    $comment->edited_at = now();
                    $comment->save();
                }
            }
        }

        if ($taskId && $isTaskFile) {
            $task = Task::query()->find($taskId);
            if ($task) {
                $this->recordTaskChange(
                    $task,
                    $user,
                    TaskChangeHistory::TYPE_FILE_REMOVED,
                    ['fileName' => $fileName],
                );
            }
        }

        if ($taskId) {
            $this->broadcastTaskUpdated($taskId);
        }

        return response()->json([
            'ok' => true,
            'commentDeleted' => $commentDeleted,
        ]);
    }

    public function uploadTaskFiles(Request $request, int $id): JsonResponse
    {
        if ($resp = $this->forbidWrite($this->user($request))) {
            return $resp;
        }

        if (! Task::query()->whereKey($id)->exists()) {
            return response()->json(['error' => 'Задача не найдена'], 404);
        }

        return $this->storeUploads($request, ['task_id' => $id]);
    }

    public function uploadCommentFiles(Request $request, int $id): JsonResponse
    {
        if ($resp = $this->forbidWrite($this->user($request))) {
            return $resp;
        }

        if (! Comment::query()->whereKey($id)->exists()) {
            return response()->json(['error' => 'Комментарий не найден'], 404);
        }

        return $this->storeUploads($request, ['comment_id' => $id]);
    }

    private function storeUploads(Request $request, array $owner): JsonResponse
    {
        $user = $this->user($request);
        $list = [];
        foreach ($request->allFiles() as $value) {
            if (is_array($value)) {
                foreach ($value as $file) {
                    $list[] = $file;
                }
            } else {
                $list[] = $value;
            }
        }

        if ($list === []) {
            return response()->json(['error' => 'Файл не передан'], 400);
        }
        if (count($list) > 20) {
            return response()->json(['error' => 'Слишком много файлов'], 400);
        }

        $attachments = [];
        $taskForHistory = null;
        if (! empty($owner['task_id']) && empty($owner['comment_id'])) {
            $taskForHistory = Task::query()->find($owner['task_id']);
        }

        foreach ($list as $file) {
            if ($file->getSize() > $this->files->maxBytes()) {
                return response()->json([
                    'error' => 'Файл «'.$file->getClientOriginalName().'» больше 500 МБ',
                ], 400);
            }
            $stored = $this->files->store($file);
            $attachment = Attachment::query()->create([
                'filename' => $stored['filename'],
                'original_name' => $stored['originalName'],
                'mime_type' => $stored['mime'],
                'size' => $stored['size'],
                'key' => $stored['key'],
                'url' => '',
                'task_id' => $owner['task_id'] ?? null,
                'comment_id' => $owner['comment_id'] ?? null,
                'created_at' => now(),
            ]);
            $attachment->update([
                'url' => '/api/attachments/'.$attachment->id,
            ]);
            $attachments[] = ApiPresenter::attachment($attachment->fresh());

            if ($taskForHistory) {
                $this->recordTaskChange(
                    $taskForHistory,
                    $user,
                    TaskChangeHistory::TYPE_FILE_ADDED,
                    ['fileName' => $stored['originalName']],
                );
            }
        }

        $taskId = $owner['task_id'] ?? null;
        if (! $taskId && ! empty($owner['comment_id'])) {
            $taskId = Comment::query()->whereKey($owner['comment_id'])->value('task_id');
        }
        if ($taskId) {
            $this->broadcastTaskUpdated((int) $taskId);
        }

        return response()->json([
            'files' => $attachments,
            'file' => $attachments[0],
        ], 201);
    }
}
