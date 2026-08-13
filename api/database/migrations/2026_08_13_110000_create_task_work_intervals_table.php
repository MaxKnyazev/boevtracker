<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('task_work_intervals', function (Blueprint $table) {
            $table->id();
            $table->foreignId('task_id')->constrained('tasks')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->unsignedBigInteger('status_id')->nullable();
            $table->string('status_name', 128);
            $table->timestamp('started_at');
            $table->timestamp('ended_at')->nullable();
            $table->timestamps();

            $table->index(['user_id', 'started_at', 'ended_at']);
            $table->index(['task_id', 'ended_at']);
        });

        $this->backfillOpenIntervals();
    }

    public function down(): void
    {
        Schema::dropIfExists('task_work_intervals');
    }

    private function backfillOpenIntervals(): void
    {
        $openName = 'Открыта';
        $closedName = 'Закрыта';

        $tasks = DB::table('tasks')
            ->join('project_statuses as s', 's.id', '=', 'tasks.status_id')
            ->select([
                'tasks.id as task_id',
                'tasks.project_id',
                'tasks.active_assignee_id',
                'tasks.status_id',
                'tasks.status_changed_at',
                'tasks.updated_at',
                's.name as status_name',
                's.order as status_order',
            ])
            ->get();

        $statusesByProject = DB::table('project_statuses')
            ->get(['id', 'project_id', 'name', 'order'])
            ->groupBy('project_id');

        $assigneeCounts = DB::table('task_assignees')
            ->select('task_id', DB::raw('COUNT(*) as cnt'), DB::raw('MIN(user_id) as only_user_id'))
            ->groupBy('task_id')
            ->get()
            ->keyBy('task_id');

        $now = now();
        $rows = [];

        foreach ($tasks as $task) {
            $projectStatuses = $statusesByProject->get($task->project_id, collect());
            $open = $projectStatuses->firstWhere('name', $openName);
            $closed = $projectStatuses->firstWhere('name', $closedName);
            if (! $open || ! $closed) {
                continue;
            }
            if (
                (int) $task->status_order <= (int) $open->order
                || (int) $task->status_order >= (int) $closed->order
            ) {
                continue;
            }

            $userId = $task->active_assignee_id ? (int) $task->active_assignee_id : null;
            if ($userId === null) {
                $pivot = $assigneeCounts->get($task->task_id);
                if ($pivot && (int) $pivot->cnt === 1) {
                    $userId = (int) $pivot->only_user_id;
                }
            }
            if ($userId === null) {
                continue;
            }

            $startedAt = $task->status_changed_at ?? $task->updated_at ?? $now;

            $rows[] = [
                'task_id' => (int) $task->task_id,
                'user_id' => $userId,
                'status_id' => (int) $task->status_id,
                'status_name' => (string) $task->status_name,
                'started_at' => $startedAt,
                'ended_at' => null,
                'created_at' => $now,
                'updated_at' => $now,
            ];
        }

        foreach (array_chunk($rows, 200) as $chunk) {
            DB::table('task_work_intervals')->insert($chunk);
        }
    }
};
