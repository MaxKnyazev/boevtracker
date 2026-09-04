/** Personal project order per board (localStorage). */

export const PROJECT_ORDER_EVENT = 'boevtracker:project-order';

function projectOrderKey(boardId: string | number): string {
  return `boevtracker.board.${boardId}.projectOrder`;
}

export function readProjectOrder(boardId: string | number | undefined): number[] {
  if (boardId == null || boardId === '') return [];
  try {
    const raw = localStorage.getItem(projectOrderKey(boardId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (id): id is number => typeof id === 'number' && Number.isFinite(id),
    );
  } catch {
    return [];
  }
}

export function writeProjectOrder(
  boardId: string | number | undefined,
  orderedIds: number[],
): void {
  if (boardId == null || boardId === '') return;
  try {
    localStorage.setItem(projectOrderKey(boardId), JSON.stringify(orderedIds));
    window.dispatchEvent(
      new CustomEvent(PROJECT_ORDER_EVENT, {
        detail: { boardId: Number(boardId) },
      }),
    );
  } catch {
    // ignore
  }
}

/**
 * Apply a saved personal order to the current project id list.
 * Unknown (deleted) ids are dropped; new ids are appended in `fallbackIds` order.
 */
export function mergeProjectOrder(
  savedOrder: number[],
  fallbackIds: number[],
): number[] {
  if (fallbackIds.length === 0) return [];
  if (savedOrder.length === 0) return [...fallbackIds];

  const remaining = new Set(fallbackIds);
  const ordered: number[] = [];
  for (const id of savedOrder) {
    if (!remaining.has(id)) continue;
    ordered.push(id);
    remaining.delete(id);
  }
  for (const id of fallbackIds) {
    if (remaining.has(id)) ordered.push(id);
  }
  return ordered;
}

export function sortProjectsByPersonalOrder<T extends { id: number; order?: number }>(
  projects: T[],
  boardId: string | number | undefined,
): T[] {
  const fallback = [...projects]
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.id - b.id)
    .map((p) => p.id);
  const order = mergeProjectOrder(readProjectOrder(boardId), fallback);
  const byId = new Map(projects.map((p) => [p.id, p]));
  return order.map((id) => byId.get(id)).filter((p): p is T => !!p);
}
