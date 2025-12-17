'use client';
import React, { ReactNode } from 'react';
import { clsx } from 'clsx';
import Header from '@/components/header';
import { SidebarProvider } from '@/components/ui/sidebar';

export default function LoginLayout({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider>
      <div className={clsx('min-h-screen w-full bg-background text-foreground')}>
        <Header />
        <main className="p-4 md:p-6 lg:p-8">{children}</main>
      </div>
    </SidebarProvider>
  );
}
