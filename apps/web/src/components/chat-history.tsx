'use client'
import { useMutation, useQuery } from '@apollo/client/react';
import {
  ChatSessionListDocument,
  ChatSessionListQuery,
  ChatSessionListQueryVariables,
  DeleteSessionDocument,
  DeleteSessionMutation,
  DeleteSessionMutationVariables,
} from '@/gql/graphql';
import {
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import Link from 'next/link';
import { useAuthState } from '@/features/auth/auth.store';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreHorizontal } from 'lucide-react';
import { useSessionsActions } from '@/features/chat/chat.sessions.store';
import { useChatActions } from '@/features/chat/chat.store';
import { usePathname, useRouter } from 'next/navigation';
import React from 'react';

export default function ChatHistory() {
  const { user } = useAuthState();
  const { reset } = useChatActions();

  const router = useRouter();
  const pathname = usePathname();

  const { selectedSessionId, setSelectedSessionId } = useSessionsActions();

  const { data } = useQuery<ChatSessionListQuery, ChatSessionListQueryVariables>(
    ChatSessionListDocument,
    {
      variables: { first: 50 },
      fetchPolicy: 'cache-and-network',
      notifyOnNetworkStatusChange: true,
      skip: !user,
    },
  );
  const [mutateDeleteSession] = useMutation<DeleteSessionMutation, DeleteSessionMutationVariables>(
    DeleteSessionDocument,
  );

  const edges = user ? data?.chatSessionList.edges ?? [] : [];

  const deleteSession = async (sessionId: string) => {
    try {
      await mutateDeleteSession({
        variables: { sessionId },
        optimisticResponse: {
          deleteChatSession: {
            __typename: 'DeleteChatSessionResult',
            ok: true,
            sessionId: 'optimistic',
            status: 'deleting',
          },
        },
        refetchQueries: [{ query: ChatSessionListDocument }],
        awaitRefetchQueries: true,
      });
    } catch (e) {
      console.error('delete session  mutation failed', e);
      alert('세션 삭제 요청에 실패했습니다.');
    }
  };


  return (
    <SidebarMenu className={'flex flex-col gap-2'}>
      {edges.map(edge => (
        <SidebarMenuItem key={edge.node.id}>
          <div className="relative flex items-center group/item">
            <SidebarMenuButton className="block truncate whitespace-nowrap" asChild>
              <Link
                className={
                  pathname === `/chat/${edge.node.id}`
                    ? 'bg-accent text-accent-foreground'
                    : 'hover:bg-accent/50'
                }
                title={edge.node.title?.replace(/^"|"$/g, '')}
                href={`/chat/${edge.node.id}`}
              >
                {edge.node.title?.replace(/"/g, '') ?? (
                  <>
                    <div className="inline-flex gap-1">
                      <span
                        className="inline-block animate-bounce"
                        style={{ animationDelay: '0ms' }}
                      >
                        .
                      </span>
                      <span
                        className="inline-block animate-bounce"
                        style={{ animationDelay: '200ms' }}
                      >
                        .
                      </span>
                      <span
                        className="inline-block animate-bounce"
                        style={{ animationDelay: '400ms' }}
                      >
                        .
                      </span>
                    </div>
                  </>
                )}
              </Link>
            </SidebarMenuButton>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuAction className="opacity-0 group-hover/item:opacity-100 group-focus-within/item:opacity-100 transition-opacity">
                  <MoreHorizontal />
                  <span className="sr-only">Chat Menu</span>
                </SidebarMenuAction>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="right" align="start">
                <DropdownMenuItem
                  onClick={() => {
                    const wasCurrent = selectedSessionId === edge.node.id;
                    void deleteSession(edge.node.id);
                    if (wasCurrent) {
                      reset();
                      router.push('/');
                    }
                  }}
                >
                  <span>Delete</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  );
}
