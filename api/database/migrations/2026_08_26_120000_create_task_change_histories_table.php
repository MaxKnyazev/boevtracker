<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('task_change_histories', function (Blueprint $table) {
            $table->id();
            $table->foreignId('task_id')->constrained('tasks')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('type', 64);
            $table->json('payload')->nullable();
            $table->timestamp('created_at')->useCurrent();

            $table->index(['task_id', 'created_at']);
            $table->index(['task_id', 'type']);
        });

        if (Schema::hasTable('task_status_histories')) {
            $rows = DB::table('task_status_histories')->orderBy('id')->get();
            foreach ($rows as $row) {
                DB::table('task_change_histories')->insert([
                    'task_id' => $row->task_id,
                    'user_id' => $row->user_id,
                    'type' => 'status',
                    'payload' => json_encode([
                        'fromStatusName' => $row->from_status_name,
                        'toStatusName' => $row->to_status_name,
                    ], JSON_UNESCAPED_UNICODE),
                    'created_at' => $row->created_at,
                ]);
            }
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('task_change_histories');
    }
};
