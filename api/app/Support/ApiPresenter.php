<?php

namespace App\Support;

use App\Models\Attachment;
use App\Models\Board;
use App\Models\Comment;
use App\Models\Notification;
use App\Models\Project;
use App\Models\ProjectStatus;
use App\Models\Task;
use App\Models\TaskStatusHistory;
use App\Models\User;
use Illuminate\Support\Carbon;

class ApiPresenter
{
    public static function user(User $user): array
    {
        return [
            'id' => $user->id,
            'username' => $user->username,
            'firstName' => $user->first_name,
            'lastName' => $user->last_name,
            'avatarColor' => $user->avatar_color,
            'role' => $user->role,
            'createdAt' => self::date($user->created_at),
        ];
    }

    public static function publicUser(?User $user): ?array
    {
        if (! $user) {
            return null;
        }

        return [
            'id' => $user->id,
            'username' => $user->username,
            'firstName' => $user->first_name,
            'lastName' => $user->last_name,
            'avatarColor' => $user->avatar_color,
            'role' => $user->role,
        ];
    }

    public static function status(ProjectStatus $status): array
    {
        return [
            'id' => $status->id,
            'name' => $status->name,
            'order' => $status->order,
            'projectId' => $status->project_id,
            'locked' => Constants::isProtectedStatusName($status->name),
            'createdAt' => self::date($status->created_at),
        ];
    }

    public static function attachment(Attachment $file): array
    {
        return [
            'id' => $file->id,
            'filename' => $file->filename,
            'originalName' => $file->original_name,
            'mimeType' => $file->mime_type,
            'size' => $file->size,
            'url' => $file->url,
            'key' => $file->key,
            'taskId' => $file->task_id,
            'commentId' => $file->comment_id,
            'createdAt' => self::date($file->created_at),
        ];
    }

    public static function notification(Notification $notification): array
    {
        return [
            'id' => $notification->id,
            'type' => $notification->type,
            'title' => $notification->title,
            'body' => $notification->body,
            'taskId' => $notification->task_id,
            'taskTitle' => $notification->relationLoaded('task') && $notification->task
                ? $notification->task->title
                : null,
            'commentId' => $notification->comment_id,
            'readAt' => self::date($notification->read_at),
            'createdAt' => self::date($notification->created_at),
            'actor' => self::publicUser(
                $notification->relationLoaded('actor') ? $notification->actor : null
            ),
        ];
    }

    public static function comment(Comment $comment): array
    {
        $reply = null;
        if ($comment->relationLoaded('replyTo') && $comment->replyTo) {
            $target = $comment->replyTo;
            $reply = [
                'id' => $target->id,
                'body' => $target->body,
                'author' => self::publicUser($target->author),
                'hasFiles' => $target->relationLoaded('files')
                    ? $target->files->isNotEmpty()
                    : $target->files()->exists(),
            ];
        }

        return [
            'id' => $comment->id,
            'body' => $comment->body,
            'createdAt' => self::date($comment->created_at),
            'editedAt' => self::date($comment->edited_at),
            'replyToId' => $comment->reply_to_id,
            'replyTo' => $reply,
            'author' => self::publicUser($comment->author),
            'files' => $comment->relationLoaded('files')
                ? $comment->files->map(fn ($f) => self::attachment($f))->values()->all()
                : [],
        ];
    }

