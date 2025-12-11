// apps/web/src/app/chat/layout.tsx
'use client'
import ChatProvider from '@/providers/ChatProvider'
import {ReactNode} from "react";
import {StickyComposer} from "@/components/chat/StickyComposer";

export default function ChatLayout({children}: { children: ReactNode }) {
    return (
      <ChatProvider>
        <div className="overscroll-contain -webkit-overflow-scrolling-touch flex-1 touch-pan-y overflow-y-auto">
          {children}
        </div>
        <StickyComposer />
      </ChatProvider>
    );
}
