import { ChatProvider, ChatRequest, ChatResult, ProviderError, isRetryableStatus, resolveTemperature } from './chatClient.js';

export interface OpenAICompatConfig {
  /** Short vendor label: Deepseek, Mistral, Cerebras… */
  vendor: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  defaultTemperature?: number;
  /** Highest temperature the vendor accepts (default 2). */
  maxTemperature?: number;
  supportsJson?: boolean;
  /** Extra fields merged into every request body (vendor-specific knobs, e.g. reasoning_effort). */
  extraBody?: Record<string, unknown>;
  /** OpenAI reasoning models refuse max_tokens and want max_completion_tokens. */
  maxTokensParam?: 'max_tokens' | 'max_completion_tokens';
  /** Models whose hidden reasoning cannot be turned off spend it from the same token budget: added on top of req.maxTokens. */
  reasoningHeadroom?: number;
}

/** Visible text of a reply: string content, or the text parts of a content array (Mistral returns thinking parts there). */
function contentText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter((part: any) => part && part.type === 'text' && typeof part.text === 'string')
      .map((part: any) => part.text)
      .join('');
  }
  return '';
}

/** Removes reasoning written inline: complete <think>…</think> blocks, and an unclosed one (its answer never came). */
export function stripReasoning(text: string): { text: string; unclosed: boolean } {
  let s = text.replace(/<think>[\s\S]*?<\/think>/gi, '');
  // Some templates open the block in the prompt, so the reply carries only the closing tag.
  const orphanClose = s.search(/<\/think>/i);
  if (orphanClose >= 0) s = s.slice(orphanClose + '</think>'.length);
  const open = s.search(/<think>/i);
  const unclosed = open >= 0;
  if (unclosed) s = s.slice(0, open);
  return { text: s.trim(), unclosed };
}

/** Quota or balance exhausted: retrying the same provider cannot succeed, the fallback should take over at once. */
function isBillingError(status: number, detail: string): boolean {
  return status === 402 || /insufficient_quota|insufficient balance|credits? (are )?depleted|no credits remaining/i.test(detail);
}

/** Any provider exposing an OpenAI-compatible /chat/completions endpoint. */
export class OpenAICompatProvider implements ChatProvider {
  readonly name: string;
  readonly model: string;
  readonly supportsJson: boolean;

  constructor(private readonly config: OpenAICompatConfig) {
    this.name = `${config.vendor}/${config.model}`;
    this.model = config.model;
    this.supportsJson = config.supportsJson ?? false;
  }

  async chat(req: ChatRequest): Promise<ChatResult> {
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), req.timeoutMs ?? 8000);
    try {
      const body: Record<string, unknown> = {
        model: this.config.model,
        messages: req.messages,
        temperature: resolveTemperature(req, this.config.defaultTemperature ?? 1.0, this.config.maxTemperature ?? 2),
        [this.config.maxTokensParam ?? 'max_tokens']: (req.maxTokens ?? 300) + (this.config.reasoningHeadroom ?? 0),
        ...(this.config.extraBody ?? {}),
      };
      if (req.json && this.supportsJson) body.response_format = { type: 'json_object' };

      const res = await fetch(`${this.config.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.config.apiKey}` },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) {
        const detail = (await res.text().catch(() => '')).slice(0, 300);
        const retryable = isRetryableStatus(res.status) && !isBillingError(res.status, detail);
        throw new ProviderError(`${this.name} HTTP ${res.status}: ${detail}`, res.status, retryable);
      }
      const data: any = await res.json();
      const choice = data?.choices?.[0];
      // Reasoning returned in its own field (reasoning, reasoning_content) is never read: only the visible content is.
      const { text, unclosed } = stripReasoning(contentText(choice?.message?.content));
      let finishReason: string | null = choice?.finish_reason ?? null;
      // A reply cut inside its reasoning has no answer: report it as truncated even if the vendor said otherwise.
      if (unclosed && !text) finishReason = 'length';
      const usage = data?.usage;
      return {
        text,
        finishReason,
        latencyMs: Date.now() - started,
        provider: this.name,
        model: this.model,
        usage: usage
          ? {
              inputTokens: usage.prompt_tokens ?? 0,
              outputTokens: usage.completion_tokens ?? 0,
              reasoningTokens: usage.completion_tokens_details?.reasoning_tokens ?? undefined,
            }
          : undefined,
      };
    } catch (err: any) {
      if (err instanceof ProviderError) throw err;
      const aborted = err?.name === 'AbortError';
      throw new ProviderError(`${this.name} ${aborted ? 'timeout' : 'network'}: ${err?.message ?? err}`, null, true);
    } finally {
      clearTimeout(timer);
    }
  }
}
