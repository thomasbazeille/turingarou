/**
 * One finished game, as read from Postgres and as exported (one JSON object per JSONL line).
 * Exported records are pseudonymized: every name is `p_<hash>`, the game id is `g_<hash>`.
 */

export const HISTORY_SCHEMA = 'turingarou.history.v1';

export type Language = 'fr' | 'en';
export type GameResult = 'humans_win' | 'ai_win' | 'draw';
export type PlayerKind = 'human' | 'ai' | 'inspector';

export interface HistoryPlayer {
  name: string; type: PlayerKind; strategy: string | null;
  provider: string | null; // LLM provider; null when unknown (not persisted by the game, see readStrategy)
  eliminated: boolean; eliminatedRound: number | null;
}

export interface HistoryAnswer { player: string; type: PlayerKind; answer: string }
export interface HistoryVote { voter: string; target: string }

export interface HistoryRound {
  round: number;
  question: string | null;
  answers: HistoryAnswer[];
  votes: HistoryVote[];
  eliminated: { name: string; isAI: boolean } | null; // null: nobody eliminated (tie or no vote); isAI counts an inspector as human
}

export interface HistoryMessage {
  round: number; player: string; type: PlayerKind; content: string; ts: number; // ts: epoch milliseconds
}

export interface HistoryFlag {
  round: number; flaggedBy: string; ts: number; reason: string | null;
  target: { player: string; ts: number } | null; // the flagged message, matched on the ts in its in-game id; null when not found
}

export interface HistoryGame {
  schema: typeof HISTORY_SCHEMA;
  gameId: string;
  date: string;
  language: Language;
  result: GameResult;
  players: HistoryPlayer[];
  rounds: HistoryRound[];
  messages: HistoryMessage[];
  flags: HistoryFlag[];
  quality: {
    /**
     * A private room code reused for a second game merges both under one game_id (games is upserted,
     * the other tables keep the first rows). Flagged when there are more than 8 players or the messages
     * span more than 3 hours. Excluded from the analysis by default.
     */
    suspectMerged: boolean;
  };
  synthetic?: boolean; // set on invented fixture games only; never on records read from the database
}
