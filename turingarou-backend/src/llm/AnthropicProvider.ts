import Anthropic from '@anthropic-ai/sdk';
import { LLMProvider, LLMConfig } from './LLMProvider.js';
import { LLMMessage, LLMResponse } from '../types/game.types.js';

/** Strip markdown code fences that LLMs sometimes wrap JSON in. */
function stripCodeFences(s: string): string {
  const m = s.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  return m ? m[1] : s.trim();
}

export class AnthropicProvider implements LLMProvider {
  name = 'Anthropic';
  private client: Anthropic;
  private config: Required<LLMConfig>;

  constructor(config: LLMConfig) {
    this.config = {
      model: 'claude-haiku-4-5',
      temperature: 1.0,
      maxTokens: 500,
      ...config,
    };
    this.client = new Anthropic({ apiKey: config.apiKey });
  }

  async query(messages: LLMMessage[]): Promise<LLMResponse> {
    try {
      // Anthropic separates system prompt from the messages array
      const systemMessages = messages.filter((m) => m.role === 'system');
      const system = systemMessages.map((m) => m.content).join('\n\n');

      // Merge consecutive user messages (Anthropic requires alternating turns)
      const userMessages: { role: 'user' | 'assistant'; content: string }[] = [];
      for (const m of messages.filter((m) => m.role !== 'system')) {
        const last = userMessages[userMessages.length - 1];
        if (last && last.role === m.role) {
          last.content += '\n\n' + m.content;
        } else {
          userMessages.push({ role: m.role as 'user' | 'assistant', content: m.content });
        }
      }

      if (userMessages.length === 0) {
        return { shouldRespond: false };
      }

      const response = await this.client.messages.create({
        model: this.config.model,
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature,
        system: system || undefined,
        messages: userMessages,
      });

      const block = response.content[0];
      const content = block.type === 'text' ? block.text : '';
      return this.parseResponse(content);
    } catch (error: any) {
      console.error('Anthropic API error:', error.message ?? error);
      return { shouldRespond: false };
    }
  }

  private parseResponse(content: string): LLMResponse {
    try {
      const parsed = JSON.parse(stripCodeFences(content));
      return {
        shouldRespond: parsed.shouldRespond ?? false,
        message: parsed.message,
        delayMs: parsed.delayMs ?? 2000,
      };
    } catch {
      // Non-JSON response (e.g. answerQuestion plain text) — treat as direct message
      return {
        shouldRespond: true,
        message: content.trim(),
        delayMs: 2000,
      };
    }
  }
}
