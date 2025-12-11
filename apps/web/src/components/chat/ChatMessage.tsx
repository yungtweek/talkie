
import { clsx } from 'clsx';
import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import rehypeSanitize from 'rehype-sanitize';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { ChatEdge } from '@/features/chat/chat.types';

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
      : role === 'system'
        ? 'w-full px-6 py-3'
        : '';

  return (
    <li className={clsx(roleClass, 'prose')} role={chat.node.role}>
      {showDots && (
        <div className="mt-0 inline-flex gap-1">
          <span className="inline-block animate-bounce" style={{ animationDelay: '0ms' }}>.</span>
          <span className="inline-block animate-bounce" style={{ animationDelay: '200ms' }}>.</span>
          <span className="inline-block animate-bounce" style={{ animationDelay: '400ms' }}>.</span>
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
    </li>
  );
}
