import { chatStore, selectIsStreaming } from '@/features/chat/chat.store';
import type { ChatEdge } from '@/features/chat/chat.types';

describe('selectIsStreaming', () => {
  const baseState = chatStore.getState();

  afterEach(() => {
    chatStore.setState({ ...baseState, edges: [] });
  });

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
