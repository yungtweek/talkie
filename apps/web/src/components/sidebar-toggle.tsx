'use client';



import type { ComponentProps } from 'react';
import { SidebarTrigger } from '@/components/ui/sidebar';

export function SidebarToggle({ className }: ComponentProps<typeof SidebarTrigger>) {

  return (
    <SidebarTrigger className={className} />
  );
}
