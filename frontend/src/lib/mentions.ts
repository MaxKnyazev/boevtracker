import type { AvatarUser } from '@/components/user-avatar';
import { displayName } from '@/components/user-avatar';

export type MentionUser = AvatarUser & {
  id: number;
  username: string;
};

/** Active @query just before the caret, if any. */
export function getMentionQueryAt(
  text: string,
  caret: number,
): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const match = before.match(/(^|[\s([{«"'])@([^\s@]*)$/u);
  if (!match) return null;
  const start = before.lastIndexOf('@');
  if (start < 0) return null;
  return { start, query: match[2] ?? '' };
}

export function filterMentionUsers(
  users: MentionUser[],
  query: string,
): MentionUser[] {
  const q = query.trim().toLowerCase();
  const sorted = [...users].sort((a, b) =>
    displayName(a).localeCompare(displayName(b), 'ru'),
  );
  if (!q) return sorted.slice(0, 8);
  return sorted
    .filter((u) => {
      const full = `${u.firstName || ''} ${u.lastName || ''}`.trim().toLowerCase();
      return (
        u.username.toLowerCase().includes(q) ||
        (u.firstName || '').toLowerCase().includes(q) ||
        (u.lastName || '').toLowerCase().includes(q) ||
        full.includes(q)
      );
    })
    .slice(0, 8);
}

export function insertMention(
  text: string,
  caret: number,
  mentionStart: number,
  username: string,
): { text: string; caret: number } {
  const before = text.slice(0, mentionStart);
  const after = text.slice(caret);
  const inserted = `@${username} `;
  return {
    text: before + inserted + after,
    caret: before.length + inserted.length,
  };
}

const MENTION_TOKEN = /@[^\s@]+/gu;

/** Split text into plain / mention segments for rendering. */
export function splitMentionSegments(
  text: string,
  users: MentionUser[],
): { type: 'text' | 'mention'; value: string; user?: MentionUser }[] {
  const byUsername = new Map(
    users.map((u) => [u.username.toLowerCase(), u] as const),
  );
  const segments: {
    type: 'text' | 'mention';
    value: string;
    user?: MentionUser;
  }[] = [];
  let last = 0;
  for (const match of text.matchAll(MENTION_TOKEN)) {
    const raw = match[0];
    const index = match.index ?? 0;
    if (index > last) {
      segments.push({ type: 'text', value: text.slice(last, index) });
    }
    const username = raw.slice(1);
    const user = byUsername.get(username.toLowerCase());
    if (user) {
      segments.push({ type: 'mention', value: raw, user });
    } else {
      segments.push({ type: 'text', value: raw });
    }
    last = index + raw.length;
  }
  if (last < text.length) {
    segments.push({ type: 'text', value: text.slice(last) });
  }
  return segments;
}
