import type {
  DriftConfig,
  RouteResult,
  Context,
  Branch,
  Fact,
  FactsResult,
} from './types';

export class DriftClient {
  private baseUrl: string;
  private apiKey?: string;
  private timeout: number;

  constructor(config: DriftConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.apiKey = config.apiKey;
    this.timeout = config.timeout ?? 10000;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    const headers: Record<string, string> = {};

    if (body) {
      headers['Content-Type'] = 'application/json';
    }

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error?.message ?? `Request failed: ${response.status}`);
      }

      return data.data as T;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Route a message to the appropriate branch
   */
  async route(
    conversationId: string,
    content: string,
    role: 'user' | 'assistant' = 'user'
  ): Promise<RouteResult> {
    return this.request<RouteResult>('POST', '/api/v1/drift/route', {
      conversationId,
      content,
      role,
    });
  }

  /**
   * Get all branches for a conversation
   */
  async getBranches(conversationId: string): Promise<Branch[]> {
    return this.request<Branch[]>('GET', `/api/v1/drift/branches/${conversationId}`);
  }

  /**
   * Get context for a branch (messages + facts)
   */
  async getContext(branchId: string): Promise<Context> {
    return this.request<Context>('GET', `/api/v1/context/${branchId}`);
  }

  /**
   * Extract facts from a branch
   */
  async extractFacts(branchId: string): Promise<FactsResult> {
    return this.request<FactsResult>('POST', `/api/v1/facts/${branchId}/extract`);
  }

  /**
   * Get existing facts for a branch
   */
  async getFacts(branchId: string): Promise<Fact[]> {
    return this.request<Fact[]>('GET', `/api/v1/facts/${branchId}`);
  }

  /**
   * Build a prompt with context for LLM calls
   */
  async buildPrompt(
    branchId: string,
    systemPrompt?: string
  ): Promise<{ system: string; messages: Array<{ role: string; content: string }> }> {
    const ctx = await this.getContext(branchId);

    const factsBlock = ctx.allFacts
      .filter(b => b.isCurrent)
      .flatMap(b => b.facts.map(f => `- ${f.key}: ${f.value}`))
      .join('\n');

    const otherTopics = ctx.allFacts
      .filter(b => !b.isCurrent)
      .map(b => b.branchTopic)
      .join(', ');

    const system = `${systemPrompt ?? 'You are a helpful assistant.'}

Current topic: ${ctx.branchTopic}

Known facts:
${factsBlock || '(none yet)'}

${otherTopics ? `Other topics discussed: ${otherTopics}` : ''}`.trim();

    const messages = ctx.messages.map(m => ({
      role: m.role,
      content: m.content,
    }));

    return { system, messages };
  }
}