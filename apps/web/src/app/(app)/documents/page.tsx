'use client';
import type { ApolloCache } from '@apollo/client';
import React, { useEffect, useCallback } from 'react';
import FileUploader from '@/components/documents/FileUploader';
import { chatStore } from '@/features/chat/chat.store';
import { useSessionsActions } from '@/features/chat/chat.sessions.store';
import {
  DeleteFileDocument,
  DeleteFileMutation,
  DeleteFileMutationVariables,
  FilesDocument,
  FilesQuery,
  FilesQueryVariables,
  UpdateVisibilityDocument,
  UpdateVisibilityMutation,
  UpdateVisibilityMutationVariables,
} from '@/gql/graphql';
import type { FileVisibility as FileVisibilityT } from '@/gql/graphql';
import { FileVisibility } from '@talkie/types-zod';
import { useMutation, useQuery } from '@apollo/client/react';
import { removeFromConnection } from '@/lib/apollo/connection';
import FileItem from '@/components/documents/FileItem';
import { useIngestSSE } from '@/features/ingest/useIngestSSE';
import { toGqlVisibility, writeFileVisibility } from '@/features/ingest/ingest.utils';
import { clsx } from 'clsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export default function DocumentsPage() {
  const { reset } = chatStore();
  const { setSelectedSessionId, setActiveSessionId } = useSessionsActions();
  useIngestSSE();

  const { data } = useQuery<FilesQuery, FilesQueryVariables>(FilesDocument, {
    variables: { first: 20 },
    notifyOnNetworkStatusChange: true,
  });

  const [mutateDeleteFile, { loading: deleting }] = useMutation<
    DeleteFileMutation,
    DeleteFileMutationVariables
  >(DeleteFileDocument);

  const [mutateUpdateVisibility, { loading: updatingVisibility }] = useMutation<
    UpdateVisibilityMutation,
    UpdateVisibilityMutationVariables
  >(UpdateVisibilityDocument);

  useEffect(() => {
    setSelectedSessionId(null);
    setActiveSessionId(null);
    reset();
  }, [setActiveSessionId, reset]);

  const deleteFile = useCallback(
    async (fileId: string) => {
      try {
        await mutateDeleteFile({
          variables: { fileId },
          optimisticResponse: {
            deleteFile: {
              __typename: 'DeleteFilePayload',
              ok: true,
              fileId,
              message: 'optimistic',
              deletedCount: null,
            },
          },
          update: (cache: ApolloCache) => {
            const cacheId = cache.identify({ __typename: 'FileListType', id: fileId });
            cache.evict({ id: cacheId });
            removeFromConnection(cache, { fieldName: 'files', id: fileId });
          },
        });
      } catch (e) {
        console.error('deleteFile mutation failed', e);
        alert('파일 삭제 요청에 실패했습니다.');
      }
    },
    [mutateDeleteFile],
  );

  const toggleVisibility = useCallback(
    async (fileId: string, currentVisibility: FileVisibilityT) => {
      const next =
        currentVisibility === FileVisibility.Public
          ? FileVisibility.Private
          : FileVisibility.Public;
      try {
        await mutateUpdateVisibility({
          variables: { fileId, visibility: toGqlVisibility(next) },
          optimisticResponse: { updateVisibility: true },
          update: (cache: ApolloCache) => {
            writeFileVisibility(cache, fileId, toGqlVisibility(next));
          },
        });
      } catch (e) {
        console.error('updateVisibility mutation failed', e);
        alert('가시성 변경에 실패했습니다.');
      }
    },
    [mutateUpdateVisibility],
  );

  return (
    <>
      <div
        className={clsx('h-full min-h-0 w-full flex-1 overflow-auto mx-auto')}
        // ref={containerRef}
      >
        <div className="w-full max-w-4xl mx-auto px-4 ">
          <h1 className="py-2 text-xl font-semibold">Documents</h1>
          <div className="mb-4">
            <FileUploader />
          </div>
          <div className="space-y-3 rounded-xl border border-border bg-white/70 p-4 shadow-sm backdrop-blur-sm dark:bg-white/5">
            <div className="flex items-center justify-between">
              <h3 className="m-0 text-sm font-semibold text-muted-foreground">
                {data?.files.edges.length ?? 0} files
              </h3>
            </div>

            <Table className="border border-border rounded-xl">
              <TableHeader>
                <TableRow>
                  <TableHead className="">Filename</TableHead>
                  <TableHead className="px-4 text-center">Status</TableHead>
                  <TableHead className="px-4 text-center">Size</TableHead>
                  <TableHead className="px-4 text-center">Visibility</TableHead>
                  <TableHead className="px-4 text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.files.edges.map(e => (
                  <FileItem
                    key={e.cursor}
                    node={e.node}
                    deleting={deleting}
                    updatingVisibility={updatingVisibility}
                    onToggle={toggleVisibility}
                    onDelete={deleteFile}
                  />
                ))}
                {!data?.files.edges.length && (
                  <TableRow>
                    <TableCell colSpan={5} className="h-20 text-center text-sm font-normal">
                      업로드된 파일이 없습니다.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </>
  );
}
