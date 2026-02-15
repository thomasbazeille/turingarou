// Types fondamentaux du jeu

export type GamePhase = 'waiting' | 'question' | 'discussion' | 'voting' | 'endround' | 'gameover';

export interface PlayerBase {
  id: string;
  username: string;
  color: string;
  colorName: string;
  isReady: boolean;
  isEliminated: boolean;
  hearts: number; // Vie restante (pour les protégés)
}

export interface HumanPlayer extends PlayerBase {
  type: 'human';
  socketId: string;
}

export interface AIPlayerData extends PlayerBase {
  type: 'ai';
  personality: AIPersonality;
  messageHistory: GameMessage[];
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
}

export interface QuestionAnswer {
  playerId: string;
  playerName: string;
  answer: string;
  timestamp: number;
}

export interface Vote {
  voterId: string;
  targetId: string;
}

export interface GameRoomState {
  roomId: string;
  phase: GamePhase;
  currentRound: number;
  players: Player[];
  messages: GameMessage[];
  currentQuestion: string | null;
  answers: QuestionAnswer[];
  votes: Vote[];
  protectedPlayerId: string | null;
  discussionEndTime: number | null;
  questionEndTime: number | null;
  voteEndTime: number | null;
  maxPlayers: number;
  minPlayers: number;
  aiCount: number; // Nombre d'IA dans la partie
  eliminatedPlayerId?: string | null; // Set when phase is endround
  gameOverReason?: 'humans_win' | 'ai_win' | 'draw' | null; // Set when phase is gameover
  language?: 'fr' | 'en'; // Room language for UI and AI
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

export interface LLMResponse {
  shouldRespond: boolean;
  message?: string;
  delayMs?: number; // Temps avant de répondre (naturalité)
}
