<?php

namespace App\Services;

use App\Events\UserNotificationCreated;
use App\Models\Comment;
use App\Models\Notification;
use App\Models\Task;
use App\Models\User;
use App\Support\Broadcasting;

class NotificationService
{
    public function notifyAssignee(User $actor, Task $task, ?int $assigneeId): void
    {
        if ($assigneeId === null || $assigneeId === $actor->id) {
            return;
        }

        $title = 'Вас назначили исполнителем';
        $body = sprintf('Задача «%s»', $task->title);

        $this->create(
            userId: $assigneeId,
            actorId: $actor->id,
            type: 'assignee',
            title: $title,
            body: $body,
            taskId: $task->id,
        );
    }

    public function notifyComment(User $actor, Task $task, Comment $comment): void
    {
        $skipUserIds = [$actor->id];

        if ($comment->reply_to_id) {
            $parent = $comment->relationLoaded('replyTo')
                ? $comment->replyTo
                : Comment::query()->find($comment->reply_to_id);

            if ($parent && $parent->author_id !== $actor->id) {
                $snippet = $this->snippet($comment->body) ?: 'Вложение';
                $this->create(
                    userId: (int) $parent->author_id,
                    actorId: $actor->id,
                    type: 'reply',
                    title: 'Ответ на ваше сообщение',
                    body: sprintf('В задаче «%s»: %s', $task->title, $snippet),
                    taskId: $task->id,
                    commentId: $comment->id,
                );
                $skipUserIds[] = (int) $parent->author_id;
            }
        }

        $this->notifyMentions($actor, $task, $comment, $skipUserIds);
    }

    /**
     * @param  list<int>  $skipUserIds
     * @param  list<int>|null  $onlyUserIds
     */
    public function notifyMentions(
        User $actor,
        Task $task,
        Comment $comment,
        array $skipUserIds = [],
        ?array $onlyUserIds = null,
    ): void {
        $skip = array_merge($skipUserIds, [$actor->id]);
        $mentioned = $this->mentionedUserIds($comment->body ?? '');
        if ($onlyUserIds !== null) {
            $mentioned = array_values(array_intersect($mentioned, $onlyUserIds));
        }

        $snippet = $this->snippet($comment->body) ?: 'Вложение';
        foreach ($mentioned as $userId) {
            if (in_array($userId, $skip, true)) {
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
            } catch (\Throwable) {
                // Realtime is best-effort; DB notification already saved.
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
