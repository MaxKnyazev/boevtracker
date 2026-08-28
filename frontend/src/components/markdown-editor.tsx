import { useRef, type TextareaHTMLAttributes } from 'react';
import {
  Bold,
  Heading2,
  ImagePlus,
  Italic,
  Link2,
  List,
  Paperclip,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';
import { MentionsTextarea } from '@/components/mentions-textarea';
import type { MentionUser } from '@/lib/mentions';
import { cn } from '@/lib/utils';

type MarkdownEditorProps = {
  value: string;
  onChange: (next: string) => void;
  onInsertFiles?: (files: File[]) => void | Promise<void>;
  disabled?: boolean;
  rows?: number;
  placeholder?: string;
  className?: string;
  users?: MentionUser[];
} & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'>;

function wrapSelection(
  value: string,
  start: number,
  end: number,
  before: string,
  after: string,
) {
  const selected = value.slice(start, end) || 'текст';
  const next = value.slice(0, start) + before + selected + after + value.slice(end);
  return {
    next,
    selectionStart: start + before.length,
    selectionEnd: start + before.length + selected.length,
  };
}

export function MarkdownEditor({
  value,
  onChange,
  onInsertFiles,
  disabled,
  rows = 10,
  placeholder,
  className,
  users,
  ...rest
}: MarkdownEditorProps) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const applyWrap = (before: string, after = before) => {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const result = wrapSelection(value, start, end, before, after);
    onChange(result.next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(result.selectionStart, result.selectionEnd);
    });
  };

  const insertAtCursor = (snippet: string) => {
    const el = ref.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const next = value.slice(0, start) + snippet + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      const pos = start + snippet.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const textareaProps = {
    ref,
    value,
    disabled,
    rows,
    placeholder,
    className: cn('min-h-[120px] w-full font-mono text-sm'),
    ...rest,
  };

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex flex-wrap items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8"
          disabled={disabled}
          title="Жирный"
          onClick={() => applyWrap('**')}
        >
          <Bold className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8"
          disabled={disabled}
          title="Курсив"
          onClick={() => applyWrap('_')}
        >
          <Italic className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8"
          disabled={disabled}
          title="Заголовок"
          onClick={() => applyWrap('## ', '')}
        >
          <Heading2 className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8"
          disabled={disabled}
          title="Список"
          onClick={() => applyWrap('- ', '')}
        >
          <List className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8"
          disabled={disabled}
          title="Ссылка"
          onClick={() => applyWrap('[', '](https://)')}
        >
          <Link2 className="h-3.5 w-3.5" />
        </Button>
        {onInsertFiles && (
          <>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={disabled}
              title="Вставить файл / изображение"
              onClick={() => fileRef.current?.click()}
            >
              <ImagePlus className="h-3.5 w-3.5" />
            </Button>
            <input
              ref={fileRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                const files = Array.from(e.target.files || []);
                e.target.value = '';
                if (files.length) void onInsertFiles(files);
              }}
            />
            <span className="ml-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <Paperclip className="h-3 w-3" />
              файлы вставляются в текст
            </span>
          </>
        )}
      </div>
      {users ? (
        <MentionsTextarea
          {...textareaProps}
          users={users}
          onChange={onChange}
          className={cn('w-full', textareaProps.className)}
        />
      ) : (
        <Textarea
          {...textareaProps}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}

export function insertMarkdownSnippet(
  value: string,
  snippet: string,
  cursor = value.length,
) {
  return value.slice(0, cursor) + snippet + value.slice(cursor);
}

export { wrapSelection };
