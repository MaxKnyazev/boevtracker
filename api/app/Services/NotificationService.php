<?php

namespace App\Services;

use App\Events\UserNotificationCreated;
use App\Models\Comment;
use App\Models\Notification;
use App\Models\NotificationSubscription;
use App\Models\Project;
use App\Models\Task;
use App\Models\User;
use App\Models\UserNotificationSettings;
use App\Support\Broadcasting;
use Illuminate\Support\Collection;

class NotificationService
{
    public function notifyAssignee(User $actor, Task $task, ?int $assigneeId): void
    {
        if ($assigneeId === null || $assigneeId === $actor->id) {
            return;
        }

        if (! $this->prefEnabled((int) $assigneeId, 'assignee')) {
            return;
        }

        $this->create(
            userId: $assigneeId,
            actorId: $actor->id,
            type: 'assignee',
            title: 'Вас назначили исполнителем',
            body: sprintf('Задача «%s»', $task->title),
            taskId: $task->id,
        );
    }

    /**
     * @param  list<int>  $userIds
     */
    public function notifyNewAssignees(User $actor, Task $task, array $userIds): void
    {
        foreach (array_unique($userIds) as $userId) {
            $this->notifyAssignee($actor, $task, (int) $userId);
        }
    }

    public function notifyComment(User $actor, Task $task, Comment $comment): void
    {
        $notified = [(int) $actor->id];

        if ($comment->reply_to_id) {
            $parent = $comment->relationLoaded('replyTo')
                ? $comment->replyTo
                : Comment::query()->find($comment->reply_to_id);

            if ($parent && (int) $parent->author_id !== (int) $actor->id) {
                $recipientId = (int) $parent->author_id;
                if ($this->prefEnabled($recipientId, 'reply')) {
                    $snippet = $this->snippet($comment->body) ?: 'Вложение';
                    $this->create(
                        userId: $recipientId,
                        actorId: $actor->id,
                        type: 'reply',
                        title: 'Ответ на ваше сообщение',
                        body: sprintf('В задаче «%s»: %s', $task->title, $snippet),
                        taskId: $task->id,
                        commentId: $comment->id,
                    );
                }
                $notified[] = $recipientId;
            }
        }

        $mentioned = $this->notifyMentions($actor, $task, $comment, $notified);
        $notified = array_values(array_unique(array_merge($notified, $mentioned)));

        $assigneeIds = $task->assigneeIds();
        $snippet = $this->snippet($comment->body) ?: 'Вложение';
        foreach ($assigneeIds as $assigneeId) {
            if (in_array($assigneeId, $notified, true)) {
                continue;
            }
            if (! $this->prefEnabled($assigneeId, 'task_comment')) {
                continue;
            }

            $this->create(
                userId: $assigneeId,
                actorId: $actor->id,
                type: 'task_comment',
                title: 'Новое сообщение в задаче',
                body: sprintf('В задаче «%s»: %s', $task->title, $snippet),
                taskId: $task->id,
                commentId: $comment->id,
            );
            $notified[] = $assigneeId;
        }
    }

    /**
     * @param  list<int>  $skipUserIds
     * @param  list<int>|null  $onlyUserIds
     * @return list<int> user ids that were candidates (mentioned), whether or not notified
     */
    public function notifyMentions(
        User $actor,
        Task $task,
        Comment $comment,
        array $skipUserIds = [],
        ?array $onlyUserIds = null,
    ): array {
        $skip = array_merge($skipUserIds, [(int) $actor->id]);
        $mentioned = $this->mentionedUserIds($comment->body ?? '');
        if ($onlyUserIds !== null) {
            $mentioned = array_values(array_intersect($mentioned, $onlyUserIds));
        }

        $snippet = $this->snippet($comment->body) ?: 'Вложение';
        $touched = [];
        foreach ($mentioned as $userId) {
            $touched[] = $userId;
            if (in_array($userId, $skip, true)) {
                continue;
            }
            if (! $this->prefEnabled($userId, 'mention')) {
                continue;
            }

            $this->create(
                userId: $userId,
                actorId: $actor->id,
                type: 'mention',
                title: 'Вас упомянули',
                body: sprintf('В задаче «%s»: %s', $task->title, $snippet),
                taskId: $task->id,
                commentId: $comment->id,
            );
            $skip[] = $userId;
        }

        return $touched;
    }

