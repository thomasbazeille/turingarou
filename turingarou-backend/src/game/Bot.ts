import { ChatProvider } from '../llm/chatClient.js';
import { callLLM, CallRole, LLMEventSink } from '../llm/llmCall.js';
import { matchPlayerName } from '../llm/parse.js';
import { LLMMessage } from '../types/game.types.js';
import type { HumanPersona } from './GameLogger.js';
import { AISpeechSink, AIStyleProfile, DecisionOutcome, answerWithGate, decideWithGate } from './aiSpeech.js';
import { BotRole, BotView, buildGameContext, ownAnswers } from './botContext.js';
import { DecisionCue, PromptIdentity, answerPrompt, decisionPrompt, systemPrompt, votePrompt } from './botPrompts.js';
import { ResponseStyle } from './humanTiming.js';

/** Temperature scale per task, relative to each provider's default (analysis C, T14): a name to vote needs less dispersion. */
export const TEMPERATURE_SCALE = { decision: 0.9, answer: 0.9, vote: 0.5 } as const;
const VOTE_TIMEOUT_MS = 6000;

export interface BotSpec {
  id: string;
  name: string;
  role: BotRole;
  provider: ChatProvider;
  pool: ChatProvider[];
  profile: AIStyleProfile;
  responseStyle: ResponseStyle;
  strategy: string;
  strategyName?: string;
  personality?: string;
  persona?: HumanPersona | null;
}

export interface BotSinks {
  llm?: LLMEventSink;
  speech?: AISpeechSink;
  rng?: () => number;
}

export type VoteResult = { targetId: string; reason: null } | { targetId: null; reason: 'llm_failed' | 'unmatched' | 'stale' };

/**
 * One bot, AI or inspector: the role only changes the prompts and the call labels. It keeps no game state;
 * every call reads a fresh BotView.
 */
export class Bot {
  readonly id: string;
  readonly name: string;
  readonly role: BotRole;

  constructor(readonly spec: BotSpec, private readonly sinks: BotSinks = {}) {
    this.id = spec.id;
    this.name = spec.name;
    this.role = spec.role;
  }

  get responseStyle(): ResponseStyle {
    return this.spec.responseStyle;
  }

  get providerName(): string {
    return this.spec.provider.name;
  }

  private get identity(): PromptIdentity {
    return {
      name: this.name,
      role: this.role,
      strategy: this.spec.strategy,
      personality: this.spec.personality,
      persona: this.spec.persona,
      caseProfile: this.spec.profile.caseProfile,
    };
  }

  private callRole(task: 'decision' | 'answer' | 'vote'): CallRole {
    return this.role === 'inspector' ? `inspector_${task}` : task;
  }

  private common(alive: () => boolean) {
    return {
      provider: this.spec.provider,
      pool: this.spec.pool,
      player: this.name,
      profile: this.spec.profile,
      llmSink: this.sinks.llm,
      eventSink: this.sinks.speech,
      rng: this.sinks.rng,
      alive,
    };
  }

  context(view: BotView): string {
    return buildGameContext(view, { id: this.id, name: this.name, role: this.role });
  }

  /** Answer to the round question, or null (SKIP, failure, or the phase is over). */
  answer(view: BotView, alive: () => boolean): Promise<string | null> {
    if (!view.question) return Promise.resolve(null);
    const previous = ownAnswers(view.history, this.id);
    const messages: LLMMessage[] = [
      { role: 'system', content: systemPrompt(this.identity, view.format, false) },
      { role: 'user', content: answerPrompt(this.identity, view.question, previous, view.format) },
    ];
    return answerWithGate({
      ...this.common(alive),
      role: this.callRole('answer'),
      messages,
      ownPreviousAnswers: previous.map((a) => a.answer),
      temperatureScale: TEMPERATURE_SCALE.answer,
    });
  }

  /** Discussion decision. Timing is computed by the director, never asked to the model. */
  decide(view: BotView, cue: DecisionCue, alive: () => boolean): Promise<DecisionOutcome> {
    const discussion = view.messages.filter((m) => m.playerId !== 'system');
    const mine = discussion.filter((m) => m.playerId === this.id);
    const last = mine[mine.length - 1];
    const messages: LLMMessage[] = [
      { role: 'system', content: systemPrompt(this.identity, view.format, true) },
      { role: 'user', content: this.context(view) },
      {
        role: 'user',
        content: decisionPrompt(
          this.identity,
          cue,
          mine.slice(-3).map((m) => m.content),
          last ? Math.floor((view.now - last.timestamp) / 1000) : null
        ),
      },
    ];
    return decideWithGate({
      ...this.common(alive),
      role: this.callRole('decision'),
      messages,
      speech: {
        ownRecent: mine.slice(-5).map((m) => m.content),
        otherAIRecent: discussion
          .filter((m) => m.playerId !== this.id && view.botIds.has(m.playerId))
          .slice(-20)
          .map((m) => m.content),
      },
      temperatureScale: TEMPERATURE_SCALE.decision,
    });
  }

  /** Vote on a fresh context. A null target is a named failure: the director casts a logged fallback vote. */
  async vote(view: BotView, candidates: { id: string; username: string }[], alive: () => boolean): Promise<VoteResult> {
    const messages: LLMMessage[] = [
      { role: 'system', content: systemPrompt(this.identity, view.format, false) },
      { role: 'user', content: votePrompt(this.identity, this.context(view), candidates.map((c) => c.username)) },
    ];
    const r = await callLLM(
      this.spec.provider,
      {
        messages,
        maxTokens: 20,
        timeoutMs: VOTE_TIMEOUT_MS,
        temperatureScale: TEMPERATURE_SCALE.vote,
        temperatureOffset: this.spec.profile.temperatureOffset,
      },
      { role: this.callRole('vote'), player: this.name, pool: this.spec.pool, sink: this.sinks.llm }
    );
    if (!alive()) return { targetId: null, reason: 'stale' };
    if (!r) return { targetId: null, reason: 'llm_failed' };
    const match = matchPlayerName(r.text, candidates);
    return match ? { targetId: match.id, reason: null } : { targetId: null, reason: 'unmatched' };
  }
}
