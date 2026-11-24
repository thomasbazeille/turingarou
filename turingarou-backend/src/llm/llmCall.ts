import { ChatProvider, ChatRequest, ChatResult, ProviderError } from './chatClient.js';

export type CallRole = 'decision' | 'answer' | 'vote' | 'inspector_decision' | 'inspector_answer' | 'inspector_vote';

export interface LLMCallEvent {
  role: CallRole;
  player: string;
  provider: string;
  model: string;
  ok: boolean;
  latencyMs: number;
  attempts: number;
  fallback: boolean;
  error: string | null;
  finishReason: string | null;
  promptChars: number;
  outputChars: number;
  at: number;
}

export type LLMEventSink = (e: LLMCallEvent) => void;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface CallOptions {
  role: CallRole;
  player: string;
  /** Other providers that may take over this call if the primary fails. */
  pool: ChatProvider[];
  sink?: LLMEventSink;
}

/**
 * One LLM call with a time budget, one retry on transient errors (429, 5xx, network, timeout) and a
 * fallback provider for THIS call. Returns null when every attempt failed: callers treat null as a named
 * failure (logged), never as "the AI chose to stay silent".
 */
export async function callLLM(primary: ChatProvider, req: ChatRequest, opts: CallOptions): Promise<ChatResult | null> {
  const promptChars = req.messages.reduce((n, m) => n + m.content.length, 0);
  const started = Date.now();
  let attempts = 0;
  let lastError: string | null = null;

  const attempt = async (p: ChatProvider): Promise<ChatResult | null> => {
    for (let i = 0; i < 2; i++) {
      attempts++;
      try {
        return await p.chat(req);
      } catch (err) {
        const e = err as ProviderError;
        lastError = e?.message?.slice(0, 200) ?? String(err);
        if (i > 0 || !(e instanceof ProviderError && e.retryable)) return null;
        await sleep(300 + Math.random() * 300);
      }
    }
    return null;
  };

  let result = await attempt(primary);
  let fallback = false;
  if (!result) {
    const alternatives = opts.pool.filter((p) => p.name !== primary.name);
    if (alternatives.length) {
      fallback = true;
      result = await attempt(alternatives[Math.floor(Math.random() * alternatives.length)]);
    }
  }

  opts.sink?.({
    role: opts.role,
    player: opts.player,
    provider: result?.provider ?? primary.name,
    model: result?.model ?? primary.model,
    ok: result !== null,
    latencyMs: Date.now() - started,
    attempts,
    fallback,
    error: result ? null : lastError,
    finishReason: result?.finishReason ?? null,
    promptChars,
    outputChars: result?.text.length ?? 0,
    at: started,
  });
  if (!result) console.error(`[llm] ${opts.role} ${opts.player} failed after ${attempts} attempt(s): ${lastError}`);
  return result;
}
