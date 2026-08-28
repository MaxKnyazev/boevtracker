import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  ArrowDown,
  ArrowUp,
  BookMarked,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import {
  api,
  type DocumentationChapter,
  type DocumentationProduct,
} from '@/lib/api';
import { canWrite, useAuthStore } from '@/store/auth';
import { EmptyState } from '@/components/layout';
import {
  MarkdownContent,
  markdownAttachmentImage,
  markdownAttachmentLink,
} from '@/components/markdown-content';
import { MarkdownEditor } from '@/components/markdown-editor';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input, Label } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export function DocumentationPanel() {
  const user = useAuthStore((s) => s.user);
  const writable = canWrite(user?.role);

  const [products, setProducts] = useState<DocumentationProduct[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selected, setSelected] = useState<DocumentationProduct | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeChapterId, setActiveChapterId] = useState<number | null>(null);

  const [productDialog, setProductDialog] = useState<'create' | 'edit' | null>(
    null,
  );
  const [chapterDialog, setChapterDialog] = useState<
    'create' | 'edit' | null
  >(null);
  const [editingChapter, setEditingChapter] =
    useState<DocumentationChapter | null>(null);

  const [productName, setProductName] = useState('');
  const [productDescription, setProductDescription] = useState('');
  const [chapterTitle, setChapterTitle] = useState('');
  const [chapterBody, setChapterBody] = useState('');
  const [saving, setSaving] = useState(false);

  const loadList = async () => {
    setLoading(true);
    try {
      const res = await api.helpProducts();
      setProducts(res.products);
      setError('');
      if (selectedId == null && res.products[0]) {
        setSelectedId(res.products[0].id);
      } else if (
        selectedId != null &&
        !res.products.some((p) => p.id === selectedId)
      ) {
        setSelectedId(res.products[0]?.id ?? null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  };

  const loadDetail = async (id: number) => {
    setDetailLoading(true);
    try {
      const res = await api.helpProduct(id);
      setSelected(res.product);
      setActiveChapterId((prev) => {
        if (prev && res.product.chapters?.some((c) => c.id === prev)) return prev;
        return res.product.chapters?.[0]?.id ?? null;
      });
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка загрузки продукта');
      setSelected(null);
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    void loadList();
  }, []);

  useEffect(() => {
    if (selectedId == null) {
      setSelected(null);
      return;
    }
    void loadDetail(selectedId);
  }, [selectedId]);

  const activeChapter = useMemo(
    () => selected?.chapters?.find((c) => c.id === activeChapterId) ?? null,
    [selected, activeChapterId],
  );

  const openCreateProduct = () => {
    setProductName('');
    setProductDescription('');
    setProductDialog('create');
  };

  const openEditProduct = () => {
    if (!selected) return;
    setProductName(selected.name);
    setProductDescription(selected.description || '');
    setProductDialog('edit');
  };

  const saveProduct = async (e: FormEvent) => {
    e.preventDefault();
    const name = productName.trim();
    if (!name) {
      setError('Укажите название продукта');
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (productDialog === 'create') {
        const res = await api.createHelpProduct({
          name,
          description: productDescription.trim() || undefined,
        });
        setProductDialog(null);
        await loadList();
        setSelectedId(res.product.id);
      } else if (productDialog === 'edit' && selected) {
        await api.updateHelpProduct(selected.id, {
          name,
          description: productDescription,
        });
        setProductDialog(null);
        await loadList();
        await loadDetail(selected.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  };

  const deleteProduct = async () => {
    if (!selected || !writable) return;
    if (!window.confirm(`Удалить продукт «${selected.name}»?`)) return;
    try {
      await api.deleteHelpProduct(selected.id);
      setSelectedId(null);
      await loadList();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось удалить');
    }
  };

  const moveProduct = async (productId: number, dir: -1 | 1) => {
    const index = products.findIndex((p) => p.id === productId);
    const swap = index + dir;
    if (index < 0 || swap < 0 || swap >= products.length) return;
    const ordered = [...products];
    const tmp = ordered[index];
    ordered[index] = ordered[swap];
    ordered[swap] = tmp;
    setProducts(ordered);
    try {
      const res = await api.reorderHelpProducts(ordered.map((p) => p.id));
      setProducts(res.products);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось изменить порядок');
      await loadList();
    }
  };

  const openCreateChapter = () => {
    setEditingChapter(null);
    setChapterTitle('');
    setChapterBody('');
    setChapterDialog('create');
  };

  const openEditChapter = (chapter: DocumentationChapter) => {
    setEditingChapter(chapter);
    setChapterTitle(chapter.title);
    setChapterBody(chapter.body || '');
    setChapterDialog('edit');
  };

  const saveChapter = async (e: FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    const title = chapterTitle.trim();
    if (!title) {
      setError('Укажите название главы');
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (chapterDialog === 'create') {
        const res = await api.createHelpChapter(selected.id, {
          title,
          body: chapterBody.trim() || undefined,
        });
        setChapterDialog(null);
        await loadDetail(selected.id);
        setActiveChapterId(res.chapter.id);
      } else if (chapterDialog === 'edit' && editingChapter) {
        await api.updateHelpChapter(editingChapter.id, {
          title,
          body: chapterBody,
        });
        setChapterDialog(null);
        await loadDetail(selected.id);
        setActiveChapterId(editingChapter.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить главу');
    } finally {
      setSaving(false);
    }
  };

  const deleteChapter = async (chapter: DocumentationChapter) => {
    if (!writable) return;
    if (!window.confirm(`Удалить главу «${chapter.title}»?`)) return;
    try {
      await api.deleteHelpChapter(chapter.id);
      if (selected) await loadDetail(selected.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось удалить главу');
    }
  };

  const moveChapter = async (chapterId: number, dir: -1 | 1) => {
    if (!selected?.chapters) return;
    const chapters = [...selected.chapters];
    const index = chapters.findIndex((c) => c.id === chapterId);
    const swap = index + dir;
    if (index < 0 || swap < 0 || swap >= chapters.length) return;
    const tmp = chapters[index];
    chapters[index] = chapters[swap];
    chapters[swap] = tmp;
    try {
      const res = await api.reorderHelpChapters(
        selected.id,
        chapters.map((c) => c.id),
      );
      setSelected(res.product);
      await loadList();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось изменить порядок');
    }
  };

  const insertFilesIntoProductDescription = async (files: File[]) => {
    if (!selected) return;
    try {
      const res = await api.uploadHelpProductFiles(selected.id, files);
      let next = productDescription;
      for (const file of res.files) {
        const snippet = file.mimeType.startsWith('image/')
          ? markdownAttachmentImage(file)
          : markdownAttachmentLink(file);
        next = `${next}${next.endsWith('\n') || !next ? '' : '\n'}${snippet}\n`;
      }
      setProductDescription(next);
      await loadDetail(selected.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить файл');
    }
  };

  const insertFilesIntoChapter = async (files: File[]) => {
    const chapterId =
      chapterDialog === 'edit' && editingChapter
        ? editingChapter.id
        : chapterDialog === 'create' && selected
          ? null
          : null;

    // For create: need chapter first. Upload after create is awkward.
    // Approach: if editing, upload to chapter. If creating, create chapter first with title then upload.
    try {
      if (chapterDialog === 'edit' && editingChapter) {
        const res = await api.uploadHelpChapterFiles(editingChapter.id, files);
        let next = chapterBody;
        for (const file of res.files) {
          const snippet = file.mimeType.startsWith('image/')
            ? markdownAttachmentImage(file)
            : markdownAttachmentLink(file);
          next = `${next}${next.endsWith('\n') || !next ? '' : '\n'}${snippet}\n`;
        }
        setChapterBody(next);
        if (selected) await loadDetail(selected.id);
        return;
      }

      if (chapterDialog === 'create' && selected) {
        const title = chapterTitle.trim() || 'Новая глава';
        if (!chapterTitle.trim()) setChapterTitle(title);
        const created = await api.createHelpChapter(selected.id, {
          title,
          body: chapterBody.trim() || undefined,
        });
        const res = await api.uploadHelpChapterFiles(created.chapter.id, files);
        let next = chapterBody;
        for (const file of res.files) {
          const snippet = file.mimeType.startsWith('image/')
            ? markdownAttachmentImage(file)
            : markdownAttachmentLink(file);
          next = `${next}${next.endsWith('\n') || !next ? '' : '\n'}${snippet}\n`;
        }
        setChapterBody(next);
        setEditingChapter(created.chapter);
        setChapterDialog('edit');
        setActiveChapterId(created.chapter.id);
        await loadDetail(selected.id);
        await loadList();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить файл');
    }
    void chapterId;
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground">Загрузка…</p>;
  }

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <aside className="space-y-2 rounded-lg border border-border p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-medium">Продукты</div>
            {writable && (
              <Button type="button" size="sm" onClick={openCreateProduct}>
                <Plus className="mr-1 h-3.5 w-3.5" />
                Добавить
              </Button>
            )}
          </div>
          {products.length === 0 ? (
            <p className="text-xs text-muted-foreground">Пока нет продуктов</p>
          ) : (
            <div className="flex flex-col gap-1">
              {products.map((product, index) => {
                const active = product.id === selectedId;
                return (
                  <div
                    key={product.id}
                    className={cn(
                      'group flex items-center gap-1 rounded-md',
                      active ? 'bg-primary/10' : 'hover:bg-accent/50',
                    )}
                  >
                    <button
                      type="button"
                      className={cn(
                        'min-w-0 flex-1 truncate px-2 py-1.5 text-left text-sm',
                        active && 'font-medium text-foreground',
                      )}
                      onClick={() => setSelectedId(product.id)}
                    >
                      {product.name}
                    </button>
                    {writable && (
                      <div className="flex shrink-0 opacity-0 transition group-hover:opacity-100">
                        <button
                          type="button"
                          className="rounded p-1 text-muted-foreground hover:bg-accent disabled:opacity-30"
                          disabled={index === 0}
                          title="Выше"
                          onClick={() => void moveProduct(product.id, -1)}
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          className="rounded p-1 text-muted-foreground hover:bg-accent disabled:opacity-30"
                          disabled={index === products.length - 1}
                          title="Ниже"
                          onClick={() => void moveProduct(product.id, 1)}
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </aside>

        <div className="min-w-0 space-y-4">
          {!selectedId ? (
            <EmptyState
              title="Выберите продукт"
              description="Или создайте первый продукт документации"
              icon={<BookMarked className="h-10 w-10" />}
            />
          ) : detailLoading || !selected ? (
            <p className="text-sm text-muted-foreground">Загрузка…</p>
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold tracking-tight">
                    {selected.name}
                  </h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Глав: {selected.chaptersCount}
                  </p>
                </div>
                {writable && (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={openEditProduct}
                    >
                      <Pencil className="mr-1 h-3.5 w-3.5" />
                      Изменить
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void deleteProduct()}
                    >
                      <Trash2 className="mr-1 h-3.5 w-3.5" />
                      Удалить
                    </Button>
                    <Button type="button" size="sm" onClick={openCreateChapter}>
                      <Plus className="mr-1 h-3.5 w-3.5" />
                      Глава
                    </Button>
                  </div>
                )}
              </div>

              <section className="rounded-lg border border-border p-4">
                <h3 className="mb-2 text-sm font-medium text-muted-foreground">
                  Описание продукта
                </h3>
                <MarkdownContent content={selected.description} />
              </section>

              <div className="grid gap-4 lg:grid-cols-[14rem_minmax(0,1fr)]">
                <nav className="rounded-lg border border-border p-3">
                  <div className="mb-2 text-sm font-medium">Содержание</div>
                  {(selected.toc || []).length === 0 ? (
                    <p className="text-xs text-muted-foreground">Нет глав</p>
                  ) : (
                    <div className="flex flex-col gap-1">
                      {(selected.chapters || selected.toc || []).map(
                        (chapter, index) => {
                          const id = chapter.id;
                          const title = chapter.title;
                          const active = id === activeChapterId;
                          return (
                            <div
                              key={id}
                              className={cn(
                                'group flex items-center gap-1 rounded-md',
                                active ? 'bg-primary/10' : 'hover:bg-accent/50',
                              )}
                            >
                              <button
                                type="button"
                                className={cn(
                                  'min-w-0 flex-1 truncate px-2 py-1.5 text-left text-xs',
                                  active && 'font-medium',
                                )}
                                onClick={() => setActiveChapterId(id)}
                              >
                                {title}
                              </button>
                              {writable && selected.chapters && (
                                <div className="flex shrink-0 opacity-0 transition group-hover:opacity-100">
                                  <button
                                    type="button"
                                    className="rounded p-1 text-muted-foreground hover:bg-accent disabled:opacity-30"
                                    disabled={index === 0}
                                    onClick={() => void moveChapter(id, -1)}
                                  >
                                    <ArrowUp className="h-3 w-3" />
                                  </button>
                                  <button
                                    type="button"
                                    className="rounded p-1 text-muted-foreground hover:bg-accent disabled:opacity-30"
                                    disabled={
                                      index === (selected.chapters?.length ?? 0) - 1
                                    }
                                    onClick={() => void moveChapter(id, 1)}
                                  >
                                    <ArrowDown className="h-3 w-3" />
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        },
                      )}
                    </div>
                  )}
                </nav>

                <section className="min-w-0 rounded-lg border border-border p-4">
                  {!activeChapter ? (
                    <p className="text-sm text-muted-foreground">
                      Выберите главу или создайте новую
                    </p>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <h3 className="text-lg font-semibold">
                          {activeChapter.title}
                        </h3>
                        {writable && (
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => openEditChapter(activeChapter)}
                            >
                              <Pencil className="mr-1 h-3.5 w-3.5" />
                              Редактировать
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => void deleteChapter(activeChapter)}
                            >
                              <Trash2 className="mr-1 h-3.5 w-3.5" />
                              Удалить
                            </Button>
                          </div>
                        )}
                      </div>
                      <MarkdownContent content={activeChapter.body} />
                    </div>
                  )}
                </section>
              </div>
            </>
          )}
        </div>
      </div>

      <Dialog
        open={productDialog != null}
        onOpenChange={(open) => !open && setProductDialog(null)}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {productDialog === 'create'
                ? 'Новый продукт'
                : 'Редактировать продукт'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => void saveProduct(e)} className="space-y-4">
            <div className="space-y-2">
              <Label>Название</Label>
              <Input
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                disabled={saving}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label>Описание (Markdown)</Label>
              <MarkdownEditor
                value={productDescription}
                onChange={setProductDescription}
                disabled={saving}
                rows={12}
                onInsertFiles={
                  productDialog === 'edit' && selected
                    ? insertFilesIntoProductDescription
                    : undefined
                }
              />
              {productDialog === 'create' && (
                <p className="text-[11px] text-muted-foreground">
                  Файлы можно добавить после создания продукта при редактировании.
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setProductDialog(null)}
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

      <Dialog
        open={chapterDialog != null}
        onOpenChange={(open) => !open && setChapterDialog(null)}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {chapterDialog === 'create' ? 'Новая глава' : 'Редактировать главу'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => void saveChapter(e)} className="space-y-4">
            <div className="space-y-2">
              <Label>Название</Label>
              <Input
                value={chapterTitle}
                onChange={(e) => setChapterTitle(e.target.value)}
                disabled={saving}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label>Текст (Markdown)</Label>
              <MarkdownEditor
                value={chapterBody}
                onChange={setChapterBody}
                disabled={saving}
                rows={14}
                onInsertFiles={insertFilesIntoChapter}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setChapterDialog(null)}
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
