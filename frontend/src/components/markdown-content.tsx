import { useEffect, useState, type ReactNode } from 'react';
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';
import { Download, FileIcon } from 'lucide-react';
import { api, type Attachment } from '@/lib/api';
import { MentionHoverCard } from '@/components/mentions-textarea';
import type { MentionUser } from '@/lib/mentions';
import { cn } from '@/lib/utils';

function parseAttachmentId(href?: string | null): number | null {
  if (!href) return null;
  const attachmentMatch = href.match(/^attachment:(\d+)$/i);
  if (attachmentMatch) return Number(attachmentMatch[1]);
  const apiMatch = href.match(/\/api\/attachments\/(\d+)/i);
  if (apiMatch) return Number(apiMatch[1]);
  return null;
}

function useAttachmentBlob(attachmentId: number | null) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (attachmentId == null) {
      setUrl(null);
      setFailed(false);
      return;
    }
    let revoked: string | null = null;
    let cancelled = false;
    setFailed(false);
    void fetch(api.attachmentUrl(attachmentId), { credentials: 'include' })
      .then((res) => {
        if (!res.ok) throw new Error('fail');
        return res.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        revoked = URL.createObjectURL(blob);
        setUrl(revoked);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [attachmentId]);

  return { url, failed };
}

function AuthAttachmentImage({
  id,
  alt,
  className,
}: {
  id: number;
  alt?: string;
  className?: string;
}) {
  const { url, failed } = useAttachmentBlob(id);
  if (failed) {
    return (
      <span className="text-sm text-destructive">Не удалось загрузить изображение</span>
    );
  }
  if (!url) {
    return (
      <span className="inline-block h-40 w-full max-w-xl animate-pulse rounded-md bg-muted" />
    );
  }
  return (
    <img
      src={url}
      alt={alt || ''}
      className={cn('my-3 max-h-[28rem] max-w-full rounded-lg border border-border', className)}
    />
  );
}

function AuthAttachmentLink({
  id,
  children,
}: {
  id: number;
  children: ReactNode;
}) {
  const onDownload = async () => {
    try {
      const res = await fetch(api.attachmentUrl(id, true), {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('fail');
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = typeof children === 'string' ? children : `file-${id}`;
      a.click();
      URL.revokeObjectURL(objectUrl);
    } catch {
      window.open(api.attachmentUrl(id, true), '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <button
      type="button"
      onClick={() => void onDownload()}
      className="inline-flex items-center gap-1.5 text-primary underline-offset-2 hover:underline"
    >
      <FileIcon className="h-3.5 w-3.5" />
      <span>{children}</span>
      <Download className="h-3 w-3 opacity-60" />
    </button>
  );
}

function escapeMarkdownLabel(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/[\[\]]/g, '\\$&');
}

function markdownUrlTransform(value: string): string {
  if (/^(attachment|mention):/i.test(value)) {
    return value;
  }
  return defaultUrlTransform(value);
}

export function markdownAttachmentImage(file: Attachment): string {
  return `![${escapeMarkdownLabel(file.originalName)}](attachment:${file.id})`;
}

export function markdownAttachmentLink(file: Attachment): string {
  return `[${escapeMarkdownLabel(file.originalName)}](attachment:${file.id})`;
}

const MENTION_TOKEN = /@[^\s@]+/gu;

/** Turn known @mentions into markdown links for safe rendering alongside GFM. */
export function preprocessMentionsForMarkdown(
  text: string,
  users: MentionUser[],
): string {
  if (!users.length) return text;
  const byUsername = new Map(
    users.map((u) => [u.username.toLowerCase(), u] as const),
  );
  return text.replace(MENTION_TOKEN, (raw) => {
    const username = raw.slice(1);
    if (byUsername.has(username.toLowerCase())) {
      return `[${raw}](mention:${username})`;
    }
    return raw;
  });
}

export function MarkdownContent({
  content,
  className,
  users,
}: {
  content?: string | null;
  className?: string;
  users?: MentionUser[];
}) {
  if (!content?.trim()) {
    return (
      <p className="text-sm text-muted-foreground">Нет содержимого</p>
    );
  }

  const markdown = users?.length
    ? preprocessMentionsForMarkdown(content, users)
    : content;
  const userByUsername = new Map(
    (users ?? []).map((u) => [u.username.toLowerCase(), u] as const),
  );

  return (
    <div
      className={cn(
        'prose-help max-w-none text-sm leading-relaxed text-foreground',
        '[&_h1]:mb-3 [&_h1]:mt-5 [&_h1]:text-xl [&_h1]:font-semibold',
        '[&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-lg [&_h2]:font-semibold',
        '[&_h3]:mb-2 [&_h3]:mt-3 [&_h3]:text-base [&_h3]:font-semibold',
        '[&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5',
        '[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5',
        '[&_li]:my-0.5 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground',
        '[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[0.85em]',
        '[&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-border [&_pre]:bg-muted/50 [&_pre]:p-3',
        '[&_a]:text-primary [&_a]:underline-offset-2 hover:[&_a]:underline',
        '[&_table]:my-3 [&_table]:w-full [&_table]:border-collapse',
        '[&_th]:border [&_th]:border-border [&_th]:bg-muted/40 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left',
        '[&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1',
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        urlTransform={markdownUrlTransform}
        components={{
          img: ({ src, alt }) => {
            const id = parseAttachmentId(typeof src === 'string' ? src : null);
            if (id != null) {
              return <AuthAttachmentImage id={id} alt={alt} />;
            }
            if (!src) return null;
            return (
              <img
                src={src}
                alt={alt || ''}
                className="my-3 max-h-[28rem] max-w-full rounded-lg border border-border"
              />
            );
          },
          a: ({ href, children }) => {
            const mentionMatch = href?.match(/^mention:(.+)$/i);
            if (mentionMatch) {
              const user = userByUsername.get(mentionMatch[1]!.toLowerCase());
              if (user) {
                return (
                  <MentionHoverCard user={user}>
                    {String(children)}
                  </MentionHoverCard>
                );
              }
            }
            const id = parseAttachmentId(href);
            if (id != null) {
              return (
                <AuthAttachmentLink id={id}>{children}</AuthAttachmentLink>
              );
            }
            return (
              <a href={href} target="_blank" rel="noreferrer noopener">
                {children}
              </a>
            );
          },
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
