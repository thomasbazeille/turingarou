import { LLMMessage, LLMResponse } from '../types/game.types.js';

export interface LLMProvider {
  name: string;
  query(messages: LLMMessage[]): Promise<LLMResponse>;
}

export interface LLMConfig {
  apiKey: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}
