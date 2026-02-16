/**
 * Types partagés entre Frontend et Backend
 * Copier ce fichier dans le frontend si nécessaire
 */

export type GamePhase = 'waiting' | 'question' | 'discussion' | 'voting' | 'endround' | 'gameover';

export interface Player {
  id: string;
  username: string;
  color: string;
  colorName: string;
  isReady: boolean;
  isEliminated: boolean;
  hearts: number;
}

export interface GameMessage {
  id: string;
  playerId: string;
  playerName: string;
  content: string;
  timestamp: number;
  phase: GamePhase;
  /** Round when the message was sent (for chat history across rounds). */
  round?: number;
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

export interface GameState {
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
  maxPlayers: number;
}

// Événements Socket.io

export interface ClientToServerEvents {
  joinRoom: (data: { roomId: string; username: string }) => void;
  sendMessage: (data: { message: string }) => void;
  answerQuestion: (data: { answer: string }) => void;
  vote: (data: { targetId: string }) => void;
}

export interface ServerToClientEvents {
  gameState: (state: GameState) => void;
  joinSuccess: (data: { playerId: string; roomId: string }) => void;
  joinError: (data: { message: string }) => void;
}
