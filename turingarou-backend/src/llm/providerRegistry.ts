import { ChatProvider } from './chatClient.js';
import { OpenAICompatProvider } from './OpenAICompatProvider.js';
import { AnthropicChatProvider } from './AnthropicChatProvider.js';

/** One model at one vendor, selectable by id in LLM_POOL. Facts measured on 2026-11-10 (docs/bench-modeles-2026-11-10.md). */
export interface ProviderSpec {
  id: string;
  vendor: string;
  api: 'openai-compat' | 'anthropic';
  baseUrl: string;
  /** Name of the env var holding the API key. */
  keyEnv: string;
  model: string;
  /** Env var that overrides the model (legacy knobs of the default pool). */
  modelEnv?: string;
  defaultTemperature: number;
  maxTemperature: number;
  supportsJson: boolean;
  extraBody?: Record<string, unknown>;
  maxTokensParam?: 'max_tokens' | 'max_completion_tokens';
  reasoningHeadroom?: number;
  disableThinking?: boolean;
  omitTemperature?: boolean;
  /** USD per million tokens, for cost estimates only. */
  price: { input: number; output: number };
  notes: string;
}

export const PROVIDER_CATALOG: ProviderSpec[] = [
  {
    id: 'deepseek',
    vendor: 'Deepseek',
    api: 'openai-compat',
    baseUrl: 'https://api.deepseek.com/v1',
    keyEnv: 'DEEPSEEK_API_KEY',
    model: 'deepseek-chat',
    modelEnv: 'DEEPSEEK_MODEL',
    defaultTemperature: 1.3,
    maxTemperature: 2,
    supportsJson: true,
    price: { input: 0.3, output: 1.2 },
    notes: 'Default pool. /models lists only deepseek-flash and deepseek-v4-pro on 2026-11-10: deepseek-chat may be a legacy alias. Price unverified.',
  },
  {
    id: 'mistral-small',
    vendor: 'Mistral',
    api: 'openai-compat',
    baseUrl: 'https://api.mistral.ai/v1',
    keyEnv: 'MISTRAL_API_KEY',
    model: 'mistral-small-latest',
    modelEnv: 'MISTRAL_MODEL',
    defaultTemperature: 1.0,
    maxTemperature: 1.0,
    supportsJson: true,
    price: { input: 0.15, output: 0.6 },
    notes: 'Default pool. Mistral Small 4 (2603).',
  },
  {
    id: 'ministral-14b',
    vendor: 'Mistral',
    api: 'openai-compat',
    baseUrl: 'https://api.mistral.ai/v1',
    keyEnv: 'MISTRAL_API_KEY',
    model: 'ministral-14b-latest',
    defaultTemperature: 1.0,
    maxTemperature: 1.0,
    supportsJson: true,
    price: { input: 0.2, output: 0.2 },
    notes: 'Ministral 3 14B, same key as mistral-small. Price unverified.',
  },
  {
    id: 'anthropic-haiku',
    vendor: 'Anthropic',
    api: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    keyEnv: 'ANTHROPIC_API_KEY',
    model: 'claude-haiku-4-5',
    modelEnv: 'ANTHROPIC_MODEL',
    defaultTemperature: 1.0,
    maxTemperature: 1.0,
    supportsJson: false,
    price: { input: 1, output: 5 },
    notes: 'Default pool. JSON by prompt only.',
  },
  {
    id: 'anthropic-haiku-5-5',
    vendor: 'Anthropic',
    api: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    keyEnv: 'ANTHROPIC_API_KEY',
    model: 'claude-haiku-5-5',
    defaultTemperature: 1.0,
    maxTemperature: 1.0,
    supportsJson: false,
    disableThinking: true,
    omitTemperature: true,
    price: { input: 1, output: 5 },
    notes: 'Thinks by default (a 220-token budget then returns an empty reply) and rejects any temperature but its default: both handled. Price unverified (budgeted like 4.5).',
  },
  {
    id: 'cerebras-qwen',
    vendor: 'Cerebras',
    api: 'openai-compat',
    baseUrl: 'https://api.cerebras.ai/v1',
    keyEnv: 'CEREBRAS_API_KEY',
    model: 'qwen-3.8-27b',
    defaultTemperature: 0.9,
    maxTemperature: 1.5,
    supportsJson: true,
    extraBody: { reasoning_effort: 'none' },
    price: { input: 0.99, output: 1.49 },
    notes: 'Hybrid reasoning model, reasoning off. ~1850 tok/s announced.',
  },
  {
    id: 'cerebras-gpt-oss',
    vendor: 'Cerebras',
    api: 'openai-compat',
    baseUrl: 'https://api.cerebras.ai/v1',
    keyEnv: 'CEREBRAS_API_KEY',
    model: 'gpt-oss-120b',
    defaultTemperature: 1.0,
    maxTemperature: 1.5,
    supportsJson: true,
    extraBody: { reasoning_effort: 'low' },
    reasoningHeadroom: 300,
    price: { input: 0.35, output: 0.75 },
    notes: 'Reasoning cannot be turned off (low is the floor). Price unverified.',
  },
  {
    id: 'groq-qwen',
    vendor: 'Groq',
    api: 'openai-compat',
    baseUrl: 'https://api.groq.com/openai/v1',
    keyEnv: 'GROQ_API_KEY',
    model: 'qwen/qwen3.8-27b',
    defaultTemperature: 0.9,
    maxTemperature: 2,
    supportsJson: true,
    extraBody: { reasoning_effort: 'none' },
    price: { input: 0.8, output: 4 },
    notes: 'Same weights as cerebras-qwen; preview model at Groq.',
  },
  {
    id: 'groq-gpt-oss-20b',
    vendor: 'Groq',
    api: 'openai-compat',
    baseUrl: 'https://api.groq.com/openai/v1',
    keyEnv: 'GROQ_API_KEY',
    model: 'openai/gpt-oss-20b',
    defaultTemperature: 1.0,
    maxTemperature: 2,
    supportsJson: true,
    extraBody: { reasoning_effort: 'low' },
    reasoningHeadroom: 300,
    price: { input: 0.075, output: 0.3 },
    notes: 'Cheapest. Reasoning cannot be turned off.',
  },
  {
    id: 'gemini-flash-lite',
    vendor: 'Google',
    api: 'openai-compat',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    keyEnv: 'GEMINI_API_KEY',
    model: 'gemini-3.5-flash-lite',
    defaultTemperature: 1.0,
    maxTemperature: 2,
    supportsJson: true,
    extraBody: { reasoning_effort: 'minimal' },
    reasoningHeadroom: 300,
    price: { input: 0.3, output: 2.5 },
    notes: 'NOT MEASURED: the available key answered 402 (prepaid credits depleted). Thinking cannot be off on Gemini 3; json_object unverified.',
  },
  {
    id: 'openai-luna',
    vendor: 'OpenAI',
    api: 'openai-compat',
    baseUrl: 'https://api.openai.com/v1',
    keyEnv: 'OPENAI_API_KEY',
    model: 'gpt-5.6-luna',
    defaultTemperature: 1.0,
    maxTemperature: 2,
    supportsJson: true,
    extraBody: { reasoning_effort: 'none' },
    maxTokensParam: 'max_completion_tokens',
    price: { input: 0.1, output: 0.5 },
    notes: 'NOT MEASURED: the available key answered 429 insufficient_quota. Temperature acceptance unverified.',
  },
];

