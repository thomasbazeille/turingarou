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
  /** Extra fields merged into every request body (vendor-specific knobs). */
  extraBody?: Record<string, unknown>;
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
        max_tokens: req.maxTokens ?? 300,
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
        throw new ProviderError(`${this.name} HTTP ${res.status}: ${detail}`, res.status, isRetryableStatus(res.status));
      }
      const data: any = await res.json();
      const choice = data?.choices?.[0];
      return {
        text: typeof choice?.message?.content === 'string' ? choice.message.content : '',
        finishReason: choice?.finish_reason ?? null,
        latencyMs: Date.now() - started,
        provider: this.name,
        model: this.model,
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
