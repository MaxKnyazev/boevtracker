<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('work_shifts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->timestamp('started_at');
            $table->timestamp('ended_at')->nullable();
            $table->text('comment')->nullable();
            $table->timestamps();

            $table->index(['user_id', 'ended_at']);
        });

        Schema::create('work_shift_pauses', function (Blueprint $table) {
            $table->id();
            $table->foreignId('work_shift_id')->constrained('work_shifts')->cascadeOnDelete();
            $table->timestamp('started_at');
            $table->timestamp('ended_at')->nullable();
            $table->timestamp('created_at')->useCurrent();

            $table->index(['work_shift_id', 'ended_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('work_shift_pauses');
        Schema::dropIfExists('work_shifts');
    }
};
