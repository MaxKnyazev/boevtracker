import {
  FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ClipboardEvent,
  type MouseEvent,
  type PointerEvent,
  type WheelEvent,
} from 'react';
import { createPortal } from 'react-dom';
import {
  Check,
  Copy,
  Download,
  FileIcon,
  GripHorizontal,
  Maximize2,
  Minus,
  Paperclip,
  Pencil,
  Plus,
  Reply,
  Rocket,
  Send,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';
import {
  api,
  isTaskAssignee,
  taskActiveAssignee,
  taskAssignees,
  type Attachment,
  type Comment,
  type Project,
  type PublicUser,
  type Release,
  type Task,
  type TaskChangeHistory,
  type User,
} from '@/lib/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { DeadlinePicker } from '@/components/deadline-picker';
import { Input, Label } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { PrioritySelect } from '@/components/priority-select';
import { ReleasePicker } from '@/components/release-picker';
import { AppSelect } from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  MentionText,
  MentionsTextarea,
} from '@/components/mentions-textarea';
import { PRIORITY_LABELS, formatDate, formatDuration, cn, MAX_TASK_TITLE_LENGTH } from '@/lib/utils';
import { CLOSED_STATUS_NAME } from '@/lib/task-buckets';
import {
  EmptyAssigneeAvatar,
  UserAvatar,
  displayName,
} from '@/components/user-avatar';
import { AssigneeStack } from '@/components/assignee-stack';
import { ChooseActiveAssigneeDialog } from '@/components/choose-active-assignee-dialog';
import { CloseTaskDialog } from '@/components/close-task-dialog';
import {
  FileDropZone,
  MAX_UPLOAD_FILE_SIZE,
  PendingFileChip,
  UploadProgressBar,
  extractClipboardFiles,
} from '@/components/file-drop-zone';
import { useAuthStore } from '@/store/auth';
import { useUploadsStore } from '@/store/uploads';
import { realtimeClient } from '@/lib/realtime';

function replySnippet(
  source: {
    body?: string | null;
    hasFiles?: boolean;
    files?: Attachment[];
  } | null | undefined,
  max = 100,
): string {
  const body = (source?.body || '').trim();
  if (body) {
    return body.length > max ? `${body.slice(0, max)}…` : body;
  }
  if (source?.hasFiles || (source?.files && source.files.length > 0)) {
    return 'Вложение';
  }
  return 'Сообщение';
}

