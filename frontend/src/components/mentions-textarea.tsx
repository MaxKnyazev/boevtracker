import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type TextareaHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';
import { Textarea } from '@/components/ui/input';
import { UserAvatar, displayName } from '@/components/user-avatar';
import { cn } from '@/lib/utils';
import {
  filterMentionUsers,
  getMentionQueryAt,
  insertMention,
  splitMentionSegments,
  type MentionUser,
} from '@/lib/mentions';

type Props = Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  'value' | 'onChange'
> & {
  value: string;
  onChange: (value: string) => void;
  users: MentionUser[];
};

export const MentionsTextarea = forwardRef<HTMLTextAreaElement, Props>(
  function MentionsTextarea(
    { value, onChange, users, onKeyDown, className, ...props },
    ref,
  ) {
    const localRef = useRef<HTMLTextAreaElement | null>(null);
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [mentionStart, setMentionStart] = useState(0);
    const [active, setActive] = useState(0);
    const [openUp, setOpenUp] = useState(false);

    useImperativeHandle(ref, () => localRef.current as HTMLTextAreaElement);

    const matches = open ? filterMentionUsers(users, query) : [];

    const syncMentionState = (text: string, caret: number) => {
      const mention = getMentionQueryAt(text, caret);
      if (!mention) {
        setOpen(false);
        return;
      }
      setMentionStart(mention.start);
      setQuery(mention.query);
      setOpen(true);
      setActive(0);
    };

    useLayoutEffect(() => {
      if (!open) return;
      const el = localRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setOpenUp(rect.bottom + 220 > window.innerHeight);
    }, [open, value, matches.length]);

    useEffect(() => {
      if (active >= matches.length) setActive(0);
    }, [matches.length, active]);

    const applyUser = (user: MentionUser) => {
      const el = localRef.current;
      const caret = el?.selectionStart ?? value.length;
      const next = insertMention(value, caret, mentionStart, user.username);
      onChange(next.text);
      setOpen(false);
      requestAnimationFrame(() => {
        const node = localRef.current;
        if (!node) return;
        node.focus();
        node.setSelectionRange(next.caret, next.caret);
      });
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (open && matches.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setActive((i) => (i + 1) % matches.length);
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setActive((i) => (i - 1 + matches.length) % matches.length);
          return;
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault();
          applyUser(matches[active] ?? matches[0]!);
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          setOpen(false);
          return;
        }
      }
      onKeyDown?.(e);
    };

    return (
      <div className="relative min-w-0 flex-1">
        <Textarea
          {...props}
          ref={localRef}
          value={value}
          className={cn('w-full', className)}
          onChange={(e) => {
            const next = e.target.value;
            const caret = e.target.selectionStart ?? next.length;
            onChange(next);
            syncMentionState(next, caret);
          }}
          onKeyUp={(e) => {
            const el = e.currentTarget;
            syncMentionState(el.value, el.selectionStart ?? el.value.length);
          }}
          onClick={(e) => {
            const el = e.currentTarget;
            syncMentionState(el.value, el.selectionStart ?? el.value.length);
            props.onClick?.(e);
          }}
          onBlur={() => {
            window.setTimeout(() => setOpen(false), 120);
          }}
          onFocus={(e) => {
            const el = e.currentTarget;
            syncMentionState(el.value, el.selectionStart ?? el.value.length);
            props.onFocus?.(e);
          }}
          onKeyDown={handleKeyDown}
        />

        {open && matches.length > 0 && (
          <div
            className={cn(
              'absolute left-0 z-[80] max-h-56 min-w-[220px] overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md',
              openUp ? 'bottom-full mb-1' : 'top-full mt-1',
            )}
            style={{ width: 'max(100%, 220px)' }}
          >
            {matches.map((user, index) => (
              <button
                key={user.id}
                type="button"
                className={cn(
                  'flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none',
                  index === active
                    ? 'bg-accent text-accent-foreground'
                    : 'hover:bg-accent/60',
                )}
                onMouseEnter={() => setActive(index)}
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  applyUser(user);
                }}
              >
                <UserAvatar user={user} size="sm" />
                <span className="min-w-0 flex-1 truncate font-medium">
                  {displayName(user)}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  @{user.username}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  },
);

function MentionHoverCard({
  user,
  children,
  mentionClassName,
}: {
  user: MentionUser;
  children: string;
  mentionClassName?: string;
}) {
  const triggerRef = useRef<HTMLSpanElement | null>(null);
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const show = () => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPos({
      top: rect.top - 8,
      left: rect.left + rect.width / 2,
    });
    setVisible(true);
  };

  return (
    <>
      <span
        ref={triggerRef}
        className={cn(
          'cursor-default rounded px-0.5 font-semibold text-primary',
          mentionClassName,
        )}
        onMouseEnter={show}
        onMouseLeave={() => setVisible(false)}
      >
        {children}
      </span>
      {visible &&
        pos &&
        createPortal(
          <span
            className="pointer-events-none fixed z-[400] flex -translate-x-1/2 -translate-y-full items-center gap-2 rounded-md border border-border bg-popover px-2 py-1.5 text-sm text-popover-foreground shadow-md"
            style={{ top: pos.top, left: pos.left }}
            role="tooltip"
          >
            <UserAvatar user={user} size="sm" />
            <span className="whitespace-nowrap font-medium">
              {displayName(user)}
            </span>
          </span>,
          document.body,
        )}
    </>
  );
}

export function MentionText({
  text,
  users,
  className,
  mentionClassName,
}: {
  text: string;
  users: MentionUser[];
  className?: string;
  mentionClassName?: string;
}) {
  const segments = splitMentionSegments(text, users);
  return (
    <span className={className}>
      {segments.map((seg, i) =>
        seg.type === 'mention' && seg.user ? (
          <MentionHoverCard
            key={`${seg.value}-${i}`}
            user={seg.user}
            mentionClassName={mentionClassName}
          >
            {seg.value}
          </MentionHoverCard>
        ) : (
          <span
            key={`t-${i}`}
            className={
              seg.type === 'mention'
                ? cn(
                    'rounded px-0.5 font-semibold text-primary',
                    mentionClassName,
                  )
                : undefined
            }
          >
            {seg.value}
          </span>
        ),
      )}
    </span>
  );
}
