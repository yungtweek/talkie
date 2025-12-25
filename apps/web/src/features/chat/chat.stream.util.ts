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
  let textBuffer = '';
  let flushHandle: number | null = null;

  const flushText = () => {
    if (!textBuffer) return;
    const chunk = textBuffer;
    textBuffer = '';
    flushHandle = null;
    handlers.onText?.(chunk);
  };

  const scheduleFlush = () => {
    if (flushHandle !== null) return;
    flushHandle = requestAnimationFrame(flushText);
  };

  es.addEventListener('token', (e: MessageEvent) => {
    const d = JSON.parse(e.data);
    const chunk = d.text ?? d.content ?? '';
    if (chunk) {
      textBuffer += chunk;
      scheduleFlush();
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

  es.addEventListener('rag_retrieve.in_progress', (e: MessageEvent) => {
    try {
      const d = JSON.parse(e.data);
      handlers.onRagSearch?.('in_progress', {
        query: d.query,
      });
    } catch (err) {
      console.warn('[chat][rag_retrieve.in_progress] parse failed', err);
    }
  });

  es.addEventListener('rag_retrieve.completed', (e: MessageEvent) => {
    try {
      const d = JSON.parse(e.data);
      handlers.onRagSearch?.('completed', {
        query: d.query,
        hits: d.hits,
        tookMs: d.tookMs,
      });
    } catch (err) {
      console.warn('[chat][rag_retrieve.completed] parse failed', err);
    }
  });

  es.addEventListener('done', () => {
    if (flushHandle !== null) {
      cancelAnimationFrame(flushHandle);
      flushHandle = null;
    }
    flushText();
    es.close();
    handlers.onDone?.();
  });

  es.addEventListener('error', e => {
    if (flushHandle !== null) {
      cancelAnimationFrame(flushHandle);
      flushHandle = null;
    }
    flushText();
    es.close();
    handlers.onError?.(e);
  });

  return es;
}
