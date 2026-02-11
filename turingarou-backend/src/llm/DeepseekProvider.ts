import axios from 'axios';
import { LLMProvider, LLMConfig } from './LLMProvider.js';
import { LLMMessage, LLMResponse } from '../types/game.types.js';

export class DeepseekProvider implements LLMProvider {
  name = 'Deepseek';
  private config: LLMConfig;

  constructor(config: LLMConfig) {
    this.config = {
      model: 'deepseek-chat',
      temperature: 0.8,
      maxTokens: 500,
      ...config,
    };
  }

  async query(messages: LLMMessage[]): Promise<LLMResponse> {
    try {
      const response = await axios.post(
        'https://api.deepseek.com/v1/chat/completions',
        {
          model: this.config.model,
          messages,
          temperature: this.config.temperature,
          max_tokens: this.config.maxTokens,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.config.apiKey}`,
          },
        }
      );

      const content = response.data.choices[0].message.content;
      return this.parseResponse(content);
    } catch (error: any) {
      console.error('Deepseek API error:', error.response?.data || error.message);
      return { shouldRespond: false };
    }
  }

  private parseResponse(content: string): LLMResponse {
    try {
      // Format attendu: JSON avec shouldRespond, message, delayMs
      const parsed = JSON.parse(content);
      return {
        shouldRespond: parsed.shouldRespond ?? false,
        message: parsed.message,
        delayMs: parsed.delayMs ?? 2000,
      };
    } catch {
      // Si pas JSON, on considère que c'est un message direct
      return {
        shouldRespond: true,
        message: content.trim(),
        delayMs: 2000,
      };
    }
  }
}
