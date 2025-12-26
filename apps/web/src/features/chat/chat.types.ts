import type {
  RagEventMeta,
  RagEventPayload,
  RagEventStatus,
  RagSearchSnapshot,
  RagSearchKey,
  RagStageKey,
  RagStagePayload,
  RagStageSnapshot,
  RagWrapperKey,
  RagWrapperSnapshot,
} from '@talkie/events-contracts';

export type Role = 'user' | 'assistant' | 'system';

export type {
  RagEventMeta,
  RagEventPayload,
  RagEventStatus,
  RagSearchSnapshot,
  RagSearchKey,
  RagStageKey,
  RagStagePayload,
  RagStageSnapshot,
  RagWrapperKey,
  RagWrapperSnapshot,
};

export type RagLiveEvent = {
  meta: RagEventMeta;
  payload?: RagEventPayload;
};


export interface ChatEdge {
  cursor?: string | null;
  node: ChatNode;
}

export interface ChatNode {
  id?: string | null;
  role: 'user' | 'assistant' | 'system';
  content: string;
  messageIndex?: number | null;
  turn?: number | null;
  sourcesJson?: string | null;
  ragSearchJson?: string | null;
  jobId?: string | null;
  streamDone?: boolean;
  ragSearch?: RagLiveEvent;
}
