/**
 * Integration tests for @driftos/client.
 *
 * Exercises the SDK against a live DriftOS server (default:
 * http://localhost:3000). Run with:
 *
 *   npx tsx tests/integration.ts
 *   DRIFT_BASE_URL=https://... npx tsx tests/integration.ts
 *
 * These are round-trip tests — they mutate real state. Point at a dev
 * database, never production.
 */
import { createDriftClient } from '../src';

const BASE_URL = process.env.DRIFT_BASE_URL ?? 'http://localhost:3000';
const API_KEY = process.env.DRIFT_API_KEY;

const drift = createDriftClient(BASE_URL, API_KEY);

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

async function testRouting() {
  const conversationId = `sdk-test-routing-${Date.now()}`;
  console.log(`\n=== Routing: ${conversationId} ===`);

  const r1 = await drift.route(conversationId, 'I want to buy a house in London');
  console.log(' route 1:', r1.action, r1.branchTopic);

  const r2 = await drift.route(conversationId, 'What areas have good schools?');
  console.log(' route 2:', r2.action, r2.branchTopic);

  const r3 = await drift.route(conversationId, 'What should I cook for dinner?');
  console.log(' route 3:', r3.action, r3.branchTopic);

  const branches = await drift.getBranches(conversationId);
  assert(branches.length > 0, 'expected at least one branch');

  // Cleanup
  await drift.deleteConversation(conversationId);
}

async function testDeleteConversation() {
  const conversationId = `sdk-test-del-conv-${Date.now()}`;
  console.log(`\n=== Delete conversation: ${conversationId} ===`);

  // Seed: at least two branches + fact extraction
  const r1 = await drift.route(conversationId, 'I want to plan a trip to Paris');
  await drift.route(conversationId, 'What should I pack for spring?');
  const r3 = await drift.route(
    conversationId,
    'Also, recommend me a good espresso machine'
  );
  await drift.extractFacts(r1.branchId);
  await drift.extractFacts(r3.branchId);

  const before = await drift.getBranches(conversationId);
  assert(before.length >= 2, `expected ≥2 branches, got ${before.length}`);

  const result = await drift.deleteConversation(conversationId);
  console.log(' result:', result);
  assert(result.deletedBranches >= 2, 'expected ≥2 branches deleted');
  assert(result.deletedMessages >= 3, 'expected ≥3 messages deleted');
  assert(typeof result.deletedFacts === 'number', 'deletedFacts must be a number');

  // After delete: getBranches returns []
  const after = await drift.getBranches(conversationId);
  assert(after.length === 0, `expected 0 branches after delete, got ${after.length}`);

  // Second delete → 404 (throws)
  let threw = false;
  try {
    await drift.deleteConversation(conversationId);
  } catch (err) {
    threw = true;
    console.log(' second delete threw:', (err as Error).message);
  }
  assert(threw, 'expected second delete to throw');
}

async function testDeleteBranch() {
  const conversationId = `sdk-test-del-branch-${Date.now()}`;
  console.log(`\n=== Delete branch: ${conversationId} ===`);

  // Seed two topics = two branches
  const r1 = await drift.route(conversationId, 'Tell me about cooking pasta');
  await drift.route(conversationId, 'What sauces go with spaghetti?');
  const r3 = await drift.route(
    conversationId,
    'Completely different topic — car maintenance'
  );
  await drift.extractFacts(r1.branchId);

  const before = await drift.getBranches(conversationId);
  assert(before.length >= 2, `expected ≥2 branches, got ${before.length}`);
  const cookingBranchId = r1.branchId;

  const result = await drift.deleteBranch(cookingBranchId);
  console.log(' result:', result);
  assert(result.deletedMessages >= 2, 'expected ≥2 messages deleted');
  assert(typeof result.deletedFacts === 'number', 'deletedFacts must be a number');

  // Cooking branch gone, car branch still there
  const after = await drift.getBranches(conversationId);
  assert(
    !after.some((b) => b.id === cookingBranchId),
    'cooking branch should be gone'
  );
  assert(
    after.some((b) => b.id === r3.branchId),
    'car-maintenance branch should still exist'
  );

  // Cleanup
  await drift.deleteConversation(conversationId);

  // Unknown branch → 404 (throws)
  let threw = false;
  try {
    await drift.deleteBranch('does-not-exist');
  } catch (err) {
    threw = true;
    console.log(' unknown branch threw:', (err as Error).message);
  }
  assert(threw, 'expected delete of unknown branch to throw');
}

async function main() {
  await testRouting();
  await testDeleteConversation();
  await testDeleteBranch();
  console.log('\nAll integration tests passed.');
}

main().catch((err) => {
  console.error('\nIntegration tests FAILED:', err);
  process.exit(1);
});
