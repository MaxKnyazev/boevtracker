import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/layout';
import { cn } from '@/lib/utils';
import { DocumentationPanel } from '@/pages/help-docs';
import { NotesPanel } from '@/pages/help-notes';

type HelpTab = 'docs' | 'notes';

const TAB_STORAGE_KEY = 'boevtracker.help.tab';

function readTab(): HelpTab {
  try {
    const raw = localStorage.getItem(TAB_STORAGE_KEY);
    if (raw === 'docs' || raw === 'notes') return raw;
  } catch {
    // ignore
  }
  return 'docs';
}

export function HelpPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTabState] = useState<HelpTab>(() => {
    const fromUrl = searchParams.get('tab');
    if (fromUrl === 'docs' || fromUrl === 'notes') return fromUrl;
    return readTab();
  });

  const setTab = useCallback(
    (next: HelpTab) => {
      setTabState(next);
      try {
        localStorage.setItem(TAB_STORAGE_KEY, next);
      } catch {
        // ignore
      }
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev);
          params.set('tab', next);
          return params;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  useEffect(() => {
    const fromUrl = searchParams.get('tab');
    if (fromUrl === 'docs' || fromUrl === 'notes') {
      setTabState((current) => (current === fromUrl ? current : fromUrl));
      try {
        localStorage.setItem(TAB_STORAGE_KEY, fromUrl);
      } catch {
        // ignore
      }
      return;
    }
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        if (params.get('tab') === tab) return prev;
        params.set('tab', tab);
        return params;
      },
      { replace: true },
    );
  }, [searchParams, setSearchParams, tab]);

  return (
    <div>
      <PageHeader
        title="Справка"
        description="Документация по продуктам и рабочие заметки"
      />

      <div
        className="mb-4 inline-flex rounded-lg border border-border bg-muted/30 p-1"
        role="tablist"
        aria-label="Разделы справки"
      >
        <TabButton active={tab === 'docs'} onClick={() => setTab('docs')}>
          Документация
        </TabButton>
        <TabButton active={tab === 'notes'} onClick={() => setTab('notes')}>
          Заметки
        </TabButton>
      </div>

      {tab === 'notes' ? <NotesPanel /> : <DocumentationPanel />}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={cn(
        'rounded-md px-3 py-1.5 text-sm transition-colors',
        active
          ? 'bg-background text-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground',
      )}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
