type StreamHandlers = {
  onText?: (chunk: string) => void;
  onSources?: (sources: unknown) => void;
  onRagSearch?: (
    status: 'in_progress' | 'completed',
    payload: { hits?: number; tookMs?: number; query?: string },
  ) => void;
  onDone?: () => void;
  onError?: (err: unknown) => void;
};

export function openChatStream(jobId: string, handlers: StreamHandlers) {
  const es = new EventSource(`/api/chat/${jobId}`, { withCredentials: true });

  es.addEventListener('token', (e: MessageEvent) => {
    const d = JSON.parse(e.data);
    const chunk = d.text ?? d.content ?? '';
    if (chunk) {
      handlers.onText?.(chunk);
    }
  });

  es.addEventListener('sources', (e: MessageEvent) => {
    try {
      const d = JSON.parse(e.data);
      handlers.onSources?.(d);
    } catch (err) {
      console.warn('[chat][sources] parse failed', err);
    }
  });

  es.addEventListener('rag_search_call.in_progress', (e: MessageEvent) => {
    try {
      const d = JSON.parse(e.data);
      handlers.onRagSearch?.('in_progress', {
        query: d.query,
      });
    } catch (err) {
      console.warn('[chat][rag_search_call.in_progress] parse failed', err);
    }
  });

  es.addEventListener('rag_search_call.completed', (e: MessageEvent) => {
    try {
      const d = JSON.parse(e.data);
      handlers.onRagSearch?.('completed', {
        query: d.query,
        hits: d.hits,
        tookMs: d.tookMs,
      });
    } catch (err) {
      console.warn('[chat][rag_search_call.completed] parse failed', err);
    }
  });

  es.addEventListener('done', () => {
    es.close();
    handlers.onDone?.();
  });

  es.addEventListener('error', e => {
    es.close();
    handlers.onError?.(e);
  });

  return es;
}
