import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Check, Flame } from 'lucide-react';
import { taskAssignees, type Task, type User } from '@/lib/api';
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
import { AssigneeStack } from '@/components/assignee-stack';
import { CLOSED_STATUS_NAME } from '@/lib/task-buckets';
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
  onMoveProject,
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
  onMoveProject?: () => void;
  onAssign?: (assigneeIds: number[]) => Promise<void>;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerPos, setPickerPos] = useState<{ top: number; left: number } | null>(
    null,
  );
  const [draftIds, setDraftIds] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pickerOpen) return;
    setDraftIds(taskAssignees(task).map((u) => u.id));
  }, [pickerOpen, task]);

  useLayoutEffect(() => {
    if (!pickerOpen || !buttonRef.current) {
      setPickerPos(null);
      return;
    }
    const rect = buttonRef.current.getBoundingClientRect();
    const menuHeight = Math.min(280, 80 + users.length * 36);
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

  const applyAssignees = async (ids: number[]) => {
    if (!onAssign) return;
    setSaving(true);
    try {
      await onAssign(ids);
      setPickerOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const assigneeMenu =
    pickerOpen && onAssign && pickerPos
      ? createPortal(
          <div
            ref={menuRef}
            className="fixed z-[100] w-52 rounded-lg border border-border bg-popover py-1 shadow-xl"
            style={{ top: pickerPos.top, left: pickerPos.left }}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-muted-foreground hover:bg-accent"
              disabled={saving}
              onClick={() => {
                setDraftIds([]);
                void applyAssignees([]);
              }}
            >
              <EmptyAssigneeAvatar size="sm" />
              Без исполнителей
            </button>
            {users.map((u) => {
              const selected = draftIds.includes(u.id);
              return (
                <button
                  key={u.id}
                  type="button"
                  disabled={saving}
                  className={cn(
                    'flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-accent',
                    selected && 'bg-accent/50',
                  )}
                  onClick={() => {
                    setDraftIds((prev) =>
                      prev.includes(u.id)
                        ? prev.filter((id) => id !== u.id)
                        : [...prev, u.id],
                    );
                  }}
                >
                  <UserAvatar user={u} size="sm" />
                  <span className="min-w-0 flex-1 truncate">{displayName(u)}</span>
                  {selected ? <Check className="h-3.5 w-3.5 shrink-0" /> : null}
                </button>
              );
            })}
            <div className="border-t border-border p-1.5">
              <button
                type="button"
                disabled={saving}
                className="w-full rounded-md bg-primary px-2 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                onClick={() => void applyAssignees(draftIds)}
              >
                Применить
              </button>
            </div>
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
              'flex min-h-7 shrink-0 items-center justify-center p-0 leading-none outline-none focus-visible:ring-2 focus-visible:ring-ring',
              writable && onAssign && !preview
                ? 'cursor-pointer'
                : 'disabled:cursor-default',
            )}
          >
            <AssigneeStack task={task} size="sm" />
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

      <div className="space-y-0.5 text-xs text-muted-foreground">
        <div>Создана {formatDate(task.createdAt)}</div>
        <div>
          {task.status?.name === CLOSED_STATUS_NAME
            ? `Закрыта ${formatDate(task.statusChangedAt)}`
            : `В статусе ${formatDuration(task.statusChangedAt)}`}
        </div>
      </div>
    </div>
  );

  if (!writable || preview || (!onMoveBoard && !onMoveProject)) return card;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{card}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={() => onOpen?.()}>Открыть</ContextMenuItem>
        {onMoveProject ? (
          <ContextMenuItem onSelect={onMoveProject}>
            Перенести в другой проект
          </ContextMenuItem>
        ) : null}
        {onMoveBoard ? (
          <ContextMenuItem onSelect={onMoveBoard}>
            Перенести на другую доску
          </ContextMenuItem>
        ) : null}
      </ContextMenuContent>
    </ContextMenu>
  );
}
