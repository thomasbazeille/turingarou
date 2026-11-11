import { GameFormat, GameMessage, GamePhase, QuestionAnswer } from '../types/game.types.js';

export type BotRole = 'ai' | 'inspector';

export interface OwnAnswer {
  round: number;
  question: string;
  answer: string;
}

/** A finished round, as humans saw it between rounds. */
export interface RoundRecord {
  round: number;
  question: string;
  answers: QuestionAnswer[];
  votes: { voter: string; target: string }[];
  eliminated: { name: string; isAI: boolean } | null;
}

/**
 * What a bot may know at the instant of a call. Built fresh for every call: a context never outlives its phase
 * (votes used to read a context built by the last discussion tick, possibly a round old).
 */
export interface BotView {
  now: number;
  format: GameFormat;
  round: number;
  phase: GamePhase;
  question: string | null;
  answers: QuestionAnswer[];
  messages: readonly GameMessage[];
  activePlayerIds: ReadonlySet<string>;
  /** Ids of every bot (AI or inspector): only used to compare a draft with other bots' lines, never shown to a model. */
  botIds: ReadonlySet<string>;
  eliminatedNames: string[];
  aiRemaining: number;
  history: RoundRecord[];
}

export const CONTEXT_WINDOW = 40;
export const FORGET_PERCENT = 12;

/** Stable pseudo-random 0..99 from a string: the same message is forgotten (or not) on every call. */
export function stableBucket(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 100;
}

export function ownAnswers(history: RoundRecord[], botId: string): OwnAnswer[] {
  const out: OwnAnswer[] = [];
  for (const r of history) {
    const mine = r.answers.find((a) => a.playerId === botId);
    if (mine) out.push({ round: r.round, question: r.question, answer: mine.answer });
  }
  return out;
}

export function previousRoundsSummary(history: RoundRecord[]): string {
  return history
    .map((r) => {
      const parts: string[] = [];
      if (r.question) parts.push(`Question: "${r.question}"`);
      if (r.answers.length > 0) parts.push(`Answers: ${r.answers.map((a) => `${a.playerName}: ${a.answer}`).join(' / ')}`);
      parts.push(r.eliminated ? `Eliminated: ${r.eliminated.name} (${r.eliminated.isAI ? 'AI' : 'human'})` : 'Eliminated: none');
      parts.push(`Votes: ${r.votes.length > 0 ? r.votes.map((v) => `${v.voter} → ${v.target}`).join(', ') : 'none recorded'}`);
      return `Round ${r.round}. ${parts.join('. ')}`;
    })
    .join('\n');
}

/**
 * The messages a bot "saw": the last 40 lines of players still in the game. Humans miss some lines (scrolled past,
 * phone, distracted); the forgotten set is STABLE per bot (hash of message id + bot id), so a line never vanishes
 * or reappears from one call to the next. Never forgotten: the last 3 lines, the bot's own, system lines, and lines
 * that name the bot.
 */
export function visibleMessages(messages: readonly GameMessage[], self: { id: string; name: string }, activeIds: ReadonlySet<string>): GameMessage[] {
  const recent = messages.filter((m) => m.playerId === 'system' || activeIds.has(m.playerId)).slice(-CONTEXT_WINDOW);
  const ownName = self.name.toLowerCase();
  return recent.filter((m, idx) => {
    const kept =
      idx >= recent.length - 3 ||
      m.playerId === self.id ||
      m.playerId === 'system' ||
      m.content.toLowerCase().includes(ownName);
    return kept || stableBucket(m.id + self.id) >= FORGET_PERCENT;
  });
}

export function buildGameContext(view: BotView, self: { id: string; name: string; role: BotRole }): string {
  let context = `# GAME CONTEXT - Round ${view.round}\n\nCurrent phase: ${view.phase}\n\n`;

  if (view.eliminatedNames.length > 0) {
    context += `## Eliminated (out of the game, ignore them): ${view.eliminatedNames.join(', ')}\n`;
    context +=
      self.role === 'ai'
        ? `AIs still in game: ${view.aiRemaining}. Focus only on the remaining players. Your goal: get humans voted out and stay with the other AIs to win.\n\n`
        : `AIs still in game: ${view.aiRemaining}. Focus only on the remaining players to find and vote out the AI(s).\n\n`;
  }
  if (view.question) context += `Current question: "${view.question}"\n\n`;

  const summary = previousRoundsSummary(view.history);
  if (summary) context += `## Previous rounds summary (same info humans see between rounds):\n${summary}\n\n`;

  const mine = ownAnswers(view.history, self.id);
  if (mine.length > 0) {
    context += `## Your own answers in previous rounds (stay consistent with them, don't repeat them):\n`;
    for (const a of mine) context += `Round ${a.round}, question "${a.question}": ${a.answer}\n`;
    context += `\n`;
  }

  if (view.answers.length > 0) {
    context += `## Answers to the question this round:\n`;
    for (const a of view.answers) context += `[${a.playerName}]: ${a.answer}\n`;
    context += `\n`;
  }

  if (view.phase === 'discussion') {
    if (self.role === 'ai' && view.answers.length > 0) {
      context += `Discussion time: react to the conversation, don't loop back to justifying your own answer. A real player would comment on what others said, make jokes, ask questions, be curious or suspicious. Don't strategize out loud; just react like a person.\n\n`;
    }
    const posted = view.messages.some((m) => m.phase === 'discussion' && m.round === view.round && m.playerId !== 'system');
    if (!posted) context += `No one has posted in this discussion yet.\n\n`;
  }

  const seen = visibleMessages(view.messages, self, view.activePlayerIds);
  if (seen.length > 0) {
    context += `## Recent conversation (only players still in the game):\n`;
    let round = -1;
    for (const m of seen) {
      if (m.round !== round) {
        round = m.round;
        context += `(round ${round})\n`;
      }
      const quoted = m.replyToId ? view.messages.find((q) => q.id === m.replyToId) : undefined;
      context += `[${m.playerName}]${quoted ? ` (replying to ${quoted.playerName}: "${quoted.content.slice(0, 60)}")` : ''}: ${m.content}\n`;
    }
  }
  return context;
}
