import { Server as SocketServer } from 'socket.io';
import { AIPlayer } from './AIPlayer.js';
import {
  GameRoomState,
  Player,
  HumanPlayer,
  AIPlayerData,
  GameMessage,
  QuestionAnswer,
  Vote,
  AIPersonality,
} from '../types/game.types.js';
import { LLMProvider } from '../llm/LLMProvider.js';

const COLORS = [
  { name: 'Red', hex: '#ef4444' },
  { name: 'Orange', hex: '#f97316' },
  { name: 'Gold', hex: '#eab308' },
  { name: 'Silver', hex: '#94a3b8' },
  { name: 'Purple', hex: '#a855f7' },
  { name: 'Turquoise', hex: '#06b6d4' },
];

const QUESTIONS = [
  "What color are your socks right now?",
  "What was the last thing you ate?",
  "If you could have any superpower, what would it be?",
  "What's your favorite childhood memory?",
  "What did you dream about last night?",
];

export class GameRoom {
  private state: GameRoomState;
  private io: SocketServer;
  private aiPlayers: Map<string, AIPlayer> = new Map();
  private llmProvider: LLMProvider;
  private discussionTimer: NodeJS.Timeout | null = null;
  private aiThinkingInterval: NodeJS.Timeout | null = null;

  constructor(roomId: string, io: SocketServer, llmProvider: LLMProvider, aiCount: number = 2) {
    this.io = io;
    this.llmProvider = llmProvider;

    this.state = {
      roomId,
      phase: 'waiting',
      currentRound: 0,
      players: [],
      messages: [],
      currentQuestion: null,
      answers: [],
      votes: [],
      protectedPlayerId: null,
      discussionEndTime: null,
      maxPlayers: 6,
      minPlayers: 3,
      aiCount,
    };
  }

  // ====== PLAYER MANAGEMENT ======

  addHumanPlayer(socketId: string, username: string): boolean {
    if (this.state.players.length >= this.state.maxPlayers) {
      return false;
    }

    const usedColors = this.state.players.map((p) => p.color);
    const availableColor = COLORS.find((c) => !usedColors.includes(c.hex));

    if (!availableColor) return false;

    const player: HumanPlayer = {
      type: 'human',
      id: `player-${Date.now()}-${Math.random()}`,
      socketId,
      username,
      color: availableColor.hex,
      colorName: availableColor.name,
      isReady: true,
      isEliminated: false,
      hearts: 3,
    };

    this.state.players.push(player);
    this.emitState();

    // Si on a assez de joueurs, on ajoute les IA
    if (this.state.players.length === this.state.maxPlayers - this.state.aiCount) {
      this.addAIPlayers();
      this.startGame();
    }

    return true;
  }

  removePlayer(socketId: string): void {
    this.state.players = this.state.players.filter(
      (p) => p.type !== 'human' || p.socketId !== socketId
    );
    this.emitState();
  }

  private addAIPlayers(): void {
    const aiPersonalities = this.generateAIPersonalities(this.state.aiCount);

    aiPersonalities.forEach((personality) => {
      const usedColors = this.state.players.map((p) => p.color);
      const availableColor = COLORS.find((c) => !usedColors.includes(c.hex));

      if (!availableColor) return;

      const aiPlayerData: AIPlayerData = {
        type: 'ai',
        id: `ai-${Date.now()}-${Math.random()}`,
        username: personality.name,
        color: availableColor.hex,
        colorName: availableColor.name,
        isReady: true,
        isEliminated: false,
        hearts: 3,
        personality,
        messageHistory: [],
      };

      this.state.players.push(aiPlayerData);

      const aiPlayer = new AIPlayer(aiPlayerData, this.llmProvider);
      this.aiPlayers.set(aiPlayerData.id, aiPlayer);
    });
  }

