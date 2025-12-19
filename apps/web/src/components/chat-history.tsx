'use client'
import { NetworkStatus } from '@apollo/client';
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
import { removeFromConnection } from '@/lib/apollo/connection';

export default function ChatHistory() {
  const pageSize = 10;
  const { user } = useAuthState();
  const { reset } = useChatActions();

  const router = useRouter();
  const pathname = usePathname();

  const { selectedSessionId, setSelectedSessionId } = useSessionsActions();

  const { data, fetchMore, networkStatus } = useQuery<
    ChatSessionListQuery,
    ChatSessionListQueryVariables
  >(
    ChatSessionListDocument,
    {
      variables: { first: pageSize },
      fetchPolicy: 'cache-and-network',
      notifyOnNetworkStatusChange: true,
      skip: !user,
    },
  );
  const [mutateDeleteSession] = useMutation<DeleteSessionMutation, DeleteSessionMutationVariables>(
    DeleteSessionDocument,
  );

  const edges = user ? data?.chatSessionList.edges ?? [] : [];
  const pageInfo = user ? data?.chatSessionList.pageInfo : undefined;
  const hasNextPage = Boolean(pageInfo?.hasNextPage);
  const isLoadingMore = networkStatus === NetworkStatus.fetchMore;

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
        update: (cache, _result, { variables }) => {
          const targetSessionId = variables?.sessionId;
          if (!targetSessionId) return;
          removeFromConnection(cache, { fieldName: 'chatSessionList', id: targetSessionId });
          const cacheId = cache.identify({ __typename: 'ChatSession', id: targetSessionId });
          if (cacheId) {
            cache.evict({ id: cacheId });
          }
        },
      });
    } catch (e) {
      console.error('delete session  mutation failed', e);
      alert('세션 삭제 요청에 실패했습니다.');
    }
  };

  const loadMoreSessions = async () => {
    if (!hasNextPage || !pageInfo?.endCursor || isLoadingMore) return;
    try {
      await fetchMore({
        variables: {
          first: pageSize,
          after: pageInfo.endCursor,
        },
        updateQuery: (prev, { fetchMoreResult }) => {
          if (!fetchMoreResult?.chatSessionList) return prev;
          const existingEdges = prev.chatSessionList.edges ?? [];
          const incomingEdges = fetchMoreResult.chatSessionList.edges ?? [];
          const seenIds = new Set(existingEdges.map(edge => edge.node.id));
          const mergedEdges = existingEdges.concat(
            incomingEdges.filter(edge => !seenIds.has(edge.node.id)),
          );
          return {
            chatSessionList: {
              __typename: prev.chatSessionList.__typename,
              edges: mergedEdges,
              pageInfo: fetchMoreResult.chatSessionList.pageInfo,
            },
          };
        },
      });
    } catch (e) {
      console.error('load more sessions failed', e);
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
                  onSelect={() => {
                    const wasCurrent = selectedSessionId === edge.node.id;
                    void deleteSession(edge.node.id);
                    if (wasCurrent) {
                      reset();
                      setSelectedSessionId(null);
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
      {hasNextPage ? (
        <SidebarMenuItem>
          <SidebarMenuButton
            className="text-muted-foreground justify-center"
            disabled={isLoadingMore}
            onClick={() => void loadMoreSessions()}
          >
            {isLoadingMore ? 'Loading...' : 'Load more'}
          </SidebarMenuButton>
        </SidebarMenuItem>
      ) : null}
    </SidebarMenu>
  );
}
