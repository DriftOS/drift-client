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

## License

MIT