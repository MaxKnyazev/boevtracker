import { useCallback, useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation, useParams } from 'react-router-dom';
import { ChevronDown, FolderKanban, LayoutDashboard } from 'lucide-react';
import { api, type Board } from '@/lib/api';
import {
  PROJECT_ORDER_EVENT,
  sortProjectsByPersonalOrder,
} from '@/lib/project-order';
import { cn } from '@/lib/utils';

const BOARDS_EXPANDED_KEY = 'boevtracker.sidebar.boardsExpanded';
const BOARD_IDS_EXPANDED_KEY = 'boevtracker.sidebar.expandedBoardIds';

function readBoardsExpanded(): boolean {
  try {
    return localStorage.getItem(BOARDS_EXPANDED_KEY) === '1';
  } catch {
    return false;
  }
}

function writeBoardsExpanded(value: boolean) {
  try {
    localStorage.setItem(BOARDS_EXPANDED_KEY, value ? '1' : '0');
  } catch {
    // ignore
  }
}

function readExpandedBoardIds(): Set<number> {
  try {
    const raw = localStorage.getItem(BOARD_IDS_EXPANDED_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(
      parsed.filter((id): id is number => typeof id === 'number'),
    );
  } catch {
    return new Set();
  }
}

function writeExpandedBoardIds(ids: Set<number>) {
  try {
    localStorage.setItem(BOARD_IDS_EXPANDED_KEY, JSON.stringify([...ids]));
  } catch {
    // ignore
  }
}

export function BoardsNav({
  collapsed,
}: {
  collapsed: boolean;
}) {
  const location = useLocation();
  const params = useParams();
  const routeBoardId = params.boardId ? Number(params.boardId) : null;

  const [boards, setBoards] = useState<Board[]>([]);
  const [loading, setLoading] = useState(false);
  const [boardsOpen, setBoardsOpen] = useState(readBoardsExpanded);
  const [expandedBoardIds, setExpandedBoardIds] = useState<Set<number>>(
    readExpandedBoardIds,
  );
  const [orderVersion, setOrderVersion] = useState(0);

  const loadBoards = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.boards();
      setBoards(data.boards);
    } catch {
      // keep previous list
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBoards();
  }, [loadBoards]);

  useEffect(() => {
    const onOrder = () => setOrderVersion((v) => v + 1);
    window.addEventListener(PROJECT_ORDER_EVENT, onOrder);
    return () => window.removeEventListener(PROJECT_ORDER_EVENT, onOrder);
  }, []);

  // Refresh list when returning to the boards index (e.g. after create).
  useEffect(() => {
    if (location.pathname === '/') {
      void loadBoards();
    }
  }, [location.pathname, loadBoards]);

  const activeProjectId = useMemo(() => {
    if (!location.pathname.startsWith('/boards/')) return null;
    const tab = new URLSearchParams(location.search).get('tab');
    if (!tab || tab === 'overview' || !/^\d+$/.test(tab)) return null;
    return Number(tab);
  }, [location.pathname, location.search]);

  const toggleBoards = () => {
    setBoardsOpen((prev) => {
      const next = !prev;
      writeBoardsExpanded(next);
      if (next) void loadBoards();
      return next;
    });
  };

  const toggleBoard = (boardId: number) => {
    setExpandedBoardIds((prev) => {
      const next = new Set(prev);
      if (next.has(boardId)) next.delete(boardId);
      else next.add(boardId);
      writeExpandedBoardIds(next);
      return next;
    });
  };

  if (collapsed) {
    return (
      <NavLink
        to="/"
        end
        className={({ isActive }) =>
          cn(
            'flex items-center justify-center rounded-lg px-2 py-2.5 text-sm transition-colors',
            isActive || location.pathname.startsWith('/boards/')
              ? 'bg-primary text-primary-foreground'
              : 'text-sidebar-foreground/80 hover:bg-sidebar-accent',
          )
        }
        title="Доски"
      >
        <LayoutDashboard className="h-4 w-4 shrink-0" />
      </NavLink>
    );
  }

  const boardsSectionActive =
    location.pathname === '/' || location.pathname.startsWith('/boards/');

  return (
    <div className="flex flex-col gap-0.5">
      <div
        className={cn(
          'flex items-center rounded-lg text-sm transition-colors',
          boardsSectionActive && !boardsOpen
            ? 'bg-primary text-primary-foreground'
            : boardsSectionActive
              ? 'text-foreground'
              : 'text-sidebar-foreground/80',
        )}
      >
        <NavLink
          to="/"
          end
          className={cn(
            'flex min-w-0 flex-1 items-center gap-3 rounded-lg px-3 py-2.5 transition-colors',
            boardsSectionActive && !boardsOpen
              ? 'text-primary-foreground'
              : 'hover:bg-sidebar-accent',
          )}
          title="Доски"
        >
          <LayoutDashboard className="h-4 w-4 shrink-0" />
          <span className="truncate">Доски</span>
        </NavLink>
        <button
          type="button"
          className={cn(
            'mr-1 flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md transition-colors',
            boardsSectionActive && !boardsOpen
              ? 'hover:bg-primary-foreground/15'
              : 'hover:bg-sidebar-accent',
          )}
          title={boardsOpen ? 'Скрыть доски' : 'Показать доски'}
          aria-expanded={boardsOpen}
          onClick={toggleBoards}
        >
          <ChevronDown
            className={cn(
              'h-4 w-4 transition-transform',
              boardsOpen && 'rotate-180',
            )}
          />
        </button>
      </div>

      {boardsOpen && (
        <div className="ml-3 flex flex-col gap-0.5 border-l border-border pl-2">
          {loading && boards.length === 0 ? (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">
              Загрузка…
            </div>
          ) : boards.length === 0 ? (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">
              Нет досок
            </div>
          ) : (
            boards.map((board) => {
              const boardOpen = expandedBoardIds.has(board.id);
              const projects = sortProjectsByPersonalOrder(
                board.projects ?? [],
                board.id,
              );
              const boardActive =
                routeBoardId === board.id && activeProjectId == null;

              return (
                <div key={`${board.id}-${orderVersion}`} className="flex flex-col gap-0.5">
                  <div
                    className={cn(
                      'flex items-center rounded-lg text-sm transition-colors',
                      boardActive
                        ? 'bg-primary text-primary-foreground'
                        : 'text-sidebar-foreground/80',
                    )}
                  >
                    <NavLink
                      to={`/boards/${board.id}`}
                      className={cn(
                        'flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 transition-colors',
                        boardActive
                          ? 'text-primary-foreground'
                          : 'hover:bg-sidebar-accent hover:text-foreground',
                      )}
                      title={board.name}
                    >
                      <FolderKanban className="h-3.5 w-3.5 shrink-0 opacity-80" />
                      <span className="truncate">{board.name}</span>
                    </NavLink>
                    <button
                      type="button"
                      className={cn(
                        'mr-0.5 flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md transition-colors',
                        boardActive
                          ? 'hover:bg-primary-foreground/15'
                          : 'hover:bg-sidebar-accent',
                      )}
                      title={
                        boardOpen ? 'Скрыть проекты' : 'Показать проекты'
                      }
                      aria-expanded={boardOpen}
                      onClick={() => toggleBoard(board.id)}
                    >
                      <ChevronDown
                        className={cn(
                          'h-3.5 w-3.5 transition-transform',
                          boardOpen && 'rotate-180',
                        )}
                      />
                    </button>
                  </div>

                  {boardOpen && (
                    <div className="ml-2 flex flex-col gap-0.5 border-l border-border/70 pl-2">
                      {projects.length === 0 ? (
                        <div className="px-2 py-1 text-xs text-muted-foreground">
                          Нет проектов
                        </div>
                      ) : (
                        projects.map((project) => {
                          const projectActive =
                            routeBoardId === board.id &&
                            activeProjectId === project.id;
                          return (
                            <NavLink
                              key={project.id}
                              to={`/boards/${board.id}?tab=${project.id}`}
                              className={cn(
                                'truncate rounded-lg px-2 py-1.5 text-xs transition-colors',
                                projectActive
                                  ? 'bg-primary text-primary-foreground'
                                  : 'text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-foreground',
                              )}
                              title={project.name}
                            >
                              {project.name}
                            </NavLink>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
