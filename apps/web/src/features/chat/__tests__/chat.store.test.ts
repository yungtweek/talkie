import { chatStore, selectIsStreaming } from '@/features/chat/chat.store';
import type { ChatEdge } from '@/features/chat/chat.types';

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
  it('preserves previous fields while keeping the latest status and payload', () => {
    const jobId = 'job-123';
    chatStore.setState({
      ...baseState,
      edges: [
        {
          node: {
            role: 'assistant',
            content: '',
            jobId,
            ragSearch: {
              status: 'in_progress',
              query: 'hello',
              hits: 1,
            },
          },
        },
      ],
    });

    chatStore.getState().updateRagSearch(jobId, 'completed', { hits: 2, tookMs: 15 });

    const updated = chatStore.getState().edges[0]?.node.ragSearch;
    expect(updated).toEqual({
      status: 'completed',
      query: 'hello',
      hits: 2,
      tookMs: 15,
    });
  });
});
