<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('releases', function (Blueprint $table) {
            $table->id();
            $table->string('name', 255);
            $table->text('description')->nullable();
            $table->string('status', 32)->default('PLANNED');
            $table->date('target_date')->nullable();
            $table->timestamp('released_at')->nullable();
            $table->foreignId('created_by_id')->nullable()->constrained('users')->nullOnDelete();
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();

            $table->index(['status', 'sort_order']);
        });

        Schema::table('tasks', function (Blueprint $table) {
            $table->foreignId('release_id')
                ->nullable()
                ->after('project_id')
                ->constrained('releases')
                ->nullOnDelete();
            $table->index('release_id');
        });
    }

    public function down(): void
    {
        Schema::table('tasks', function (Blueprint $table) {
            $table->dropConstrainedForeignId('release_id');
        });
        Schema::dropIfExists('releases');
    }
};
