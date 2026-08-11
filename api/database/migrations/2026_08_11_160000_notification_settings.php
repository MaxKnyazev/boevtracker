<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('user_notification_settings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->unique()->constrained('users')->cascadeOnDelete();
            $table->boolean('task_comment')->default(false);
            $table->boolean('mention')->default(true);
            $table->boolean('reply')->default(true);
            $table->boolean('assignee')->default(true);
            $table->boolean('status_assignee')->default(true);
            $table->boolean('status_creator')->default(false);
            $table->timestamps();
        });

        Schema::create('notification_subscriptions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('board_id')->nullable()->constrained('boards')->cascadeOnDelete();
            $table->foreignId('project_id')->nullable()->constrained('projects')->cascadeOnDelete();
            $table->boolean('notify_new_tasks')->default(true);
            $table->boolean('notify_status_changes')->default(true);
            $table->timestamps();

            $table->unique(['user_id', 'board_id']);
            $table->unique(['user_id', 'project_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('notification_subscriptions');
        Schema::dropIfExists('user_notification_settings');
    }
};
