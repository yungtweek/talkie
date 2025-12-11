'use client';
import { useEffect, useState } from 'react';

import { useAuthState } from '@/features/auth/auth.store';
import { useAuth } from '@/features/auth/useAuth';
import { useRouter, usePathname } from 'next/navigation';
import { useChatActions } from '@/features/chat/chat.store';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { SidebarTrigger } from '@/components/ui/sidebar';

export default function Header() {
  const { user, loading } = useAuthState();
  const { reset } = useChatActions();
  const { logout } = useAuth();

  const router = useRouter();
  const pathname = usePathname();

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  const showLoading = !mounted || loading;


  return (
    <header className="flex shrink-0 items-center justify-between">
      <div>
        <Button variant={'outline'} size={'icon-sm'} className="bg-transparent, p-0">
          <SidebarTrigger />
        </Button>
      </div>
      {/*<div>*/}
      {/*  {showLoading ? (*/}
      {/*    <Button variant={'outline'} size={'sm'} type="button" disabled>*/}
      {/*      ...*/}
      {/*    </Button>*/}
      {/*  ) : user ? (*/}
      {/*    <Button*/}
      {/*      variant={'outline'}*/}
      {/*      size={'sm'}*/}
      {/*      type="button"*/}
      {/*      onClick={() => {*/}
      {/*        void (async () => {*/}
      {/*          reset();*/}
      {/*          await logout();*/}
      {/*        })();*/}
      {/*      }}*/}
      {/*    >*/}
      {/*      logout*/}
      {/*    </Button>*/}
      {/*  ) : (*/}
      {/*    pathname !== '/login' && (*/}
      {/*      <Button variant={'outline'} size={'sm'} type="button" onClick={() => router.push('/login')}>*/}
      {/*        login*/}
      {/*      </Button>*/}
      {/*    )*/}
      {/*  )}*/}
      {/*</div>*/}
    </header>
  );
}
