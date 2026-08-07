import { useRef, useState, type ReactNode, type RefObject } from 'react';
import { cn } from '@/lib/utils';

export const MAX_UPLOAD_FILE_SIZE = 500 * 1024 * 1024;

function extensionFromMime(type: string): string {
  if (type === 'image/png') return 'png';
  if (type === 'image/jpeg') return 'jpg';
  if (type === 'image/gif') return 'gif';
  if (type === 'image/webp') return 'webp';
  if (type === 'image/svg+xml') return 'svg';
  if (type.includes('/')) {
    const part = type.split('/')[1]?.split(';')[0];
    if (part) return part.replace(/[^a-z0-9]+/gi, '') || 'bin';
  }
  return 'bin';
}

function normalizePasteFile(file: File, index: number): File {
  const name = file.name?.trim();
  if (name && name !== 'blob') return file;
  const ext = extensionFromMime(file.type || '');
  return new File([file], `clipboard-${Date.now()}-${index + 1}.${ext}`, {
    type: file.type,
    lastModified: file.lastModified || Date.now(),
  });
}

/** Files / images from a paste or drop DataTransfer (deduped). */
export function extractClipboardFiles(
  data: DataTransfer | null | undefined,
): File[] {
  if (!data) return [];

  const fromItems: File[] = [];
  for (const item of Array.from(data.items || [])) {
    if (item.kind !== 'file') continue;
    const file = item.getAsFile();
    if (file) fromItems.push(normalizePasteFile(file, fromItems.length));
  }
  if (fromItems.length) return fromItems;

  return Array.from(data.files || []).map((file, index) =>
    normalizePasteFile(file, index),
  );
}

export function FileDropZone({
  onFiles,
  disabled,
  children,
  className,
  activeClassName,
  inputRef: externalInputRef,
  disableClickOpen = false,
}: {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
  children: ReactNode;
  className?: string;
  activeClassName?: string;
  inputRef?: RefObject<HTMLInputElement | null>;
  /** When true, only the hidden input / external trigger opens the picker. */
  disableClickOpen?: boolean;
}) {
  const localInputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const dragDepth = useRef(0);

  const setInputRef = (node: HTMLInputElement | null) => {
    localInputRef.current = node;
    if (externalInputRef) {
      (
        externalInputRef as React.MutableRefObject<HTMLInputElement | null>
      ).current = node;
    }
  };

  const openPicker = () => {
    if (disabled) return;
    localInputRef.current?.click();
  };

  const take = (list: FileList | File[]) => {
    // Copy first — FileList is live and clears when input.value is reset.
    const files = Array.from(list).filter((f) => f.name);
    if (files.length) onFiles(files);
  };

  return (
    <div
      data-file-dropzone=""
      className={cn(
        'flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border bg-muted/10 px-3 py-4 text-center transition-colors outline-none',
        !disableClickOpen &&
          'cursor-pointer focus-visible:ring-2 focus-visible:ring-ring',
        over && (activeClassName || 'border-primary bg-primary/10'),
        disabled && 'pointer-events-none opacity-60',
        className,
      )}
      onClick={
        disableClickOpen
          ? undefined
          : () => {
              openPicker();
            }
      }
      onKeyDown={
        disableClickOpen
          ? undefined
          : (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openPicker();
              }
            }
      }
      onPaste={(e) => {
        if (disabled) return;
        const files = extractClipboardFiles(e.clipboardData);
        if (!files.length) return;
        e.preventDefault();
        e.stopPropagation();
        onFiles(files);
      }}
      role={disableClickOpen ? undefined : 'button'}
      tabIndex={disableClickOpen || disabled ? -1 : 0}
      onDragEnter={(e) => {
        e.preventDefault();
        e.stopPropagation();
        dragDepth.current += 1;
        setOver(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        e.stopPropagation();
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        dragDepth.current = 0;
        setOver(false);
        if (!disabled) take(e.dataTransfer.files);
      }}
    >
      <input
        ref={setInputRef}
        type="file"
        multiple
        className="sr-only"
        tabIndex={-1}
        disabled={disabled}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          if (files.length) take(files);
        }}
        onClick={(e) => e.stopPropagation()}
      />
      {children}
    </div>
  );
}
