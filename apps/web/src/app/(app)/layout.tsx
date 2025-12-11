'use client';
import React, { ReactNode, useEffect, useState, useRef } from 'react';
import { usePathname } from 'next/navigation';

import { useAuthBootstrap } from '@/features/auth/useAuthBootstrap';
import Header from '@/components/Header';
import { clsx } from 'clsx';
import { useAuthState } from '@/features/auth/auth.store';
import ApolloProvider from '@/providers/ApolloProvider';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/app-sidebar';

export default function TalkieLayout({ children }: { children: ReactNode }) {
  useAuthBootstrap();

  return (
    <ApolloProvider>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <div className="overscroll-contain flex h-dvh min-w-0 touch-pan-y flex-col bg-background">
            <div className={'w-full p-2'}>
              <div className={'sticky top-0 z-10'}>
                <Header />
              </div>
            </div>
            {children}
          </div>
        </SidebarInset>
      </SidebarProvider>
    </ApolloProvider>
  );
}
