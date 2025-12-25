'use client';

import { startTransition, useEffect, useMemo, useRef, useState } from 'react';

import type React from 'react';

const getLastMessageByRole = (container: HTMLElement | null, role: string) => {
  if (!container) return null;
  const nodes = container.querySelectorAll<HTMLElement>(`[data-role="${role}"]`);
  return nodes.length ? nodes[nodes.length - 1] : null;
};

const getOffsetTopWithin = (container: HTMLElement, target: HTMLElement) => {
  let offset = 0;
  let el: HTMLElement | null = target;
  while (el && el !== container) {
    offset += el.offsetTop;
    el = el.offsetParent as HTMLElement | null;
  }
  return offset;
};

export function useAssistantSelectionOnScroll(
  containerRef: React.RefObject<HTMLDivElement | null>,
  setSelectedMessageId: (id: string) => void,
  isStreaming?: boolean,
) {
  useEffect(() => {
    if (isStreaming) return;

    const container = containerRef.current;
    if (!container) return;

    let ticking = false;

    const onScroll = () => {
      if (ticking) return;
      ticking = true;

      requestAnimationFrame(() => {
        ticking = false;

        const containerRect = container.getBoundingClientRect();
        const focusY = containerRect.top + containerRect.height * 0.3;

        const nodes = Array.from(
          container.querySelectorAll<HTMLElement>('[data-message-id][data-role="assistant"]'),
        );

        let best: { id: string; distance: number } | null = null;

        for (const el of nodes) {
          const rect = el.getBoundingClientRect();
          const isVisible = rect.bottom > containerRect.top && rect.top < containerRect.bottom;
          if (!isVisible) continue;

          const center = rect.top + rect.height / 2;
          const dist = Math.abs(focusY - center);
          const id = el.getAttribute('data-message-id');
          if (!id) continue;

          if (!best || dist < best.distance) {
            best = { id, distance: dist };
          }
        }

        if (best) {
          setSelectedMessageId(best.id);
        }
      });
    };

    container.addEventListener('scroll', onScroll, { passive: true });
    return () => container.removeEventListener('scroll', onScroll);
  }, [containerRef, setSelectedMessageId, isStreaming]);
}

type MessageRoleSource = {
  role?: string;
  node?: { role?: string };
};

const getMessageRole = (message: MessageRoleSource) => message.role ?? message.node?.role ?? '';

export function useChatScrollAnchors(
  containerRef: React.RefObject<HTMLDivElement | null>,
  messages: MessageRoleSource[],
  isStreaming?: boolean,
) {
  const [isAutoScrollEnabled, setIsAutoScrollEnabled] = useState(true);
  const autoScrollEnabledRef = useRef(true);
  const isProgrammaticScrollRef = useRef(false);
  const prevUserCountRef = useRef(0);
  const prevIsStreamingRef = useRef(isStreaming);
  const nearBottomThreshold = 200;
  const messageCount = messages.length;
  const userCount = useMemo(() => {
    return messages.reduce(
      (acc, message) => (getMessageRole(message) === 'user' ? acc + 1 : acc),
      0,
    );
  }, [messages]);

  const setAutoScrollEnabled = (next: boolean) => {
    autoScrollEnabledRef.current = next;
    setIsAutoScrollEnabled(prev => (prev === next ? prev : next));
  };

  const scrollToTop = (container: HTMLElement, top: number, behavior: ScrollBehavior) => {
    isProgrammaticScrollRef.current = true;
    container.scrollTo({ top, behavior });
    requestAnimationFrame(() => {
      isProgrammaticScrollRef.current = false;
    });
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onScroll = () => {
      if (isProgrammaticScrollRef.current) return;
      const distanceFromBottom =
        container.scrollHeight - (container.scrollTop + container.clientHeight);
      setAutoScrollEnabled(distanceFromBottom <= nearBottomThreshold);
    };

    container.addEventListener('scroll', onScroll, { passive: true });
    return () => container.removeEventListener('scroll', onScroll);
  }, [containerRef]);

  useEffect(() => {
    if (messageCount === 0) {
      prevUserCountRef.current = 0;
      setAutoScrollEnabled(true);
    }
  }, [messageCount]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const isNewUserMessage = userCount > prevUserCountRef.current;
    prevUserCountRef.current = userCount;

    if (!autoScrollEnabledRef.current && !isNewUserMessage) return;
    const lastAssistant = getLastMessageByRole(container, 'assistant');
    const lastUser = getLastMessageByRole(container, 'user');
    const anchor = isNewUserMessage ? lastUser ?? lastAssistant : lastAssistant ?? lastUser;
    if (!anchor) return;

    const top = getOffsetTopWithin(container, anchor) - 46;
    if (isNewUserMessage) {
      setAutoScrollEnabled(true);
    }
    scrollToTop(container, top, 'smooth');
  }, [messageCount, userCount, containerRef]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const anchor = getLastMessageByRole(container, 'assistant');
    if (!anchor) return;

    let rafId: number | null = null;

    const observer = new ResizeObserver(entries => {
      if (!entries.length) return;
      if (!autoScrollEnabledRef.current) return;
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        if (!autoScrollEnabledRef.current) return;
        scrollToTop(container, container.scrollHeight, 'auto');
      });
    });

    observer.observe(anchor);
    return () => {
      observer.disconnect();
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
    };
  }, [messageCount, containerRef]);

  useEffect(() => {
    const wasStreaming = prevIsStreamingRef.current;
    prevIsStreamingRef.current = isStreaming;

    if (!wasStreaming || isStreaming) return;
    const container = containerRef.current;
    if (!container) return;
    if (!autoScrollEnabledRef.current) return;

    scrollToTop(container, container.scrollHeight, 'auto');
  }, [isStreaming, containerRef]);

  const resumeAutoScroll = (options?: { scrollToBottom?: boolean; behavior?: ScrollBehavior }) => {
    const container = containerRef.current;
    if (!container) return;

    setAutoScrollEnabled(true);

    if (options?.scrollToBottom) {
      const behavior = options.behavior ?? 'smooth';
      scrollToTop(container, container.scrollHeight, behavior);
    }
  };

  return { isAutoScrollEnabled, resumeAutoScroll };
}

export function useSelectLatestAssistantMessage(
  messages: Array<{ id: string; role: string }>,
  setSelectedMessageId: (id: string) => void,
) {
  const prevLengthRef = useRef(0);

  useEffect(() => {
    const prevLength = prevLengthRef.current;
    const nextLength = messages.length;
    prevLengthRef.current = nextLength;

    if (nextLength <= prevLength) return;
    if (nextLength === 0) return;

    const last = messages[nextLength - 1];
    if (last.role !== 'assistant') return;

    startTransition(() => setSelectedMessageId(last.id));
  }, [messages, setSelectedMessageId]);
}