  private generateAIPersonalities(count: number): AIPersonality[] {
    const personalities: AIPersonality[] = [
      {
        name: 'Alex',
        traits: ['analytical', 'calm', 'logical'],
        systemPrompt: `You are Alex, a calm and analytical person. You tend to think before you speak and use logic. You're playing a social deduction game and must act like a human.`,
        responseStyle: 'thoughtful',
        suspicionLevel: 0.3,
      },
      {
        name: 'Jordan',
        traits: ['friendly', 'chatty', 'enthusiastic'],
        systemPrompt: `You are Jordan, a friendly and enthusiastic person. You like to chat and engage with others. Sometimes you type quickly and make small typos. You're playing a social deduction game.`,
        responseStyle: 'quick',
        suspicionLevel: 0.5,
      },
      {
        name: 'Sam',
        traits: ['quiet', 'observant', 'skeptical'],
        systemPrompt: `You are Sam, a quiet and observant person. You don't talk much but when you do, it's meaningful. You're naturally skeptical. You're playing a social deduction game.`,
        responseStyle: 'random',
        suspicionLevel: 0.7,
      },
    ];

    return personalities.slice(0, count);
  }

  // ====== GAME FLOW ======

  private startGame(): void {
    this.state.phase = 'question';
    this.state.currentRound = 1;
    this.state.currentQuestion = this.getRandomQuestion();
    this.emitState();

    // Les IA répondent à la question
    this.aiAnswerQuestion();

    // Timer pour passer à la discussion
    setTimeout(() => {
      this.startDiscussion();
    }, 15000); // 15 secondes comme dans le frontend
  }

  private async aiAnswerQuestion(): Promise<void> {
    for (const [id, aiPlayer] of this.aiPlayers) {
      if (this.state.currentQuestion) {
        const answer = await aiPlayer.answerQuestion(this.state.currentQuestion);
        this.addAnswer(id, answer);
      }
    }
  }

  private startDiscussion(): void {
    this.state.phase = 'discussion';
    this.state.discussionEndTime = Date.now() + 60000; // 60 secondes de discussion
    this.emitState();

    // Démarrer le timer de discussion
    this.discussionTimer = setTimeout(() => {
      this.startVoting();
    }, 60000);

    // Les IA commencent à "penser" et réagir aux messages
    this.startAIThinking();
  }

  private startAIThinking(): void {
    // Toutes les 5 secondes, chaque IA décide si elle veut parler
    this.aiThinkingInterval = setInterval(async () => {
      for (const [id, aiPlayer] of this.aiPlayers) {
        const player = this.state.players.find((p) => p.id === id) as AIPlayerData;
        if (!player || player.isEliminated) continue;

        aiPlayer.buildGameContext(
          this.state.messages,
          this.state.currentQuestion,
          this.state.phase,
          this.state.currentRound
        );

        const decision = await aiPlayer.decideAction();

        if (decision.shouldRespond && decision.message) {
          // Attendre un délai aléatoire pour sembler humain
          setTimeout(() => {
            this.addMessage(id, decision.message!);
          }, decision.delayMs || 2000);
        }
      }
    }, 5000);
  }

  private stopAIThinking(): void {
    if (this.aiThinkingInterval) {
      clearInterval(this.aiThinkingInterval);
      this.aiThinkingInterval = null;
    }
  }

  private startVoting(): void {
    this.stopAIThinking();
    this.state.phase = 'voting';
    this.state.votes = [];
    this.emitState();

    // Les IA votent automatiquement
    this.aiVote();

    // Timer pour le résultat
    setTimeout(() => {
      this.processVotes();
    }, 10000); // 10 secondes pour voter
  }

  private async aiVote(): Promise<void> {
    const activePlayers = this.state.players
      .filter((p) => !p.isEliminated)
      .map((p) => ({ id: p.id, username: p.username }));

    for (const [id, aiPlayer] of this.aiPlayers) {
      const player = this.state.players.find((p) => p.id === id);
      if (!player || player.isEliminated) continue;

      const targetId = await aiPlayer.decideVote(activePlayers);
      this.addVote(id, targetId);
    }
  }

