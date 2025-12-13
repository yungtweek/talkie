'use client'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarTrigger,
} from '@/components/ui/sidebar';
import Link from 'next/link';
import ChatHistory from '@/components/ChatHistory';
import { Folder, Home, LogIn, SquarePen } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAuthState } from '@/features/auth/auth.store';
import { useChatActions } from '@/features/chat/chat.store';
import { useAuth } from '@/features/auth/useAuth';
import { Button } from '@/components/ui/button';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useApolloClient } from '@apollo/client/react';
import { useSessionsActions } from '@/features/chat/chat.sessions.store';

export function AppSidebar() {
  const { user, loading } = useAuthState();
  const { reset } = useChatActions();
  const { logout } = useAuth();
  const { selectedSessionId, setSelectedSessionId } = useSessionsActions();

  const router = useRouter();
  const pathname = usePathname();

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  const showLoading = !mounted || loading;

  const client = useApolloClient();
  const handleLogout = async () => {
    reset();
    try {
      await client.clearStore();
    } catch (error) {
      console.error('Failed to clear Apollo cache on logout', error);
    }
    await logout();
  };

  return (
    <Sidebar>
      <SidebarHeader />
      <SidebarContent className="overflow-hidden">
        <SidebarGroup>
          {/*<SidebarGroupLabel>Talkie</SidebarGroupLabel>*/}
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <Link href="/" onClick={() => setSelectedSessionId(null)}>
                    <Home />
                    Talkie
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <Link
                    className="w-full"
                    href="/chat"
                    onClick={() => {
                      setSelectedSessionId(null);
                    }}
                  >
                    <SquarePen />
                    Chat
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <Link
                    className="w-full"
                    href="/documents"
                    onClick={() => {
                      setSelectedSessionId(null);
                    }}
                  >
                    <Folder />
                    Documents
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup className="flex min-h-0 flex-col">
          <SidebarGroupLabel>Chats</SidebarGroupLabel>
          <SidebarGroupContent className="flex-1 overflow-y-auto">
            <ChatHistory />
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              {showLoading ? (
                <Button variant={'outline'} size={'sm'} type="button" disabled>
                  ...
                </Button>
              ) : user ? (
                <Button
                  variant={'outline'}
                  size={'sm'}
                  type="button"
                  onClick={() => {
                    void handleLogout();
                  }}
                >
                  logout
                </Button>
              ) : (
                pathname !== '/login' && (
                  <Button
                    variant={'outline'}
                    size={'sm'}
                    type="button"
                    onClick={() => router.push('/login')}
                  >
                    login
                  </Button>
                )
              )}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
