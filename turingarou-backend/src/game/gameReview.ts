import type { GameMessage, QuestionAnswer } from '../types/game.types.js';

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