function formatChatTime(value: string | Date): string {
  return new Date(value).toLocaleString('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function renderChangeHistoryText(entry: TaskChangeHistory) {
  const who = (
    <span className="font-medium">{displayName(entry.user)}</span>
  );
  const payload = entry.payload ?? {};

  switch (entry.type) {
    case 'status':
      if (payload.fromStatusName) {
        return (
          <>
            {who} перевёл из{' '}
            <span className="font-medium">«{payload.fromStatusName}»</span> в{' '}
            <span className="font-medium">«{payload.toStatusName}»</span>
          </>
        );
      }
      return (
        <>
          {who} установил статус{' '}
          <span className="font-medium">«{payload.toStatusName}»</span>
        </>
      );
    case 'deadline_set':
      return (
        <>
          {who} назначил дедлайн{' '}
          <span className="font-medium">
            {formatDate(payload.toDeadline) || '—'}
          </span>
        </>
      );
    case 'deadline_changed':
      return (
        <>
          {who} изменил дедлайн с{' '}
          <span className="font-medium">
            {formatDate(payload.fromDeadline) || '—'}
          </span>{' '}
          на{' '}
          <span className="font-medium">
            {formatDate(payload.toDeadline) || '—'}
          </span>
        </>
      );
    case 'description_changed':
      return <>{who} изменил описание задачи</>;
    case 'priority_changed':
      return (
        <>
          {who} изменил приоритет задачи с{' '}
          <span className="font-medium">
            {payload.fromPriority
              ? PRIORITY_LABELS[payload.fromPriority] ?? payload.fromPriority
              : '—'}
          </span>{' '}
          на{' '}
          <span className="font-medium">
            {payload.toPriority
              ? PRIORITY_LABELS[payload.toPriority] ?? payload.toPriority
              : '—'}
          </span>
        </>
      );
    case 'file_added':
      return (
        <>
          {who} добавил файл{' '}
          <span className="font-medium">{payload.fileName || '—'}</span>
        </>
      );
    case 'file_removed':
      return (
        <>
          {who} удалил файл{' '}
          <span className="font-medium">{payload.fileName || '—'}</span>
        </>
      );
    case 'took_task':
      return <>{who} взял задачу в работу</>;
    case 'assigned_assignee':
      return (
        <>
          {who} назначил исполнителем{' '}
          <span className="font-medium">
            {payload.targetUser
              ? displayName(payload.targetUser)
              : payload.targetUserName || '—'}
          </span>
        </>
      );
    case 'took_co_assignee':
      return <>{who} взял задачу в совместное исполнение</>;
    case 'assigned_co_assignee':
      return (
        <>
          {who} назначил в совместное исполнение{' '}
          <span className="font-medium">
            {payload.targetUser
              ? displayName(payload.targetUser)
              : payload.targetUserName || '—'}
          </span>
        </>
      );
    case 'removed_assignee':
      return (
        <>
          {who} убрал исполнителя{' '}
          <span className="font-medium">
            {payload.targetUser
              ? displayName(payload.targetUser)
              : payload.targetUserName || '—'}
          </span>
        </>
      );
    case 'assigned_active_assignee':
      return (
        <>
          {who} назначил активным исполнителем{' '}
          <span className="font-medium">
            {payload.targetUser
              ? displayName(payload.targetUser)
              : payload.targetUserName || '—'}
          </span>
        </>
      );
    default:
      return <>{who} внёс изменение</>;
  }
}

function formatFileSize(size: number): string {
  if (size < 1024) return `${size} Б`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} КБ`;
  return `${(size / (1024 * 1024)).toFixed(1)} МБ`;
}

const CHAT_HEIGHT_KEY = 'boevtracker.taskChatHeight';
const DEFAULT_CHAT_HEIGHT = 380;
const MIN_CHAT_HEIGHT = 260;
const MAX_CHAT_HEIGHT = 900;
const TASK_MODAL_LG_QUERY = '(min-width: 1024px)';

function subscribeLg(onChange: () => void) {
  const mq = window.matchMedia(TASK_MODAL_LG_QUERY);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}

function getLgSnapshot() {
  return window.matchMedia(TASK_MODAL_LG_QUERY).matches;
}

function clampChatHeight(value: number): number {
  return Math.min(MAX_CHAT_HEIGHT, Math.max(MIN_CHAT_HEIGHT, Math.round(value)));
}

function readStoredChatHeight(): number {
  try {
    const raw = localStorage.getItem(CHAT_HEIGHT_KEY);
    const n = raw == null ? NaN : Number(raw);
    if (Number.isFinite(n)) return clampChatHeight(n);
  } catch {
    // ignore
  }
  return DEFAULT_CHAT_HEIGHT;
}

function writeStoredChatHeight(value: number): void {
  try {
    localStorage.setItem(CHAT_HEIGHT_KEY, String(clampChatHeight(value)));
  } catch {
    // ignore
  }
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
  const uploadTaskFilesGlobal = useUploadsStore((s) => s.uploadTaskFiles);
  const uploadCommentFilesGlobal = useUploadsStore((s) => s.uploadCommentFiles);
  const allUploadJobs = useUploadsStore((s) => s.jobs);
  const taskUploadJobs = allUploadJobs.filter(
    (job) => job.taskId === taskId && job.status === 'uploading',
  );
  const taskFileUploads = taskUploadJobs
    .filter((job) => job.kind === 'task')
    .flatMap((job) => job.files);
  const commentFileUploads = taskUploadJobs
    .filter((job) => job.kind === 'comment')
    .flatMap((job) => job.files);
  const overallUploadPercent =
    taskUploadJobs.length > 0
      ? Math.round(
          taskUploadJobs.reduce((sum, job) => sum + job.overallPercent, 0) /
            taskUploadJobs.length,
        )
      : null;
  const uploadingFiles = taskFileUploads.length > 0;

  const [task, setTask] = useState<Task | null>(null);
  const [comment, setComment] = useState('');
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [minimized, setMinimized] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const linkCopiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [lightboxFile, setLightboxFile] = useState<Attachment | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [editingDescription, setEditingDescription] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState('');
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [savingComment, setSavingComment] = useState(false);
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [highlightedCommentId, setHighlightedCommentId] = useState<number | null>(
    null,
  );
  const [activeChoice, setActiveChoice] = useState<{
    mode: 'status' | 'assign';
    statusId?: number;
    assigneeIds?: number[];
    assignees: PublicUser[];
  } | null>(null);
  const [pendingCloseStatusId, setPendingCloseStatusId] = useState<number | null>(
    null,
  );
  const [assigneePickerOpen, setAssigneePickerOpen] = useState(false);
  const [assigneeDraftIds, setAssigneeDraftIds] = useState<number[]>([]);
  const [releases, setReleases] = useState<Release[]>([]);
  const [chatHeight, setChatHeight] = useState(readStoredChatHeight);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatListRef = useRef<HTMLDivElement | null>(null);
  const chatFileInputRef = useRef<HTMLInputElement | null>(null);
  const chatResizeRef = useRef<{ startY: number; startHeight: number } | null>(
    null,
  );
  const commentInputRef = useRef<HTMLTextAreaElement | null>(null);
  const commentComposerRef = useRef<HTMLDivElement | null>(null);
  const dialogContentRef = useRef<HTMLDivElement | null>(null);
  const modalBodyRef = useRef<HTMLDivElement | null>(null);
  const modalPinRef = useRef<HTMLDivElement | null>(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const prevCommentsCountRef = useRef<number | null>(null);
  const [scrollPortH, setScrollPortH] = useState(0);
  const isLgLayout = useSyncExternalStore(subscribeLg, getLgSnapshot, () => true);

  const scrollModalToTop = () => {
    const el = modalBodyRef.current ?? dialogContentRef.current;
    if (!el) return;
    el.scrollTop = 0;
  };

  const forwardWheelToModalBody = (e: WheelEvent<HTMLElement>) => {
    const body = modalBodyRef.current;
    if (!body) return;
    body.scrollTop += e.deltaY;
  };

  const startChatResize = (e: PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    chatResizeRef.current = {
      startY: e.clientY,
      startHeight: chatHeight,
    };
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);

    const onMove = (ev: globalThis.PointerEvent) => {
      const start = chatResizeRef.current;
      if (!start) return;
      const next = clampChatHeight(start.startHeight + (ev.clientY - start.startY));
      setChatHeight(next);
    };
    const onUp = (ev: globalThis.PointerEvent) => {
      const start = chatResizeRef.current;
      chatResizeRef.current = null;
      try {
        target.releasePointerCapture(ev.pointerId);
      } catch {
        // ignore
      }
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (start) {
        const next = clampChatHeight(
          start.startHeight + (ev.clientY - start.startY),
        );
        setChatHeight(next);
        writeStoredChatHeight(next);
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const load = async () => {
    try {
      const data = await api.task(taskId);
      if (!mountedRef.current) return;
      setTask(data.task);
      setError('');
      setEditingTitle(false);
      setEditingDescription(false);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : 'Ошибка');
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    setReplyTo(null);
    setEditingCommentId(null);
    setEditDraft('');
    setComment('');
    setPendingFiles([]);
    setMinimized(false);
    setHighlightedCommentId(null);
    setLinkCopied(false);
    if (highlightTimerRef.current) {
      clearTimeout(highlightTimerRef.current);
      highlightTimerRef.current = null;
    }
    void load();
  }, [taskId]);

  useEffect(() => {
    let cancelled = false;
    void api
      .releases()
      .then((res) => {
        if (!cancelled && mountedRef.current) setReleases(res.releases);
      })
      .catch(() => {
        if (!cancelled && mountedRef.current) setReleases([]);
      });
    return () => {
      cancelled = true;
    };
  }, [taskId]);

  useEffect(() => {
    realtimeClient.watchTask(taskId, (next) => {
      setTask(next);
    });
    return () => {
      realtimeClient.unwatchTask(taskId);
    };
  }, [taskId]);

  useEffect(() => {
    return () => {
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
      if (linkCopiedTimerRef.current) clearTimeout(linkCopiedTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const count = task?.comments?.length ?? 0;
    const prev = prevCommentsCountRef.current;
    prevCommentsCountRef.current = count;
    // Only auto-scroll the chat panel when new comments arrive — not on first open.
    if (prev == null || count <= prev) return;
    const list = chatListRef.current;
    if (list) {
      list.scrollTop = list.scrollHeight;
      return;
    }
    chatEndRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [task?.comments?.length]);

  useEffect(() => {
    prevCommentsCountRef.current = null;
  }, [taskId]);

  useEffect(() => {
    if (minimized || !task) return;
    scrollModalToTop();
    const id = window.requestAnimationFrame(() => scrollModalToTop());
    return () => window.cancelAnimationFrame(id);
  }, [taskId, task?.id, minimized]);

  useEffect(() => {
    if (minimized) return;
    const pin = modalPinRef.current;
    if (!pin) return;
    const update = () => setScrollPortH(pin.clientHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(pin);
    return () => ro.disconnect();
  }, [minimized, task?.id, isLgLayout]);

  const saveField = async (data: Record<string, unknown>) => {
    if (!writable) return;
    setSaving(true);
    try {
      const res = await api.updateTask(taskId, data);
      setTask(res.task);
      if (res.needsActiveChoice && taskAssignees(res.task).length > 1) {
        setActiveChoice({
          mode: 'assign',
          assigneeIds: taskAssignees(res.task).map((u) => u.id),
          assignees: taskAssignees(res.task),
        });
      }
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (statusId: number) => {
    if (!task || task.statusId === statusId) return;
    const assignees = taskAssignees(task);
    const nextStatus = project?.statuses?.find((s) => s.id === statusId);
    const toClosed = nextStatus?.name === CLOSED_STATUS_NAME;
    if (toClosed) {
      setPendingCloseStatusId(statusId);
      return;
    }
    if (assignees.length > 1) {
      setActiveChoice({
        mode: 'status',
        statusId,
        assignees,
      });
      return;
    }
    await saveField({ statusId });
  };

  const take = async () => {
    setSaving(true);
    try {
      const res = await api.takeTask(taskId);
      setTask(res.task);
      if (res.needsActiveChoice && taskAssignees(res.task).length > 1) {
        setActiveChoice({
          mode: 'assign',
          assigneeIds: taskAssignees(res.task).map((u) => u.id),
          assignees: taskAssignees(res.task),
        });
      }
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!assigneePickerOpen || !task) return;
    setAssigneeDraftIds(taskAssignees(task).map((u) => u.id));
  }, [assigneePickerOpen, task]);

  const applyAssigneeDraft = async (ids: number[]) => {
    await saveField({ assigneeIds: ids });
    setAssigneePickerOpen(false);
  };

  const sendComment = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!writable || (!comment.trim() && pendingFiles.length === 0)) return;
    setSending(true);
    try {
      const body = comment.trim();
      const filesToUpload = [...pendingFiles];
      const res = await api.addComment(taskId, body, replyTo?.id ?? null);
      setComment('');
      setPendingFiles([]);
      setReplyTo(null);

      if (filesToUpload.length > 0) {
        const oversized = filesToUpload.find(
          (f) => f.size > MAX_UPLOAD_FILE_SIZE,
        );
        if (oversized) {
          setError(`Файл «${oversized.name}» больше 500 МБ`);
          await load();
          await onChanged();
        } else {
          // Store owns the XHR — survives modal close.
          void uploadCommentFilesGlobal({
            taskId,
            commentId: res.comment.id,
            title: task?.title || 'Комментарий',
            files: filesToUpload,
            onComplete: async () => {
              if (mountedRef.current) await load();
              await onChanged();
            },
          });
        }
      } else {
        await load();
        await onChanged();
      }
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
        setError(`Файл «${file.name}» больше 500 МБ`);
        continue;
      }
      ok.push(file);
    }
    return ok;
  };

  const uploadTaskFiles = (incoming: File[]) => {
    const files = filterFiles(incoming);
    if (!files.length) return;
    void uploadTaskFilesGlobal({
      taskId,
      title: task?.title || 'Задача',
      files,
      onComplete: async () => {
        if (mountedRef.current) await load();
        await onChanged();
      },
    });
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

  const removeAttachment = async (file: Attachment) => {
    if (!writable) return;
    if (!confirm(`Удалить файл «${file.originalName}»?`)) return;
    try {
      await api.deleteAttachment(file.id);
      if (lightboxFile?.id === file.id) setLightboxFile(null);
      await load();
      await onChanged();
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка удаления файла');
    }
  };

  const startEditComment = (c: Comment) => {
    setReplyTo(null);
    setEditingCommentId(c.id);
    setEditDraft(c.body);
  };

  const startReply = (c: Comment) => {
    if (!writable) return;
    setEditingCommentId(null);
    setEditDraft('');
    setReplyTo(c);
    requestAnimationFrame(() => commentInputRef.current?.focus());
  };

  const jumpToComment = (commentId: number) => {
    const el = document.querySelector<HTMLElement>(
      `[data-comment-id="${commentId}"]`,
    );
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightedCommentId(commentId);
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = setTimeout(() => {
      setHighlightedCommentId(null);
      highlightTimerRef.current = null;
    }, 1000);
  };

  const cancelEditComment = () => {
    setEditingCommentId(null);
    setEditDraft('');
  };

  const saveEditComment = async () => {
    if (editingCommentId == null) return;
    const current = task?.comments?.find((c) => c.id === editingCommentId);
    const trimmed = editDraft.trim();
    if (!trimmed && !(current?.files?.length)) {
      try {
        setSavingComment(true);
        await api.deleteComment(editingCommentId);
        cancelEditComment();
        await load();
        await onChanged();
        setError('');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Ошибка удаления');
      } finally {
        setSavingComment(false);
      }
      return;
    }
    setSavingComment(true);
    try {
      await api.updateComment(editingCommentId, trimmed);
      cancelEditComment();
      await load();
      await onChanged();
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка сохранения');
    } finally {
      setSavingComment(false);
    }
  };

  const deleteComment = async (c: Comment) => {
    if (!confirm('Удалить сообщение?')) return;
    try {
      if (editingCommentId === c.id) cancelEditComment();
      await api.deleteComment(c.id);
      await load();
      await onChanged();
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка удаления');
    }
  };

  const removeCommentFile = async (file: Attachment) => {
    if (!confirm(`Удалить файл «${file.originalName}»?`)) return;
    try {
      const ownerComment = task?.comments?.find((c) =>
        (c.files || []).some((f) => f.id === file.id),
      );
      const res = await api.deleteAttachment(file.id);
      if (lightboxFile?.id === file.id) setLightboxFile(null);
      if (
        res.commentDeleted ||
        (ownerComment &&
          !(ownerComment.body || '').trim() &&
          (ownerComment.files || []).filter((f) => f.id !== file.id).length ===
            0)
      ) {
        if (editingCommentId === ownerComment?.id) cancelEditComment();
      }
      await load();
      await onChanged();
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка удаления файла');
    }
  };

  const handleModalPaste = (e: ClipboardEvent) => {
    if (!writable || uploadingFiles || sending) return;
    const files = extractClipboardFiles(e.clipboardData);
    if (!files.length) return;
    e.preventDefault();
    const target = e.target as Node | null;
    const commentActive =
      commentComposerRef.current?.contains(document.activeElement) ||
      (target != null &&
        commentComposerRef.current?.contains(target) === true);
    if (commentActive) {
      addPendingFiles(files);
    } else {
      void uploadTaskFiles(files);
    }
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
  const isFileUploadActive = uploadingFiles || commentFileUploads.length > 0;
  const minimizedProgress = isFileUploadActive ? (overallUploadPercent ?? 0) : null;

  const copyTaskLink = async () => {
    const projectId = task.projectId || project?.id;
    if (!projectId) return;
    const boardId = task.project?.boardId ?? project?.boardId;
    const path = boardId
      ? `/boards/${boardId}?tab=${projectId}&task=${task.id}`
      : `/projects/${projectId}?task=${task.id}`;
    const url = `${window.location.origin}${path}`;
    try {
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
      if (linkCopiedTimerRef.current) clearTimeout(linkCopiedTimerRef.current);
      linkCopiedTimerRef.current = setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      setError('Не удалось скопировать ссылку');
    }
  };

  const handleDialogOpenChange = (open: boolean) => {
    if (!open) {
      if (lightboxFile) {
        setLightboxFile(null);
        return;
      }
      // Closing must not cancel uploads — they live in the global store/dock.
      onClose();
    }
  };

  const blockOutsideInteractions = (
    event: Event | { preventDefault: () => void; target: EventTarget | null },
  ) => {
    if (lightboxFile) {
      event.preventDefault();
      return;
    }
    const target = event.target as HTMLElement | null;
    if (target?.closest?.('[data-image-lightbox]')) {
      event.preventDefault();
      return;
    }
    // Portaled dropdown / select menus live outside DialogContent.
    if (
      target?.closest?.(
        '[data-assignee-picker], [data-release-picker], [data-mention-picker], [data-radix-dropdown-menu-content], [data-radix-popover-content], [data-radix-select-content], [data-radix-popper-content-wrapper], [role="menu"]',
      )
    ) {
      event.preventDefault();
    }
  };

  return (
    <>
      {!minimized && (
      <Dialog open onOpenChange={handleDialogOpenChange}>
        <DialogContent
          ref={dialogContentRef}
          className="flex h-[min(90vh,calc(100%-2rem))] max-h-[min(90vh,calc(100%-2rem))] max-w-6xl flex-col gap-0 overflow-hidden p-0"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            scrollModalToTop();
            dialogContentRef.current?.setAttribute('tabindex', '-1');
            dialogContentRef.current?.focus({ preventScroll: true });
          }}
          tabIndex={-1}
          onPointerDownOutside={blockOutsideInteractions}
          onInteractOutside={blockOutsideInteractions}
          onFocusOutside={blockOutsideInteractions}
          onPaste={handleModalPaste}
          onEscapeKeyDown={(e) => {
            if (lightboxFile) {
              e.preventDefault();
              setLightboxFile(null);
            }
          }}
        >
        <button
          type="button"
          className="absolute right-20 top-4 z-30 cursor-pointer rounded-sm opacity-70 hover:opacity-100"
          title={linkCopied ? 'Ссылка скопирована' : 'Копировать ссылку на задачу'}
          onClick={() => void copyTaskLink()}
        >
          {linkCopied ? (
            <Check className="h-4 w-4 text-emerald-600" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </button>
        <button
          type="button"
          className="absolute right-12 top-4 z-30 cursor-pointer rounded-sm opacity-70 hover:opacity-100"
          title={isFileUploadActive ? 'Свернуть (загрузка продолжится)' : 'Свернуть'}
          onClick={() => {
            // While uploading, close the modal so the global dock stays visible.
            if (isFileUploadActive) {
              onClose();
              return;
            }
            setMinimized(true);
          }}
        >
          <Minus className="h-4 w-4" />
        </button>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <div className="shrink-0 px-6 pt-6 pb-2">
            <DialogHeader className="min-w-0">
              <DialogTitle className="sr-only">{task.title}</DialogTitle>
              <div className="flex min-h-11 min-w-0 items-start gap-2 pr-24">
                {writable && editingTitle ? (
                  <>
                    <Input
                      value={titleDraft}
                      onChange={(e) => setTitleDraft(e.target.value)}
                      className="h-11 min-w-0 flex-1 text-lg font-semibold"
                      maxLength={MAX_TASK_TITLE_LENGTH}
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          void (async () => {
                            const next = titleDraft.trim();
                            if (!next) return;
                            if (next.length > MAX_TASK_TITLE_LENGTH) {
                              setError(
                                `Название задачи не длиннее ${MAX_TASK_TITLE_LENGTH} символов`,
                              );
                              return;
                            }
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
                      disabled={
                        saving ||
                        !titleDraft.trim() ||
                        titleDraft.trim().length > MAX_TASK_TITLE_LENGTH
                      }
                      title="Принять"
                      onClick={() => {
                        void (async () => {
                          const next = titleDraft.trim();
                          if (!next) return;
                          if (next.length > MAX_TASK_TITLE_LENGTH) {
                            setError(
                              `Название задачи не длиннее ${MAX_TASK_TITLE_LENGTH} символов`,
                            );
                            return;
                          }
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
                    <h2
                      className="min-w-0 flex-1 py-2 text-lg font-semibold leading-snug break-words [overflow-wrap:anywhere]"
                      title={task.title}
                    >
                      {task.title}
                    </h2>
                  </>
                )}
              </div>
            </DialogHeader>

            {error && (
              <p className="mt-2 text-sm text-destructive">{error}</p>
            )}
          </div>

          <div
            ref={(node) => {
              modalPinRef.current = node;
              if (!isLgLayout) modalBodyRef.current = node;
            }}
            className={cn(
              'min-h-0 min-w-0 flex-1',
              isLgLayout
                ? 'relative overflow-hidden'
                : 'overflow-y-auto overscroll-contain px-6 pb-6 pt-2 [scrollbar-gutter:stable]',
            )}
          >
            <aside
              className={cn(
                'min-w-0',
                isLgLayout
                  ? 'absolute left-6 top-2 z-[1] flex w-[240px] flex-col overflow-hidden'
                  : 'mb-4 h-fit',
              )}
              style={
                isLgLayout
                  ? {
                      height:
                        scrollPortH > 32
                          ? scrollPortH - 32
                          : 'calc(100% - 0.5rem)',
                    }
                  : undefined
              }
              onWheel={isLgLayout ? forwardWheelToModalBody : undefined}
            >
              <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-background/40">
                <div className="shrink-0 border-b border-border px-3 py-2">
                  <div className="text-sm font-medium">Свойства</div>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-1">
                  <Meta label="Статус">
                    {writable ? (
                      <AppSelect
                        value={String(task.statusId)}
                        onValueChange={(v) => void changeStatus(Number(v))}
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
                      <PrioritySelect
                        value={task.priority}
                        onChange={(v) => void saveField({ priority: v })}
                        disabled={saving}
                      />
                    ) : (
                      PRIORITY_LABELS[task.priority]
                    )}
                  </Meta>

                  <Meta label="Исполнители">
                    {writable ? (
                      <DropdownMenu
                        modal={false}
                        open={assigneePickerOpen}
                        onOpenChange={setAssigneePickerOpen}
                      >
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            disabled={saving}
                            className="inline-flex items-center outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
                            title="Выбрать исполнителей"
                          >
                            <AssigneeStack task={task} size="sm" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="start"
                          className="w-52 p-0"
                          data-assignee-picker
                          onCloseAutoFocus={(e) => e.preventDefault()}
                        >
                          <DropdownMenuItem
                            disabled={saving}
                            className="mx-1 mt-1 text-muted-foreground"
                            onSelect={(e) => {
                              e.preventDefault();
                              setAssigneeDraftIds([]);
                              void applyAssigneeDraft([]);
                            }}
                          >
                            <EmptyAssigneeAvatar size="sm" />
                            Без исполнителей
                          </DropdownMenuItem>
                          {users.map((u) => {
                            const selected = assigneeDraftIds.includes(u.id);
                            return (
                              <DropdownMenuCheckboxItem
                                key={u.id}
                                checked={selected}
                                disabled={saving}
                                className="mx-1"
                                onSelect={(e) => e.preventDefault()}
                                onCheckedChange={(checked) => {
                                  setAssigneeDraftIds((prev) =>
                                    checked
                                      ? prev.includes(u.id)
                                        ? prev
                                        : [...prev, u.id]
                                      : prev.filter((id) => id !== u.id),
                                  );
                                }}
                              >
                                <UserAvatar user={u} size="sm" />
                                <span className="min-w-0 flex-1 truncate">
                                  {displayName(u)}
                                </span>
                              </DropdownMenuCheckboxItem>
                            );
                          })}
                          <DropdownMenuSeparator />
                          <div className="p-1.5">
                            <button
                              type="button"
                              disabled={saving}
                              className="w-full rounded-md bg-primary px-2 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                              onClick={() =>
                                void applyAssigneeDraft(assigneeDraftIds)
                              }
                            >
                              Применить
                            </button>
                          </div>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : (
                      <AssigneeStack task={task} size="sm" />
                    )}
                  </Meta>

                  <Meta label="Дедлайн">
                    {writable ? (
                      <DeadlinePicker
                        value={task.deadline}
                        disabled={saving}
                        size="sm"
                        onChange={(next) =>
                          void saveField({
                            deadline: next || null,
                          })
                        }
                      />
                    ) : (
                      formatDate(task.deadline)
                    )}
                  </Meta>

                  <Meta label="Привязать к релизу">
                    {writable ? (
                      <ReleasePicker
                        value={task.releaseId}
                        releases={releases}
                        disabled={saving}
                        onChange={(next) => void saveField({ releaseId: next })}
                      />
                    ) : (
                      <span className="inline-flex min-w-0 items-center gap-1.5">
                        <Rocket className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate">
                          {task.release?.name || 'Не привязан'}
                        </span>
                      </span>
                    )}
                  </Meta>

                  <div className="my-2 border-t border-border/70" />

                  <Meta label="Создана" muted>
                    {formatDate(task.createdAt)}
                  </Meta>
                  <Meta label="В статусе" muted>
                    {formatDuration(task.statusChangedAt)}
                  </Meta>
                  <Meta label="Автор" muted>
                    {displayName(task.createdBy)}
                  </Meta>
                </div>
              </div>
            </aside>

            <div
              ref={isLgLayout ? modalBodyRef : undefined}
              className={cn(
                'min-w-0',
                isLgLayout
                  ? 'absolute inset-0 overflow-y-auto overscroll-contain px-[280px] pb-6 pt-2 [scrollbar-gutter:stable]'
                  : undefined,
              )}
            >
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex h-8 items-center gap-2">
                  {writable &&
                    !editingDescription &&
                    !!task.description?.trim() && (
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        title="Редактировать описание"
                        onClick={() => {
                          setDescriptionDraft(task.description || '');
                          setEditingDescription(true);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  <Label className="mb-0">Описание</Label>
                </div>

                <div className="min-h-[192px]">
                  {writable && editingDescription ? (
                    <div className="flex gap-2">
                      <MentionsTextarea
                        value={descriptionDraft}
                        onChange={setDescriptionDraft}
                        users={users}
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
                    <div className="min-h-[192px] min-w-0 overflow-hidden px-1 py-0.5 text-sm leading-relaxed whitespace-pre-wrap break-words text-muted-foreground [overflow-wrap:anywhere]">
                      <MentionText text={task.description} users={users} />
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
                    disabled={false}
                    onFiles={(files) => {
                      if (uploadingFiles) return;
                      void uploadTaskFiles(files);
                    }}
                    className="min-h-[88px]"
                  >
                    <UploadCloud className="h-5 w-5 text-muted-foreground" />
                    <div className="text-sm">
                      {uploadingFiles
                        ? overallUploadPercent != null
                          ? `Загрузка… ${overallUploadPercent}%`
                          : 'Загрузка...'
                        : 'Перетащите файлы сюда, нажмите или вставьте из буфера'}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      Можно несколько файлов, до 500 МБ каждый · Ctrl+V
                    </div>
                    {uploadingFiles && (
                      <>
                        <UploadProgressBar
                          value={overallUploadPercent ?? 0}
                          className="mt-1 w-full max-w-xs"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="mt-2 h-7 px-3 text-xs"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            for (const job of taskUploadJobs.filter(
                              (j) => j.kind === 'task',
                            )) {
                              useUploadsStore.getState().cancelJob(job.id);
                            }
                          }}
                        >
                          Отменить
                        </Button>
                      </>
                    )}
                  </FileDropZone>
                )}
                {taskFileUploads.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {taskUploadJobs
                      .filter((job) => job.kind === 'task')
                      .flatMap((job) =>
                        job.files.map((item) => (
                          <PendingFileChip
                            key={item.id}
                            name={item.name}
                            progress={
                              item.status === 'pending' ? null : item.progress
                            }
                            status={
                              item.status === 'error'
                                ? 'error'
                                : item.status === 'done'
                                  ? 'done'
                                  : item.status === 'pending'
                                    ? 'pending'
                                    : 'uploading'
                            }
                            onRemove={
                              item.status !== 'done'
                                ? () =>
                                    useUploadsStore
                                      .getState()
                                      .cancelFile(job.id, item.id)
                                : undefined
                            }
                            className="min-w-[10rem] max-w-full sm:max-w-[14rem]"
                          />
                        )),
                      )}
                  </div>
                )}
                <FileGallery
                  files={task.files || []}
                  emptyText={
                    writable ? undefined : 'К задаче пока нет файлов'
                  }
                  canDelete={writable}
                  onDelete={(file) => void removeAttachment(file)}
                  lightboxFile={lightboxFile}
                  onOpenLightbox={setLightboxFile}
                />
              </div>

              <div
                className="relative flex flex-col overflow-hidden rounded-xl border border-border bg-background/40"
                style={{ height: chatHeight }}
              >
                <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2">
                  <h3 className="text-sm font-medium">Комментарии</h3>
                  <span className="text-xs text-muted-foreground">
                    {comments.length}
                  </span>
                </div>

                <div
                  ref={chatListRef}
                  className="flex-1 space-y-3 overflow-y-auto px-3 py-3"
                >
                  {comments.length === 0 ? (
                    <div className="flex h-full min-h-[160px] items-center justify-center text-center text-sm text-muted-foreground">
                      Пока нет сообщений
                    </div>
                  ) : (
                    comments.map((c) => {
                      const mine = me?.id === c.author?.id;
                      const editing = editingCommentId === c.id;
                      const highlighted = highlightedCommentId === c.id;
                      if (c.kind === 'status_change') {
                        const [statusLine, ...noteLines] = c.body.split('\n');
                        const note = noteLines.join('\n').trim();
                        return (
                          <div
                            key={c.id}
                            data-comment-id={c.id}
                            className="flex justify-center px-1 py-0.5"
                          >
                            <div className="max-w-[92%] rounded-lg bg-muted/50 px-3 py-1.5 text-center text-[11px] leading-snug text-muted-foreground">
                              <div>
                                <span className="font-medium text-foreground">
                                  {displayName(c.author)}
                                </span>
                                <span className="mx-1">·</span>
                                <span className="break-words [overflow-wrap:anywhere]">
                                  {statusLine}
                                </span>
                                <span className="ml-2 opacity-70">
                                  {formatChatTime(c.createdAt)}
                                </span>
                              </div>
                              {note ? (
                                <div className="mt-1 break-words [overflow-wrap:anywhere]">
                                  <span className="text-muted-foreground">
                                    С комментарием:{' '}
                                  </span>
                                  <span className="text-white">{note}</span>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        );
                      }
                      const bubble = (
                        <div
                          className={cn(
                            'min-w-0 rounded-2xl px-3 py-2 transition-[box-shadow,background-color] duration-300',
                            editing
                              ? 'w-[min(100%,28rem)] max-w-[90%]'
                              : 'max-w-[85%]',
                            mine
                              ? 'rounded-tr-md bg-primary text-primary-foreground'
                              : 'rounded-tl-md bg-muted/60',
                            writable && !editing && 'cursor-context-menu',
                            highlighted &&
                              (mine
                                ? 'ring-2 ring-white shadow-[0_0_0_4px_rgba(255,255,255,0.35)]'
                                : 'ring-2 ring-primary shadow-[0_0_0_4px_rgba(37,99,235,0.25)]'),
                          )}
                          onDoubleClick={() => {
                            if (writable && !editing) startReply(c);
                          }}
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

                          {!editing && c.replyTo ? (
                            <button
                              type="button"
                              title="Перейти к сообщению"
                              className={cn(
                                'mb-2 w-full cursor-pointer rounded-md border-l-2 px-2 py-1 text-left text-[11px] leading-snug transition-opacity hover:opacity-90',
                                mine
                                  ? 'border-primary-foreground/50 bg-black/15 text-primary-foreground/85'
                                  : 'border-primary/50 bg-background/70 text-muted-foreground',
                              )}
                              onClick={(e) => {
                                e.stopPropagation();
                                jumpToComment(c.replyTo!.id);
                              }}
                              onDoubleClick={(e) => e.stopPropagation()}
                            >
                              <div
                                className={cn(
                                  'mb-0.5 font-medium',
                                  mine
                                    ? 'text-primary-foreground'
                                    : 'text-foreground',
                                )}
                              >
                                {displayName(c.replyTo.author)}
                              </div>
                              <div className="line-clamp-2 break-words [overflow-wrap:anywhere]">
                                {replySnippet(c.replyTo)}
                              </div>
                            </button>
                          ) : null}

                          {editing ? (
                            <div className="space-y-2">
                              <MentionsTextarea
                                value={editDraft}
                                onChange={setEditDraft}
                                users={users}
                                rows={3}
                                className="min-h-[72px] resize-y border bg-white/10 text-sm text-primary-foreground placeholder:text-primary-foreground/50 focus-visible:ring-white/40"
                                style={{
                                  borderColor: 'rgba(255, 255, 255, 0.45)',
                                }}
                                disabled={savingComment}
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === 'Escape') {
                                    e.preventDefault();
                                    cancelEditComment();
                                  }
                                  if (
                                    e.key === 'Enter' &&
                                    (e.ctrlKey || e.metaKey)
                                  ) {
                                    e.preventDefault();
                                    void saveEditComment();
                                  }
                                }}
                              />
                              {(c.files || []).length > 0 && (
                                <FileGallery
                                  files={c.files || []}
                                  compact
                                  onDark
                                  canDelete
                                  onDelete={(file) => void removeCommentFile(file)}
                                  lightboxFile={lightboxFile}
                                  onOpenLightbox={setLightboxFile}
                                />
                              )}
                              <div className="flex flex-wrap gap-1.5">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="secondary"
                                  className="h-7 px-2 text-xs"
                                  disabled={savingComment}
                                  onClick={() => void saveEditComment()}
                                >
                                  Сохранить
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 px-2 text-xs text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground"
                                  disabled={savingComment}
                                  onClick={cancelEditComment}
                                >
                                  Отмена
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <>
                              {(c.body || '').trim() ? (
                                <p className="whitespace-pre-wrap break-words text-sm leading-relaxed [overflow-wrap:anywhere]">
                                  <MentionText
                                    text={c.body}
                                    users={users}
                                    mentionClassName={
                                      mine
                                        ? 'bg-white/15 text-primary-foreground'
                                        : undefined
                                    }
                                  />
                                </p>
                              ) : null}
                              {(c.files || []).length > 0 && (
                                <div
                                  className={cn((c.body || '').trim() && 'mt-2')}
                                >
                                  <FileGallery
                                    files={c.files || []}
                                    compact
                                    onDark={mine}
                                    lightboxFile={lightboxFile}
                                    onOpenLightbox={setLightboxFile}
                                  />
                                </div>
                              )}
                              {c.editedAt && (
                                <div
                                  className={cn(
                                    'mt-1.5 text-[10px] leading-none',
                                    mine
                                      ? 'text-primary-foreground/65'
                                      : 'text-muted-foreground',
                                  )}
                                  title={formatChatTime(c.editedAt)}
                                >
                                  Отредактировано
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      );

                      return (
                        <div
                          key={c.id}
                          data-comment-id={c.id}
                          className={cn(
                            'flex min-w-0 gap-2',
                            mine ? 'flex-row-reverse' : 'flex-row',
                          )}
                        >
                          <UserAvatar user={c.author} size="sm" />
                          {writable && !editing ? (
                            <ContextMenu>
                              <ContextMenuTrigger asChild>
                                {bubble}
                              </ContextMenuTrigger>
                              <ContextMenuContent>
                                <ContextMenuItem
                                  onSelect={() => startReply(c)}
                                >
                                  <Reply className="mr-2 h-3.5 w-3.5" />
                                  Ответить
                                </ContextMenuItem>
                                {mine ? (
                                  <>
                                    <ContextMenuItem
                                      onSelect={() => startEditComment(c)}
                                    >
                                      <Pencil className="mr-2 h-3.5 w-3.5" />
                                      Редактировать
                                    </ContextMenuItem>
                                    <ContextMenuItem
                                      destructive
                                      onSelect={() => void deleteComment(c)}
                                    >
                                      <Trash2 className="mr-2 h-3.5 w-3.5" />
                                      Удалить
                                    </ContextMenuItem>
                                  </>
                                ) : null}
                              </ContextMenuContent>
                            </ContextMenu>
                          ) : (
                            bubble
                          )}
                        </div>
                      );
                    })
                  )}
                  <div ref={chatEndRef} />
                </div>

                {writable ? (
                  <div ref={commentComposerRef}>
                    <FileDropZone
                      disabled={sending}
                      onFiles={addPendingFiles}
                      inputRef={chatFileInputRef}
                      disableClickOpen
                      className="items-stretch justify-start rounded-none border-0 border-t border-border bg-card/80 p-3 text-left hover:bg-card/80"
                      activeClassName="bg-primary/10"
                    >
                      {replyTo ? (
                        <div className="mb-2 flex items-start gap-2 rounded-md border border-border bg-background px-2.5 py-2">
                          <Reply className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                          <div className="min-w-0 flex-1">
                            <div className="text-[11px] font-medium text-foreground">
                              Ответ {displayName(replyTo.author)}
                            </div>
                            <div className="truncate text-[11px] text-muted-foreground">
                              {replySnippet(replyTo)}
                            </div>
                          </div>
                          <button
                            type="button"
                            className="cursor-pointer rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                            onClick={(e) => {
                              e.stopPropagation();
                              setReplyTo(null);
                            }}
                            title="Отменить ответ"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : null}
                      {(pendingFiles.length > 0 ||
                        commentFileUploads.length > 0) && (
                        <div className="mb-2 flex flex-wrap gap-1.5">
                          {pendingFiles.map((file, index) => (
                            <PendingFileChip
                              key={`${file.name}-${file.size}-${index}`}
                              name={file.name}
                              progress={null}
                              status="pending"
                              disabled={sending}
                              onRemove={
                                sending
                                  ? undefined
                                  : () =>
                                      setPendingFiles((prev) =>
                                        prev.filter((_, i) => i !== index),
                                      )
                              }
                              className="min-w-[9rem] max-w-full sm:max-w-[13rem]"
                            />
                          ))}
                          {commentFileUploads.length > 0 &&
                            taskUploadJobs
                              .filter((job) => job.kind === 'comment')
                              .flatMap((job) =>
                                job.files.map((item) => (
                                  <PendingFileChip
                                    key={item.id}
                                    name={item.name}
                                    progress={
                                      item.status === 'pending'
                                        ? null
                                        : item.progress
                                    }
                                    status={
                                      item.status === 'error'
                                        ? 'error'
                                        : item.status === 'done'
                                          ? 'done'
                                          : item.status === 'pending'
                                            ? 'pending'
                                            : 'uploading'
                                    }
                                    onRemove={
                                      item.status !== 'done'
                                        ? () =>
                                            useUploadsStore
                                              .getState()
                                              .cancelFile(job.id, item.id)
                                        : undefined
                                    }
                                    className="min-w-[9rem] max-w-full sm:max-w-[13rem]"
                                  />
                                )),
                              )}
                        </div>
                      )}
                      <form onSubmit={(e) => void sendComment(e)}>
                        <div className="flex items-center gap-2">
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
                          <MentionsTextarea
                            ref={commentInputRef}
                            users={users}
                            placeholder={
                              replyTo
                                ? `Ответ ${displayName(replyTo.author)}…`
                                : 'Текст необязателен, если есть вложения…'
                            }
                            value={comment}
                            onChange={setComment}
                            rows={1}
                            className="h-10 min-h-10 max-h-10 flex-1 resize-none py-2 leading-normal"
                            onKeyDown={(e) => {
                              if (e.key === 'Escape' && replyTo) {
                                e.preventDefault();
                                setReplyTo(null);
                                return;
                              }
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
                          Enter — отправить · файлы: перетащить или Ctrl+V
                          {replyTo ? ' · Esc — отменить ответ' : ''}
                        </p>
                      </form>
                    </FileDropZone>
                  </div>
                ) : (
                  <div className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
                    Только просмотр
                  </div>
                )}
                <div
                  role="separator"
                  aria-orientation="horizontal"
                  aria-label="Изменить высоту чата"
                  title="Потяните, чтобы изменить высоту чата"
                  className="flex h-3 shrink-0 cursor-ns-resize items-center justify-center border-t border-border bg-muted/30 text-muted-foreground hover:bg-muted/60"
                  onPointerDown={startChatResize}
                >
                  <GripHorizontal className="h-3.5 w-3.5" aria-hidden />
                </div>
              </div>
            </div>
            </div>

            <aside
              className={cn(
                'flex min-h-0 min-w-0 flex-col gap-8',
                isLgLayout
                  ? 'absolute right-6 top-2 z-[1] w-[240px] overflow-hidden'
                  : 'mt-4',
              )}
              style={
                isLgLayout
                  ? {
                      height:
                        scrollPortH > 32
                          ? scrollPortH - 32
                          : 'calc(100% - 0.5rem)',
                    }
                  : undefined
              }
              onWheel={(e) => {
                // Keep wheel on the history panel — do not scroll the main modal body.
                e.stopPropagation();
              }}
            >
              <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-background/40">
                <div className="shrink-0 border-b border-border px-3 py-2">
                  <div className="text-sm font-medium">История изменений</div>
                </div>
                {(task.changeHistory || []).length === 0 ? (
                  <p className="flex flex-1 items-start px-3 py-3 text-xs text-muted-foreground">
                    Пока нет записей
                  </p>
                ) : (
                  <ul
                    className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain px-2 py-2"
                    onWheel={(e) => e.stopPropagation()}
                  >
                    {(task.changeHistory || []).map((entry) => (
                      <li
                        key={entry.id}
                        className="rounded-md px-2 py-2 hover:bg-muted/40"
                      >
                        <div className="flex items-start gap-2">
                          <UserAvatar user={entry.user} size="sm" />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs leading-snug">
                              {renderChangeHistoryText(entry)}
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
                <div className="flex shrink-0 flex-col gap-2">
                  <Button
                    className="w-full"
                    variant="secondary"
                    onClick={() => void take()}
                    disabled={saving || isTaskAssignee(task, me?.id)}
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
      )}

      {minimized &&
        createPortal(
          <div className="fixed bottom-4 right-4 z-[120] w-[min(100vw-2rem,22rem)] rounded-xl border border-border bg-card p-3 shadow-xl">
            <div className="flex items-start gap-2">
              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                onClick={() => setMinimized(false)}
                title="Развернуть задачу"
              >
                <div className="truncate text-sm font-medium">{task.title}</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  {minimizedProgress != null
                    ? `Загрузка файлов… ${Math.round(minimizedProgress)}%`
                    : 'Нажмите, чтобы развернуть'}
                </div>
              </button>
              <button
                type="button"
                className="rounded-sm p-1 opacity-70 hover:bg-accent hover:opacity-100"
                title="Развернуть"
                onClick={() => setMinimized(false)}
              >
                <Maximize2 className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                className="rounded-sm p-1 opacity-70 hover:bg-accent hover:opacity-100"
                title="Закрыть"
                onClick={onClose}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            {minimizedProgress != null && (
              <UploadProgressBar
                value={minimizedProgress}
                className="mt-2"
              />
            )}
          </div>,
          document.body,
        )}

      {lightboxFile && (
        <ImageLightbox
          file={lightboxFile}
          onClose={() => setLightboxFile(null)}
        />
      )}

      <CloseTaskDialog
        open={pendingCloseStatusId != null}
        taskTitle={task?.title}
        onCancel={() => setPendingCloseStatusId(null)}
        onConfirm={async (closeComment) => {
          const statusId = pendingCloseStatusId;
          setPendingCloseStatusId(null);
          if (statusId == null) return;
          await saveField({
            statusId,
            ...(closeComment ? { closeComment } : {}),
          });
        }}
      />

      {activeChoice && (
        <ChooseActiveAssigneeDialog
          open
          title={
            activeChoice.mode === 'status'
              ? 'Кто работает в следующем статусе?'
              : 'Кто активный исполнитель?'
          }
          description={
            activeChoice.mode === 'status'
              ? 'Выберите активного исполнителя для нового статуса.'
              : 'У задачи несколько исполнителей. Выберите активного для текущего статуса.'
          }
          assignees={activeChoice.assignees}
          initialUserId={
            taskActiveAssignee(task)?.id ?? activeChoice.assignees[0]?.id
          }
          confirmLabel={activeChoice.mode === 'status' ? 'Перевести' : 'Подтвердить'}
          onCancel={() => setActiveChoice(null)}
          onConfirm={async (userId) => {
            const choice = activeChoice;
            setActiveChoice(null);
            if (choice.mode === 'status' && choice.statusId != null) {
              await saveField({
                statusId: choice.statusId,
                activeAssigneeId: userId,
              });
              return;
            }
            await saveField({
              assigneeIds:
                choice.assigneeIds ?? choice.assignees.map((u) => u.id),
              activeAssigneeId: userId,
            });
          }}
        />
      )}
    </>
  );
}

function Meta({
  label,
  children,
  muted = false,
}: {
  label: string;
  children: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <div className="border-b border-border/60 py-2.5 last:border-b-0">
      <div className="mb-1.5 text-[11px] font-medium text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          'text-sm leading-snug',
          muted ? 'text-muted-foreground' : 'text-foreground',
        )}
      >
        {children}
      </div>
    </div>
  );
}

function FileGallery({
  files,
  emptyText,
  compact = false,
  onDark = false,
  canDelete = false,
  onDelete,
  lightboxFile,
  onOpenLightbox,
}: {
  files: Attachment[];
  emptyText?: string;
  compact?: boolean;
  onDark?: boolean;
  canDelete?: boolean;
  onDelete?: (file: Attachment) => void;
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
                onDark={onDark}
                canDelete={canDelete}
                onDelete={onDelete}
                onOpen={() => openLightbox(f)}
              />
            ))}
          </div>
        )}
        {others.map((f) => (
          <FileRow
            key={f.id}
            file={f}
            compact={compact}
            onDark={onDark}
            canDelete={canDelete}
            onDelete={onDelete}
          />
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
  onDark,
  canDelete,
  onDelete,
  onOpen,
}: {
  file: Attachment;
  compact?: boolean;
  onDark?: boolean;
  canDelete?: boolean;
  onDelete?: (file: Attachment) => void;
  onOpen: () => void;
}) {
  const previewUrl = useAuthObjectUrl(file.id, true);
  const [downloading, setDownloading] = useState(false);

  const onDownload = async (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDownloading(true);
    try {
      await downloadAttachment(file);
    } catch {
      window.open(file.url, '_blank', 'noopener,noreferrer');
    } finally {
      setDownloading(false);
    }
  };

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
    <div
      className={cn(
        'group relative overflow-hidden rounded-lg border bg-background/20',
        compact ? 'max-w-[220px]' : 'max-w-[280px]',
      )}
      style={{
        borderColor: onDark
          ? 'rgba(255, 255, 255, 0.4)'
          : compact
            ? 'rgba(125, 211, 252, 0.55)'
            : undefined,
      }}
    >
      <button
        type="button"
        onClick={onOpen}
        className="block w-full text-left outline-none transition hover:opacity-95 focus-visible:ring-2 focus-visible:ring-ring"
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
      <div
        className={cn(
          'truncate px-2 py-1 text-[11px] font-medium',
          onDark ? 'text-primary-foreground/90' : 'text-foreground',
        )}
        title={file.originalName}
      >
        {file.originalName}
      </div>
      <div className="pointer-events-none absolute right-1.5 top-1.5 flex gap-1 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100">
        <Button
          type="button"
          variant="secondary"
          size="icon"
          className="h-7 w-7 shadow-sm"
          disabled={downloading}
          onClick={(e) => void onDownload(e)}
          title="Скачать"
        >
          <Download className="h-3.5 w-3.5" />
        </Button>
        {canDelete && onDelete && (
          <Button
            type="button"
            variant="secondary"
            size="icon"
            className="h-7 w-7 shadow-sm text-destructive hover:text-destructive"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onDelete(file);
            }}
            title="Удалить"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

const LIGHTBOX_MIN_ZOOM = 1;
const LIGHTBOX_MAX_ZOOM = 8;
const LIGHTBOX_ZOOM_STEP = 1.25;

function clampLightboxZoom(value: number) {
  return Math.min(LIGHTBOX_MAX_ZOOM, Math.max(LIGHTBOX_MIN_ZOOM, value));
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
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const viewportRef = useRef<HTMLDivElement>(null);
  const scaleRef = useRef(1);
  const panRef = useRef({ x: 0, y: 0 });
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    panX: number;
    panY: number;
  } | null>(null);
  const movedRef = useRef(false);
  const clickTimerRef = useRef<number | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  scaleRef.current = scale;
  panRef.current = pan;

  const clearClickTimer = () => {
    if (clickTimerRef.current == null) return;
    window.clearTimeout(clickTimerRef.current);
    clickTimerRef.current = null;
  };

  const resetView = () => {
    setScale(1);
    setPan({ x: 0, y: 0 });
  };

  const zoomToward = (nextScale: number, clientX?: number, clientY?: number) => {
    const clamped = clampLightboxZoom(nextScale);
    const current = scaleRef.current;
    if (clamped === current) return;
    if (clamped === 1) {
      resetView();
      return;
    }

    const viewport = viewportRef.current;
    const currentPan = panRef.current;
    if (!viewport || clientX == null || clientY == null) {
      setScale(clamped);
      return;
    }

    const rect = viewport.getBoundingClientRect();
    const cx = clientX - rect.left - rect.width / 2;
    const cy = clientY - rect.top - rect.height / 2;
    const ox = (cx - currentPan.x) / current;
    const oy = (cy - currentPan.y) / current;
    setScale(clamped);
    setPan({
      x: cx - ox * clamped,
      y: cy - oy * clamped,
    });
  };

  useEffect(() => {
    resetView();
  }, [file.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        onCloseRef.current();
        return;
      }
      if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        zoomToward(scaleRef.current * LIGHTBOX_ZOOM_STEP);
        return;
      }
      if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        zoomToward(scaleRef.current / LIGHTBOX_ZOOM_STEP);
        return;
      }
      if (e.key === '0') {
        e.preventDefault();
        resetView();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      clearClickTimer();
    };
  }, []);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const factor = e.deltaY < 0 ? LIGHTBOX_ZOOM_STEP : 1 / LIGHTBOX_ZOOM_STEP;
      zoomToward(scaleRef.current * factor, e.clientX, e.clientY);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [previewUrl]);

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

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    movedRef.current = false;
    if (scaleRef.current <= 1) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      panX: panRef.current.x,
      panY: panRef.current.y,
    };
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    if (
      Math.abs(e.clientX - drag.startX) > 4 ||
      Math.abs(e.clientY - drag.startY) > 4
    ) {
      movedRef.current = true;
    }
    setPan({
      x: drag.panX + (e.clientX - drag.startX),
      y: drag.panY + (e.clientY - drag.startY),
    });
  };

  const endDrag = (e: PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== e.pointerId) return;
    dragRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const onViewportClick = (e: MouseEvent<HTMLDivElement>) => {
    if (movedRef.current || e.detail !== 1) return;
    const { clientX, clientY } = e;
    clearClickTimer();
    clickTimerRef.current = window.setTimeout(() => {
      clickTimerRef.current = null;
      zoomToward(scaleRef.current * LIGHTBOX_ZOOM_STEP, clientX, clientY);
    }, 250);
  };

  const onDoubleClick = (e: MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    clearClickTimer();
    resetView();
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
        className="relative flex h-[90vh] w-[min(1200px,96vw)] max-w-[96vw] flex-col gap-3"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 text-sm text-white">
          <span className="min-w-0 truncate font-medium">{file.originalName}</span>
          <div className="flex shrink-0 items-center gap-1">
            <div className="mr-1 flex items-center gap-0.5">
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="h-8 w-8 cursor-pointer"
                disabled={scale <= LIGHTBOX_MIN_ZOOM}
                title="Уменьшить"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  zoomToward(scale / LIGHTBOX_ZOOM_STEP);
                }}
              >
                <Minus className="h-4 w-4" />
              </Button>
              <span className="min-w-[3.25rem] text-center tabular-nums text-xs text-white/90">
                {Math.round(scale * 100)}%
              </span>
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="h-8 w-8 cursor-pointer"
                disabled={scale >= LIGHTBOX_MAX_ZOOM}
                title="Увеличить"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  zoomToward(scale * LIGHTBOX_ZOOM_STEP);
                }}
              >
                <Plus className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="h-8 w-8 cursor-pointer"
                disabled={scale === 1 && pan.x === 0 && pan.y === 0}
                title="Сбросить масштаб"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  resetView();
                }}
              >
                <Maximize2 className="h-4 w-4" />
              </Button>
            </div>
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
        <div
          ref={viewportRef}
          className={cn(
            'relative min-h-0 flex-1 overflow-hidden rounded-xl bg-black/40',
            scale > 1 ? 'cursor-grab active:cursor-grabbing' : 'cursor-zoom-in',
          )}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onClick={onViewportClick}
          onDoubleClick={onDoubleClick}
        >
          {previewUrl ? (
            <div className="flex h-full w-full items-center justify-center">
              <img
                src={previewUrl}
                alt={file.originalName}
                draggable={false}
                className="max-h-full max-w-full select-none object-contain"
                style={{
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
                  transformOrigin: 'center center',
                }}
              />
            </div>
          ) : (
            <div className="flex h-full items-center justify-center px-8 py-16 text-sm text-white/70">
              Загрузка...
            </div>
          )}
        </div>
        <p className="text-center text-[11px] text-white/60">
          ЛКМ — увеличить, двойной клик — сбросить. Колёсико тоже меняет
          масштаб, при увеличении фото можно перетаскивать.
        </p>
      </div>
    </div>,
    document.body,
  );
}

function FileRow({
  file,
  compact,
  onDark,
  canDelete,
  onDelete,
}: {
  file: Attachment;
  compact?: boolean;
  onDark?: boolean;
  canDelete?: boolean;
  onDelete?: (file: Attachment) => void;
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
          ? 'border-white/40 bg-primary-foreground/10'
          : compact
            ? 'border-sky-300/50 bg-background/70'
            : 'border-border bg-background/70',
        compact && 'py-1',
      )}
      style={
        onDark
          ? { borderColor: 'rgba(255, 255, 255, 0.4)' }
          : compact
            ? { borderColor: 'rgba(125, 211, 252, 0.55)' }
            : undefined
      }
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

      <div className="flex shrink-0 items-center gap-1">
        <Button
          type="button"
          variant={onDark ? 'secondary' : 'outline'}
          size="icon"
          className="h-8 w-8"
          disabled={downloading}
          onClick={() => void onDownload()}
          title="Скачать"
        >
          <Download className="h-3.5 w-3.5" />
        </Button>
        {canDelete && onDelete && (
          <Button
            type="button"
            variant={onDark ? 'secondary' : 'outline'}
            size="icon"
            className="h-8 w-8 text-destructive hover:text-destructive"
            onClick={() => onDelete(file)}
            title="Удалить"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}
