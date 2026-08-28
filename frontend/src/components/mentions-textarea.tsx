import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
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

type MenuPos = {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
  openUp: boolean;
};

export const MentionsTextarea = forwardRef<HTMLTextAreaElement, Props>(
  function MentionsTextarea(
    { value, onChange, users, onKeyDown, className, ...props },
    ref,
  ) {
    const localRef = useRef<HTMLTextAreaElement | null>(null);
    const menuRef = useRef<HTMLDivElement | null>(null);
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [mentionStart, setMentionStart] = useState(0);
    const [active, setActive] = useState(0);
    const [menuPos, setMenuPos] = useState<MenuPos | null>(null);

    useImperativeHandle(ref, () => localRef.current as HTMLTextAreaElement);

    const matches = open ? filterMentionUsers(users, query) : [];

    const queryRef = useRef(query);
    queryRef.current = query;
    const openRef = useRef(open);
    openRef.current = open;

    const syncMentionState = (text: string, caret: number) => {
      const mention = getMentionQueryAt(text, caret);
      if (!mention) {
        setOpen(false);
        return;
      }
      const queryChanged = mention.query !== queryRef.current;
      setMentionStart(mention.start);
      setQuery(mention.query);
      setOpen(true);
      if (queryChanged || !openRef.current) {
        setActive(0);
      }
    };

    useLayoutEffect(() => {
      if (!open || matches.length === 0) {
        setMenuPos(null);
        return;
      }
      const el = localRef.current;
      if (!el) return;

      const place = () => {
        const rect = el.getBoundingClientRect();
        const width = Math.max(rect.width, 220);
        const estimatedItem = 40;
        const estimatedHeight = Math.min(
          matches.length * estimatedItem + 8,
          224,
        );
        const gap = 4;
        const spaceBelow = window.innerHeight - rect.bottom - gap - 8;
        const spaceAbove = rect.top - gap - 8;
        const openUp =
          spaceBelow < estimatedHeight && spaceAbove > spaceBelow;
        const maxHeight = Math.max(
          80,
          Math.min(224, openUp ? spaceAbove : spaceBelow),
        );
        const left = Math.min(
          Math.max(8, rect.left),
          window.innerWidth - width - 8,
        );
        const top = openUp ? rect.top - gap : rect.bottom + gap;
        setMenuPos({ top, left, width, maxHeight, openUp });
      };

      place();
      window.addEventListener('resize', place);
      window.addEventListener('scroll', place, true);
      return () => {
        window.removeEventListener('resize', place);
        window.removeEventListener('scroll', place, true);
      };
    }, [open, value, matches.length]);

    useEffect(() => {
      if (active >= matches.length) setActive(0);
    }, [matches.length, active]);

    useEffect(() => {
      if (!open || !menuRef.current) return;
      const activeEl = menuRef.current.querySelector<HTMLElement>(
        `[data-mention-index="${active}"]`,
      );
      activeEl?.scrollIntoView({ block: 'nearest' });
    }, [active, open]);

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

    const menu =
      open && matches.length > 0 && menuPos
        ? createPortal(
            <div
              ref={menuRef}
              data-mention-picker
              className="fixed z-[300] overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
              style={{
                top: menuPos.openUp ? undefined : menuPos.top,
                bottom: menuPos.openUp
                  ? window.innerHeight - menuPos.top
                  : undefined,
                left: menuPos.left,
                width: menuPos.width,
                maxHeight: menuPos.maxHeight,
              }}
            >
              {matches.map((user, index) => (
                <button
                  key={user.id}
                  type="button"
                  data-mention-index={index}
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
            </div>,
            document.body,
          )
        : null;

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
            if (
              e.key === 'ArrowUp' ||
              e.key === 'ArrowDown' ||
              e.key === 'Enter' ||
              e.key === 'Tab' ||
              e.key === 'Escape'
            ) {
              return;
            }
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
        {menu}
      </div>
    );
  },
);

export function MentionHoverCard({
  user,
  children,
  mentionClassName,
}: {
  user: MentionUser;
  children: ReactNode;
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
      {segments.map((seg, i) => {
        if (seg.type === 'mention' && seg.user) {
          return (
            <MentionHoverCard
              key={`${seg.value}-${i}`}
              user={seg.user}
              mentionClassName={mentionClassName}
            >
              {seg.value}
            </MentionHoverCard>
          );
        }
        if (seg.type === 'link' && seg.href) {
          return (
            <a
              key={`l-${i}`}
              href={seg.href}
              target="_blank"
              rel="noopener noreferrer"
              className="break-all underline underline-offset-2 hover:opacity-90"
              onClick={(e) => e.stopPropagation()}
              onDoubleClick={(e) => e.stopPropagation()}
            >
              {seg.value}
            </a>
          );
        }
        return (
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
        );
      })}
    </span>
  );
}
