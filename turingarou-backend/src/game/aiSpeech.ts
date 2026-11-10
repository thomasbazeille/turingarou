import { ChatProvider } from '../llm/chatClient.js';
import { callLLM, CallRole, LLMEventSink } from '../llm/llmCall.js';
import { parseDecision, cleanPlain } from '../llm/parse.js';
import { checkMessage, CaseProfile, GateReason } from './formGate.js';
import { LLMMessage } from '../types/game.types.js';

/** Writing habits drawn once per AI and kept for the whole game (a real player's style does not change per message). */
export interface AIStyleProfile {
  caseProfile: CaseProfile;
  dropFinalPeriodProb: number;
  temperatureOffset: number;
}

export function drawStyleProfile(rng: () => number = Math.random): AIStyleProfile {
  const r = rng();
  return {
    caseProfile: r < 0.55 ? 'lower' : r < 0.85 ? 'sentence' : 'raw',
    dropFinalPeriodProb: 0.5 + rng() * 0.45,
    temperatureOffset: Math.round((rng() * 0.3 - 0.15) * 100) / 100,
  };
}

export interface SpeechContext {
  ownRecent: string[];
  otherAIRecent: string[];
}

export interface AISpeechEvent {
  player: string;
  kind: 'gate_regen' | 'gate_drop' | 'parse_fail' | 'llm_fail' | 'answer_drop';
  reason?: string;
  detail?: string;
  at: number;
}
export type AISpeechSink = (e: AISpeechEvent) => void;

export type DecisionOutcome =
  | { kind: 'silent' }
  | { kind: 'message'; message: string; regenerated: boolean; notes: string[] }
  | { kind: 'failed'; reason: string }
  | { kind: 'dropped'; reason: GateReason; detail: string };

const REJECT_HINT: Record<GateReason, string> = {
  empty: 'it was empty',
  structure: 'no lists and no line breaks, one single chat line',
  json_leak: 'the message field must contain only what you type in the chat',
  ai_admission: 'never talk about being an AI or a model',
  assistant_formula: 'it sounds like a chatbot assistant, not a player',
  duplicate_own: 'you already said almost exactly that',
  duplicate_other: 'another player already said almost exactly that',
  same_opening: 'it starts exactly like another player\'s message',
};

interface SpeakParams {
  provider: ChatProvider;
  pool: ChatProvider[];
  role: CallRole;
  player: string;
  profile: AIStyleProfile;
  llmSink?: LLMEventSink;
  eventSink?: AISpeechSink;
  /** Rechecked after every LLM call: once false (phase changed, job superseded), no further call is made. */
  alive?: () => boolean;
  rng?: () => number;
}

/** A discussion decision: strict JSON, form gate on the message, one regeneration, never posts raw model output. */
export async function decideWithGate(
  p: SpeakParams & { messages: LLMMessage[]; speech: SpeechContext; temperatureScale: number }
): Promise<DecisionOutcome> {
  const emit = (e: Omit<AISpeechEvent, 'player' | 'at'>) => p.eventSink?.({ player: p.player, at: Date.now(), ...e });
  const stale = () => p.alive !== undefined && !p.alive();
  const ask = (messages: LLMMessage[]) =>
    callLLM(
      p.provider,
      { messages, json: true, maxTokens: 220, timeoutMs: 8000, temperatureScale: p.temperatureScale, temperatureOffset: p.profile.temperatureOffset },
      { role: p.role, player: p.player, pool: p.pool, sink: p.llmSink }
    );

  const readDecision = async (messages: LLMMessage[]) => {
    const r = await ask(messages);
    if (stale()) return { failed: 'stale' as const };
    if (!r) return { failed: 'llm' as const };
    let d = parseDecision(r.text, r.finishReason);
    if (!d.ok) {
      const retry = await ask([...messages, { role: 'user', content: 'Reply with the JSON object only, nothing else.' }]);
      if (stale()) return { failed: 'stale' as const };
      if (!retry) return { failed: 'llm' as const };
      d = parseDecision(retry.text, retry.finishReason);
      if (!d.ok) return { failed: `parse:${d.error}` as const };
    }
    return { decision: d };
  };
  const failure = (failed: string): DecisionOutcome => {
    if (failed !== 'stale') emit({ kind: failed === 'llm' ? 'llm_fail' : 'parse_fail', reason: failed });
    return { kind: 'failed', reason: failed };
  };

  const first = await readDecision(p.messages);
  if ('failed' in first) return failure(first.failed ?? 'llm');
  if (!first.decision.shouldRespond) return { kind: 'silent' };

  const gateCtx = { channel: 'discussion' as const, caseProfile: p.profile.caseProfile, dropFinalPeriodProb: p.profile.dropFinalPeriodProb, rng: p.rng, ...p.speech };
  const v1 = checkMessage(first.decision.message, gateCtx);
  if (v1.ok) return { kind: 'message', message: v1.text, regenerated: false, notes: v1.notes };

  emit({ kind: 'gate_regen', reason: v1.reason, detail: first.decision.message.slice(0, 160) });
  const second = await readDecision([
    ...p.messages,
    { role: 'user', content: `Your message "${first.decision.message.slice(0, 200)}" cannot be posted: ${REJECT_HINT[v1.reason]}. Write something different, one short casual line, same JSON format.` },
  ]);
  if ('failed' in second) return failure(second.failed ?? 'llm');
  if (!second.decision.shouldRespond) return { kind: 'silent' };
  const v2 = checkMessage(second.decision.message, gateCtx);
  if (v2.ok) return { kind: 'message', message: v2.text, regenerated: true, notes: v2.notes };
  emit({ kind: 'gate_drop', reason: v2.reason, detail: second.decision.message.slice(0, 160) });
  return { kind: 'dropped', reason: v2.reason, detail: v2.detail };
}

/** A question-phase answer: plain text, SKIP allowed, form gate, one regeneration. Returns null to skip. */
export async function answerWithGate(
  p: SpeakParams & { messages: LLMMessage[]; ownPreviousAnswers: string[]; temperatureScale?: number }
): Promise<string | null> {
  const ask = (messages: LLMMessage[]) =>
    callLLM(
      p.provider,
      { messages, maxTokens: 80, timeoutMs: 10000, temperatureScale: p.temperatureScale, temperatureOffset: p.profile.temperatureOffset },
      { role: p.role, player: p.player, pool: p.pool, sink: p.llmSink }
    );
  const gateCtx = { channel: 'answer' as const, caseProfile: p.profile.caseProfile, dropFinalPeriodProb: p.profile.dropFinalPeriodProb, rng: p.rng, ownRecent: p.ownPreviousAnswers, otherAIRecent: [] };

  let messages = p.messages;
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await ask(messages);
    if (p.alive !== undefined && !p.alive()) return null;
    if (!r) {
      p.eventSink?.({ player: p.player, kind: 'llm_fail', reason: 'answer', at: Date.now() });
      return null;
    }
    const raw = cleanPlain(r.text, p.player);
    if (!raw || /^skip\b/i.test(raw)) return null;
    const firstSentence = raw.split(/(?<=[.!?])\s/)[0]?.trim() || raw;
    const v = checkMessage(firstSentence, gateCtx);
    if (v.ok) return v.text;
    p.eventSink?.({ player: p.player, kind: attempt === 0 ? 'gate_regen' : 'answer_drop', reason: v.reason, detail: raw.slice(0, 160), at: Date.now() });
    messages = [...p.messages, { role: 'user', content: `Your answer "${raw.slice(0, 120)}" cannot be used: ${REJECT_HINT[v.reason]}. Give a different short answer, or SKIP.` }];
  }
  return null;
}
