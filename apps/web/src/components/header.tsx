'use client'
import { Button } from '@/components/ui/button';
import { SidebarTrigger } from '@/components/ui/sidebar';

export default function Header() {
  return (
    <header className="flex shrink-0 items-center justify-between">
      <div>
        <Button variant={'outline'} size={'icon-sm'} className="bg-transparent, p-0" asChild>
          <SidebarTrigger />
        </Button>
      </div>
    </header>
  );
}