/** Today's behaviour without LLM_POOL: every one of these whose key is set, equal weights. */
export const DEFAULT_POOL_IDS = ['deepseek', 'mistral-small', 'anthropic-haiku'];

export interface PoolEntry {
  id: string;
  weight: number;
}

export interface PoolMember {
  spec: ProviderSpec;
  weight: number;
  provider: ChatProvider;
}

export interface ProviderPool {
  /**
   * Each provider repeated `weight` times: a uniform pick over this list is a weighted pick, and the fallback
   * (llmCall.ts, which skips every entry named like the primary) is weighted the same way.
   */
  providers: ChatProvider[];
  members: PoolMember[];
  source: 'LLM_POOL' | 'default';
  warnings: string[];
}

type Env = Record<string, string | undefined>;

/** "cerebras-qwen:2, anthropic-haiku" → entries. Bad weights are reported, not guessed. */
export function parsePoolSpec(spec: string): { entries: PoolEntry[]; warnings: string[] } {
  const entries: PoolEntry[] = [];
  const warnings: string[] = [];
  for (const raw of spec.split(',')) {
    const item = raw.trim();
    if (!item) continue;
    const [id, w] = item.split(':').map((s) => s.trim());
    const weight = w === undefined ? 1 : Number(w);
    if (!Number.isInteger(weight) || weight < 0 || weight > 20) {
      warnings.push(`LLM_POOL: weight "${w}" of ${id} is not an integer 0..20, entry ignored`);
      continue;
    }
    if (weight === 0) continue;
    const existing = entries.find((e) => e.id === id);
    if (existing) existing.weight += weight;
    else entries.push({ id, weight });
  }
  return { entries, warnings };
}

