'use client';
import Chat from '@/components/chat/Chat';
import { StickyComposer } from '@/components/chat/StickyComposer';

export default function ChatPage() {
  return (
    <>
      <div className="overscroll-contain -webkit-overflow-scrolling-touch flex-1 touch-pan-y overflow-y-auto">
        <Chat />
      </div>
      <StickyComposer />
    </>
  );
}