  private processVotes(): void {
    const voteCounts = new Map<string, number>();

    this.state.votes.forEach((vote) => {
      const count = voteCounts.get(vote.targetId) || 0;
      voteCounts.set(vote.targetId, count + 1);
    });

    // Trouver le joueur avec le plus de votes
    let eliminatedId = '';
    let maxVotes = 0;

    voteCounts.forEach((count, playerId) => {
      if (count > maxVotes) {
        maxVotes = count;
        eliminatedId = playerId;
      }
    });

    // Protéger un joueur aléatoire (pas l'éliminé)
    const eligibleForProtection = this.state.players.filter(
      (p) => !p.isEliminated && p.id !== eliminatedId
    );
    if (eligibleForProtection.length > 0) {
      const protectedIndex = Math.floor(Math.random() * eligibleForProtection.length);
      this.state.protectedPlayerId = eligibleForProtection[protectedIndex].id;
    }

    // Éliminer le joueur
    const eliminatedPlayer = this.state.players.find((p) => p.id === eliminatedId);
    if (eliminatedPlayer) {
      eliminatedPlayer.isEliminated = true;
    }

    this.state.phase = 'endround';
    this.emitState();

    // Passer au round suivant
    setTimeout(() => {
      this.nextRound();
    }, 13000); // 13 secondes sur l'écran de fin de round
  }

  private nextRound(): void {
    const activePlayers = this.state.players.filter((p) => !p.isEliminated);

    // Vérifier si le jeu est terminé
    const remainingAI = activePlayers.filter((p) => p.type === 'ai').length;
    const remainingHumans = activePlayers.filter((p) => p.type === 'human').length;

    if (remainingAI === 0 || remainingHumans === 0 || activePlayers.length <= 2) {
      this.endGame();
      return;
    }

    // Nouveau round
    this.state.currentRound++;
    this.state.currentQuestion = this.getRandomQuestion();
    this.state.answers = [];
    this.state.votes = [];
    this.state.messages = [];
    this.state.phase = 'question';
    this.emitState();

    this.aiAnswerQuestion();

    setTimeout(() => {
      this.startDiscussion();
    }, 15000);
  }

  private endGame(): void {
    // TODO: Logique de fin de partie
    console.log('Game Over!');
  }

  // ====== ACTIONS ======

  addMessage(playerId: string, content: string): void {
    const player = this.state.players.find((p) => p.id === playerId);
    if (!player || player.isEliminated) return;

    const message: GameMessage = {
      id: `msg-${Date.now()}-${Math.random()}`,
      playerId,
      playerName: player.username,
      content,
      timestamp: Date.now(),
      phase: this.state.phase,
    };

    this.state.messages.push(message);

    // Si c'est une IA, on ajoute à son historique
    if (player.type === 'ai') {
      player.messageHistory.push(message);
    }

    this.emitState();
  }

  addAnswer(playerId: string, answer: string): void {
    const player = this.state.players.find((p) => p.id === playerId);
    if (!player) return;

    const questionAnswer: QuestionAnswer = {
      playerId,
      playerName: player.username,
      answer,
      timestamp: Date.now(),
    };

    this.state.answers.push(questionAnswer);
    this.emitState();
  }

  addVote(voterId: string, targetId: string): void {
    // Vérifier que le vote n'existe pas déjà
    if (this.state.votes.some((v) => v.voterId === voterId)) {
      return;
    }

    this.state.votes.push({ voterId, targetId });
    this.emitState();
  }

  // ====== UTILS ======

  private getRandomQuestion(): string {
    return QUESTIONS[Math.floor(Math.random() * QUESTIONS.length)];
  }

  private emitState(): void {
    // Envoyer l'état à tous les clients de la room
    this.io.to(this.state.roomId).emit('gameState', this.sanitizeState());
  }

  private sanitizeState(): any {
    // Ne pas révéler qui est IA aux clients
    return {
      ...this.state,
      players: this.state.players.map((p) => ({
        id: p.id,
        username: p.username,
        color: p.color,
        colorName: p.colorName,
        isReady: p.isReady,
        isEliminated: p.isEliminated,
        hearts: p.hearts,
        // On cache le type (ai/human)
      })),
    };
  }

  getState(): GameRoomState {
    return this.state;
  }

  getRoomId(): string {
    return this.state.roomId;
  }
}
