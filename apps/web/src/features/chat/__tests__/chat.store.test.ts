import { chatStore, selectIsStreaming } from '@/features/chat/chat.store';
import type { ChatEdge } from '@/features/chat/chat.types';
import { safeJsonParse } from '@/lib/utils';

const baseState = chatStore.getState();

afterEach(() => {
  chatStore.setState({ ...baseState, edges: [] });
});

describe('selectIsStreaming', () => {
  it('returns false when there are no edges', () => {
    const edges: ChatEdge[] = [];
    expect(selectIsStreaming(edges)).toBe(false);
  });

  it('returns false when assistant stream is done', () => {
    const edges: ChatEdge[] = [
      { node: { role: 'assistant', content: 'hi', streamDone: true } },
    ];
    expect(selectIsStreaming(edges)).toBe(false);
  });

  it('returns true when assistant stream is active', () => {
    const edges: ChatEdge[] = [
      { node: { role: 'assistant', content: '', streamDone: false } },
    ];
    expect(selectIsStreaming(edges)).toBe(true);
  });

  it('ignores non-assistant roles', () => {
    const edges: ChatEdge[] = [
      { node: { role: 'user', content: 'hi', streamDone: false } },
    ];
    expect(selectIsStreaming(edges)).toBe(false);
  });
});

describe('updateRagSearch', () => {
  it('keeps in-progress and completed snapshots for detail view', () => {
    const jobId = 'job-123';
    chatStore.setState({
      ...baseState,
      edges: [
        {
          node: {
            role: 'assistant',
            content: '',
            jobId,
            ragSearchJson: JSON.stringify({
              inProgress: {
                query: 'hello',
                hits: 1,
              },
              completed: null,
            }),
          },
        },
      ],
    });

    chatStore.getState().updateRagSearch(jobId, 'completed', { hits: 2, tookMs: 15 });

    const updated = safeJsonParse<{
      inProgress?: { query?: string; hits?: number } | null;
      completed?: { hits?: number; tookMs?: number } | null;
    }>(chatStore.getState().edges[0]?.node.ragSearchJson, null);
    expect(updated).toEqual({
      inProgress: {
        query: 'hello',
        hits: 1,
      },
      completed: {
        hits: 2,
        tookMs: 15,
      },
    });
  });
});
