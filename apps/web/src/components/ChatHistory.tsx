'use client'
import { useQuery } from '@apollo/client/react';
import {
  ChatSessionListDocument,
  ChatSessionListQuery,
  ChatSessionListQueryVariables,
} from '@/gql/graphql';
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';
import Link from 'next/link';

export default function ChatHistory() {
  const { data } = useQuery<ChatSessionListQuery, ChatSessionListQueryVariables>(
    ChatSessionListDocument,
    {
      variables: { first: 50 },
      fetchPolicy: 'cache-and-network',
      notifyOnNetworkStatusChange: true,
    },
  );

  return (
    <SidebarMenu>
      {data?.chatSessionList.edges.map(edge => (
        <SidebarMenuItem key={edge.node.id}>
          <SidebarMenuButton className="block truncate whitespace-nowrap" asChild>
            <Link href={`/chat/${edge.node.id}`}>{edge.node.title}</Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  );
}
