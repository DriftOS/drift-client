export type RouteAction = 'STAY' | 'ROUTE' | 'BRANCH';

export type BranchMode = 'AUTO' | 'PINNED';

export type DriftEngine = 'llm' | 'embed';

export interface DriftConfig {
  baseUrl: string;
  apiKey?: string;
  timeout?: number;
  /**
   * Routing engine to hit when the hosted gateway is used.
   * - 'llm' (default): LLM-based drift routing — higher accuracy, ~500-1000ms
   * - 'embed': embedding-based routing — faster, no LLM cost
   *
   * Only applied when `baseUrl` does not already include an engine prefix
   * (e.g. `/api/v1/llm` or `/api/v1/embed`). Ignored for self-hosted
   * `baseUrl`s that point directly at a driftos-core / driftos-embed service.
   */
  engine?: DriftEngine;
  /**
   * If true, the SDK treats `baseUrl` as the hosted DriftOS gateway and
   * composes engine-prefixed URLs (e.g. `/api/v1/llm/drift/route`) when
   * the baseUrl doesn't already include one. Auto-detected from
   * `api.driftos.dev`; pass `false` to force self-hosted mode.
   */
  hosted?: boolean;
}

export interface RouteOptions {
  role?: 'user' | 'assistant';
  /**
   * Branch targeting mode.
   * - 'AUTO' (default): the routing engine decides which branch the message belongs to.
   * - 'PINNED': skip routing and force the message onto `targetBranchId`. Useful when
   *   the UI lets the user manually select a branch to send into.
   */
  branchMode?: BranchMode;
  /** Required when `branchMode` is 'PINNED'. Must belong to the conversation. */
  targetBranchId?: string;
}

export interface RouteResult {
  action: RouteAction;
  branchId: string;
  branchTopic: string;
  messageId: string;
  previousBranchId?: string;
  isNewBranch: boolean;
  reason: string;
  confidence: number;
  /** Set when the message was written because of a user-pinned target. */
  pinned?: boolean;
}

export interface Message {
  id: string;
  role: string;
  content: string;
  createdAt: string;
}

export interface Fact {
  id: string;
  key: string;
  value: string;
  confidence: number;
  messageId?: string;
}

export interface BranchFacts {
  branchId: string;
  branchTopic: string;
  facts: Fact[];
  isCurrent: boolean;
}

export interface Context {
  branchId: string;
  branchTopic: string;
  messages: Message[];
  allFacts: BranchFacts[];
}

export interface Branch {
  id: string;
  topic: string;
  messageCount: number;
  factCount: number;
  parentId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FactsResult {
  branchId: string;
  facts: Fact[];
  extractedCount: number;
}

export interface DeleteConversationResult {
  deletedBranches: number;
  deletedMessages: number;
  deletedFacts: number;
}

export interface DeleteBranchResult {
  deletedMessages: number;
  deletedFacts: number;
}