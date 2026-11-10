import Anthropic from '@anthropic-ai/sdk';
import { ChatProvider, ChatRequest, ChatResult, ProviderError, isRetryableStatus, resolveTemperature } from './chatClient.js';

export interface AnthropicOptions {
  /** Haiku 5.5 thinks by default and spends the whole small budget on it (empty reply): send thinking disabled. */
  disableThinking?: boolean;
  /** Organisation keys need an anthropic-workspace-id header. */
  workspaceId?: string;
}

export class AnthropicChatProvider implements ChatProvider {
  readonly name: string;
  readonly model: string;
  readonly supportsJson = false;
  private client: Anthropic;

  constructor(
    apiKey: string,
    model = 'claude-haiku-4-5',
    private readonly options: AnthropicOptions = {}
  ) {
    this.model = model;
    this.name = `Anthropic/${model}`;
    // Retries are ours (llmCall.ts): the SDK must not retry behind our back.
    this.client = new Anthropic({
      apiKey,
      maxRetries: 0,
      defaultHeaders: options.workspaceId ? { 'anthropic-workspace-id': options.workspaceId } : undefined,
    });
  }

  async chat(req: ChatRequest): Promise<ChatResult> {
    const started = Date.now();
    const system = req.messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
    const turns: { role: 'user' | 'assistant'; content: string }[] = [];
    for (const m of req.messages.filter((m) => m.role !== 'system')) {
      const last = turns[turns.length - 1];
      if (last && last.role === m.role) last.content += '\n\n' + m.content;
      else turns.push({ role: m.role as 'user' | 'assistant', content: m.content });
    }
    if (turns.length === 0) throw new ProviderError(`${this.name}: no user turn`, 400, false);

    try {
      const response = await this.client.messages.create(
        {
          model: this.model,
          max_tokens: req.maxTokens ?? 300,
          temperature: resolveTemperature(req, 1.0, 1),
          // The system prompt is stable for a given AI during a game: cache it.
          system: system ? [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }] : undefined,
          messages: turns,
          ...(this.options.disableThinking ? { thinking: { type: 'disabled' as const } } : {}),
        },
        { timeout: req.timeoutMs ?? 8000 }
      );
      // Thinking blocks come first when the model thinks: read the first text block, not the first block.
      const block = response.content.find((b) => b.type === 'text');
      return {
        text: block && block.type === 'text' ? block.text : '',
        finishReason: response.stop_reason ?? null,
        latencyMs: Date.now() - started,
        provider: this.name,
        model: this.model,
        usage: {
          inputTokens:
            response.usage.input_tokens + (response.usage.cache_creation_input_tokens ?? 0) + (response.usage.cache_read_input_tokens ?? 0),
          outputTokens: response.usage.output_tokens,
        },
      };
    } catch (err: any) {
      const status = typeof err?.status === 'number' ? err.status : null;
      throw new ProviderError(`${this.name}: ${err?.message ?? err}`, status, isRetryableStatus(status));
    }
  }
}
