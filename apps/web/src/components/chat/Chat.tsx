'use client';
import { useSessionsActions } from '@/features/chat/chat.sessions.store';
import { useEffect } from 'react';
import MessagesPane from '@/components/chat/ChatMessagesPane';

export interface ChatProps {
  sessionId?: string;
}

export default function Chat({ sessionId }: ChatProps) {
  const { setSelectedSessionId, setActiveSessionId, selectedSessionId } = useSessionsActions();

  useEffect(() => {
    const sid = typeof sessionId === 'string' && sessionId.length > 0 ? sessionId : null;

    if (!sid) {
      // 새 세션을 생성하도록 활성/선택 상태를 초기화
      if (selectedSessionId !== null) setSelectedSessionId(null);
      setActiveSessionId(null);
      return;
    }

    // 지정된 sessionId를 선택/활성화
    if (selectedSessionId !== sid) {
      setSelectedSessionId(sid);
    }
    setActiveSessionId(sid);
  }, [sessionId, selectedSessionId, setSelectedSessionId, setActiveSessionId]);

  return <MessagesPane />;
}
