type StreamHandlers = {
  onText?: (chunk: string) => void;
  onSources?: (sources: unknown) => void;
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
