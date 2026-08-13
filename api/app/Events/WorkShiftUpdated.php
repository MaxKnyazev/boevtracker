<?php

namespace App\Events;

use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class WorkShiftUpdated implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(
        public int $shiftId,
        public int $userId,
        public string $action,
    ) {}

    public function broadcastOn(): array
    {
        return [
            new PrivateChannel('shifts'),
        ];
    }

    public function broadcastAs(): string
    {
        return 'shift.updated';
    }

    public function broadcastWith(): array
    {
        return [
            'shiftId' => $this->shiftId,
            'userId' => $this->userId,
            'action' => $this->action,
        ];
    }
}
