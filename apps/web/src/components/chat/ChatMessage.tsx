import { clsx } from 'clsx';
import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import rehypeSanitize from 'rehype-sanitize';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { ChatEdge } from '@/features/chat/chat.types';
import { safeJsonParse } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';

export default function ChatMessage({ chat, showDots }: { chat: ChatEdge; showDots?: boolean }) {
  const CodeBlock = ({ className, children, node, ...props }: any) => {
    const match = /language-(\w+)/.exec(className || '');
    const raw = String(children).replace(/\n$/, '');
    const code = stripIndent(raw);
    return match ? (
      <pre className="overflow-x-auto rounded-xl p-0" style={{paddingLeft: 0, paddingRight: 0}}>
        <div className="border-b border-border bg-(--border-mid) px-4 py-1 opacity-70 text-muted-foreground">
          {match[1]}
        </div>
        <SyntaxHighlighter
          PreTag="div"
          style={vscDarkPlus}
          language={match[1]}
          customStyle={{ margin: 0, padding: '1.5rem 1.5rem' }}
          {...props}
        >
          {code}
        </SyntaxHighlighter>
      </pre>
    ) : (
      <code className={className} {...props}>
        {children}
      </code>
    );
  };

  function stripIndent(input: string) {
    const s = input.replace(/^\n/, '').replace(/\s+$/, '');
    const lines = s.split('\n');
    const indents = lines
      .filter(l => l.trim().length > 0)
      .map(l => l.match(/^(\s*)/)?.[1].length ?? 0);
    const min = indents.length ? Math.min(...indents) : 0;
    return lines.map(l => l.slice(min)).join('\n');
  }

  const role = chat.node.role;
  const roleClass =
    role === 'user'
      ? 'ml-auto w-fit max-w-[80%] rounded-3xl bg-[var(--border)] px-5 py-2'
      : role === 'assistant'
        ? 'w-full max-w-[100%]'
      : role === 'system'
        ? 'w-full px-6 py-3'
        : '';

  const citations = safeJsonParse<{
    citations?: Array<{
      title?: string;
      snippet?: string;
      file_name?: string;
      source_id?: string;
      rerank_score?: number;
    }>;
  }>(chat.node.sourcesJson, { citations: [] }).citations ?? [];

  const groupedCitations = useMemo(() => {
    const groups = new Map<string, typeof citations>();
    for (const c of citations) {
      const key = c.file_name || c.title || 'Untitled source';
      const arr = groups.get(key) ?? [];
      arr.push(c);
      groups.set(key, arr);
    }

    // sort by rerank_score desc within each file (if present)
    for (const [k, arr] of groups.entries()) {
      arr.sort((a, b) => (b.rerank_score ?? -Infinity) - (a.rerank_score ?? -Infinity));
      groups.set(k, arr);
    }

    // stable ordering: files by top rerank_score desc
    const entries = Array.from(groups.entries()).map(([file, items]) => {
      const top = items.length ? (items[0].rerank_score ?? -Infinity) : -Infinity;
      return { file, items, top };
    });
    entries.sort((a, b) => b.top - a.top);
    return entries;
  }, [citations]);

  return (
    <div className={clsx(roleClass, 'prose')} role={chat.node.role}>
      {showDots && (
        <div className="mt-0 inline-flex gap-1">
          <span className="inline-block animate-bounce" style={{ animationDelay: '0ms' }}>
            .
          </span>
          <span className="inline-block animate-bounce" style={{ animationDelay: '200ms' }}>
            .
          </span>
          <span className="inline-block animate-bounce" style={{ animationDelay: '400ms' }}>
            .
          </span>
        </div>
      )}
      <ReactMarkdown
        remarkPlugins={[remarkBreaks]}
        rehypePlugins={[rehypeSanitize]}
        components={{
          br: () => <br />,
          pre({ children }) {
            return <>{children}</>; // 바깥 pre 제거
          },
          code(CodeProps) {
            return <CodeBlock {...CodeProps} />;
          },
        }}
      >
        {chat.node.content}
      </ReactMarkdown>
      {citations.length > 0 && (
        <div className="mt-4">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="text-xs"
              >
                <span>Sources</span>
                <span>
                  {groupedCitations.length} file{groupedCitations.length === 1 ? '' : 's'} ·{' '}
                  {citations.length} passage{citations.length === 1 ? '' : 's'}
                </span>
              </Button>
            </PopoverTrigger>

            <PopoverContent align="start" className="w-xl max-w-[90vw] p-0">
              <div className="border-b border-border px-4 py-3">
                <div className="text-sm font-semibold">Sources</div>
                <div className="text-xs text-muted-foreground">
                  {groupedCitations.length} file{groupedCitations.length === 1 ? '' : 's'} ·{' '}
                  {citations.length} passage{citations.length === 1 ? '' : 's'}
                </div>
              </div>

              <div className="max-h-96 overflow-auto px-4 py-3">
                <div className="space-y-3">
                  {groupedCitations.map(({ file, items }) => (
                    <div key={file}>
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <div className="min-w-0 truncate text-sm font-semibold">{file}</div>
                        <div className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                          {items.length} passage{items.length === 1 ? '' : 's'}
                        </div>
                      </div>

                      <div className="space-y-3">
                        {items.map((c, i) => (
                          <div key={c.source_id ?? `${file}-${i}`} className="text-sm">
                            <div className="mb-1 flex items-center justify-between gap-3">
                              <div className="min-w-0 truncate text-xs text-muted-foreground">
                                {c.source_id ?? `#${i + 1}`}
                              </div>
                              {typeof c.rerank_score === 'number' && (
                                <div className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                                  {c.rerank_score.toFixed(2)}
                                </div>
                              )}
                            </div>

                            {c.snippet ? (
                              <div className="rounded-md bg-muted/40 p-2 text-sm text-muted-foreground">
                                <div className="whitespace-pre-wrap line-clamp-6">{c.snippet}</div>
                              </div>
                            ) : (
                              <div className="text-xs text-muted-foreground">(no snippet)</div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      )}
    </div>
  );
}
