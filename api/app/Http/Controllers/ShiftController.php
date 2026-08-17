<?php

namespace App\Http\Controllers;

use App\Events\WorkShiftUpdated;
use App\Models\WorkShift;
use App\Models\WorkShiftPause;
use App\Services\ShiftStatsService;
use App\Support\ApiPresenter;
use App\Support\AppDateTime;
use App\Support\Broadcasting;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;

class ShiftController extends Controller
{
    public function __construct(
        private ShiftStatsService $shiftStats,
    ) {}

    public function index(Request $request): JsonResponse
    {
        if ($resp = $this->forbidPending($this->user($request))) {
            return $resp;
        }

        $shifts = WorkShift::query()
            ->with(['user', 'pauses'])
            ->latest('started_at')
            ->get();

        return response()->json([
            'shifts' => $shifts->map(fn (WorkShift $shift) => ApiPresenter::workShift($shift))->values(),
        ]);
    }

    public function stats(Request $request, int $id): JsonResponse
    {
        if ($resp = $this->forbidPending($this->user($request))) {
            return $resp;
        }

        $shift = WorkShift::query()->with(['user', 'pauses'])->find($id);
        if (! $shift) {
            return response()->json(['error' => 'Смена не найдена'], 404);
        }

        return response()->json($this->shiftStats->build($shift));
    }

    public function current(Request $request): JsonResponse
    {
        if ($resp = $this->forbidPending($this->user($request))) {
            return $resp;
        }

        $shift = $this->activeShift($this->user($request)->id);

        return response()->json([
            'shift' => $shift ? ApiPresenter::workShift($shift) : null,
        ]);
    }

    public function start(Request $request): JsonResponse
    {
        if ($resp = $this->forbidPending($this->user($request))) {
            return $resp;
        }

        $user = $this->user($request);
        if ($this->activeShift($user->id)) {
            return response()->json(['error' => 'Смена уже начата'], 409);
        }

        $shift = WorkShift::query()->create([
            'user_id' => $user->id,
            'started_at' => AppDateTime::now(),
        ]);
        $shift->setRelation('user', $user);
        $shift->load('pauses');
        $this->broadcastShiftUpdated($shift, 'start');

        return response()->json(['shift' => ApiPresenter::workShift($shift)], 201);
    }

    public function pause(Request $request): JsonResponse
    {
        if ($resp = $this->forbidPending($this->user($request))) {
            return $resp;
        }

        $shift = $this->activeShift($this->user($request)->id);
        if (! $shift) {
            return response()->json(['error' => 'Нет активной смены'], 404);
        }
        if ($shift->openPause()) {
            return response()->json(['error' => 'Смена уже на паузе'], 409);
        }

        WorkShiftPause::query()->create([
            'work_shift_id' => $shift->id,
            'started_at' => AppDateTime::now(),
            'created_at' => AppDateTime::now(),
        ]);

        $shift->touch();
        $shift->load('pauses');
        $this->broadcastShiftUpdated($shift, 'pause');

        return response()->json(['shift' => ApiPresenter::workShift($shift)]);
    }

    public function resume(Request $request): JsonResponse
    {
        if ($resp = $this->forbidPending($this->user($request))) {
            return $resp;
        }

        $shift = $this->activeShift($this->user($request)->id);
        if (! $shift) {
            return response()->json(['error' => 'Нет активной смены'], 404);
        }

        $openPause = $shift->openPause();
        if (! $openPause) {
            return response()->json(['error' => 'Смена не на паузе'], 409);
        }

        $openPause->update(['ended_at' => AppDateTime::now()]);
        $shift->touch();
        $shift->load('pauses');
        $this->broadcastShiftUpdated($shift, 'resume');

        return response()->json(['shift' => ApiPresenter::workShift($shift)]);
    }

    public function end(Request $request): JsonResponse
    {
        if ($resp = $this->forbidPending($this->user($request))) {
            return $resp;
        }

        $validator = Validator::make($request->all(), [
            'endedAt' => ['required', 'date'],
            'comment' => ['nullable', 'string', 'max:2000'],
        ]);
        if ($validator->fails()) {
            return response()->json(['error' => $validator->errors()->toArray()], 400);
        }

        $shift = $this->activeShift($this->user($request)->id);
        if (! $shift) {
            return response()->json(['error' => 'Нет активной смены'], 404);
        }

        $data = $validator->validated();
        // Client sends UTC ISO; normalize to APP_TIMEZONE wall clock before save.
        $endedAt = AppDateTime::parseClient($data['endedAt']);
        $now = AppDateTime::now();

        if ($endedAt->lt($shift->started_at)) {
            return response()->json(['error' => 'Время окончания не может быть раньше начала смены'], 400);
        }
        if ($endedAt->gt($now->copy()->addMinute())) {
            return response()->json(['error' => 'Время окончания не может быть в будущем'], 400);
        }

        DB::transaction(function () use ($shift, $endedAt, $data) {
            $openPause = $shift->openPause();
            if ($openPause) {
                $pauseEnd = $endedAt->lt($openPause->started_at)
                    ? $openPause->started_at
                    : $endedAt;
                $openPause->update(['ended_at' => $pauseEnd]);
            }

            $comment = array_key_exists('comment', $data)
                ? trim((string) $data['comment'])
                : null;

            $shift->update([
                'ended_at' => $endedAt,
                'comment' => $comment === '' ? null : $comment,
            ]);
        });

        $shift->refresh()->load(['user', 'pauses']);
        $this->broadcastShiftUpdated($shift, 'end');

        return response()->json(['shift' => ApiPresenter::workShift($shift)]);
    }

    private function activeShift(int $userId): ?WorkShift
    {
        return WorkShift::query()
            ->with(['user', 'pauses'])
            ->where('user_id', $userId)
            ->whereNull('ended_at')
            ->latest('started_at')
            ->first();
    }

    private function broadcastShiftUpdated(WorkShift $shift, string $action): void
    {
        if (Broadcasting::enabled()) {
            try {
                broadcast(new WorkShiftUpdated(
                    (int) $shift->id,
                    (int) $shift->user_id,
                    $action,
                ));
            } catch (\Throwable $e) {
                report($e);
            }
        }
    }
}
