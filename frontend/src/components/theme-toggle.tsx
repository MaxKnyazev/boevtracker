import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  applyTheme,
  resolveTheme,
  useThemeStore,
} from '@/store/theme';

export function ThemeSync() {
  const theme = useThemeStore((s) => s.theme);

  useEffect(() => {
    applyTheme(theme);

    if (theme !== 'system') return;

    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme('system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme]);

  return null;
}

function useResolvedTheme() {
  const theme = useThemeStore((s) => s.theme);
  const [resolved, setResolved] = useState(() => resolveTheme(theme));

  useEffect(() => {
    setResolved(resolveTheme(theme));
    if (theme !== 'system') return;

    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setResolved(resolveTheme('system'));
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme]);

  return resolved;
}

export function ThemeToggle({ className }: { className?: string }) {
  const toggleTheme = useThemeStore((s) => s.toggleTheme);
  const resolved = useResolvedTheme();
  const nextLabel = resolved === 'dark' ? 'Светлая тема' : 'Тёмная тема';
  const Icon = resolved === 'dark' ? Sun : Moon;

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn(
        'h-9 w-9 shrink-0 rounded-full text-muted-foreground hover:text-foreground',
        className,
      )}
      title={nextLabel}
      aria-label={nextLabel}
      onClick={toggleTheme}
    >
      <Icon className="h-4 w-4" />
    </Button>
  );
}
