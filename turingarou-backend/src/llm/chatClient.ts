import { LLMMessage } from '../types/game.types.js';

export interface ChatRequest {
  messages: LLMMessage[];
  temperature?: number;
  /** Relative to the provider's own default, so a fallback provider keeps a sensible setting. */
  temperatureScale?: number;
  temperatureOffset?: number;
  maxTokens?: number;
  /** Ask the provider for a JSON object when it supports it (decision calls only). */
  json?: boolean;
  timeoutMs?: number;
}

export interface ChatResult {
  text: string;
  finishReason: string | null;
  latencyMs: number;
  provider: string;
  model: string;
  /** Token counts reported by the vendor, when it reports them. */
  usage?: { inputTokens: number; outputTokens: number; reasoningTokens?: number };
}

export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly status: number | null,
    public readonly retryable: boolean
  ) {
    super(message);
  }
}

export interface ChatProvider {
  /** Label used in logs and persisted game data, e.g. "Deepseek/deepseek-chat". */
  name: string;
  model: string;
  supportsJson: boolean;
  chat(req: ChatRequest): Promise<ChatResult>;
}

export function resolveTemperature(req: ChatRequest, providerDefault: number, max: number): number {
  const base = req.temperature ?? providerDefault;
  const t = base * (req.temperatureScale ?? 1) + (req.temperatureOffset ?? 0);
  return Math.max(0, Math.min(max, Math.round(t * 100) / 100));
}

export function isRetryableStatus(status: number | null): boolean {
  return status === null || status === 408 || status === 409 || status === 429 || status >= 500;
}
