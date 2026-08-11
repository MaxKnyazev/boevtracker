<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('task_assignees', function (Blueprint $table) {
            $table->id();
            $table->foreignId('task_id')->constrained('tasks')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->timestamp('created_at')->useCurrent();
            $table->unique(['task_id', 'user_id']);
        });

        Schema::table('tasks', function (Blueprint $table) {
            $table->foreignId('active_assignee_id')
                ->nullable()
                ->after('assignee_id')
                ->constrained('users')
                ->nullOnDelete();
        });

        $tasks = DB::table('tasks')
            ->whereNotNull('assignee_id')
            ->select(['id', 'assignee_id'])
            ->get();

        $now = now();
        foreach ($tasks as $task) {
            DB::table('task_assignees')->insert([
                'task_id' => $task->id,
                'user_id' => $task->assignee_id,
                'created_at' => $now,
            ]);
            DB::table('tasks')
                ->where('id', $task->id)
                ->update(['active_assignee_id' => $task->assignee_id]);
        }

        Schema::table('tasks', function (Blueprint $table) {
            $table->dropConstrainedForeignId('assignee_id');
        });
    }

    public function down(): void
    {
        Schema::table('tasks', function (Blueprint $table) {
            $table->foreignId('assignee_id')
                ->nullable()
                ->after('status_id')
                ->constrained('users')
                ->nullOnDelete();
        });

        $tasks = DB::table('tasks')
            ->whereNotNull('active_assignee_id')
            ->select(['id', 'active_assignee_id'])
            ->get();

        foreach ($tasks as $task) {
            DB::table('tasks')
                ->where('id', $task->id)
                ->update(['assignee_id' => $task->active_assignee_id]);
        }

        Schema::table('tasks', function (Blueprint $table) {
            $table->dropConstrainedForeignId('active_assignee_id');
        });

        Schema::dropIfExists('task_assignees');
    }
};
