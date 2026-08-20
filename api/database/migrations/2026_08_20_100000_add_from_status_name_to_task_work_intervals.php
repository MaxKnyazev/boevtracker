<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('task_work_intervals', function (Blueprint $table) {
            $table->string('from_status_name', 128)->nullable()->after('status_name');
        });

        $this->backfillFromStatusNames();
    }

    public function down(): void
    {
        Schema::table('task_work_intervals', function (Blueprint $table) {
            $table->dropColumn('from_status_name');
        });
    }

    private function backfillFromStatusNames(): void
    {
        $intervals = DB::table('task_work_intervals')
            ->select(['id', 'task_id', 'status_name', 'started_at'])
            ->orderBy('id')
            ->get();

        foreach ($intervals as $interval) {
            $history = DB::table('task_status_histories')
                ->where('task_id', $interval->task_id)
                ->where('to_status_name', $interval->status_name)
                ->where('created_at', '<=', $interval->started_at)
                ->orderByDesc('created_at')
                ->orderByDesc('id')
                ->first(['from_status_name']);

            if (! $history) {
                $history = DB::table('task_status_histories')
                    ->where('task_id', $interval->task_id)
                    ->where('to_status_name', $interval->status_name)
                    ->orderByDesc('created_at')
                    ->orderByDesc('id')
                    ->first(['from_status_name']);
            }

            if (! $history || $history->from_status_name === null || $history->from_status_name === '') {
                continue;
            }

            DB::table('task_work_intervals')
                ->where('id', $interval->id)
                ->update(['from_status_name' => $history->from_status_name]);
        }
    }
};
