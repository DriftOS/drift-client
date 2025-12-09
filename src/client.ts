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
   * 
   * @param branchId - The branch to build context for
   * @param options - Configuration options
   * @param options.systemPrompt - Base system prompt (default: 'You are a helpful assistant.')
   * @param options.includeOtherTopics - Whether to mention other discussed topics (default: true)
   * @param options.includeFacts - Whether to include extracted facts (default: true)
   * @param options.factsFromAllBranches - Include facts from all branches, not just current (default: false)
   * @param options.template - Custom template function for system prompt generation
   */
  async buildPrompt(
    branchId: string,
    systemPromptOrOptions?: string | {
      systemPrompt?: string;
      includeOtherTopics?: boolean;
      includeFacts?: boolean;
      factsFromAllBranches?: boolean;
      template?: (ctx: {
        systemPrompt: string;
        branchTopic: string;
        facts: Array<{ key: string; value: string }>;
        otherTopics: string[];
      }) => string;
    }
  ): Promise<{ system: string; messages: Array<{ role: string; content: string }> }> {
    const ctx = await this.getContext(branchId);

    // Handle legacy string-only argument
    const options = typeof systemPromptOrOptions === 'string'
      ? { systemPrompt: systemPromptOrOptions }
      : systemPromptOrOptions ?? {};

    const {
      systemPrompt = 'You are a helpful assistant.',
      includeOtherTopics = true,
      includeFacts = true,
      factsFromAllBranches = false,
      template,
    } = options;

    // Get facts based on configuration
    const factsToInclude = includeFacts
      ? ctx.allFacts
          .filter(b => factsFromAllBranches || b.isCurrent)
          .flatMap(b => b.facts.map(f => ({ key: f.key, value: f.value })))
      : [];

    const otherTopics = includeOtherTopics
      ? ctx.allFacts.filter(b => !b.isCurrent).map(b => b.branchTopic)
      : [];

    // Use custom template if provided, otherwise use default
    let system: string;
    if (template) {
      system = template({
        systemPrompt,
        branchTopic: ctx.branchTopic,
        facts: factsToInclude,
        otherTopics,
      });
    } else {
      const factsBlock = factsToInclude
        .map(f => `- ${f.key}: ${f.value}`)
        .join('\n');

      const parts = [systemPrompt];
      parts.push(`\nCurrent topic: ${ctx.branchTopic}`);
      
      if (includeFacts && factsBlock) {
        parts.push(`\nKnown facts:\n${factsBlock}`);
      }
      
      if (includeOtherTopics && otherTopics.length > 0) {
        parts.push(`\nOther topics discussed: ${otherTopics.join(', ')}`);
      }

      system = parts.join('').trim();
    }

    const messages = ctx.messages.map(m => ({
      role: m.role,
      content: m.content,
    }));

    return { system, messages };
  }
}