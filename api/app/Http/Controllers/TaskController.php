<?php

namespace App\Http\Controllers;

use App\Models\Attachment;
use App\Models\Comment;
use App\Models\Project;
use App\Models\ProjectStatus;
use App\Models\Task;
use App\Models\TaskStatusHistory;
use App\Models\User;
use App\Services\FileStorage;
use App\Services\NotificationService;
use App\Support\ApiPresenter;
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
    ) {}

    private function taskRelations(): array
    {
        return [
            'assignee',
            'status',
            'files',
            'createdBy',
            'project.board',
            'comments.author',
            'comments.files',
            'comments.replyTo.author',
            'comments.replyTo.files',
            'statusHistories.user',
        ];
    }

    private function recordStatusChange(
        Task $task,
        User $user,
        ?int $fromStatusId,
        int $toStatusId,
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
            ->with(['assignee', 'status', 'createdBy', 'project.board'])
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
            'deadline' => ['nullable', 'date'],
            'statusId' => ['nullable', 'integer'],
            'assigneeId' => ['nullable', 'integer'],
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

        $task = Task::query()->create([
            'title' => $data['title'],
            'description' => $data['description'] ?? null,
            'priority' => $data['priority'] ?? 'MEDIUM',
            'deadline' => $data['deadline'] ?? null,
            'project_id' => $projectId,
            'status_id' => $statusId,
            'sort_order' => $maxOrder + 1,
            'assignee_id' => $data['assigneeId'] ?? null,
            'created_by_id' => $user->id,
            'status_changed_at' => now(),
        ]);

        $this->recordStatusChange($task, $user, null, (int) $statusId);

        if (! empty($data['assigneeId'])) {
            $this->notifications->notifyAssignee($user, $task, (int) $data['assigneeId']);
        }

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
            'deadline' => ['nullable', 'date'],
            'statusId' => ['sometimes', 'integer'],
            'assigneeId' => ['nullable', 'integer'],
            'projectId' => ['sometimes', 'integer'],
        ]);
        if ($validator->fails()) {
            return response()->json(['error' => $validator->errors()->toArray()], 400);
        }

        $task = Task::query()->with('status')->find($id);
        if (! $task) {
            return response()->json(['error' => 'Задача не найдена'], 404);
        }

        $data = $validator->validated();
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
        if (array_key_exists('assigneeId', $data)) {
            $update['assignee_id'] = $data['assigneeId'];
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
                $toStatusId = (int) $status->id;
            }
        }

        $previousAssigneeId = $task->assignee_id;

        $task->update($update);

        if ($toStatusId !== $fromStatusId) {
            $this->recordStatusChange($task, $user, $fromStatusId, $toStatusId);
        }

        if (array_key_exists('assignee_id', $update)) {
            $newAssigneeId = $update['assignee_id'];
            if ($newAssigneeId !== null && (int) $newAssigneeId !== (int) $previousAssigneeId) {
                $this->notifications->notifyAssignee($user, $task, (int) $newAssigneeId);
            }
        }

        $task->load($this->taskRelations());

        return response()->json(['task' => ApiPresenter::task($task, true)]);
    }

    public function take(Request $request, int $id): JsonResponse
    {
        $user = $this->user($request);
        if ($resp = $this->forbidWrite($user)) {
            return $resp;
        }

        $task = Task::query()->find($id);
        if (! $task) {
            return response()->json(['error' => 'Задача не найдена'], 404);
        }

        $task->update(['assignee_id' => $user->id]);
        $task->load($this->taskRelations());

        return response()->json(['task' => ApiPresenter::task($task, true)]);
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
        ]);
        if ($validator->fails()) {
            return response()->json(['error' => 'Укажите statusId и index'], 400);
        }

        $task = Task::query()->find($id);
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
        $siblings = Task::query()
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

        DB::transaction(function () use ($task, $status, $statusChanged, $index, $orderedIds, $user, $fromStatusId) {
            $payload = [
                'status_id' => $status->id,
                'sort_order' => $index,
            ];
            if ($statusChanged) {
                $payload['status_changed_at'] = now();
            }
            $task->update($payload);

            foreach ($orderedIds as $order => $taskId) {
                Task::query()->where('id', $taskId)->update(['sort_order' => $order]);
            }

            if ($statusChanged) {
                $this->recordStatusChange($task, $user, $fromStatusId, (int) $status->id);
            }
        });

        $task = Task::query()->with($this->taskRelations())->find($id);

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
            foreach ($comment->files as $file) {
                if ($this->files->exists($file->key)) {
                    $this->files->delete($file->key);
                }
            }
            $comment->delete();

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
        if ($comment->author_id !== $user->id) {
            return response()->json(['error' => 'Можно удалять только свои сообщения'], 403);
        }

        foreach ($comment->files as $file) {
            if ($this->files->exists($file->key)) {
                $this->files->delete($file->key);
            }
        }
        $comment->delete();

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
        if ($resp = $this->forbidWrite($this->user($request))) {
            return $resp;
        }

        $attachment = Attachment::query()->find($id);
        if (! $attachment) {
            return response()->json(['error' => 'Файл не найден'], 404);
        }

        $commentId = $attachment->comment_id;

        if ($this->files->exists($attachment->key)) {
            $this->files->delete($attachment->key);
        }
        $attachment->delete();

        $commentDeleted = false;
        if ($commentId) {
            $comment = Comment::query()->withCount('files')->find($commentId);
            if ($comment) {
                if (trim((string) $comment->body) === '' && (int) $comment->files_count === 0) {
                    $comment->delete();
                    $commentDeleted = true;
                } else {
                    $comment->edited_at = now();
                    $comment->save();
                }
            }
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
        foreach ($list as $file) {
            if ($file->getSize() > $this->files->maxBytes()) {
                return response()->json([
                    'error' => 'Файл «'.$file->getClientOriginalName().'» больше 100 МБ',
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
        }

        return response()->json([
            'files' => $attachments,
            'file' => $attachments[0],
        ], 201);
    }
}
