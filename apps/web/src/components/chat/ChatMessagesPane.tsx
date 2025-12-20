import React, { useEffect, useRef, useState } from 'react';
import { clsx } from 'clsx';
import ChatMessage from '@/components/chat/ChatMessage';
import { useSessionsState } from '@/features/chat/chat.sessions.store';
import { useChatSessionStream } from '@/features/chat/useChatSessionStream';
import { useChatUI } from '@/providers/ChatProvider';
import { useChatState } from '@/features/chat/chat.store';
import { ChatEdge } from '@/features/chat/chat.types';
import { Greeting } from '@/components/chat/Greeting';

export default function MessagesPane() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const { awaitingFirstToken, setAwaitingFirstToken } = useChatUI();
  const { selectedSessionId } = useSessionsState();
  const { messages, loading } = useChatSessionStream(selectedSessionId);
  const { busy } = useChatState();

  useEffect(() => {
    console.log('messages changed', messages);
    if (!awaitingFirstToken) return;
    const last = messages[messages.length - 1];
    if (last?.node?.role === 'assistant' && (last?.node?.content?.trim()?.length ?? 0) > 0) {
      setAwaitingFirstToken(false);
    }
  }, [messages, awaitingFirstToken]);

  const isStreamingNow = busy || awaitingFirstToken || loading;

  useEffect(() => {
    if (!containerRef.current) return;
    const userChat = containerRef.current.querySelectorAll('li[role="user"]');
    if (userChat.length > 0) {
      const lastUserChat = userChat[userChat.length - 1];
      lastUserChat.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' });
    }
  }, [messages]);

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
        {messages.length ===0 && <Greeting />}
        <div className={clsx('flex min-h-full flex-col gap-9 pb-24')}>
          <>
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
          </>
        </div>
      </div>
    </div>
  );
}
