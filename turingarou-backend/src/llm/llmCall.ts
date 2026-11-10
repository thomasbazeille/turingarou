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
 * One LLM call with a time budget, one retry on transient errors (429, 5xx, network, timeout) and a fallback
 * to another configured provider for THIS call. Returns null when every attempt failed: callers treat null
 * as a named failure (logged), never as "the AI chose to stay silent".
 */
export async function callLLM(primary: ChatProvider, req: ChatRequest, opts: CallOptions): Promise<ChatResult | null> {
  const promptChars = req.messages.reduce((n, m) => n + m.content.length, 0);
  const started = Date.now();
  let attempts = 0;
  let lastError: string | null = null;

  const attempt = async (p: ChatProvider): Promise<ChatResult | null> => {
    attempts++;
    try {
      return await p.chat(req);
    } catch (err) {
      const e = err as ProviderError;
      lastError = e?.message?.slice(0, 200) ?? String(err);
      if (e instanceof ProviderError && e.retryable) {
        await sleep(300 + Math.random() * 300);
        attempts++;
        try {
          return await p.chat(req);
        } catch (err2: any) {
          lastError = err2?.message?.slice(0, 200) ?? String(err2);
        }
      }
      return null;
    }
  };

  let result = await attempt(primary);
  let fallback = false;
  if (!result) {
    const alternatives = opts.pool.filter((p) => p.name !== primary.name);
    if (alternatives.length > 0) {
      const alt = alternatives[Math.floor(Math.random() * alternatives.length)];
      fallback = true;
      result = await attempt(alt);
    }
  }

  const event: LLMCallEvent = {
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
  };
  opts.sink?.(event);
  if (!event.ok) console.error(`[llm] ${opts.role} ${opts.player} failed after ${attempts} attempt(s): ${lastError}`);
  return result;
}