    public function notifyStatusChange(
        User $actor,
        Task $task,
        ?string $fromName,
        string $toName,
    ): void {
        $body = $fromName
            ? sprintf('Задача «%s»: %s → %s', $task->title, $fromName, $toName)
            : sprintf('Задача «%s»: статус «%s»', $task->title, $toName);

        $notified = [(int) $actor->id];
        $assigneeIds = $task->assigneeIds();

        foreach ($assigneeIds as $assigneeId) {
            if (in_array($assigneeId, $notified, true)) {
                continue;
            }
            if (! $this->prefEnabled($assigneeId, 'status_assignee')) {
                continue;
            }

            $this->create(
                userId: $assigneeId,
                actorId: $actor->id,
                type: 'status_assignee',
                title: 'Изменён статус задачи',
                body: $body,
                taskId: $task->id,
            );
            $notified[] = $assigneeId;
        }

        $creatorId = $task->created_by_id !== null ? (int) $task->created_by_id : null;
        if (
            $creatorId !== null
            && ! in_array($creatorId, $notified, true)
            && $this->prefEnabled($creatorId, 'status_creator')
        ) {
            $this->create(
                userId: $creatorId,
                actorId: $actor->id,
                type: 'status_creator',
                title: 'Изменён статус вашей задачи',
                body: $body,
                taskId: $task->id,
            );
            $notified[] = $creatorId;
        }

        $subscribers = $this->subscribersForTask($task, 'notify_status_changes');
        foreach ($subscribers as $userId) {
            if (in_array($userId, $notified, true)) {
                continue;
            }

            $this->create(
                userId: $userId,
                actorId: $actor->id,
                type: 'subscription_status',
                title: 'Изменён статус в подписке',
                body: $body,
                taskId: $task->id,
            );
            $notified[] = $userId;
        }
    }

    public function notifyTaskCreated(User $actor, Task $task): void
    {
        $subscribers = $this->subscribersForTask($task, 'notify_new_tasks');
        $body = sprintf('Новая задача «%s»', $task->title);

        foreach ($subscribers as $userId) {
            if ($userId === (int) $actor->id) {
                continue;
            }

            $this->create(
                userId: $userId,
                actorId: $actor->id,
                type: 'subscription_task',
                title: 'Новая задача в подписке',
                body: $body,
                taskId: $task->id,
            );
        }
    }

    /**
     * @return list<int>
     */
    public function mentionedUserIds(string $body): array
    {
        if ($body === '') {
            return [];
        }

        preg_match_all('/@([^\s@]+)/u', $body, $matches);
        $usernames = array_values(array_unique(array_map(
            static fn (string $name) => mb_strtolower($name),
            $matches[1] ?? [],
        )));

        if ($usernames === []) {
            return [];
        }

        return User::query()
            ->where('role', '!=', 'PENDING')
            ->get(['id', 'username'])
            ->filter(fn (User $user) => in_array(mb_strtolower($user->username), $usernames, true))
            ->pluck('id')
            ->map(fn ($id) => (int) $id)
            ->values()
            ->all();
    }

    private function prefEnabled(int $userId, string $key): bool
    {
        $settings = UserNotificationSettings::defaultsFor($userId);

        return (bool) ($settings->{$key} ?? false);
    }

    /**
     * @param  'notify_new_tasks'|'notify_status_changes'  $flag
     * @return list<int>
     */
    private function subscribersForTask(Task $task, string $flag): array
    {
        $projectId = (int) $task->project_id;
        $boardId = $task->relationLoaded('project') && $task->project
            ? (int) $task->project->board_id
            : (int) (Project::query()->whereKey($projectId)->value('board_id') ?? 0);

        if ($boardId === 0) {
            return [];
        }

        /** @var Collection<int, NotificationSubscription> $subs */
        $subs = NotificationSubscription::query()
            ->where(function ($q) use ($projectId, $boardId) {
                $q->where('project_id', $projectId)
                    ->orWhere('board_id', $boardId);
            })
            ->where($flag, true)
            ->get();

        return $subs->pluck('user_id')->map(fn ($id) => (int) $id)->unique()->values()->all();
    }

    private function create(
        int $userId,
        ?int $actorId,
        string $type,
        string $title,
        ?string $body,
        ?int $taskId = null,
        ?int $commentId = null,
    ): void {
        $notification = Notification::query()->create([
            'user_id' => $userId,
            'actor_id' => $actorId,
            'type' => $type,
            'title' => $title,
            'body' => $body,
            'task_id' => $taskId,
            'comment_id' => $commentId,
            'created_at' => now(),
        ]);

        if (Broadcasting::enabled()) {
            try {
                broadcast(new UserNotificationCreated($notification));
            } catch (\Throwable $e) {
                report($e);
            }
        }
    }

    private function snippet(?string $text, int $max = 120): string
    {
        $text = trim((string) $text);
        if ($text === '') {
            return '';
        }
        if (mb_strlen($text) <= $max) {
            return $text;
        }

        return mb_substr($text, 0, $max).'…';
    }
}
