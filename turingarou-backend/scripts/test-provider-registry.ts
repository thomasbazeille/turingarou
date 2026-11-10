import assert from 'node:assert/strict';
import { buildProviderPool, parsePoolSpec } from '../src/llm/providerRegistry.js';
import { OpenAICompatProvider, stripReasoning } from '../src/llm/OpenAICompatProvider.js';
import { ProviderError } from '../src/llm/chatClient.js';

let failures = 0;
const check = async (name: string, fn: () => void | Promise<void>) => {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
  } catch (e: any) {
    failures++;
    console.log(`  ✗ ${name} — ${e.message}`);
  }
};

const names = (env: Record<string, string>) => buildProviderPool(env).providers.map((p) => p.name);

await check('no LLM_POOL = default pool, keys present only', () =>
  assert.deepEqual(names({ DEEPSEEK_API_KEY: 'k', ANTHROPIC_API_KEY: 'k' }), ['Deepseek/deepseek-chat', 'Anthropic/claude-haiku-4-5']));
await check('default pool keeps the legacy model overrides', () =>
  assert.deepEqual(names({ MISTRAL_API_KEY: 'k', MISTRAL_MODEL: 'mistral-medium-latest' }), ['Mistral/mistral-medium-latest']));
await check('LLM_POOL weights repeat the provider', () =>
  assert.deepEqual(names({ LLM_POOL: 'cerebras-qwen:2,anthropic-haiku', CEREBRAS_API_KEY: 'k', ANTHROPIC_API_KEY: 'k' }), [
    'Cerebras/qwen-3.8-27b',
    'Cerebras/qwen-3.8-27b',
    'Anthropic/claude-haiku-4-5',
  ]));
await check('LLM_POOL entry without key is skipped with a warning', () => {
  const pool = buildProviderPool({ LLM_POOL: 'groq-qwen, cerebras-qwen', CEREBRAS_API_KEY: 'k' });
  assert.deepEqual(pool.providers.map((p) => p.name), ['Cerebras/qwen-3.8-27b']);
  assert.ok(pool.warnings.some((w) => w.includes('GROQ_API_KEY')));
});
await check('LLM_POOL unusable = default pool + warning', () => {
  const pool = buildProviderPool({ LLM_POOL: 'nope', DEEPSEEK_API_KEY: 'k' });
  assert.equal(pool.source, 'default');
  assert.deepEqual(pool.providers.map((p) => p.name), ['Deepseek/deepseek-chat']);
  assert.ok(pool.warnings.some((w) => w.includes('unknown provider "nope"')));
});
await check('bad weight is reported, not guessed', () => {
  const r = parsePoolSpec('a:1.5,b:0,c');
  assert.deepEqual(r.entries, [{ id: 'c', weight: 1 }]);
  assert.equal(r.warnings.length, 1);
});

await check('think block stripped', () => assert.deepEqual(stripReasoning('<think>hmm</think> {"a":1}'), { text: '{"a":1}', unclosed: false }));
await check('orphan closing tag: keep what follows', () => assert.equal(stripReasoning('plan...</think>salut').text, 'salut'));
await check('unclosed think = no answer', () => assert.deepEqual(stripReasoning('<think>je réfléchis'), { text: '', unclosed: true }));

type Captured = { body: any };
function fakeFetch(status: number, payload: unknown, captured?: Captured) {
  globalThis.fetch = (async (_url: any, init: any) => {
    if (captured) captured.body = JSON.parse(init.body);
    const text = typeof payload === 'string' ? payload : JSON.stringify(payload);
    return new Response(text, { status, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
}
const provider = (extra: Partial<ConstructorParameters<typeof OpenAICompatProvider>[0]> = {}) =>
  new OpenAICompatProvider({ vendor: 'T', baseUrl: 'http://x', apiKey: 'k', model: 'm', supportsJson: true, ...extra });
const realFetch = globalThis.fetch;

await check('reply: think stripped, usage read', async () => {
  fakeFetch(200, { choices: [{ message: { content: '<think>x</think>ok', reasoning_content: 'secret' }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 4 } });
  const r = await provider().chat({ messages: [{ role: 'user', content: 'q' }] });
  assert.equal(r.text, 'ok');
  assert.deepEqual(r.usage, { inputTokens: 10, outputTokens: 4, reasoningTokens: undefined });
});
await check('reply: content array keeps text parts only', async () => {
  fakeFetch(200, { choices: [{ message: { content: [{ type: 'thinking', thinking: [] }, { type: 'text', text: 'salut' }] }, finish_reason: 'stop' }] });
  assert.equal((await provider().chat({ messages: [{ role: 'user', content: 'q' }] })).text, 'salut');
});
await check('truncation still reported', async () => {
  fakeFetch(200, { choices: [{ message: { content: '{"shouldRespond": true, "mess' }, finish_reason: 'length' }] });
  assert.equal((await provider().chat({ messages: [{ role: 'user', content: 'q' }] })).finishReason, 'length');
});
await check('cut inside reasoning = length', async () => {
  fakeFetch(200, { choices: [{ message: { content: '<think>long' }, finish_reason: 'stop' }] });
  const r = await provider().chat({ messages: [{ role: 'user', content: 'q' }] });
  assert.equal(r.text, '');
  assert.equal(r.finishReason, 'length');
});
await check('request: json mode, extraBody, max_completion_tokens + headroom', async () => {
  const cap: Captured = { body: null };
  fakeFetch(200, { choices: [{ message: { content: '{}' }, finish_reason: 'stop' }] }, cap);
  await provider({ extraBody: { reasoning_effort: 'none' }, maxTokensParam: 'max_completion_tokens', reasoningHeadroom: 100 }).chat({ messages: [{ role: 'user', content: 'q' }], json: true, maxTokens: 220 });
  assert.equal(cap.body.max_completion_tokens, 320);
  assert.equal(cap.body.max_tokens, undefined);
  assert.equal(cap.body.reasoning_effort, 'none');
  assert.deepEqual(cap.body.response_format, { type: 'json_object' });
});
await check('402 and insufficient_quota are not retried', async () => {
  for (const [status, body] of [[402, '{"error":"Insufficient Balance"}'], [429, '{"error":{"type":"insufficient_quota"}}']] as const) {
    fakeFetch(status, body);
    await assert.rejects(provider().chat({ messages: [{ role: 'user', content: 'q' }] }), (e: any) => e instanceof ProviderError && e.retryable === false);
  }
});
await check('plain 429 stays retryable', async () => {
  fakeFetch(429, '{"message":"Rate limit exceeded"}');
  await assert.rejects(provider().chat({ messages: [{ role: 'user', content: 'q' }] }), (e: any) => e instanceof ProviderError && e.retryable === true);
});
globalThis.fetch = realFetch;

console.log(failures ? `\n${failures} échec(s)` : '\nTout est vert');
process.exit(failures ? 1 : 0);
