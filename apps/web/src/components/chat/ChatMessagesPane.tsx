import React, { useRef } from 'react';
import { clsx } from 'clsx';
import ChatMessage from '@/components/chat/ChatMessage';
import { useSessionsState } from '@/features/chat/chat.sessions.store';
import { useChatSessionStream } from '@/features/chat/useChatSessionStream';
import { useChatStreaming } from '@/features/chat/chat.store';
import { ChatEdge } from '@/features/chat/chat.types';
import { Greeting } from '@/components/chat/Greeting';
import { useChatScrollAnchors } from '@/hooks/use-chat-scroll';
import { Button } from '@/components/ui/button';
import { IconArrowDown } from '@tabler/icons-react';

export default function MessagesPane() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const { selectedSessionId } = useSessionsState();
  const { messages } = useChatSessionStream(selectedSessionId);
  const isStreamingNow = useChatStreaming();

  const { isAutoScrollEnabled, resumeAutoScroll } = useChatScrollAnchors(
    containerRef,
    messages,
    isStreamingNow,
  );

  const isAssistant = (c: ChatEdge) => c.node.role === 'assistant';
  const lastAssistantIndex = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (isAssistant(messages[i])) return i;
    }
    return -1;
  })();

  return (
    <div className={clsx('h-full min-h-0 w-full flex-1 overflow-auto mx-auto')} ref={containerRef}>
      <div className="w-full max-w-4xl mx-auto px-4 ">
        {messages.length === 0 && <Greeting />}
        <div className={clsx('flex min-h-full flex-col')}>
          {messages.map((chat, i) => (
            <ChatMessage
              chat={chat}
              key={i}
              showDots={
                isStreamingNow &&
                i === lastAssistantIndex &&
                isAssistant(chat) &&
                (!chat.node.content || chat.node.content.length === 0)
              }
            />
          ))}
          <div className='h-9' />
        </div>
        {!isAutoScrollEnabled && (
          <div className="sticky bottom-6 z-10 flex justify-center">
            <Button
              type="button"
              variant="secondary"
              size="icon-sm"
              onClick={() =>
                resumeAutoScroll({ scrollToBottom: !isStreamingNow, behavior: 'smooth' })
              }
              aria-label="Resume auto-scroll"
            >
              <IconArrowDown />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
