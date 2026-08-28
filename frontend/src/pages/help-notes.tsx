import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Pencil, Pin, PinOff, Plus, StickyNote, Trash2 } from 'lucide-react';
import { api, type HelpNote } from '@/lib/api';
import { canWrite, useAuthStore } from '@/store/auth';
import { EmptyState } from '@/components/layout';
import { MarkdownContent } from '@/components/markdown-content';
import { MarkdownEditor } from '@/components/markdown-editor';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input, Label } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export function NotesPanel() {
  const user = useAuthStore((s) => s.user);
  const writable = canWrite(user?.role);

  const [notes, setNotes] = useState<HelpNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [dialog, setDialog] = useState<'create' | 'edit' | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.helpNotes();
      setNotes(res.notes);
      setError('');
      if (selectedId == null && res.notes[0]) {
        setSelectedId(res.notes[0].id);
      } else if (
        selectedId != null &&
        !res.notes.some((n) => n.id === selectedId)
      ) {
        setSelectedId(res.notes[0]?.id ?? null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const selected = useMemo(
    () => notes.find((n) => n.id === selectedId) ?? null,
    [notes, selectedId],
  );

  const pinnedNotes = useMemo(() => notes.filter((n) => n.pinned), [notes]);
  const otherNotes = useMemo(() => notes.filter((n) => !n.pinned), [notes]);

  const openCreate = () => {
    setTitle('');
    setBody('');
    setDialog('create');
  };

  const openEdit = (note: HelpNote) => {
    setTitle(note.title);
    setBody(note.body || '');
    setSelectedId(note.id);
    setDialog('edit');
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) {
      setError('Укажите название заметки');
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (dialog === 'create') {
        const res = await api.createHelpNote({
          title: trimmed,
          body: body.trim() || undefined,
        });
        setDialog(null);
        await load();
        setSelectedId(res.note.id);
      } else if (dialog === 'edit' && selectedId != null) {
        await api.updateHelpNote(selectedId, {
          title: trimmed,
          body,
        });
        setDialog(null);
        await load();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  };

  const togglePin = async (note: HelpNote) => {
    try {
      await api.updateHelpNote(note.id, { pinned: !note.pinned });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось закрепить');
    }
  };

  const remove = async (note: HelpNote) => {
    if (!window.confirm(`Удалить заметку «${note.title}»?`)) return;
    try {
      await api.deleteHelpNote(note.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось удалить');
    }
  };

  const onDragEnd = async (event: DragEndEvent, group: 'pinned' | 'other') => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const list = group === 'pinned' ? pinnedNotes : otherNotes;
    const oldIndex = list.findIndex((n) => n.id === Number(active.id));
    const newIndex = list.findIndex((n) => n.id === Number(over.id));
    if (oldIndex < 0 || newIndex < 0) return;

    const nextGroup = arrayMove(list, oldIndex, newIndex);
    const nextNotes =
      group === 'pinned'
        ? [...nextGroup, ...otherNotes]
        : [...pinnedNotes, ...nextGroup];
    setNotes(nextNotes);

    try {
      const res = await api.reorderHelpNotes(nextNotes.map((n) => n.id));
      setNotes(res.notes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось изменить порядок');
      await load();
    }
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground">Загрузка…</p>;
  }

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Заметки с Markdown. Можно закреплять и менять порядок перетаскиванием.
        </p>
        {writable && (
          <Button type="button" onClick={openCreate}>
            <Plus className="mr-1.5 h-4 w-4" />
            Новая заметка
          </Button>
        )}
      </div>

      {notes.length === 0 ? (
        <EmptyState
          title="Нет заметок"
          description="Создайте первую заметку"
          icon={<StickyNote className="h-10 w-10" />}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
          <aside className="space-y-4 rounded-lg border border-border p-3">
            {pinnedNotes.length > 0 && (
              <div className="space-y-1">
                <div className="px-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Закреплённые
                </div>
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={(e) => void onDragEnd(e, 'pinned')}
                >
                  <SortableContext
                    items={pinnedNotes.map((n) => n.id)}
                    strategy={verticalListSortingStrategy}
                    disabled={!writable}
                  >
                    {pinnedNotes.map((note) => (
                      <SortableNoteItem
                        key={note.id}
                        note={note}
                        active={note.id === selectedId}
                        writable={writable}
                        onSelect={() => setSelectedId(note.id)}
                        onTogglePin={() => void togglePin(note)}
                      />
                    ))}
                  </SortableContext>
                </DndContext>
              </div>
            )}

            <div className="space-y-1">
              {pinnedNotes.length > 0 && (
                <div className="px-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Остальные
                </div>
              )}
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={(e) => void onDragEnd(e, 'other')}
              >
                <SortableContext
                  items={otherNotes.map((n) => n.id)}
                  strategy={verticalListSortingStrategy}
                  disabled={!writable}
                >
                  {otherNotes.map((note) => (
                    <SortableNoteItem
                      key={note.id}
                      note={note}
                      active={note.id === selectedId}
                      writable={writable}
                      onSelect={() => setSelectedId(note.id)}
                      onTogglePin={() => void togglePin(note)}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            </div>
          </aside>

          <section className="min-w-0 rounded-lg border border-border p-4">
            {!selected ? (
              <p className="text-sm text-muted-foreground">Выберите заметку</p>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2 className="text-lg font-semibold">{selected.title}</h2>
                    {selected.pinned && (
                      <span className="mt-1 inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                        <Pin className="h-3 w-3" />
                        Закреплена
                      </span>
                    )}
                  </div>
                  {writable && (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void togglePin(selected)}
                      >
                        {selected.pinned ? (
                          <>
                            <PinOff className="mr-1 h-3.5 w-3.5" />
                            Открепить
                          </>
                        ) : (
                          <>
                            <Pin className="mr-1 h-3.5 w-3.5" />
                            Закрепить
                          </>
                        )}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => openEdit(selected)}
                      >
                        <Pencil className="mr-1 h-3.5 w-3.5" />
                        Изменить
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void remove(selected)}
                      >
                        <Trash2 className="mr-1 h-3.5 w-3.5" />
                        Удалить
                      </Button>
                    </div>
                  )}
                </div>
                <MarkdownContent content={selected.body} />
              </div>
            )}
          </section>
        </div>
      )}

      <Dialog open={dialog != null} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {dialog === 'create' ? 'Новая заметка' : 'Редактировать заметку'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => void save(e)} className="space-y-4">
            <div className="space-y-2">
              <Label>Название</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={saving}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label>Текст (Markdown)</Label>
              <MarkdownEditor
                value={body}
                onChange={setBody}
                disabled={saving}
                rows={12}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialog(null)}
                disabled={saving}
              >
                Отмена
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Сохранение…' : 'Сохранить'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SortableNoteItem({
  note,
  active,
  writable,
  onSelect,
  onTogglePin,
}: {
  note: HelpNote;
  active: boolean;
  writable: boolean;
  onSelect: () => void;
  onTogglePin: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: note.id, disabled: !writable });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={cn(
        'flex items-center gap-1 rounded-md',
        active ? 'bg-primary/10' : 'hover:bg-accent/50',
        isDragging && 'opacity-70',
      )}
    >
      {writable && (
        <button
          type="button"
          className="cursor-grab touch-none rounded p-1 text-muted-foreground hover:bg-accent active:cursor-grabbing"
          title="Перетащить"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
      )}
      <button
        type="button"
        className={cn(
          'min-w-0 flex-1 truncate px-1 py-1.5 text-left text-sm',
          active && 'font-medium',
        )}
        onClick={onSelect}
      >
        {note.pinned && (
          <Pin className="mr-1 inline h-3 w-3 text-amber-600 dark:text-amber-400" />
        )}
        {note.title}
      </button>
      {writable && (
        <button
          type="button"
          className="rounded p-1 text-muted-foreground hover:bg-accent"
          title={note.pinned ? 'Открепить' : 'Закрепить'}
          onClick={onTogglePin}
        >
          {note.pinned ? (
            <PinOff className="h-3.5 w-3.5" />
          ) : (
            <Pin className="h-3.5 w-3.5" />
          )}
        </button>
      )}
    </div>
  );
}
