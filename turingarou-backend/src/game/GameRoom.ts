import { Server as SocketServer } from 'socket.io';
import { AIPlayer } from './AIPlayer.js';
import { addPlayerName, pickAIName } from './PlayerNamesStore.js';
import {
  GameRoomState,
  Player,
  HumanPlayer,
  AIPlayerData,
  GameMessage,
  QuestionAnswer,
  Vote,
  AIPersonality,
  GameFormat,
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

const QUESTION_PHASE_MS = 20000;
const DISCUSSION_PHASE_MS = 60000;
const VOTE_PHASE_MS = 10000;
const MAX_ROUNDS = 5;

const QUESTIONS_EN = [
  "What color are your socks right now?",
  "What was the last thing you ate?",
  "If you could have any superpower, what would it be?",
  "What's your favorite childhood memory?",
  "What did you dream about last night?",
];

const QUESTIONS_FR = [
  "De quelle couleur sont tes chaussettes en ce moment ?",
  "Quelle est la dernière chose que tu as mangée ?",
  "Si tu pouvais avoir un super-pouvoir, ce serait lequel ?",
  "Quel est ton souvenir d'enfance préféré ?",
  "De quoi as-tu rêvé la nuit dernière ?",
];

export class GameRoom {
  private state: GameRoomState;
  private io: SocketServer;
  private aiPlayers: Map<string, AIPlayer> = new Map();
  private llmProvider: LLMProvider;
  private discussionTimer: NodeJS.Timeout | null = null;
  private aiThinkingInterval: NodeJS.Timeout | null = null;
  private votePhaseTimeout: NodeJS.Timeout | null = null;
  private aiPendingMessage = new Set<string>();

  constructor(roomId: string, io: SocketServer, llmProvider: LLMProvider, aiCount: number = 1) {
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
      questionEndTime: null,
      maxPlayers: 3,
      minPlayers: 2,
      aiCount,
      eliminatedPlayerId: null,
      gameOverReason: null,
      language: 'fr',
    };
  }

  // ====== PLAYER MANAGEMENT ======

  addHumanPlayer(socketId: string, username: string, language?: 'fr' | 'en'): boolean {
    if (this.state.players.length >= this.state.maxPlayers) {
      return false;
    }
    if (language && !this.state.players.length) {
      this.state.language = language;
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
    addPlayerName(username);
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
    const humanNames = this.state.players.filter((p) => p.type === 'human').map((p) => p.username);
    const templates: Omit<AIPersonality, 'name'>[] = [
      { traits: ['analytical', 'calm', 'logical'], systemPrompt: `You are {name}, a calm and analytical person. You tend to think before you speak and use logic. You're playing a social deduction game and must act like a human.`, responseStyle: 'thoughtful', suspicionLevel: 0.3 },
      { traits: ['friendly', 'chatty', 'enthusiastic'], systemPrompt: `You are {name}, a friendly and enthusiastic person. You like to chat and engage with others. Sometimes you type quickly and make small typos. You're playing a social deduction game.`, responseStyle: 'quick', suspicionLevel: 0.5 },
      { traits: ['quiet', 'observant', 'skeptical'], systemPrompt: `You are {name}, a quiet and observant person. You don't talk much but when you do, it's meaningful. You're naturally skeptical. You're playing a social deduction game.`, responseStyle: 'random', suspicionLevel: 0.7 },
      { traits: ['humorous', 'casual', 'witty'], systemPrompt: `You are {name}, a witty and humorous person. You like to make jokes and keep things light. You're playing a social deduction game and must act like a human.`, responseStyle: 'quick', suspicionLevel: 0.4 },
      { traits: ['strategic', 'thoughtful', 'careful'], systemPrompt: `You are {name}, a strategic and careful thinker. You analyze situations before acting. You're playing a social deduction game and must act like a human.`, responseStyle: 'thoughtful', suspicionLevel: 0.6 },
      { traits: ['emotional', 'reactive', 'passionate'], systemPrompt: `You are {name}, an emotional and passionate person. You react quickly and speak from the heart. You're playing a social deduction game and must act like a human.`, responseStyle: 'quick', suspicionLevel: 0.5 },
      { traits: ['neutral', 'balanced', 'diplomatic'], systemPrompt: `You are {name}, a balanced and diplomatic person. You try to see all sides and stay neutral. You're playing a social deduction game and must act like a human.`, responseStyle: 'random', suspicionLevel: 0.4 },
    ];
    const shuffled = [...templates].sort(() => Math.random() - 0.5);
    const result: AIPersonality[] = [];
    const used: string[] = [...humanNames];
    for (let i = 0; i < count; i++) {
      const name = pickAIName(used);
      used.push(name);
      addPlayerName(name);
      const t = shuffled[i % templates.length];
      result.push({
        name,
        traits: t.traits,
        systemPrompt: t.systemPrompt.replace(/\{name\}/g, name),
        responseStyle: t.responseStyle,
        suspicionLevel: t.suspicionLevel,
      });
    }
    return result;
  }

  // ====== GAME FLOW ======

  private startGame(): void {
    this.state.phase = 'question';
    this.state.currentRound = 1;
    this.state.currentQuestion = this.getRandomQuestion();
    this.state.questionEndTime = Date.now() + QUESTION_PHASE_MS;
    this.emitState();

    this.aiAnswerQuestion();
    this.setGameFormatForAllAI();
    setTimeout(() => {
      this.startDiscussion();
    }, QUESTION_PHASE_MS);
  }

  private setGameFormatForAllAI(): void {
    const format = this.getGameFormat();
    this.aiPlayers.forEach((ai) => ai.setGameFormat(format));
  }

  getGameFormat(): GameFormat {
    return {
      maxPlayers: this.state.maxPlayers,
      humanCount: this.state.maxPlayers - this.state.aiCount,
      aiCount: this.state.aiCount,
      questionSec: QUESTION_PHASE_MS / 1000,
      discussionSec: DISCUSSION_PHASE_MS / 1000,
      voteSec: VOTE_PHASE_MS / 1000,
      maxRounds: MAX_ROUNDS,
      language: this.state.language ?? 'fr',
    };
  }

  private async aiAnswerQuestion(): Promise<void> {
    for (const [id, aiPlayer] of this.aiPlayers) {
      if (this.state.currentQuestion) {
        const answer = await aiPlayer.answerQuestion(this.state.currentQuestion);
        if (answer != null && answer.trim() !== '') {
          this.addAnswer(id, answer);
        }
      }
    }
  }

  private startDiscussion(): void {
    this.state.phase = 'discussion';
    this.state.discussionEndTime = Date.now() + DISCUSSION_PHASE_MS;
    this.emitState();

    this.discussionTimer = setTimeout(() => {
      this.startVoting();
    }, DISCUSSION_PHASE_MS);

    // Les IA commencent à "penser" et réagir aux messages
    this.startAIThinking();
  }

  private startAIThinking(): void {
    this.aiThinkingInterval = setInterval(async () => {
      for (const [id, aiPlayer] of this.aiPlayers) {
        const player = this.state.players.find((p) => p.id === id) as AIPlayerData;
        if (!player || player.isEliminated) continue;
        if (this.aiPendingMessage.has(id)) continue;

        aiPlayer.buildGameContext(
          this.state.messages,
          this.state.currentQuestion,
          this.state.phase,
          this.state.currentRound,
          this.state.answers
        );

        const decision = await aiPlayer.decideAction();

        if (decision.shouldRespond && decision.message) {
          this.aiPendingMessage.add(id);
          const discussionCount = this.state.messages.filter((m) => m.phase === 'discussion').length;
          let delayMs = decision.delayMs ?? 2000;
          if (discussionCount === 0) {
            delayMs = 15000 + Math.floor(Math.random() * 10000);
          }
          setTimeout(() => {
            this.addMessage(id, decision.message!);
            this.aiPendingMessage.delete(id);
          }, delayMs);
        }
      }
    }, 5000);
  }

  private stopAIThinking(): void {
    if (this.aiThinkingInterval) {
      clearInterval(this.aiThinkingInterval);
      this.aiThinkingInterval = null;
    }
    this.aiPendingMessage.clear();
  }

  private startVoting(): void {
    this.stopAIThinking();
    this.state.phase = 'voting';
    // Keep existing votes (cast during discussion); no reset
    this.emitState();

    this.aiVote();

    this.votePhaseTimeout = setTimeout(() => {
      this.votePhaseTimeout = null;
      this.processVotes();
    }, VOTE_PHASE_MS);
  }

  private async aiVote(): Promise<void> {
    const activePlayers = this.state.players
      .filter((p) => !p.isEliminated)
      .map((p) => ({ id: p.id, username: p.username }));

    for (const [id, aiPlayer] of this.aiPlayers) {
      const player = this.state.players.find((p) => p.id === id);
      if (!player || player.isEliminated) continue;

      // Vote avec un délai aléatoire pour sembler humain (2-6 secondes)
      const delay = Math.floor(Math.random() * 4000) + 2000;
      
      setTimeout(async () => {
        const targetId = await aiPlayer.decideVote(activePlayers);
        this.addVote(id, targetId);
      }, delay);
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

    // Éliminer le joueur (si pas d'égalité)
    const eliminatedPlayer = this.state.players.find((p) => p.id === eliminatedId);
    if (eliminatedPlayer) {
      eliminatedPlayer.isEliminated = true;
    }
    this.state.eliminatedPlayerId = eliminatedId || null;

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
      this.endGame(remainingAI, remainingHumans, activePlayers.length);
      return;
    }

    this.state.eliminatedPlayerId = null;
    this.state.currentRound++;
    this.state.currentQuestion = this.getRandomQuestion();
    this.state.answers = [];
    this.state.votes = [];
    this.state.messages = [];
    this.state.protectedPlayerId = null;
    this.state.phase = 'question';
    this.state.questionEndTime = Date.now() + QUESTION_PHASE_MS;
    this.emitState();

    this.aiAnswerQuestion();

    setTimeout(() => {
      this.startDiscussion();
    }, QUESTION_PHASE_MS);
  }

  private endGame(remainingAI: number, remainingHumans: number, activeCount: number): void {
    if (remainingAI === 0) {
      this.state.gameOverReason = 'humans_win';
    } else if (remainingHumans === 0) {
      this.state.gameOverReason = 'ai_win';
    } else {
      this.state.gameOverReason = 'draw';
    }
    this.state.phase = 'gameover';
    this.state.eliminatedPlayerId = null;
    this.emitState();
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
    if (this.state.votes.some((v) => v.voterId === voterId)) {
      return;
    }

    const voter = this.state.players.find((p) => p.id === voterId);
    const voterName = voter?.username ?? 'Someone';
    const lang = this.state.language === 'en' ? 'en' : 'fr';
    const votedText = lang === 'fr' ? `${voterName} a voté.` : `${voterName} has voted.`;

    this.state.votes.push({ voterId, targetId });
    this.addSystemMessage(votedText);
    this.emitState();
    this.tryEndVotingEarly();
  }

  private tryEndVotingEarly(): void {
    if (this.state.phase !== 'voting') return;
    const activePlayers = this.state.players.filter((p) => !p.isEliminated);
    const votedIds = new Set(this.state.votes.map((v) => v.voterId));
    const allVoted = activePlayers.length > 0 && activePlayers.every((p) => votedIds.has(p.id));
    if (allVoted && this.votePhaseTimeout) {
      clearTimeout(this.votePhaseTimeout);
      this.votePhaseTimeout = null;
      this.processVotes();
    }
  }

  private addSystemMessage(content: string): void {
    this.state.messages.push({
      id: `sys-${Date.now()}-${Math.random()}`,
      playerId: 'system',
      playerName: '',
      content,
      timestamp: Date.now(),
      phase: this.state.phase,
    });
  }

  // ====== UTILS ======

  private getRandomQuestion(): string {
    const lang = this.state.language === 'en' ? 'en' : 'fr';
    const questions = lang === 'fr' ? QUESTIONS_FR : QUESTIONS_EN;
    return questions[Math.floor(Math.random() * questions.length)];
  }

  private emitState(): void {
    // Envoyer l'état à tous les clients de la room
    this.io.to(this.state.roomId).emit('gameState', this.sanitizeState());
  }

  private sanitizeState(): any {
    // Ne pas révéler qui est IA aux clients
    const out: any = {
      ...this.state,
      players: this.state.players.map((p) => ({
        id: p.id,
        username: p.username,
        color: p.color,
        colorName: p.colorName,
        isReady: p.isReady,
        isEliminated: p.isEliminated,
        hearts: p.hearts,
      })),
    };
    if (this.state.phase === 'endround') {
      out.eliminatedPlayerId = this.state.eliminatedPlayerId ?? null;
      out.votes = this.state.votes;
      out.eliminatedAiCount = this.state.players.filter((p) => p.isEliminated && p.type === 'ai').length;
    }
    if (this.state.phase === 'gameover') {
      out.gameOverReason = this.state.gameOverReason ?? null;
    }
    if (this.state.phase === 'voting' || this.state.phase === 'discussion') {
      out.votes = this.state.votes;
    }
    out.language = this.state.language ?? 'fr';
    return out;
  }

  getState(): GameRoomState {
    return this.state;
  }

  getRoomId(): string {
    return this.state.roomId;
  }
}
