'use client';

import React, { useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { usePathname, useRouter } from 'next/navigation';
import { chatSessionsStore, useSessionsActions } from '@/features/chat/chat.sessions.store';
import { useMutation, useQuery } from '@apollo/client/react';
import {
  ChatSessionListDocument,
  ChatSessionListQuery,
  ChatSessionListQueryVariables,
  DeleteSessionDocument,
  DeleteSessionMutation,
  DeleteSessionMutationVariables,
} from '@/gql/graphql';
import { useChatActions } from '@/features/chat/chat.store';
import Link from 'next/link';

export default function SessionList() {
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const { reset } = useChatActions();
  const { data } = useQuery<ChatSessionListQuery, ChatSessionListQueryVariables>(
    ChatSessionListDocument,
    {
      variables: { first: 50 },
      fetchPolicy: 'cache-and-network',
      notifyOnNetworkStatusChange: true,
    },
  );
  const [mutateDeleteSession] = useMutation<DeleteSessionMutation, DeleteSessionMutationVariables>(
    DeleteSessionDocument,
  );

  const { selectedSessionId, setSelectedSessionId } = useSessionsActions();
  const router = useRouter();
  const pathname = usePathname();

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

  useEffect(() => {
    setHoverId(null);
    setOpenId(null);
  }, [data?.chatSessionList.edges]);

  return (
    <div className="flex h-full flex-col gap-2 overflow-hidden px-4">
      <ul className="flex flex-col gap-2 overflow-auto p-2">
        <li className="relative inline-flex h-fit cursor-pointer justify-center rounded-lg">
          <Link
            href={'/chat'}
            onClick={() => {
              setSelectedSessionId(null);
            }}
            title={'New Chat'}
            className={clsx(
              'block min-w-0 self-center overflow-hidden text-ellipsis whitespace-nowrap p-2',
              pathname === '/chat' && 'cursor-default font-medium bg-white/10'
            )}
          >
            New Chat
          </Link>
        </li>
        <li className="relative inline-flex h-fit cursor-pointer justify-center rounded-lg">
          <Link
            href={'/documents'}
            onClick={() => {
              setSelectedSessionId(null);
            }}
            title={'Documents'}
            className={clsx(
              'block min-w-0 self-center overflow-hidden text-ellipsis whitespace-nowrap p-2',
              pathname === '/documents' && 'cursor-default font-medium bg-white/10'
            )}
          >
            Documents
          </Link>
        </li>
      </ul>
      <h3>Chats 💬</h3>
      <ul className={clsx('flex flex-1 flex-col gap-2 overflow-auto p-2')}>
        {data?.chatSessionList.edges.map(edge => (
          <li
            key={edge.node.id}
            className={clsx(
              'relative inline-flex h-fit justify-center rounded-lg hover:bg-white/10'
            )}
            onMouseEnter={() => setHoverId(edge.node.id)}
            onMouseLeave={() => {
              setHoverId(null);
              setOpenId(null);
            }}
          >
            <Link
              href={`/chat/${edge.node.id}`}
              className={clsx(
                'block min-w-0 self-center overflow-hidden text-ellipsis whitespace-nowrap p-2',
                selectedSessionId === edge.node.id && 'cursor-default font-medium bg-white/10'
              )}
              onClick={() => {
                if (selectedSessionId === edge.node.id) return;
                setSelectedSessionId(edge.node.id);
                chatSessionsStore.getState().setActiveSessionId(edge.node.id);
                // router.push(`/chat/${edge.node.id}`);
              }}
              title={edge.node.title?.replace(/^"|"$/g, '')}
            >
              {edge.node.title?.replace(/"/g, '') ?? (
                <>
                  <div className="inline-flex gap-1">
                    <span className="inline-block animate-bounce" style={{ animationDelay: '0ms' }}>
                      .
                    </span>
                    <span className="inline-block animate-bounce" style={{ animationDelay: '200ms' }}>
                      .
                    </span>
                    <span className="inline-block animate-bounce" style={{ animationDelay: '400ms' }}>
                      .
                    </span>
                  </div>
                </>
              )}
            </Link>

            {hoverId === edge.node.id && (
              <button
                className={
                  'h-full w-12 self-center rounded-lg p-2 text-foreground hover:bg-white/10'
                }
                onClick={() => {
                  setOpenId(edge.node.id);
                }}
              >
                ⋯
              </button>
            )}

            {openId === edge.node.id && (
              <div
                className={
                  'absolute right-0 top-full z-10 rounded-md border border-border bg-background p-1 shadow-md'
                }
              >
                <button
                  className={
                    'block w-full cursor-pointer rounded-md px-3 py-1.5 text-left text-[--danger-fg] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:color-mix(in_srgb,var(--danger-fg)_40%,transparent)]'
                  }
                  onClick={() => {
                    const wasCurrent = selectedSessionId === edge.node.id;
                    void deleteSession(edge.node.id);
                    if (wasCurrent) {
                      reset();
                      router.push('/');
                    }
                  }}
                >
                  Delete
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
