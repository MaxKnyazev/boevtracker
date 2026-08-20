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
            $table->string('to_status_name', 128)->nullable()->after('from_status_name');
        });

        $this->backfillToStatusNames();
    }

    public function down(): void
    {
        Schema::table('task_work_intervals', function (Blueprint $table) {
            $table->dropColumn('to_status_name');
        });
    }

    private function backfillToStatusNames(): void
    {
        $intervals = DB::table('task_work_intervals')
            ->whereNotNull('ended_at')
            ->select(['id', 'task_id', 'status_name', 'started_at', 'ended_at'])
            ->orderBy('id')
            ->get();

        foreach ($intervals as $interval) {
            $history = DB::table('task_status_histories')
                ->where('task_id', $interval->task_id)
                ->where('from_status_name', $interval->status_name)
                ->where('created_at', '>=', $interval->started_at)
                ->orderBy('created_at')
                ->orderBy('id')
                ->first(['to_status_name']);

            if (! $history || $history->to_status_name === null || $history->to_status_name === '') {
                continue;
            }

            DB::table('task_work_intervals')
                ->where('id', $interval->id)
                ->update(['to_status_name' => $history->to_status_name]);
        }
    }
};
