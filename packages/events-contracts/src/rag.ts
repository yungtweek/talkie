export const RagWrapperKey = {
  SEARCH_CALL: 'searchCall',
} as const;

export const RagStageKey = {
  RETRIEVE: 'retrieve',
  RERANK: 'rerank',
  MMR: 'mmr',
  COMPRESS: 'compress',
} as const;

export const RagEventStatus = {
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
} as const;

export const RagWrapperEventType = {
  SEARCH_CALL_IN_PROGRESS: 'rag_search_call.in_progress',
  SEARCH_CALL_COMPLETED: 'rag_search_call.completed',
} as const;

export const RagStageEventType = {
  RETRIEVE_IN_PROGRESS: 'rag_retrieve.in_progress',
  RETRIEVE_COMPLETED: 'rag_retrieve.completed',
  RERANK_IN_PROGRESS: 'rag_rerank.in_progress',
  RERANK_COMPLETED: 'rag_rerank.completed',
  MMR_IN_PROGRESS: 'rag_mmr.in_progress',
  MMR_COMPLETED: 'rag_mmr.completed',
  COMPRESS_IN_PROGRESS: 'rag_compress.in_progress',
  COMPRESS_COMPLETED: 'rag_compress.completed',
} as const;

export const RagEventTypes = [
  ...Object.values(RagWrapperEventType),
  ...Object.values(RagStageEventType),
] as const;

export type RagWrapperKey = typeof RagWrapperKey[keyof typeof RagWrapperKey];
export type RagStageKey = typeof RagStageKey[keyof typeof RagStageKey];
export type RagSearchKey = RagWrapperKey | RagStageKey;
export type RagEventStatus = typeof RagEventStatus[keyof typeof RagEventStatus];

export type RagWrapperEventType =
  typeof RagWrapperEventType[keyof typeof RagWrapperEventType];
export type RagStageEventType =
  typeof RagStageEventType[keyof typeof RagStageEventType];
export type RagEventType = RagWrapperEventType | RagStageEventType;

export type RagEventScope = 'wrapper' | 'stage';

export type RagEventMeta =
  | { scope: 'wrapper'; key: RagWrapperKey; status: RagEventStatus }
  | { scope: 'stage'; key: RagStageKey; status: RagEventStatus };

export type RagWrapperPayload = {
  query?: string;
  hits?: number;
  tookMs?: number;
};

export type RagStagePayload = {
  query?: string;
  hits?: number;
  tookMs?: number;
  inputHits?: number;
  outputHits?: number;
  inputChars?: number;
  outputChars?: number;
  reranker?: string;
  rerankTopN?: number;
  rerankMaxCandidates?: number;
  rerankBatchSize?: number;
  rerankMaxDocChars?: number;
  mmrK?: number;
  mmrFetchK?: number;
  mmrLambda?: number;
  mmrSimilarityThreshold?: number;
  maxContext?: number;
  useLlm?: boolean;
  heuristicHits?: number;
  llmApplied?: boolean;
};

export type RagEventPayload = RagWrapperPayload | RagStagePayload;

export type RagWrapperSnapshot = {
  inProgress?: RagWrapperPayload | null;
  completed?: RagWrapperPayload | null;
};

export type RagStageSnapshot = {
  inProgress?: RagStagePayload | null;
  completed?: RagStagePayload | null;
};

export type RagSearchSnapshot = {
  wrapper?: {
    searchCall?: RagWrapperSnapshot | null;
  } | null;
  stages?: Partial<Record<RagStageKey, RagStageSnapshot | null>> | null;
};

export const RagEventMetaByType: Record<RagEventType, RagEventMeta> = {
  [RagWrapperEventType.SEARCH_CALL_IN_PROGRESS]: {
    scope: 'wrapper',
    key: RagWrapperKey.SEARCH_CALL,
    status: RagEventStatus.IN_PROGRESS,
  },
  [RagWrapperEventType.SEARCH_CALL_COMPLETED]: {
    scope: 'wrapper',
    key: RagWrapperKey.SEARCH_CALL,
    status: RagEventStatus.COMPLETED,
  },
  [RagStageEventType.RETRIEVE_IN_PROGRESS]: {
    scope: 'stage',
    key: RagStageKey.RETRIEVE,
    status: RagEventStatus.IN_PROGRESS,
  },
  [RagStageEventType.RETRIEVE_COMPLETED]: {
    scope: 'stage',
    key: RagStageKey.RETRIEVE,
    status: RagEventStatus.COMPLETED,
  },
  [RagStageEventType.RERANK_IN_PROGRESS]: {
    scope: 'stage',
    key: RagStageKey.RERANK,
    status: RagEventStatus.IN_PROGRESS,
  },
  [RagStageEventType.RERANK_COMPLETED]: {
    scope: 'stage',
    key: RagStageKey.RERANK,
    status: RagEventStatus.COMPLETED,
  },
  [RagStageEventType.MMR_IN_PROGRESS]: {
    scope: 'stage',
    key: RagStageKey.MMR,
    status: RagEventStatus.IN_PROGRESS,
  },
  [RagStageEventType.MMR_COMPLETED]: {
    scope: 'stage',
    key: RagStageKey.MMR,
    status: RagEventStatus.COMPLETED,
  },
  [RagStageEventType.COMPRESS_IN_PROGRESS]: {
    scope: 'stage',
    key: RagStageKey.COMPRESS,
    status: RagEventStatus.IN_PROGRESS,
  },
  [RagStageEventType.COMPRESS_COMPLETED]: {
    scope: 'stage',
    key: RagStageKey.COMPRESS,
    status: RagEventStatus.COMPLETED,
  },
};

export const getRagEventMeta = (eventType: string): RagEventMeta | null =>
  RagEventMetaByType[eventType as RagEventType] ?? null;
