import { cn } from '@/lib/utils';

export type AvatarUser = {
  firstName?: string | null;
  lastName?: string | null;
  username?: string;
  avatarColor?: string | null;
  avatarUrl?: string | null;
};

const SIZE_PX = { sm: 28, md: 36, lg: 40, xl: 80, '2xl': 144 } as const;
const FONT_PX = { sm: 10, md: 12, lg: 14, xl: 24, '2xl': 40 } as const;

/** Gap between avatar edge and the color ring. */
export const AVATAR_RING_GAP = 2;
/** Color ring stroke width. */
export const AVATAR_RING_WIDTH = 1;

export function avatarOuterSize(innerPx: number): number {
  return innerPx + (AVATAR_RING_GAP + AVATAR_RING_WIDTH) * 2;
}

function resolveAvatarSrc(url?: string | null): string | undefined {
  if (!url) return undefined;
  const apiUrl = String(import.meta.env.VITE_API_URL ?? '').trim();
  return apiUrl ? `${apiUrl}${url}` : url;
}

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
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  className?: string;
  title?: string;
}) {
  const px = SIZE_PX[size];
  const outer = avatarOuterSize(px);
  const color = user?.avatarColor || '#3B82F6';
  const src = resolveAvatarSrc(user?.avatarUrl);

  return (
    <span
      title={title || displayName(user)}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full',
        className,
      )}
      style={{
        width: outer,
        height: outer,
        padding: AVATAR_RING_GAP,
        border: `${AVATAR_RING_WIDTH}px solid ${color}`,
        boxSizing: 'border-box',
      }}
    >
      <span
        className="flex items-center justify-center overflow-hidden rounded-full font-semibold text-white"
        style={{
          width: px,
          height: px,
          boxSizing: 'border-box',
          fontSize: FONT_PX[size],
          lineHeight: 1,
          backgroundColor: src ? undefined : color,
        }}
      >
        {src ? (
          <img
            src={src}
            alt=""
            className="block h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          getInitials(user)
        )}
      </span>
    </span>
  );
}

export function EmptyAssigneeAvatar({
  size = 'sm',
  className,
  title = 'Назначить исполнителя',
}: {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  title?: string;
}) {
  const px = SIZE_PX[size];
  const outer = avatarOuterSize(px);
  return (
    <span
      title={title}
      className={cn(
        'block shrink-0 rounded-full border-2 border-dashed border-muted-foreground/50 bg-transparent',
        className,
      )}
      style={{
        width: outer,
        height: outer,
        boxSizing: 'border-box',
        lineHeight: 0,
      }}
    />
  );
}
