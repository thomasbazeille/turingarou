// Types fondamentaux du jeu

export type GamePhase = 'waiting' | 'question' | 'discussion' | 'voting' | 'endround' | 'gameover';

export interface PlayerBase {
  id: string;
  username: string;
  color: string;
  colorName: string;
  isReady: boolean;
  isEliminated: boolean;
}

export interface HumanPlayer extends PlayerBase {
  type: 'human';
  socketId: string;
}

export interface AIPlayerData extends PlayerBase {
  type: 'ai';
  personality: AIPersonality;
}

export type Player = HumanPlayer | AIPlayerData;

export interface AIPersonality {
  name: string;
  traits: string[]; // Ex: ["nervous", "analytical", "friendly"]
  systemPrompt: string;
  responseStyle: 'quick' | 'thoughtful' | 'random';
  suspicionLevel: number; // 0-1, how suspicious the AI acts
}

export interface GameMessage {
  id: string;
  playerId: string;
  playerName: string;
  content: string;
  timestamp: number;
  phase: GamePhase;
  round: number; // round when the message was sent (for scroll history)
  /** Earlier message of the same room this one answers (validated by the room, never a system line). */
  replyToId?: string;
}

export interface QuestionAnswer {
  playerId: string;
  playerName: string;
  answer: string;
  timestamp: number;
}

export interface Vote {
  voterId: string;
  /** null: an abstention, a vote rendered that eliminates nobody. */
  targetId: string | null;
}

export interface GameRoomState {
  roomId: string;
  phase: GamePhase;
  currentRound: number;
  players: Player[];
  messages: GameMessage[];
  currentQuestion: string | null;
  answers: QuestionAnswer[];
  /** Réponses par round (1, 2, ...) pour l'historique du chat */
  answersByRound?: Record<number, QuestionAnswer[]>;
  votes: Vote[];
  protectedPlayerId: string | null;
  discussionEndTime: number | null;
  questionEndTime: number | null;
  voteEndTime: number | null;
  /** End of the round-end screen, so every client stages the elimination within the same window. */
  endRoundEndTime?: number | null;
  maxPlayers: number;
  minPlayers: number;
  aiCount: number; // Nombre d'IA dans la partie
  eliminatedPlayerId?: string | null;
  eliminatedPlayerIsAI?: boolean | null;
  gameOverReason?: 'humans_win' | 'ai_win' | 'draw' | null;
  language?: 'fr' | 'en';
  /** Ordered list of eliminated player IDs (index 0 = eliminated in round 1, etc.) */
  eliminationOrder?: string[];
}

/** Game format passed to AI for prompt (timing, player counts, etc.) */
export interface GameFormat {
  maxPlayers: number;
  humanCount: number;
  aiCount: number;
  questionSec: number;
  discussionSec: number;
  voteSec: number;
  maxRounds: number;
  language: 'fr' | 'en';
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

