import type { GameMessage, QuestionAnswer, Vote } from '../types/game.types.js';

/** A seat as the game over reveals it: human or AI, and the model behind an AI. */
export interface RevealedPlayer {
  id: string;
  name: string;
  color: string;
  isAI: boolean;
  model?: string;
}

export interface TranscriptRound {
  round: number;
  question: string;
  /** In seat order, without the time each one came in. */
  answers: { playerId: string; text: string }[];
  /** As posted. */
  messages: { id: string; playerId: string; text: string; replyToId?: string }[];
  eliminatedId: string | null;
}

/** The whole game, every author revealed: sent with the game over only, so a client never depends on what it kept. */
export interface Transcript {
  players: RevealedPlayer[];
  rounds: TranscriptRound[];
}

export interface TranscriptInput {
  /** In seat order. */
  players: RevealedPlayer[];
  rounds: number;
  question: (round: number) => string;
  answers: (round: number) => QuestionAnswer[];
  messages: GameMessage[];
  eliminatedId: (round: number) => string | null;
}

export function buildTranscript(input: TranscriptInput): Transcript {
  const rounds: TranscriptRound[] = [];
  for (let round = 1; round <= input.rounds; round++) {
    const byPlayer = new Map(input.answers(round).map((a) => [a.playerId, a.answer]));
    rounds.push({
      round,
      question: input.question(round),
      answers: input.players.flatMap((p) => (byPlayer.has(p.id) ? [{ playerId: p.id, text: byPlayer.get(p.id)! }] : [])),
      messages: input.messages
        .filter((m) => m.round === round && m.playerId !== 'system')
        .map((m) => ({ id: m.id, playerId: m.playerId, text: m.content, ...(m.replyToId ? { replyToId: m.replyToId } : {}) })),
      eliminatedId: input.eliminatedId(round),
    });
  }
  return { players: input.players.map((p) => ({ ...p })), rounds };
}

/** A line a player flagged during the game, and who wrote it. */
export interface FlagResult {
  messageId: string;
  round: number;
  authorId: string;
  authorName: string;
  text: string;
  isAI: boolean;
}

/** One round's vote of a player: against an AI, against a human, or none (abstained, or did not vote). */
export interface RoundVote {
  round: number;
  outcome: 'ai' | 'human' | 'abstain';
  /** Voted out this round: the player votes in no later round. */
  out: boolean;
}

/** Two numbers kept apart, never netted: AIs found (votes against an AI) and false accusations (against a human). */
export interface Score {
  aiFound: number;
  falseAccusations: number;
  /** Every round the player could vote in. */
  rounds: RoundVote[];
}

/** What one player gets at the game over, and nobody else. */
export interface PlayerReview {
  /** Same for every player of the game, different from any other game: the browser counts a game once. */
  gameKey: string;
  score: Score;
  /** shareText of the score, in the game's language; the browser adds the page link. */
  share: string;
  flags: FlagResult[];
}

/** A player's score from the votes revealed at each round end (one entry per player who could vote, a missing vote as an abstention). */
export function scoreVotes(playerId: string, history: { round: number; votes: Vote[]; eliminatedId: string | null }[], isAI: (playerId: string) => boolean): Score {
  const rounds: RoundVote[] = [];
  for (const r of [...history].sort((a, b) => a.round - b.round)) {
    const own = r.votes.find((v) => v.voterId === playerId);
    if (!own) continue;
    rounds.push({ round: r.round, outcome: own.targetId === null ? 'abstain' : isAI(own.targetId) ? 'ai' : 'human', out: r.eliminatedId === playerId });
  }
  return {
    aiFound: rounds.filter((r) => r.outcome === 'ai').length,
    falseAccusations: rounds.filter((r) => r.outcome === 'human').length,
    rounds,
  };
}

/** The lines a player flagged, in the order flagged, each with the truth about its author. */
export function flagResults(messageIds: string[], messages: GameMessage[], isAI: (playerId: string) => boolean): FlagResult[] {
  return messageIds.flatMap((id) => {
    const m = messages.find((x) => x.id === id && x.playerId !== 'system');
    return m ? [{ messageId: m.id, round: m.round, authorId: m.playerId, authorName: m.playerName, text: m.content, isAI: isAI(m.playerId) }] : [];
  });
}

const SHARE_MARK: Record<RoundVote['outcome'], string> = { ai: '🎯', human: '❌', abstain: '⬜' };

/**
 * The result a player can paste anywhere, Wordle-style: the score, then one line per round they voted in (an AI
 * found, a human accused, no vote; voted out). Never a name, a model or a room: nothing that spoils a future game.
 * The page link is added by the browser, which knows the address it was served from.
 */
export function shareText(score: Score, lang: 'fr' | 'en'): string {
  const fr = lang === 'fr';
  const found = fr ? `${score.aiFound} IA ${score.aiFound > 1 ? 'trouvées' : 'trouvée'}` : `${score.aiFound} ${score.aiFound === 1 ? 'AI' : 'AIs'} found`;
  const wrong = fr
    ? `${score.falseAccusations} ${score.falseAccusations > 1 ? 'fausses accusations' : 'fausse accusation'}`
    : `${score.falseAccusations} false ${score.falseAccusations === 1 ? 'accusation' : 'accusations'}`;
  const lines = score.rounds.map((r) => `${fr ? 'M' : 'R'}${r.round} ${SHARE_MARK[r.outcome]}${r.out ? ' 💀' : ''}`);
  return [`Turingarou · ${found} · ${wrong}`, ...lines].join('\n');
}
