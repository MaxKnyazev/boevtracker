<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('users', function (Blueprint $table) {
            $table->id();
            $table->string('username', 64)->unique();
            $table->string('password_hash', 255);
            $table->string('first_name', 64)->default('');
            $table->string('last_name', 64)->default('');
            $table->string('avatar_color', 7)->default('#3B82F6');
            $table->enum('role', ['ADMIN', 'DEVELOPER', 'READER', 'PENDING'])->default('PENDING');
            $table->timestamps();
        });

        Schema::create('boards', function (Blueprint $table) {
            $table->id();
            $table->string('name', 255);
            $table->foreignId('created_by_id')->constrained('users');
            $table->timestamps();
        });

        Schema::create('projects', function (Blueprint $table) {
            $table->id();
            $table->string('name', 255);
            $table->foreignId('board_id')->constrained('boards')->cascadeOnDelete();
            $table->foreignId('created_by_id')->constrained('users');
            $table->integer('sort_order')->default(0);
            $table->timestamps();
            $table->index(['board_id', 'sort_order']);
        });

        Schema::create('project_statuses', function (Blueprint $table) {
            $table->id();
            $table->string('name', 128);
            $table->integer('order')->default(0);
            $table->foreignId('project_id')->constrained('projects')->cascadeOnDelete();
            $table->timestamp('created_at')->useCurrent();
            $table->unique(['project_id', 'name']);
        });

        Schema::create('tasks', function (Blueprint $table) {
            $table->id();
            $table->string('title', 255);
            $table->text('description')->nullable();
            $table->enum('priority', ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])->default('MEDIUM');
            $table->dateTime('deadline')->nullable();
            $table->foreignId('project_id')->constrained('projects')->cascadeOnDelete();
            $table->foreignId('status_id')->constrained('project_statuses');
            $table->foreignId('assignee_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('created_by_id')->constrained('users');
            $table->integer('sort_order')->default(0);
            $table->timestamp('status_changed_at')->useCurrent();
            $table->timestamps();
            $table->index(['status_id', 'sort_order']);
        });

        Schema::create('comments', function (Blueprint $table) {
            $table->id();
            $table->text('body');
            $table->foreignId('task_id')->constrained('tasks')->cascadeOnDelete();
            $table->foreignId('author_id')->constrained('users');
            $table->timestamps();
        });

        Schema::create('attachments', function (Blueprint $table) {
            $table->id();
            $table->string('filename', 255);
            $table->string('original_name', 255);
            $table->string('mime_type', 128);
            $table->unsignedInteger('size');
            $table->string('key', 512);
            $table->string('url', 1024);
            $table->foreignId('task_id')->nullable()->constrained('tasks')->cascadeOnDelete();
            $table->foreignId('comment_id')->nullable()->constrained('comments')->cascadeOnDelete();
            $table->timestamp('created_at')->useCurrent();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('attachments');
        Schema::dropIfExists('comments');
        Schema::dropIfExists('tasks');
        Schema::dropIfExists('project_statuses');
        Schema::dropIfExists('projects');
        Schema::dropIfExists('boards');
        Schema::dropIfExists('users');
    }
};
