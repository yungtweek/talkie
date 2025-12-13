// components/ChatModeToggle.tsx
'use client';

import { clsx } from 'clsx';
import { useChatActions } from '@/features/chat/chat.store';
import { Button } from '@/components/ui/button';
import { FileText } from 'lucide-react';

interface ChatToggleModuleProps {
  sessionId: string | null;
}

export default function ChatModeToggle({ sessionId }: ChatToggleModuleProps) {
  const { getRag, toggleRag } = useChatActions();
  const rag = getRag(sessionId);
  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => toggleRag(sessionId)}
      >
        <FileText />
        {rag && <span>RAG</span>}
      </Button>
    </>
    // <div className="inline-flex items-center gap-3 pb-2.5">
    //   <div className="inline-flex rounded-md bg-border p-0.5">
    //     <button
    //       type="button"
    //       onClick={() => toggleRag(sessionId)}
    //       className={clsx(
    //         'rounded-md px-3 py-1.5 text-sm text-muted-foreground transition hover:bg-foreground/10',
    //         !rag && 'bg-accent text-foreground hover:bg-accent'
    //       )}
    //     >
    //       GEN
    //     </button>
    //     <button
    //       type="button"
    //       onClick={() => toggleRag(sessionId)}
    //       className={clsx(
    //         'rounded-md px-3 py-1.5 text-sm text-muted-foreground transition hover:bg-foreground/10',
    //         rag && 'bg-accent text-foreground hover:bg-accent'
    //       )}
    //     >
    //       RAG
    //     </button>
    //   </div>
    //   <span className="text-xs text-muted-foreground">
    //     {rag
    //       ? 'Answer with your documents and the model'
    //       : 'Answer with only the model’s knowledge'}
    //   </span>
    // </div>
  );
}