export function createProvider(spec: ProviderSpec, env: Env): ChatProvider | null {
  const apiKey = env[spec.keyEnv];
  if (!apiKey) return null;
  const model = (spec.modelEnv && env[spec.modelEnv]) || spec.model;
  if (spec.api === 'anthropic') {
    // Haiku 5.x behaves differently from 4.5 (see anthropic-haiku-5-5), also when chosen through ANTHROPIC_MODEL.
    const haiku5 = /haiku-5/.test(model);
    return new AnthropicChatProvider(apiKey, model, {
      disableThinking: spec.disableThinking ?? haiku5,
      omitTemperature: spec.omitTemperature ?? haiku5,
      workspaceId: env.ANTHROPIC_WORKSPACE_ID || undefined,
    });
  }
  return new OpenAICompatProvider({
    vendor: spec.vendor,
    baseUrl: spec.baseUrl,
    apiKey,
    model,
    defaultTemperature: spec.defaultTemperature,
    maxTemperature: spec.maxTemperature,
    supportsJson: spec.supportsJson,
    extraBody: spec.extraBody,
    maxTokensParam: spec.maxTokensParam,
    reasoningHeadroom: spec.reasoningHeadroom,
  });
}

function resolve(entries: PoolEntry[], env: Env, warnMissing: boolean): { members: PoolMember[]; warnings: string[] } {
  const members: PoolMember[] = [];
  const warnings: string[] = [];
  for (const { id, weight } of entries) {
    const spec = PROVIDER_CATALOG.find((s) => s.id === id);
    if (!spec) {
      warnings.push(`LLM_POOL: unknown provider "${id}" (known: ${PROVIDER_CATALOG.map((s) => s.id).join(', ')})`);
      continue;
    }
    const provider = createProvider(spec, env);
    if (!provider) {
      if (warnMissing) warnings.push(`LLM_POOL: ${id} skipped, ${spec.keyEnv} is not set`);
      continue;
    }
    members.push({ spec, weight, provider });
  }
  return { members, warnings };
}

/**
 * The pool the game draws its AI players from. LLM_POOL="id[:weight],…" picks providers from PROVIDER_CATALOG;
 * without it (or if none of its entries is usable) the default pool applies, as before LLM_POOL existed.
 */
export function buildProviderPool(env: Env): ProviderPool {
  const warnings: string[] = [];
  let members: PoolMember[] = [];
  let source: ProviderPool['source'] = 'default';

  if (env.LLM_POOL && env.LLM_POOL.trim()) {
    const parsed = parsePoolSpec(env.LLM_POOL);
    warnings.push(...parsed.warnings);
    const r = resolve(parsed.entries, env, true);
    warnings.push(...r.warnings);
    if (r.members.length > 0) {
      members = r.members;
      source = 'LLM_POOL';
    } else {
      warnings.push('LLM_POOL: no usable provider, falling back to the default pool');
    }
  }
  if (members.length === 0) {
    members = resolve(DEFAULT_POOL_IDS.map((id) => ({ id, weight: 1 })), env, false).members;
  }

  const providers = members.flatMap((m) => Array.from({ length: m.weight }, () => m.provider));
  return { providers, members, source, warnings };
}

export function describePool(pool: ProviderPool): string {
  const total = pool.members.reduce((n, m) => n + m.weight, 0);
  const parts = pool.members.map((m) => `${m.spec.id}=${m.provider.name} (${Math.round((100 * m.weight) / total)}%)`);
  return `${parts.join(', ')} [${pool.source}]`;
}
