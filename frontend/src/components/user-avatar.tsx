import { cn } from '@/lib/utils';

export type AvatarUser = {
  firstName?: string | null;
  lastName?: string | null;
  username?: string;
  avatarColor?: string | null;
};

const SIZE_PX = { sm: 28, md: 36, lg: 40 } as const;
const FONT_PX = { sm: 10, md: 12, lg: 14 } as const;

export function getInitials(user?: AvatarUser | null): string {
  if (!user) return '?';
  const first = (user.firstName || '').trim();
  const last = (user.lastName || '').trim();
  if (first || last) {
    return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase() || '?';
  }
  return (user.username || '?').slice(0, 2).toUpperCase();
}

export function displayName(user?: AvatarUser | null): string {
  if (!user) return '—';
  const name = `${user.firstName || ''} ${user.lastName || ''}`.trim();
  return name || user.username || '—';
}

export function UserAvatar({
  user,
  size = 'md',
  className,
  title,
}: {
  user?: AvatarUser | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  title?: string;
}) {
  const px = SIZE_PX[size];
  return (
    <span
      title={title || displayName(user)}
      className={cn(
        'flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold text-white',
        className,
      )}
      style={{
        width: px,
        height: px,
        boxSizing: 'border-box',
        fontSize: FONT_PX[size],
        lineHeight: 1,
        backgroundColor: user?.avatarColor || '#3B82F6',
      }}
    >
      {getInitials(user)}
    </span>
  );
}

export function EmptyAssigneeAvatar({
  size = 'sm',
  className,
  title = 'Назначить исполнителя',
}: {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  title?: string;
}) {
  const px = SIZE_PX[size];
  // border-box: border is inside 28×28, same outer size as filled avatar
  return (
    <span
      title={title}
      className={cn(
        'block shrink-0 rounded-full border-2 border-dashed border-muted-foreground/50 bg-transparent',
        className,
      )}
      style={{
        width: px,
        height: px,
        boxSizing: 'border-box',
        lineHeight: 0,
      }}
    />
  );
}
