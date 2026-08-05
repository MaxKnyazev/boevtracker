/** Bright, distinct palette for user avatars */
export const AVATAR_COLORS = [
  '#EF4444', // red
  '#F97316', // orange
  '#EAB308', // yellow
  '#22C55E', // green
  '#14B8A6', // teal
  '#06B6D4', // cyan
  '#3B82F6', // blue
  '#6366F1', // indigo
  '#8B5CF6', // violet
  '#D946EF', // fuchsia
  '#EC4899', // pink
  '#F43F5E', // rose
  '#84CC16', // lime
  '#0EA5E9', // sky
  '#A855F7', // purple
  '#10B981', // emerald
] as const;

export async function pickAvatarColor(
  usedColors: string[],
): Promise<string> {
  const unused = AVATAR_COLORS.filter((c) => !usedColors.includes(c));
  const pool = unused.length > 0 ? unused : [...AVATAR_COLORS];
  return pool[Math.floor(Math.random() * pool.length)];
}

export const userPublicSelect = {
  id: true,
  username: true,
  firstName: true,
  lastName: true,
  avatarColor: true,
  role: true,
} as const;
