import { UserAvatar, EmptyAssigneeAvatar, displayName } from '@/components/user-avatar';
import {
  taskActiveAssignee,
  taskAssignees,
  type PublicUser,
  type Task,
} from '@/lib/api';
import { cn } from '@/lib/utils';

export function AssigneeStack({
  task,
  size = 'sm',
  className,
}: {
  task: Task;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const assignees = taskAssignees(task);
  const active = taskActiveAssignee(task);

  if (assignees.length === 0) {
    return <EmptyAssigneeAvatar size={size} className={className} />;
  }

  if (assignees.length === 1) {
    const only = active ?? assignees[0];
    return <UserAvatar user={only} size={size} className={className} />;
  }

  const others = assignees.filter((u) => u.id !== active?.id);
  const behind = others[0];
  const extra = assignees.length - 1;
  const badgePx = size === 'sm' ? 28 : 36;

  if (assignees.length === 2 && behind) {
    return (
      <span
        className={cn('relative inline-flex items-center', className)}
        title={assignees.map((u) => displayName(u)).join(', ')}
      >
        <UserAvatar
          user={active ?? assignees[0]}
          size={size}
          className="relative z-10 ring-2 ring-background"
        />
        <UserAvatar
          user={behind}
          size={size}
          className="relative z-0 -ml-3.5 ring-2 ring-background"
        />
      </span>
    );
  }

  return (
    <span
      className={cn('relative inline-flex items-center', className)}
      title={assignees.map((u) => displayName(u)).join(', ')}
    >
      <UserAvatar
        user={active ?? assignees[0]}
        size={size}
        className="relative z-10 ring-2 ring-background"
      />
      <span
        className="relative z-0 -ml-3.5 flex shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground ring-2 ring-background"
        style={{ width: badgePx, height: badgePx }}
      >
        +{extra}
      </span>
    </span>
  );
}

export function assigneeToggleIds(
  current: PublicUser[],
  userId: number | null,
): number[] {
  if (userId == null) return [];
  const ids = current.map((u) => u.id);
  if (ids.includes(userId)) {
    return ids.filter((id) => id !== userId);
  }
  return [...ids, userId];
}
