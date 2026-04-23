import type {
  DriftConfig,
  DriftEngine,
  RouteResult,
  RouteOptions,
  Context,
  Branch,
  Fact,
  FactsResult,
  DeleteConversationResult,
  DeleteBranchResult,
} from './types';

const ENGINE_PREFIX_REGEX = /\/api\/v\d+\/(llm|embed)(\/|$)/;

export class DriftClient {
  private baseUrl: string;
  private apiKey?: string;
  private timeout: number;
  private hosted: boolean;

  constructor(config: DriftConfig) {
    let baseUrl = config.baseUrl.replace(/\/$/, '');
    this.apiKey = config.apiKey;
    this.timeout = config.timeout ?? 10000;
    // Auto-detect hosted mode from api.driftos.dev, or use explicit config
    this.hosted = config.hosted ?? baseUrl.includes('api.driftos.dev');

    // For hosted usage, the gateway expects /api/v1/<engine>/<resource>. If the
    // caller passed a bare host (e.g. `https://api.driftos.dev`) without the
    // engine segment, append it so requests route to the right backend.
    // Callers who already included `/api/v1/llm` or `/api/v1/embed` are left
    // alone so we don't mangle working configs.
    if (this.hosted && !ENGINE_PREFIX_REGEX.test(baseUrl)) {
      const engine: DriftEngine = config.engine ?? 'llm';
      const stripped = baseUrl.replace(/\/api\/v\d+\/?$/, '');
      baseUrl = `${stripped}/api/v1/${engine}`;
    }

    this.baseUrl = baseUrl;
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

    // Strip /api/v1 prefix for hosted deployments (gateway handles routing)
    const fullPath = this.hosted ? path.replace('/api/v1', '') : path;

    try {
      const response = await fetch(`${this.baseUrl}${fullPath}`, {
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
   * Route a message to the appropriate branch.
   *
   * Call with a role string for the classic auto-routing behavior, or with an options
   * object to control branch targeting (e.g. `{ branchMode: 'PINNED', targetBranchId }`
   * to force the message onto a user-selected branch).
   */
  async route(
    conversationId: string,
    content: string,
    roleOrOptions?: 'user' | 'assistant' | RouteOptions
  ): Promise<RouteResult> {
    const options: RouteOptions =
      typeof roleOrOptions === 'string'
        ? { role: roleOrOptions }
        : (roleOrOptions ?? {});

    const body: Record<string, unknown> = {
      conversationId,
      content,
      role: options.role ?? 'user',
    };
    if (options.branchMode) body.branchMode = options.branchMode;
    if (options.targetBranchId) body.targetBranchId = options.targetBranchId;

    const raw = await this.request<RouteResult & { metadata?: { pinned?: boolean } }>(
      'POST',
      '/api/v1/drift/route',
      body
    );

    const { metadata, ...rest } = raw;
    return metadata?.pinned ? { ...rest, pinned: true } : rest;
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
   * Delete a conversation and every branch, message, and fact belonging to it.
   *
   * Use this to implement client "Clear chat history" flows. Throws if the
   * conversation does not exist (404) or the request is unauthorized.
   */
  async deleteConversation(
    conversationId: string
  ): Promise<DeleteConversationResult> {
    return this.request<DeleteConversationResult>(
      'DELETE',
      `/api/v1/drift/conversations/${encodeURIComponent(conversationId)}`
    );
  }

  /**
   * Delete a branch, its descendant branches, and all of their messages and
   * facts. Cascades through children — no re-parenting is performed. Throws
   * if the branch does not exist (404) or belongs to a different user.
   */
  async deleteBranch(branchId: string): Promise<DeleteBranchResult> {
    return this.request<DeleteBranchResult>(
      'DELETE',
      `/api/v1/drift/branches/${encodeURIComponent(branchId)}`
    );
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