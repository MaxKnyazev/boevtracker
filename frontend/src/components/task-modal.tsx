import {
  FormEvent,
  useEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import {
  Check,
  Download,
  FileIcon,
  Paperclip,
  Pencil,
  Plus,
  Send,
  UploadCloud,
  X,
} from 'lucide-react';
import { api, type Attachment, type Project, type Task, type User } from '@/lib/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input, Label, Textarea } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { AppSelect } from '@/components/ui/select';
import { PRIORITY_LABELS, formatDate, formatDuration, cn } from '@/lib/utils';
import {
  UserAvatar,
  displayName,
} from '@/components/user-avatar';
import { FileDropZone, MAX_UPLOAD_FILE_SIZE } from '@/components/file-drop-zone';
import { useAuthStore } from '@/store/auth';

function formatChatTime(value: string | Date): string {
  return new Date(value).toLocaleString('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatFileSize(size: number): string {
  if (size < 1024) return `${size} Б`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} КБ`;
  return `${(size / (1024 * 1024)).toFixed(1)} МБ`;
}

async function downloadAttachment(file: Attachment) {
  const res = await fetch(api.attachmentUrl(file.id, true), {
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Не удалось скачать файл');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.originalName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function useAuthObjectUrl(attachmentId: number | null, enabled: boolean) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || attachmentId == null) {
      setUrl(null);
      return;
    }

    let cancelled = false;
    let objectUrl: string | null = null;

    void fetch(api.attachmentUrl(attachmentId), { credentials: 'include' })
      .then((res) => {
        if (!res.ok) throw new Error('fail');
        return res.blob();
      })
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        if (!cancelled) setUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setUrl(null);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [attachmentId, enabled]);

  return url;
}

export function TaskModal({
  taskId,
  users,
  project,
  writable,
  onClose,
  onChanged,
}: {
  taskId: number;
  users: User[];
  project: Project | null;
  writable: boolean;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const me = useAuthStore((s) => s.user);
  const [task, setTask] = useState<Task | null>(null);
  const [comment, setComment] = useState('');
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [lightboxFile, setLightboxFile] = useState<Attachment | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [editingDescription, setEditingDescription] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatFileInputRef = useRef<HTMLInputElement | null>(null);

  const load = async () => {
    try {
      const data = await api.task(taskId);
      setTask(data.task);
      setError('');
      setEditingTitle(false);
      setEditingDescription(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    }
  };

  useEffect(() => {
    void load();
  }, [taskId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [task?.comments?.length]);

  const saveField = async (data: Record<string, unknown>) => {
    if (!writable) return;
    setSaving(true);
    try {
      const res = await api.updateTask(taskId, data);
      setTask(res.task);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  const take = async () => {
    const res = await api.takeTask(taskId);
    setTask(res.task);
    await onChanged();
  };

  const sendComment = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!writable || (!comment.trim() && pendingFiles.length === 0)) return;
    setSending(true);
    try {
      const body =
        comment.trim() ||
        (pendingFiles.length === 1
          ? pendingFiles[0].name
          : `Вложения (${pendingFiles.length})`);
      const res = await api.addComment(taskId, body);
      if (pendingFiles.length > 0) {
        const oversized = pendingFiles.find(
          (f) => f.size > MAX_UPLOAD_FILE_SIZE,
        );
        if (oversized) {
          setError(`Файл «${oversized.name}» больше 100 МБ`);
        } else {
          await api.uploadCommentFiles(res.comment.id, pendingFiles);
        }
      }
      setComment('');
      setPendingFiles([]);
      await load();
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка отправки');
    } finally {
      setSending(false);
    }
  };

  const filterFiles = (files: File[]) => {
    const ok: File[] = [];
    for (const file of files) {
      if (file.size > MAX_UPLOAD_FILE_SIZE) {
        setError(`Файл «${file.name}» больше 100 МБ`);
        continue;
      }
      ok.push(file);
    }
    return ok;
  };

  const uploadTaskFiles = async (incoming: File[]) => {
    const files = filterFiles(incoming);
    if (!files.length) return;
    setUploadingFiles(true);
    try {
      await api.uploadTaskFiles(taskId, files);
      await load();
      await onChanged();
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка загрузки файла');
    } finally {
      setUploadingFiles(false);
    }
  };

  const addPendingFiles = (incoming: File[]) => {
    const files = filterFiles(incoming);
    if (!files.length) return;
    setPendingFiles((prev) => {
      const names = new Set(prev.map((f) => `${f.name}:${f.size}`));
      const next = [...prev];
      for (const file of files) {
        const key = `${file.name}:${file.size}`;
        if (!names.has(key)) {
          names.add(key);
          next.push(file);
        }
      }
      return next;
    });
  };

  if (!task) {
    return (
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Загрузка задачи...</DialogTitle>
          </DialogHeader>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </DialogContent>
      </Dialog>
    );
  }

  const comments = task.comments || [];

  const handleDialogOpenChange = (open: boolean) => {
    if (!open) {
      if (lightboxFile) {
        setLightboxFile(null);
        return;
      }
      onClose();
    }
  };

  const blockOutsideWhileLightbox = (
    event: Event | { preventDefault: () => void; target: EventTarget | null },
  ) => {
    if (lightboxFile) {
      event.preventDefault();
      return;
    }
    const target = event.target as HTMLElement | null;
    if (target?.closest?.('[data-image-lightbox]')) {
      event.preventDefault();
    }
  };

  return (
    <>
      <Dialog open onOpenChange={handleDialogOpenChange}>
        <DialogContent
          className="max-h-[90vh] max-w-4xl overflow-hidden p-0"
          onPointerDownOutside={blockOutsideWhileLightbox}
          onInteractOutside={blockOutsideWhileLightbox}
          onFocusOutside={blockOutsideWhileLightbox}
          onEscapeKeyDown={(e) => {
            if (lightboxFile) {
              e.preventDefault();
              setLightboxFile(null);
            }
          }}
        >
        <div className="max-h-[90vh] overflow-y-auto p-6 [scrollbar-gutter:stable]">
          <DialogHeader>
            <DialogTitle className="sr-only">{task.title}</DialogTitle>
            <div className="flex min-h-11 items-start gap-2 pr-8">
              {writable && editingTitle ? (
                <>
                  <Input
                    value={titleDraft}
                    onChange={(e) => setTitleDraft(e.target.value)}
                    className="h-11 flex-1 text-lg font-semibold"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        void (async () => {
                          const next = titleDraft.trim();
                          if (!next) return;
                          await saveField({ title: next });
                          setEditingTitle(false);
                        })();
                      }
                      if (e.key === 'Escape') {
                        setEditingTitle(false);
                      }
                    }}
                  />
                  <Button
                    type="button"
                    size="icon"
                    className="h-11 w-11 shrink-0"
                    disabled={saving || !titleDraft.trim()}
                    title="Принять"
                    onClick={() => {
                      void (async () => {
                        const next = titleDraft.trim();
                        if (!next) return;
                        await saveField({ title: next });
                        setEditingTitle(false);
                      })();
                    }}
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-11 w-11 shrink-0"
                    title="Отменить"
                    onClick={() => setEditingTitle(false)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </>
              ) : (
                <>
                  <h2 className="min-w-0 flex-1 py-2 text-lg font-semibold leading-snug">
                    {task.title}
                  </h2>
                  {writable && (
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-11 w-11 shrink-0"
                      title="Редактировать название"
                      onClick={() => {
                        setTitleDraft(task.title);
                        setEditingTitle(true);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  )}
                </>
              )}
            </div>
          </DialogHeader>

          {error && <p className="mt-2 text-sm text-destructive">{error}</p>}

          <div className="mt-4 grid gap-4 md:grid-cols-[1fr_220px]">
            <div className="space-y-4 min-w-0">
              <div className="space-y-2">
                <div className="flex h-8 items-center justify-between gap-2">
                  <Label className="mb-0">Описание</Label>
                  {writable &&
                    !editingDescription &&
                    !!task.description?.trim() && (
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        title="Редактировать описание"
                        onClick={() => {
                          setDescriptionDraft(task.description || '');
                          setEditingDescription(true);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    )}
                </div>

                <div className="min-h-[192px]">
                  {writable && editingDescription ? (
                    <div className="flex gap-2">
                      <Textarea
                        value={descriptionDraft}
                        onChange={(e) => setDescriptionDraft(e.target.value)}
                        className="min-h-[192px] flex-1 resize-y"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') setEditingDescription(false);
                        }}
                      />
                      <div className="flex shrink-0 flex-col gap-2">
                        <Button
                          type="button"
                          size="icon"
                          className="h-9 w-9"
                          disabled={saving}
                          title="Принять"
                          onClick={() => {
                            void (async () => {
                              await saveField({
                                description: descriptionDraft.trim() || null,
                              });
                              setEditingDescription(false);
                            })();
                          }}
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-9 w-9"
                          title="Отменить"
                          onClick={() => setEditingDescription(false)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ) : task.description?.trim() ? (
                    <div className="min-h-[192px] px-1 py-0.5 text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground">
                      {task.description}
                    </div>
                  ) : writable ? (
                    <button
                      type="button"
                      className="flex min-h-[192px] w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-border text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:bg-accent/30 hover:text-foreground"
                      onClick={() => {
                        setDescriptionDraft('');
                        setEditingDescription(true);
                      }}
                    >
                      <Plus className="h-4 w-4" />
                      Добавить описание
                    </button>
                  ) : (
                    <div className="flex min-h-[192px] items-center text-sm text-muted-foreground">
                      Без описания
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Файлы задачи</Label>
                {writable && (
                  <FileDropZone
                    disabled={uploadingFiles}
                    onFiles={(files) => void uploadTaskFiles(files)}
                    className="min-h-[88px]"
                  >
                    <UploadCloud className="h-5 w-5 text-muted-foreground" />
                    <div className="text-sm">
                      {uploadingFiles
                        ? 'Загрузка...'
                        : 'Перетащите файлы сюда или нажмите для выбора'}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      Можно несколько файлов, до 100 МБ каждый
                    </div>
                  </FileDropZone>
                )}
                <FileGallery
                  files={task.files || []}
                  emptyText={
                    writable ? undefined : 'К задаче пока нет файлов'
                  }
                  lightboxFile={lightboxFile}
                  onOpenLightbox={setLightboxFile}
                />
              </div>

              <div className="flex h-[380px] flex-col overflow-hidden rounded-xl border border-border bg-background/40">
                <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2">
                  <h3 className="text-sm font-medium">Комментарии</h3>
                  <span className="text-xs text-muted-foreground">
                    {comments.length}
                  </span>
                </div>

                <div className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
                  {comments.length === 0 ? (
                    <div className="flex h-full min-h-[160px] items-center justify-center text-center text-sm text-muted-foreground">
                      Пока нет сообщений
                    </div>
                  ) : (
                    comments.map((c) => {
                      const mine = me?.id === c.author?.id;
                      return (
                        <div
                          key={c.id}
                          className={cn(
                            'flex gap-2',
                            mine ? 'flex-row-reverse' : 'flex-row',
                          )}
                        >
                          <UserAvatar user={c.author} size="sm" />
                          <div
                            className={cn(
                              'max-w-[85%] rounded-2xl px-3 py-2',
                              mine
                                ? 'rounded-tr-md bg-primary text-primary-foreground'
                                : 'rounded-tl-md bg-muted/60',
                            )}
                          >
                            <div
                              className={cn(
                                'mb-1 flex items-baseline gap-2 text-[11px]',
                                mine
                                  ? 'text-primary-foreground/80'
                                  : 'text-muted-foreground',
                              )}
                            >
                              <span className="font-medium">
                                {displayName(c.author)}
                              </span>
                              <span>{formatChatTime(c.createdAt)}</span>
                            </div>
                            <p className="whitespace-pre-wrap text-sm leading-relaxed">
                              {c.body}
                            </p>
                            {(c.files || []).length > 0 && (
                              <div className="mt-2">
                                <FileGallery
                                  files={c.files || []}
                                  compact
                                  onDark={mine}
                                  lightboxFile={lightboxFile}
                                  onOpenLightbox={setLightboxFile}
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={chatEndRef} />
                </div>

                {writable ? (
                  <FileDropZone
                    disabled={sending}
                    onFiles={addPendingFiles}
                    inputRef={chatFileInputRef}
                    disableClickOpen
                    className="items-stretch justify-start rounded-none border-0 border-t border-border bg-card/80 p-3 text-left hover:bg-card/80"
                    activeClassName="bg-primary/10"
                  >
                    {pendingFiles.length > 0 && (
                      <div className="mb-2 flex flex-wrap gap-1.5">
                        {pendingFiles.map((file, index) => (
                          <div
                            key={`${file.name}-${file.size}-${index}`}
                            className="flex max-w-full items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-xs"
                          >
                            <FileIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            <span className="min-w-0 truncate">{file.name}</span>
                            <button
                              type="button"
                              className="cursor-pointer rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                              onClick={(e) => {
                                e.stopPropagation();
                                setPendingFiles((prev) =>
                                  prev.filter((_, i) => i !== index),
                                );
                              }}
                              title="Убрать файл"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    <form onSubmit={(e) => void sendComment(e)}>
                      <div className="flex items-end gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-10 w-10 shrink-0"
                          title="Прикрепить файлы"
                          onClick={() => chatFileInputRef.current?.click()}
                        >
                          <Paperclip className="h-4 w-4" />
                        </Button>
                        <Textarea
                          placeholder="Написать сообщение или перетащить файлы..."
                          value={comment}
                          onChange={(e) => setComment(e.target.value)}
                          rows={2}
                          className="min-h-[40px] flex-1 resize-none"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              void sendComment();
                            }
                          }}
                        />
                        <Button
                          type="submit"
                          size="icon"
                          className="h-10 w-10 shrink-0"
                          disabled={
                            sending ||
                            (!comment.trim() && pendingFiles.length === 0)
                          }
                          title="Отправить"
                        >
                          <Send className="h-4 w-4" />
                        </Button>
                      </div>
                      <p className="mt-1.5 text-[11px] text-muted-foreground">
                        Enter — отправить · можно перетащить несколько файлов
                      </p>
                    </form>
                  </FileDropZone>
                ) : (
                  <div className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
                    Только просмотр
                  </div>
                )}
              </div>
            </div>

            <aside className="h-fit space-y-3 rounded-xl border border-border bg-background/50 p-3">
              <Meta label="Статус">
                {writable ? (
                  <AppSelect
                    value={String(task.statusId)}
                    onValueChange={(v) => saveField({ statusId: Number(v) })}
                    options={(project?.statuses || []).map((s) => ({
                      value: String(s.id),
                      label: s.name,
                    }))}
                    className="w-full text-sm"
                  />
                ) : (
                  <Badge>{task.status?.name}</Badge>
                )}
              </Meta>

              <Meta label="Приоритет">
                {writable ? (
                  <AppSelect
                    value={task.priority}
                    onValueChange={(v) => saveField({ priority: v })}
                    options={Object.entries(PRIORITY_LABELS).map(([k, v]) => ({
                      value: k,
                      label: v,
                    }))}
                    className="w-full text-sm"
                  />
                ) : (
                  PRIORITY_LABELS[task.priority]
                )}
              </Meta>

              <Meta label="Исполнитель">
                {writable ? (
                  <AppSelect
                    value={
                      task.assigneeId != null ? String(task.assigneeId) : 'none'
                    }
                    onValueChange={(v) =>
                      saveField({
                        assigneeId: v === 'none' ? null : Number(v),
                      })
                    }
                    options={[
                      { value: 'none', label: 'Не назначен' },
                      ...users.map((u) => ({
                        value: String(u.id),
                        label: displayName(u),
                      })),
                    ]}
                    className="w-full text-sm"
                  />
                ) : (
                  displayName(task.assignee)
                )}
              </Meta>

              <Meta label="Дедлайн">
                {writable ? (
                  <Input
                    type="date"
                    value={task.deadline ? task.deadline.slice(0, 10) : ''}
                    onChange={(e) =>
                      saveField({
                        deadline: e.target.value
                          ? new Date(e.target.value).toISOString()
                          : null,
                      })
                    }
                  />
                ) : (
                  formatDate(task.deadline)
                )}
              </Meta>

              <Meta label="В статусе">
                {formatDuration(task.statusChangedAt)}
              </Meta>
              <Meta label="Автор">{displayName(task.createdBy)}</Meta>

              <div className="space-y-2 border-t border-border pt-3">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  История статусов
                </div>
                {(task.statusHistory || []).length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Пока нет записей
                  </p>
                ) : (
                  <ul className="max-h-52 space-y-2.5 overflow-y-auto pr-1">
                    {(task.statusHistory || []).map((entry) => (
                      <li
                        key={entry.id}
                        className="rounded-md border border-border/60 bg-background/40 px-2.5 py-2"
                      >
                        <div className="flex items-start gap-2">
                          <UserAvatar user={entry.user} size="sm" />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs leading-snug">
                              <span className="font-medium">
                                {displayName(entry.user)}
                              </span>
                              {entry.fromStatusName ? (
                                <>
                                  {' '}
                                  перевёл из{' '}
                                  <span className="font-medium">
                                    «{entry.fromStatusName}»
                                  </span>{' '}
                                  в{' '}
                                  <span className="font-medium">
                                    «{entry.toStatusName}»
                                  </span>
                                </>
                              ) : (
                                <>
                                  {' '}
                                  установил статус{' '}
                                  <span className="font-medium">
                                    «{entry.toStatusName}»
                                  </span>
                                </>
                              )}
                            </p>
                            <p className="mt-0.5 text-[11px] text-muted-foreground">
                              {formatChatTime(entry.createdAt)}
                            </p>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {writable && (
                <div className="space-y-2 pt-2">
                  <Button
                    className="w-full"
                    variant="secondary"
                    onClick={take}
                    disabled={saving}
                  >
                    Взять в работу
                  </Button>
                  <Button
                    className="w-full"
                    variant="destructive"
                    onClick={async () => {
                      if (!confirm('Удалить задачу?')) return;
                      await api.deleteTask(taskId);
                      await onChanged();
                      onClose();
                    }}
                  >
                    Удалить задачу
                  </Button>
                </div>
              )}
            </aside>
          </div>
        </div>
      </DialogContent>
      </Dialog>

      {lightboxFile && (
        <ImageLightbox
          file={lightboxFile}
          onClose={() => setLightboxFile(null)}
        />
      )}
    </>
  );
}

function Meta({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="text-sm">{children}</div>
    </div>
  );
}

function FileGallery({
  files,
  emptyText,
  compact = false,
  onDark = false,
  lightboxFile,
  onOpenLightbox,
}: {
  files: Attachment[];
  emptyText?: string;
  compact?: boolean;
  onDark?: boolean;
  lightboxFile?: Attachment | null;
  onOpenLightbox?: (file: Attachment | null) => void;
}) {
  const [localLightbox, setLocalLightbox] = useState<Attachment | null>(null);
  const activeLightbox = onOpenLightbox ? lightboxFile ?? null : localLightbox;
  const openLightbox = onOpenLightbox ?? setLocalLightbox;

  if (!files.length) {
    if (!emptyText) return null;
    return (
      <div className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
        {emptyText}
      </div>
    );
  }

  const images = files.filter((f) => f.mimeType.startsWith('image/'));
  const others = files.filter((f) => !f.mimeType.startsWith('image/'));

  return (
    <>
      <div className={cn('flex flex-col gap-2', compact && 'gap-1.5')}>
        {images.length > 0 && (
          <div
            className={cn(
              'flex flex-wrap gap-2',
              compact ? 'gap-1.5' : 'gap-2',
            )}
          >
            {images.map((f) => (
              <ChatImage
                key={f.id}
                file={f}
                compact={compact}
                onOpen={() => openLightbox(f)}
              />
            ))}
          </div>
        )}
        {others.map((f) => (
          <FileRow key={f.id} file={f} compact={compact} onDark={onDark} />
        ))}
      </div>

      {!onOpenLightbox && activeLightbox && (
        <ImageLightbox
          file={activeLightbox}
          onClose={() => openLightbox(null)}
        />
      )}
    </>
  );
}

function ChatImage({
  file,
  compact,
  onOpen,
}: {
  file: Attachment;
  compact?: boolean;
  onOpen: () => void;
}) {
  const previewUrl = useAuthObjectUrl(file.id, true);

  if (!previewUrl) {
    return (
      <div
        className={cn(
          'animate-pulse rounded-lg bg-muted/60',
          compact ? 'h-28 w-28' : 'h-32 w-32',
        )}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'group relative overflow-hidden rounded-lg border border-border/40 bg-background/20 text-left outline-none transition hover:opacity-95 focus-visible:ring-2 focus-visible:ring-ring',
        compact ? 'max-w-[220px]' : 'max-w-[280px]',
      )}
      title={file.originalName}
    >
      <img
        src={previewUrl}
        alt={file.originalName}
        className={cn(
          'block max-h-56 w-auto max-w-full object-contain',
          compact ? 'max-h-44' : 'max-h-56',
        )}
      />
    </button>
  );
}

function ImageLightbox({
  file,
  onClose,
}: {
  file: Attachment;
  onClose: () => void;
}) {
  const previewUrl = useAuthObjectUrl(file.id, true);
  const [downloading, setDownloading] = useState(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      onCloseRef.current();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  const onDownload = async () => {
    setDownloading(true);
    try {
      await downloadAttachment(file);
    } catch {
      window.open(file.url, '_blank', 'noopener,noreferrer');
    } finally {
      setDownloading(false);
    }
  };

  return createPortal(
    <div
      data-image-lightbox=""
      className="pointer-events-auto fixed inset-0 z-[200] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      onPointerDown={(e) => {
        // Keep Radix task-dialog from treating this as an outside click.
        e.stopPropagation();
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      role="dialog"
      aria-modal="true"
      aria-label={file.originalName}
    >
      <div
        className="relative flex max-h-[90vh] max-w-[min(960px,94vw)] flex-col gap-3"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 text-sm text-white">
          <span className="min-w-0 truncate font-medium">{file.originalName}</span>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="cursor-pointer"
              disabled={downloading}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                void onDownload();
              }}
            >
              <Download className="h-3.5 w-3.5" />
              Скачать
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              className="h-8 w-8 cursor-pointer"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onClose();
              }}
              title="Закрыть"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-xl bg-black/40">
          {previewUrl ? (
            <img
              src={previewUrl}
              alt={file.originalName}
              className="max-h-[80vh] max-w-full object-contain"
            />
          ) : (
            <div className="px-8 py-16 text-sm text-white/70">Загрузка...</div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function FileRow({
  file,
  compact,
  onDark,
}: {
  file: Attachment;
  compact?: boolean;
  onDark?: boolean;
}) {
  const [downloading, setDownloading] = useState(false);

  const onDownload = async () => {
    setDownloading(true);
    try {
      await downloadAttachment(file);
    } catch {
      window.open(file.url, '_blank', 'noopener,noreferrer');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-lg border px-2 py-1.5',
        onDark
          ? 'border-primary-foreground/20 bg-primary-foreground/10'
          : 'border-border bg-background/70',
        compact && 'py-1',
      )}
    >
      <div
        className={cn(
          'flex shrink-0 items-center justify-center rounded-md bg-muted/50',
          compact ? 'h-10 w-10' : 'h-14 w-14',
          onDark && 'bg-primary-foreground/15',
        )}
      >
        <FileIcon
          className={cn(
            'text-muted-foreground',
            compact ? 'h-4 w-4' : 'h-5 w-5',
            onDark && 'text-primary-foreground/80',
          )}
        />
      </div>

      <div className="min-w-0 flex-1">
        <div
          className={cn(
            'truncate text-xs font-medium',
            onDark && 'text-primary-foreground',
          )}
          title={file.originalName}
        >
          {file.originalName}
        </div>
        <div
          className={cn(
            'text-[11px] text-muted-foreground',
            onDark && 'text-primary-foreground/70',
          )}
        >
          {formatFileSize(file.size)}
        </div>
      </div>

      <Button
        type="button"
        variant={onDark ? 'secondary' : 'outline'}
        size="icon"
        className="h-8 w-8 shrink-0"
        disabled={downloading}
        onClick={() => void onDownload()}
        title="Скачать"
      >
        <Download className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
