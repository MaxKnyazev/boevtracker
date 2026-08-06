<?php

namespace App\Support;

use App\Models\Project;
use App\Models\Task;
use Illuminate\Support\Collection;

class TaskBuckets
{
    /**
     * @param  Collection<int, Project>  $projects
     * @return array<int, array{openTasks: int, inProgressTasks: int}>
     */
    public static function forProjects(Collection $projects): array
    {
        $result = [];
        if ($projects->isEmpty()) {
            return $result;
        }

        foreach ($projects as $project) {
            $result[(int) $project->id] = ['openTasks' => 0, 'inProgressTasks' => 0];
        }

        $projectIds = $projects->pluck('id')->all();
        $tasksByProject = Task::query()
            ->whereIn('project_id', $projectIds)
            ->get(['project_id', 'status_id'])
            ->groupBy('project_id');

        foreach ($projects as $project) {
            $statuses = $project->relationLoaded('statuses')
                ? $project->statuses->sortBy('order')->values()
                : collect();

            $open = $statuses->firstWhere('name', Constants::OPEN_STATUS_NAME);
            $closed = $statuses->firstWhere('name', Constants::CLOSED_STATUS_NAME);

            $openStatusId = $open ? (int) $open->id : null;
            $inProgressIds = [];

            if ($open && $closed) {
                foreach ($statuses as $status) {
                    if (
                        (int) $status->order > (int) $open->order
                        && (int) $status->order < (int) $closed->order
                    ) {
                        $inProgressIds[] = (int) $status->id;
                    }
                }
            }

            $projectTasks = $tasksByProject->get($project->id, collect());
            $openTasks = 0;
            $inProgressTasks = 0;

            foreach ($projectTasks as $task) {
                $statusId = (int) $task->status_id;
                if ($openStatusId !== null && $statusId === $openStatusId) {
                    $openTasks++;
                } elseif (in_array($statusId, $inProgressIds, true)) {
                    $inProgressTasks++;
                }
            }

            $result[(int) $project->id] = [
                'openTasks' => $openTasks,
                'inProgressTasks' => $inProgressTasks,
            ];
        }

        return $result;
    }

    /**
     * Attach open/in-progress counts onto each project model.
     *
     * @param  Collection<int, Project>  $projects
     */
    public static function attachToProjects(Collection $projects): void
    {
        $counts = self::forProjects($projects);
        foreach ($projects as $project) {
            $c = $counts[(int) $project->id] ?? ['openTasks' => 0, 'inProgressTasks' => 0];
            $project->open_tasks_count = $c['openTasks'];
            $project->in_progress_tasks_count = $c['inProgressTasks'];
        }
    }
}
