import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDuration(from: string | Date): string {
  const start = new Date(from).getTime();
  const diff = Math.max(0, Date.now() - start);
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes} мин`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ч ${minutes % 60} мин`;
  const days = Math.floor(hours / 24);
  return `${days} д ${hours % 24} ч`;
}

/** Business timezone for shift / tracking UI (matches API APP_TIMEZONE). */
export const APP_DISPLAY_TIMEZONE = 'Europe/Moscow';

export function formatDate(value?: string | Date | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('ru-RU', {
    timeZone: APP_DISPLAY_TIMEZONE,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function formatDateTime(value?: string | Date | null): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('ru-RU', {
    timeZone: APP_DISPLAY_TIMEZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatTime(value?: string | Date | null): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('ru-RU', {
    timeZone: APP_DISPLAY_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Human-readable duration from total seconds (e.g. "1 ч 5 мин"). */
export function formatSeconds(
  totalSeconds: number,
  options?: { withSeconds?: boolean },
): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (options?.withSeconds) {
    if (h > 0) return `${h} ч ${m} мин ${sec} сек`;
    if (m > 0) return `${m} мин ${sec} сек`;
    return `${sec} сек`;
  }
  if (h > 0) return `${h} ч ${m} мин`;
  return `${m} мин`;
}

export const PRIORITY_LABELS: Record<string, string> = {
  LOW: 'Низкий',
  MEDIUM: 'Средний',
  HIGH: 'Высокий',
  CRITICAL: 'Критический',
};

/** Matches Laravel / DB varchar(255) for task titles. */
export const MAX_TASK_TITLE_LENGTH = 255;

export const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Администратор',
  DEVELOPER: 'Разработчик',
  READER: 'Читатель',
  PENDING: 'Ожидание подтверждения',
};
