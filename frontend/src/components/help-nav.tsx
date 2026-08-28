import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { BookOpen, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

const HELP_EXPANDED_KEY = 'boevtracker.sidebar.helpExpanded';

const HELP_TABS = [
  { id: 'docs', label: 'Документация', to: '/help?tab=docs' },
  { id: 'notes', label: 'Заметки', to: '/help?tab=notes' },
] as const;

function readHelpExpanded(): boolean {
  try {
    return localStorage.getItem(HELP_EXPANDED_KEY) === '1';
  } catch {
    return false;
  }
}

function writeHelpExpanded(value: boolean) {
  try {
    localStorage.setItem(HELP_EXPANDED_KEY, value ? '1' : '0');
  } catch {
    // ignore
  }
}

function activeHelpTab(
  pathname: string,
  search: string,
): 'docs' | 'notes' | null {
  if (pathname !== '/help') return null;
  const tab = new URLSearchParams(search).get('tab');
  if (tab === 'notes') return 'notes';
  return 'docs';
}

export function HelpNav({ collapsed }: { collapsed: boolean }) {
  const location = useLocation();
  const [open, setOpen] = useState(readHelpExpanded);
  const currentTab = activeHelpTab(location.pathname, location.search);
  const sectionActive = currentTab != null;

  const toggle = () => {
    setOpen((prev) => {
      const next = !prev;
      writeHelpExpanded(next);
      return next;
    });
  };

  if (collapsed) {
    return (
      <NavLink
        to="/help"
        className={() =>
          cn(
            'flex items-center justify-center rounded-lg px-2 py-2.5 text-sm transition-colors',
            sectionActive
              ? 'bg-primary text-primary-foreground'
              : 'text-sidebar-foreground/80 hover:bg-sidebar-accent',
          )
        }
        title="Справка"
      >
        <BookOpen className="h-4 w-4 shrink-0" />
      </NavLink>
    );
  }

  return (
    <div className="flex flex-col gap-0.5">
      <div
        className={cn(
          'flex items-center rounded-lg text-sm transition-colors',
          sectionActive && !open
            ? 'bg-primary text-primary-foreground'
            : sectionActive
              ? 'text-foreground'
              : 'text-sidebar-foreground/80',
        )}
      >
        <NavLink
          to="/help"
          className={cn(
            'flex min-w-0 flex-1 items-center gap-3 rounded-lg px-3 py-2.5 transition-colors',
            sectionActive && !open
              ? 'text-primary-foreground'
              : 'hover:bg-sidebar-accent',
          )}
          title="Справка"
        >
          <BookOpen className="h-4 w-4 shrink-0" />
          <span className="truncate">Справка</span>
        </NavLink>
        <button
          type="button"
          className={cn(
            'mr-1 flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md transition-colors',
            sectionActive && !open
              ? 'hover:bg-primary-foreground/15'
              : 'hover:bg-sidebar-accent',
          )}
          title={open ? 'Скрыть разделы' : 'Показать разделы'}
          aria-expanded={open}
          onClick={toggle}
        >
          <ChevronDown
            className={cn(
              'h-4 w-4 transition-transform',
              open && 'rotate-180',
            )}
          />
        </button>
      </div>

      {open && (
        <div className="ml-3 flex flex-col gap-0.5 border-l border-border pl-2">
          {HELP_TABS.map((item) => {
            const active = currentTab === item.id;
            return (
              <NavLink
                key={item.id}
                to={item.to}
                className={cn(
                  'truncate rounded-lg px-2 py-1.5 text-xs transition-colors',
                  active
                    ? 'bg-primary text-primary-foreground'
                    : 'text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-foreground',
                )}
                title={item.label}
              >
                {item.label}
              </NavLink>
            );
          })}
        </div>
      )}
    </div>
  );
}
