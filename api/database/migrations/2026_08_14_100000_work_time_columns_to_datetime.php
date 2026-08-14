<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * TIMESTAMP columns follow the MySQL session time_zone and silently shift values.
 * DATETIME stores the wall clock as written by Laravel (APP_TIMEZONE).
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::getConnection()->getDriverName() !== 'mysql') {
            return;
        }

        DB::statement('ALTER TABLE work_shifts MODIFY started_at DATETIME NOT NULL');
        DB::statement('ALTER TABLE work_shifts MODIFY ended_at DATETIME NULL');
        DB::statement('ALTER TABLE work_shift_pauses MODIFY started_at DATETIME NOT NULL');
        DB::statement('ALTER TABLE work_shift_pauses MODIFY ended_at DATETIME NULL');
        DB::statement('ALTER TABLE work_shift_pauses MODIFY created_at DATETIME NOT NULL');
        DB::statement('ALTER TABLE task_work_intervals MODIFY started_at DATETIME NOT NULL');
        DB::statement('ALTER TABLE task_work_intervals MODIFY ended_at DATETIME NULL');
    }

    public function down(): void
    {
        if (Schema::getConnection()->getDriverName() !== 'mysql') {
            return;
        }

        DB::statement('ALTER TABLE work_shifts MODIFY started_at TIMESTAMP NOT NULL');
        DB::statement('ALTER TABLE work_shifts MODIFY ended_at TIMESTAMP NULL');
        DB::statement('ALTER TABLE work_shift_pauses MODIFY started_at TIMESTAMP NOT NULL');
        DB::statement('ALTER TABLE work_shift_pauses MODIFY ended_at TIMESTAMP NULL');
        DB::statement('ALTER TABLE work_shift_pauses MODIFY created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP');
        DB::statement('ALTER TABLE task_work_intervals MODIFY started_at TIMESTAMP NOT NULL');
        DB::statement('ALTER TABLE task_work_intervals MODIFY ended_at TIMESTAMP NULL');
    }
};
