import type { Priority } from '@/lib/api';
import { AppSelect, type SelectOption } from '@/components/ui/select';
import { PRIORITY_LABELS, cn } from '@/lib/utils';

const PRIORITY_DOT: Record<Priority, string> = {
  LOW: 'bg-slate-400',
  MEDIUM: 'bg-blue-500',
  HIGH: 'bg-amber-500',
  CRITICAL: 'bg-red-500',
};

const PRIORITY_ORDER: Priority[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

export function PriorityDot({ priority }: { priority: Priority }) {
  return (
    <span
      className={cn('h-2 w-2 shrink-0 rounded-full', PRIORITY_DOT[priority])}
      aria-hidden
    />
  );
}

export function priorityOptions(includeAll = false): SelectOption[] {
  const items = PRIORITY_ORDER.map((priority) => ({
    value: priority,
    label: PRIORITY_LABELS[priority],
    leading: <PriorityDot priority={priority} />,
  }));
  return includeAll ? [{ value: 'all', label: 'Все' }, ...items] : items;
}

export function PrioritySelect({
  value,
  onChange,
  disabled,
  className,
}: {
  value: Priority | string;
  onChange: (next: Priority) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <AppSelect
      value={value}
      disabled={disabled}
      onValueChange={(v) => onChange(v as Priority)}
      className={cn('w-full text-sm', className)}
      options={priorityOptions()}
    />
  );
}
