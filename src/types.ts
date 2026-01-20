export type RouteAction = 'STAY' | 'ROUTE' | 'BRANCH';

export interface DriftConfig {
  baseUrl: string;
  apiKey?: string;
  timeout?: number;
  hosted?: boolean; // If true, paths won't include /api/v1 prefix (for gateway deployments)
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