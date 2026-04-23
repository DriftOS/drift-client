# @driftos/client

JavaScript SDK for [driftos-core](https://github.com/DriftOS/driftos-core) - conversation routing and context management for AI applications.

## Install
```bash
npm install @driftos/client
```

## Quick Start

### Self-Hosted
```typescript
import { createDriftClient } from '@driftos/client';

const drift = createDriftClient('http://localhost:3000');

// Route a message
const result = await drift.route('conv-123', 'I want to plan a trip to Paris');
console.log(result.branchTopic); // "Paris trip planning"

// Get context for LLM
const { system, messages } = await drift.buildPrompt(result.branchId);

// Use with OpenAI
const response = await openai.chat.completions.create({
  model: 'gpt-5',
  messages: [
    { role: 'system', content: system },
    ...messages,
    { role: 'user', content: 'What hotels do you recommend?' }
  ]
});
```

### Hosted (api.driftos.dev)
```typescript
import { DriftClient } from '@driftos/client';

// Automatically detects hosted mode from URL
const drift = new DriftClient({
  baseUrl: 'https://api.driftos.dev',
  apiKey: 'your-api-key'
});

// Use the same API - hosted mode handles routing automatically
const result = await drift.route('conv-123', 'I want to plan a trip to Paris');
```

## Configuration

### DriftClient Options

```typescript
new DriftClient({
  baseUrl: string;      // Required: Base URL of your driftos instance
  apiKey?: string;      // Optional: API key for authentication
  timeout?: number;     // Optional: Request timeout in ms (default: 10000)
  hosted?: boolean;     // Optional: Hosted mode flag (auto-detected for api.driftos.dev)
})
```

The `hosted` flag controls URL path formatting:
- `false` (default): Paths include `/api/v1` prefix (for direct driftos-core connections)
- `true`: Paths exclude `/api/v1` prefix (for gateway deployments)
- Auto-detected when `baseUrl` includes `api.driftos.dev`

## API

### `route(conversationId, content, role?)`
Route a message to the appropriate branch.

### `getBranches(conversationId)`
List all branches for a conversation.

### `getContext(branchId)`
Get messages and facts for a branch.

### `extractFacts(branchId)`
Extract facts from branch messages.

### `getFacts(branchId)`
Get existing facts for a branch.

### `buildPrompt(branchId, options?)`
Build a ready-to-use prompt with context for LLM calls.

**Options:**
- `systemPrompt?: string` - Base system prompt (default: 'You are a helpful assistant.')
- `includeOtherTopics?: boolean` - Mention other discussed topics (default: true)
- `includeFacts?: boolean` - Include extracted facts (default: true)
- `factsFromAllBranches?: boolean` - Include facts from all branches (default: false)
- `template?: (ctx) => string` - Custom template function for system prompt generation

**Legacy:** Also accepts a plain `string` for `systemPrompt` (backwards compatible)

### `deleteConversation(conversationId)`
Delete a conversation and every branch, message, and fact belonging to it.
Use this to implement client "Clear chat history" flows. Throws on 404.

```typescript
const { deletedBranches, deletedMessages, deletedFacts } =
  await drift.deleteConversation('conv-123');
```

**Returns:** `{ deletedBranches: number; deletedMessages: number; deletedFacts: number }`

### `deleteBranch(branchId)`
Delete a branch and every descendant branch (cascading), including their
messages and facts. No re-parenting is performed. Throws on 404.

```typescript
const { deletedMessages, deletedFacts } = await drift.deleteBranch('branch_abc123');
```

**Returns:** `{ deletedMessages: number; deletedFacts: number }`

## Pinning a message to a specific branch

By default, `route()` lets the server decide which branch a message belongs to.
If your UI lets the user manually select a branch, pass `branchMode: 'PINNED'`
with `targetBranchId` to force the write onto that branch instead.

```typescript
await drift.route('conv-123', 'reply text', {
  branchMode: 'PINNED',
  targetBranchId: 'branch_abc123',
});
// result.pinned === true
```

## License

MIT