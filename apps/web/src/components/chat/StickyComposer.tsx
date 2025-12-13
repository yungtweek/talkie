// StickyComposer.tsx
import React from 'react';
import ChatComposer from '@/components/chat/ChatComposer';

export function StickyComposer() {
  return (
    <div className="sticky bottom-0 z-1 mx-auto flex w-full max-w-4xl gap-2 border-t-0 bg-background px-4 pb-8">
      <ChatComposer />
    </div>
  );
}
