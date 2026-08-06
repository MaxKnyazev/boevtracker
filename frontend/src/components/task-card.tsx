import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Flame } from 'lucide-react';
import type { Task, User } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  EmptyAssigneeAvatar,
  UserAvatar,
  displayName,
} from '@/components/user-avatar';
import { PRIORITY_LABELS, formatDate, formatDuration, cn } from '@/lib/utils';

const DESC_LIMIT = 90;
const PICKER_WIDTH = 208; // w-52

const priorityColor: Record<string, string> = {
  LOW: 'border-slate-500/40 text-slate-600 dark:text-slate-300',
  MEDIUM: 'border-blue-500/40 text-blue-700 dark:text-blue-300',
  HIGH: 'border-amber-500/40 text-amber-700 dark:text-amber-300',
  CRITICAL: 'border-red-500/40 text-red-700 dark:text-red-300',
};

function truncate(text?: string | null, limit = DESC_LIMIT): string {
  if (!text?.trim()) return 'Без описания';
  const t = text.trim().replace(/\s+/g, ' ');
  return t.length > limit ? `${t.slice(0, limit).trimEnd()}...` : t;
}

export function TaskCard({
  task,
  users,
  writable,
  preview = false,
  isDragging = false,
  dragStyle,
  setDragRef,
  dragAttributes,
  dragListeners,
  onOpen,
  onMoveBoard,
  onAssign,
}: {
  task: Task;
  users: User[];
  writable: boolean;
  preview?: boolean;
  isDragging?: boolean;
  dragStyle?: CSSProperties;
  setDragRef?: (node: HTMLElement | null) => void;
  dragAttributes?: object;
  dragListeners?: object;
  onOpen?: () => void;
  onMoveBoard?: () => void;
  onAssign?: (assigneeId: number | null) => Promise<void>;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerPos, setPickerPos] = useState<{ top: number; left: number } | null>(
    null,
  );
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!pickerOpen || !buttonRef.current) {
      setPickerPos(null);
      return;
    }
    const rect = buttonRef.current.getBoundingClientRect();
    const menuHeight = Math.min(240, 40 + users.length * 36);
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < menuHeight + 8 && rect.top > spaceBelow;
    const top = openUp ? rect.top - menuHeight - 4 : rect.bottom + 4;
    const left = Math.min(
      Math.max(8, rect.right - PICKER_WIDTH),
      window.innerWidth - PICKER_WIDTH - 8,
    );
    setPickerPos({ top, left });
  }, [pickerOpen, users.length]);

  useEffect(() => {
    if (!pickerOpen) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        buttonRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
        return;
      }
      setPickerOpen(false);
    };
    const onScroll = (e: Event) => {
      // Ignore scrolling inside the picker list itself.
      if (menuRef.current?.contains(e.target as Node)) return;
      setPickerOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [pickerOpen]);

  const assigneeMenu =
    pickerOpen && onAssign && pickerPos
      ? createPortal(
          <div
            ref={menuRef}
            className="fixed z-[100] max-h-60 w-52 overflow-auto rounded-lg border border-border bg-popover py-1 shadow-xl"
            style={{ top: pickerPos.top, left: pickerPos.left }}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-muted-foreground hover:bg-accent"
              onClick={() => {
                void onAssign(null).then(() => setPickerOpen(false));
              }}
            >
              <EmptyAssigneeAvatar size="sm" />
              Без исполнителя
            </button>
            {users.map((u) => (
              <button
                key={u.id}
                type="button"
                className={cn(
                  'flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-accent',
                  task.assigneeId === u.id && 'bg-accent/50',
                )}
                onClick={() => {
                  void onAssign(u.id).then(() => setPickerOpen(false));
                }}
              >
                <UserAvatar user={u} size="sm" />
                <span className="truncate">{displayName(u)}</span>
              </button>
            ))}
          </div>,
          document.body,
        )
      : null;

  const card = (
    <div
      ref={setDragRef}
      data-task-card
      style={dragStyle}
      {...(preview || !writable ? {} : { ...dragAttributes, ...dragListeners })}
      onClick={() => {
        if (!preview && !isDragging) onOpen?.();
      }}
      className={cn(
        'relative w-full overflow-hidden rounded-lg border border-border bg-background/80 p-3 text-left touch-none',
        preview
          ? 'cursor-grabbing shadow-2xl ring-2 ring-primary/40'
          : 'cursor-grab hover:border-primary/60 hover:bg-accent/30 active:cursor-grabbing',
        isDragging && 'opacity-40',
      )}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div
          className="min-w-0 flex-1 truncate text-sm font-semibold leading-snug"
          title={task.title}
        >
          {task.title}
        </div>
        <div className="relative shrink-0 leading-none">
          <button
            ref={buttonRef}
            type="button"
            disabled={!writable || preview || !onAssign}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              if (writable && onAssign) setPickerOpen((v) => !v);
            }}
            className={cn(
              'flex h-7 w-7 shrink-0 items-center justify-center p-0 leading-none outline-none focus-visible:ring-2 focus-visible:ring-ring',
              writable && onAssign && !preview
                ? 'cursor-pointer'
                : 'disabled:cursor-default',
            )}
          >
            {task.assignee ? (
              <UserAvatar user={task.assignee} size="sm" />
            ) : (
              <EmptyAssigneeAvatar size="sm" />
            )}
          </button>
          {assigneeMenu}
        </div>
      </div>

      <div className="mb-2 flex min-h-5 items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          {task.deadline ? (
            <>
              <Flame className="h-3.5 w-3.5 shrink-0 text-orange-400" aria-hidden />
              <span className="truncate">{formatDate(task.deadline)}</span>
            </>
          ) : null}
        </div>
        <Badge className={cn('shrink-0', priorityColor[task.priority])}>
          {PRIORITY_LABELS[task.priority]}
        </Badge>
      </div>

      <div
        className="mb-2 min-w-0 truncate text-xs leading-relaxed text-muted-foreground"
        title={task.description?.trim() || undefined}
      >
        {truncate(task.description)}
      </div>

      <div className="text-xs text-muted-foreground">
        В статусе {formatDuration(task.statusChangedAt)}
      </div>
    </div>
  );

  if (!writable || preview || !onMoveBoard) return card;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{card}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={() => onOpen?.()}>Открыть</ContextMenuItem>
        <ContextMenuItem onSelect={onMoveBoard}>
          Перенести на другую доску
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