    public static function task(Task $task, bool $withComments = false): array
    {
        $data = [
            'id' => $task->id,
            'title' => $task->title,
            'description' => $task->description,
            'priority' => $task->priority,
            'deadline' => self::date($task->deadline),
            'projectId' => $task->project_id,
            'statusId' => $task->status_id,
            'order' => $task->sort_order,
            'activeAssigneeId' => $task->active_assignee_id,
            'statusChangedAt' => self::date($task->status_changed_at),
            'createdAt' => self::date($task->created_at),
            'updatedAt' => self::date($task->updated_at),
            'activeAssignee' => self::publicUser($task->activeAssignee),
            'assignees' => $task->relationLoaded('assignees')
                ? $task->assignees->map(fn ($u) => self::publicUser($u))->values()->all()
                : [],
            'status' => $task->relationLoaded('status') && $task->status
                ? self::status($task->status)
                : null,
            'files' => $task->relationLoaded('files')
                ? $task->files->map(fn ($f) => self::attachment($f))->values()->all()
                : [],
            'createdBy' => self::publicUser($task->createdBy),
        ];

        if ($task->relationLoaded('project') && $task->project) {
            $data['project'] = [
                'id' => $task->project->id,
                'name' => $task->project->name,
                'boardId' => $task->project->board_id,
                'board' => $task->project->relationLoaded('board') && $task->project->board
                    ? [
                        'id' => $task->project->board->id,
                        'name' => $task->project->board->name,
                    ]
                    : null,
            ];
        }

        if ($withComments && $task->relationLoaded('comments')) {
            $data['comments'] = $task->comments->map(fn ($c) => self::comment($c))->values()->all();
        }

        if ($task->relationLoaded('statusHistories')) {
            $data['statusHistory'] = $task->statusHistories
                ->map(fn (TaskStatusHistory $h) => self::statusHistory($h))
                ->values()
                ->all();
        }

        if ($task->relationLoaded('comments') && ! $withComments) {
            $data['_count'] = ['comments' => $task->comments->count()];
        } elseif (isset($task->comments_count)) {
            $data['_count'] = ['comments' => (int) $task->comments_count];
        }

        return $data;
    }

    public static function statusHistory(TaskStatusHistory $history): array
    {
        return [
            'id' => $history->id,
            'fromStatusName' => $history->from_status_name,
            'toStatusName' => $history->to_status_name,
            'createdAt' => self::date($history->created_at),
            'user' => self::publicUser($history->user),
        ];
    }

    public static function project(Project $project, bool $withTasks = false): array
    {
        $data = [
            'id' => $project->id,
            'name' => $project->name,
            'boardId' => $project->board_id,
            'order' => $project->sort_order,
            'createdAt' => self::date($project->created_at),
            'updatedAt' => self::date($project->updated_at),
            'statuses' => $project->relationLoaded('statuses')
                ? $project->statuses->map(fn ($s) => self::status($s))->values()->all()
                : [],
        ];

        if ($project->relationLoaded('board') && $project->board) {
            $data['board'] = [
                'id' => $project->board->id,
                'name' => $project->board->name,
            ];
        }

        if (isset($project->tasks_count) || $project->relationLoaded('tasks') || isset($project->open_tasks_count) || isset($project->in_progress_tasks_count)) {
            $data['_count'] = [];
            if (isset($project->tasks_count) || $project->relationLoaded('tasks')) {
                $data['_count']['tasks'] = isset($project->tasks_count)
                    ? (int) $project->tasks_count
                    : $project->tasks->count();
            }
            if (isset($project->open_tasks_count)) {
                $data['_count']['openTasks'] = (int) $project->open_tasks_count;
            }
            if (isset($project->in_progress_tasks_count)) {
                $data['_count']['inProgressTasks'] = (int) $project->in_progress_tasks_count;
            }
        }

        if ($withTasks && $project->relationLoaded('tasks')) {
            $data['tasks'] = $project->tasks->map(function (Task $t) {
                $row = self::task($t);
                $row['_count'] = [
                    'comments' => isset($t->comments_count)
                        ? (int) $t->comments_count
                        : ($t->relationLoaded('comments') ? $t->comments->count() : 0),
                ];

                return $row;
            })->values()->all();
        }

        return $data;
    }

    public static function board(Board $board, bool $withProjects = false, ?array $taskCounts = null): array
    {
        $data = [
            'id' => $board->id,
            'name' => $board->name,
            'createdById' => $board->created_by_id,
            'createdAt' => self::date($board->created_at),
            'updatedAt' => self::date($board->updated_at),
            'createdBy' => self::publicUser($board->createdBy),
        ];

        $count = [];
        if (isset($board->projects_count)) {
            $count['projects'] = (int) $board->projects_count;
        }
        if ($taskCounts !== null) {
            $count['openTasks'] = (int) ($taskCounts['openTasks'] ?? 0);
            $count['inProgressTasks'] = (int) ($taskCounts['inProgressTasks'] ?? 0);
        }
        if ($count !== []) {
            $data['_count'] = $count;
        }

        if ($withProjects && $board->relationLoaded('projects')) {
            $data['projects'] = $board->projects->map(fn ($p) => self::project($p))->values()->all();
        }

        return $data;
    }

    private static function date(mixed $value): ?string
    {
        if ($value === null) {
            return null;
        }
        if ($value instanceof Carbon) {
            return $value->toISOString();
        }

        return Carbon::parse($value)->toISOString();
    }
}
