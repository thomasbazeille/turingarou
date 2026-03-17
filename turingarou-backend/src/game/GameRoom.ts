import { Server as SocketServer } from 'socket.io';
import { AIPlayer } from './AIPlayer.js';
import { InspectorController } from './InspectorController.js';
import { getRandomAIPlayerStrategy, getInspectorPromptContent } from './StrategyLoader.js';
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
import { getQuestionsForLanguage } from './QuestionBank.js';
import { saveGameLog, updateHumanProfiles, getRandomHumanProfile, saveMessageFlag, RoundLog, MessageLog, PlayerLog } from './GameLogger.js';

const COLORS = [
  { name: 'Red', hex: '#ef4444' },
  { name: 'Orange', hex: '#f97316' },
  { name: 'Gold', hex: '#eab308' },
  { name: 'Silver', hex: '#94a3b8' },
  { name: 'Purple', hex: '#a855f7' },
  { name: 'Turquoise', hex: '#06b6d4' },
];

const QUESTION_PHASE_MS = 20000;
const DISCUSSION_PHASE_MS = 100000; // 100 s de discussion par round (+ temps de vote après)
const VOTE_PHASE_MS = 10000;
const MAX_ROUNDS = 5;

export class GameRoom {
  private state: GameRoomState;
  private io: SocketServer;
  private aiPlayers: Map<string, AIPlayer> = new Map();
  private llmProviders: LLMProvider[];
  private discussionTimer: NodeJS.Timeout | null = null;
  private aiThinkingInterval: NodeJS.Timeout | null = null;
  private votePhaseTimeout: NodeJS.Timeout | null = null;
  private questionPhaseTimeout: NodeJS.Timeout | null = null;
  private aiPendingMessage = new Set<string>();
  private inspectors: Map<string, InspectorController> = new Map();
  private inspectorPendingMessage = new Set<string>();
  /** Strategy name picked for each AI player id */
  private aiStrategyNames: Map<string, string> = new Map();
  /** Votes archived per round (round → list of {voter, target}) */
  private votesByRound: Map<number, { voter: string; target: string }[]> = new Map();
  /** Eliminations archived per round */
  private eliminationsByRound: Map<number, { name: string; isAI: boolean }> = new Map();
  /** Question asked per round */
  private questionsByRound: Map<number, string> = new Map();
  /** True once all humans have left — blocks every further LLM call and timer */
  private aborted = false;
  /** Chronological list of eliminated player IDs (index 0 = round 1 elimination) */
  private eliminationOrder: string[] = [];
  /** Last time each AI sent a discussion message (for rate limiting) */
  private lastAIMessageTime: Map<string, number> = new Map();
  /** Whether the last message sent by each AI was short (< 80 chars) */
  private lastAIMessageShort: Map<string, boolean> = new Map();

  constructor(roomId: string, io: SocketServer, llmProvider: LLMProvider | LLMProvider[], aiCount: number = 1) {
    this.io = io;
    this.llmProviders = Array.isArray(llmProvider) ? llmProvider : [llmProvider];

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
      voteEndTime: null,
      maxPlayers: 5,
      minPlayers: 3,
      aiCount,
      eliminatedPlayerId: null,
      gameOverReason: null,
      language: 'fr',
    };
  }

  /** Picks a random provider from the pool (uniform distribution). */
  private pickProvider(): LLMProvider {
    return this.llmProviders[Math.floor(Math.random() * this.llmProviders.length)];
  }

  // ====== PLAYER MANAGEMENT ======

  async addHumanPlayer(socketId: string, username: string, language?: 'fr' | 'en'): Promise<boolean> {
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
    };

    this.state.players.push(player);
    addPlayerName(username);
    this.emitState();

    if (this.state.players.length === this.state.maxPlayers - this.state.aiCount) {
      await this.addAIPlayers();
      this.shufflePlayers();
      this.startGame();
    }

    return true;
  }

  /** Add an AI Inspector to fill the last human slot (call when 2 humans waiting). */
  async addInspectorPlayer(): Promise<boolean> {
    const humanCount = this.state.players.filter((p) => p.type === 'human').length;
    if (this.state.phase !== 'waiting' || humanCount !== 2 || this.state.players.length >= this.state.maxPlayers) {
      return false;
    }
    const usedColors = this.state.players.map((p) => p.color);
    const availableColor = COLORS.find((c) => !usedColors.includes(c.hex));
    if (!availableColor) return false;

    const humanNames = this.state.players.filter((p) => p.type === 'human').map((p) => p.username);
    const inspectorUsername = pickAIName(humanNames);

    const inspectorId = `inspector-${Date.now()}-${Math.random()}`;
    const player: HumanPlayer = {
      type: 'human',
      id: inspectorId,
      socketId: '',
      username: inspectorUsername,
      color: availableColor.hex,
      colorName: availableColor.name,
      isReady: true,
      isEliminated: false,
    };
    this.state.players.push(player);
    const inspectorPrompt = await getInspectorPromptContent();
    const inspectorProvider = this.pickProvider();
    const controller = new InspectorController(
      inspectorId,
      player.username,
      inspectorPrompt,
      inspectorProvider
    );
    console.log(`[GameRoom] Inspector ${player.username} uses provider: ${inspectorProvider.name}`);
    controller.setGameFormat(this.getGameFormat());
    this.inspectors.set(inspectorId, controller);
    this.emitState();
    console.log(`[GameRoom] AI Inspector added to room ${this.state.roomId}`);

    if (this.state.players.length === this.state.maxPlayers - this.state.aiCount) {
      await this.addAIPlayers();
      this.shufflePlayers();
      this.startGame();
    }
    return true;
  }

  removePlayer(socketId: string): void {
    this.state.players = this.state.players.filter(
      (p) => p.type !== 'human' || p.socketId !== socketId
    );

    // Si la partie est en cours et qu'il ne reste plus aucun humain réel, abandonner
    const gameInProgress = !['waiting', 'gameover'].includes(this.state.phase);
    const humanCount = this.state.players.filter(
      (p) => p.type === 'human' && !p.isEliminated
    ).length;

    if (gameInProgress && humanCount === 0) {
      this.abortGame();
    } else {
      this.emitState();
      // If a player disconnects during voting, check if all remaining players have now voted
      if (this.state.phase === 'voting') {
        this.tryEndVotingEarly();
      }
    }
  }

  /** Arrête la partie proprement quand tous les humains ont quitté. */
  private abortGame(): void {
    if (this.aborted) return;
    this.aborted = true;

    console.log(`[GameRoom ${this.state.roomId}] All humans disconnected — aborting game.`);

    // Annuler tous les timers actifs
    if (this.discussionTimer) { clearTimeout(this.discussionTimer); this.discussionTimer = null; }
    if (this.aiThinkingInterval) { clearTimeout(this.aiThinkingInterval); this.aiThinkingInterval = null; }
    if (this.votePhaseTimeout) { clearTimeout(this.votePhaseTimeout); this.votePhaseTimeout = null; }
    if (this.questionPhaseTimeout) { clearTimeout(this.questionPhaseTimeout); this.questionPhaseTimeout = null; }

    // Vider les sets de messages en attente pour ne pas poster en retard
    this.aiPendingMessage.clear();
    this.inspectorPendingMessage.clear();

    // Remettre en waiting pour que le frontend affiche l'écran d'attente
    this.state.phase = 'waiting';
    this.emitState();
  }

  private async addAIPlayers(): Promise<void> {
    const aiPersonalities = this.generateAIPersonalities(this.state.aiCount);
    const usedPersonaNames = new Set<string>();

    for (const personality of aiPersonalities) {
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
        personality,
        messageHistory: [],
      };

      this.state.players.push(aiPlayerData);

      const chosen = await getRandomAIPlayerStrategy(personality.name);

      // Tenter de trouver un profil humain non encore utilisé dans cette partie
      let persona = getRandomHumanProfile();
      let attempts = 0;
      while (persona && usedPersonaNames.has(persona.username) && attempts < 5) {
        persona = getRandomHumanProfile();
        attempts++;
      }
      if (persona) {
        usedPersonaNames.add(persona.username);
        console.log(`[GameRoom] AI ${personality.name} uses human persona: ${persona.username} (${persona.sampleMessages.length} msgs)`);
      }

      const provider = this.pickProvider();
      const aiPlayer = new AIPlayer(aiPlayerData, provider, chosen.content, persona);
      this.aiPlayers.set(aiPlayerData.id, aiPlayer);
      this.aiStrategyNames.set(aiPlayerData.id, chosen.name);
      console.log(`[GameRoom] AI ${personality.name} uses provider: ${provider.name}`);
    }
  }

  /** Fisher–Yates shuffle so the AI is not always in the same position (e.g. middle). */
  private shufflePlayers(): void {
    const arr = this.state.players;
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    // Reassign colors after shuffle so the AI doesn't always get the same color (e.g. Gold)
    const shuffledColors = [...COLORS].sort(() => Math.random() - 0.5);
    arr.forEach((p, idx) => {
      const c = shuffledColors[idx % shuffledColors.length];
      p.color = c.hex;
      p.colorName = c.name;
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
    this.eliminationOrder = [];
    this.state.phase = 'question';
    this.state.currentRound = 1;
    this.state.currentQuestion = this.getRandomQuestion();
    this.questionsByRound.set(1, this.state.currentQuestion ?? '');
    this.state.questionEndTime = Date.now() + QUESTION_PHASE_MS;
    this.emitState();

    this.aiAnswerQuestion();
    this.setGameFormatForAllAI();
    if (this.questionPhaseTimeout) clearTimeout(this.questionPhaseTimeout);
    this.questionPhaseTimeout = setTimeout(() => {
      this.questionPhaseTimeout = null;
      this.startDiscussion();
    }, QUESTION_PHASE_MS);
  }

  private setGameFormatForAllAI(): void {
    const format = this.getGameFormat();
    this.aiPlayers.forEach((ai) => ai.setGameFormat(format));
    this.inspectors.forEach((insp) => insp.setGameFormat(format));
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
    if (this.aborted) return;
    const question = this.state.currentQuestion;
    if (!question) return;
    const phaseStart = Date.now();

    // Each AI gets its own independent random target time so answers are naturally spread.
    const submitAfterDelay = (id: string, answer: string): void => {
      const myTarget = 7000 + Math.random() * 9000; // 7–16s, unique per AI
      const check = () => {
        if (this.aborted || this.state.phase !== 'question') return;
        const elapsed = Date.now() - phaseStart;
        const humanAnswered = this.state.answers.some((a) => {
          const p = this.state.players.find((pl) => pl.id === a.playerId);
          return p && (p as any).type === 'human';
        });
        if (elapsed >= myTarget && (humanAnswered || elapsed >= 15000)) {
          this.addAnswer(id, answer);
        } else {
          setTimeout(check, 500);
        }
      };
      // First check after at least (myTarget - elapsed) ms
      const firstDelay = Math.max(0, myTarget - (Date.now() - phaseStart));
      setTimeout(check, firstDelay);
    };

    // Fire all LLM calls in parallel so AIs don't answer in a fixed order
    const aiAnswerResults = await Promise.all(
      Array.from(this.aiPlayers.entries()).map(async ([id, aiPlayer]) => ({
        id,
        answer: await aiPlayer.answerQuestion(question),
      }))
    );
    for (const { id, answer } of aiAnswerResults) {
      if (answer != null && answer.trim() !== '') {
        submitAfterDelay(id, answer);
      }
    }
    const inspectorAnswerResults = await Promise.all(
      Array.from(this.inspectors.entries())
        .filter(([id]) => {
          const p = this.state.players.find((pl) => pl.id === id);
          return p && !p.isEliminated;
        })
        .map(async ([id, inspector]) => ({
          id,
          answer: await inspector.answerQuestion(question),
        }))
    );
    for (const { id, answer } of inspectorAnswerResults) {
      if (answer != null && answer.trim() !== '') {
        submitAfterDelay(id, answer);
      }
    }
  }

  private startDiscussion(): void {
    this.state.phase = 'discussion';
    const discussionMs = DISCUSSION_PHASE_MS; // 100 s pour tous les rounds
    this.state.discussionEndTime = Date.now() + discussionMs;
    this.emitState();

    this.discussionTimer = setTimeout(() => {
      this.startVoting();
    }, discussionMs);

    // Les IA commencent à "penser" et réagir aux messages
    this.startAIThinking();
  }

  private startAIThinking(): void {
    const scheduleNextTick = () => {
      if (this.aborted || this.state.phase !== 'discussion') return;
      // Variable interval 3–8s instead of fixed 5s — avoids mechanical regularity
      const nextMs = 3000 + Math.floor(Math.random() * 5000);
      this.aiThinkingInterval = setTimeout(async () => {
        if (this.aborted || this.state.phase !== 'discussion') {
          this.aiThinkingInterval = null;
          return;
        }
        await this.runAIThinkingTick();
        scheduleNextTick();
      }, nextMs);
    };
    scheduleNextTick();
  }

  /** Single thinking tick: called on timer and optionally on human message. */
  private async runAIThinkingTick(): Promise<void> {
    if (this.aborted) return;
    const DISCUSSION_LOCK_MS = 10000;
    const remainingDiscussion = this.state.phase === 'discussion' && this.state.discussionEndTime != null
      ? this.state.discussionEndTime - Date.now()
      : Infinity;
    const discussionLocked = remainingDiscussion <= DISCUSSION_LOCK_MS;

    const activePlayers = this.state.players.filter((p) => !p.isEliminated);
    // Build inter-round summary: who was eliminated each round, their type, and votes
    let previousRoundsSummary = '';
    if (this.state.currentRound > 1) {
      const lines: string[] = [];
      for (let rd = 1; rd < this.state.currentRound; rd++) {
        const elim = this.eliminationsByRound.get(rd);
        const votes = this.votesByRound.get(rd) ?? [];
        if (!elim && votes.length === 0) continue;
        const elimStr = elim
          ? `Eliminated: ${elim.name} (${elim.isAI ? 'AI' : 'human'})`
          : 'Eliminated: none';
        const votesStr =
          votes.length > 0
            ? votes.map((v) => `${v.voter} → ${v.target}`).join(', ')
            : 'No votes recorded';
        lines.push(`Round ${rd}: ${elimStr}. Votes: ${votesStr}`);
      }
      previousRoundsSummary = lines.join('\n');
    }
    const contextOptions = {
      activePlayerIds: activePlayers.map((p) => p.id),
      eliminatedNames: this.state.players.filter((p) => p.isEliminated).map((p) => p.username),
      aiRemainingCount: activePlayers.filter((p) => p.type === 'ai').length,
      previousRoundsSummary,
    };

    // Shuffle AI order each tick so no AI is always first
    const shuffledAIs = [...this.aiPlayers.entries()].sort(() => Math.random() - 0.5);

    for (const [id, aiPlayer] of shuffledAIs) {
      const player = this.state.players.find((p) => p.id === id) as AIPlayerData;
      if (!player || player.isEliminated) continue;
      if (this.aiPendingMessage.has(id)) continue;
      if (discussionLocked) continue;

      // 30% chance to skip this AI entirely this tick — mirrors humans not always watching
      if (Math.random() < 0.3) continue;

      // Rate limiting: 10s between messages, or 3–6s if last message was short (burst mode)
      const lastMsgTime = this.lastAIMessageTime.get(id) ?? 0;
      const lastWasShort = this.lastAIMessageShort.get(id) ?? false;
      const minGap = lastWasShort ? 3000 + Math.random() * 3000 : 10000;
      if (Date.now() - lastMsgTime < minGap) continue;

      // Lock before async call to prevent race condition with the next tick
      this.aiPendingMessage.add(id);

      aiPlayer.buildGameContext(
        this.state.messages,
        this.state.currentQuestion,
        this.state.phase,
        this.state.currentRound,
        this.state.answers,
        contextOptions
      );

      this.aiPendingMessage.add(id);
      const decision = await aiPlayer.decideAction();

      if (decision.shouldRespond && decision.message) {
        const discussionCount = this.state.messages.filter((m) => m.phase === 'discussion').length;
        let delayMs = decision.delayMs ?? 2000;
        if (discussionCount === 0) {
          delayMs = 15000 + Math.floor(Math.random() * 10000);
        }
        const msgContent = decision.message;
        setTimeout(() => {
          const remaining = this.state.phase === 'discussion' && this.state.discussionEndTime != null ? this.state.discussionEndTime - Date.now() : Infinity;
          if (remaining <= DISCUSSION_LOCK_MS) {
            this.aiPendingMessage.delete(id);
            return;
          }
          this.lastAIMessageTime.set(id, Date.now());
          const isShort = msgContent.length < 50;
          this.lastAIMessageShort.set(id, isShort);
          this.addMessage(id, msgContent);
          this.aiPendingMessage.delete(id);
          // Burst: ~15% chance to send a follow-up short message after 4–9s
          if (isShort && Math.random() < 0.15) {
            this.scheduleBurstCheck(id, aiPlayer);
          }
        }, delayMs);
      } else {
        // No response — release the lock so the next tick can try again
        this.aiPendingMessage.delete(id);
      }
    }

    // Shuffle inspector order too
    const shuffledInspectors = [...this.inspectors.entries()].sort(() => Math.random() - 0.5);

    for (const [id, inspector] of shuffledInspectors) {
      const player = this.state.players.find((p) => p.id === id);
      if (!player || player.isEliminated) continue;
      if (this.inspectorPendingMessage.has(id)) continue;
      if (discussionLocked) continue;

      if (Math.random() < 0.3) continue;

      const lastInspMsgTime = this.lastAIMessageTime.get(id) ?? 0;
      const lastInspWasShort = this.lastAIMessageShort.get(id) ?? false;
      const inspMinGap = lastInspWasShort ? 3000 + Math.random() * 3000 : 10000;
      if (Date.now() - lastInspMsgTime < inspMinGap) continue;

      // Lock before async call to prevent race condition
      this.inspectorPendingMessage.add(id);

      inspector.buildGameContext(
        this.state.messages,
        this.state.currentQuestion,
        this.state.phase,
        this.state.currentRound,
        this.state.answers,
        contextOptions
      );
      this.inspectorPendingMessage.add(id);
      const decision = await inspector.decideAction();
      if (decision.shouldRespond && decision.message) {
        let delayMs = decision.delayMs ?? 5000 + Math.floor(Math.random() * 10000);
        const discussionCount = this.state.messages.filter((m) => m.phase === 'discussion').length;
        if (discussionCount === 0) delayMs = 15000 + Math.floor(Math.random() * 10000);
        setTimeout(() => {
          const remaining = this.state.phase === 'discussion' && this.state.discussionEndTime != null ? this.state.discussionEndTime - Date.now() : Infinity;
          if (remaining <= DISCUSSION_LOCK_MS) {
            this.inspectorPendingMessage.delete(id);
            return;
          }
          const inspMsgContent = decision.message!;
          this.lastAIMessageTime.set(id, Date.now());
          this.lastAIMessageShort.set(id, inspMsgContent.length < 80);
          this.addMessage(id, inspMsgContent);
          this.inspectorPendingMessage.delete(id);
        }, delayMs);
      } else {
        this.inspectorPendingMessage.delete(id);
      }
    }
  }

  private stopAIThinking(): void {
    if (this.aiThinkingInterval) {
      clearTimeout(this.aiThinkingInterval);
      this.aiThinkingInterval = null;
    }
    this.aiPendingMessage.clear();
    this.inspectorPendingMessage.clear();
    this.lastAIMessageTime.clear();
    this.lastAIMessageShort.clear();
  }

  /**
   * Schedule a solo follow-up check for one AI after a short message (burst mode).
   * Models humans sending 2-3 short messages in a row.
   */
  private scheduleBurstCheck(id: string, aiPlayer: AIPlayer): void {
    const DISCUSSION_LOCK_MS = 10000;
    const burstDelay = 4000 + Math.floor(Math.random() * 5000); // 4–9s
    setTimeout(async () => {
      if (this.aborted || this.state.phase !== 'discussion') return;
      if (this.aiPendingMessage.has(id)) return;
      const player = this.state.players.find((p) => p.id === id);
      if (!player || player.isEliminated) return;
      const remaining = this.state.discussionEndTime != null ? this.state.discussionEndTime - Date.now() : Infinity;
      if (remaining <= DISCUSSION_LOCK_MS) return;

      // Lock before async call
      this.aiPendingMessage.add(id);

      const activePlayers = this.state.players.filter((p) => !p.isEliminated);
      aiPlayer.buildGameContext(
        this.state.messages,
        this.state.currentQuestion,
        this.state.phase,
        this.state.currentRound,
        this.state.answers,
        {
          activePlayerIds: activePlayers.map((p) => p.id),
          eliminatedNames: this.state.players.filter((p) => p.isEliminated).map((p) => p.username),
          aiRemainingCount: activePlayers.filter((p) => p.type === 'ai').length,
        }
      );
      const decision = await aiPlayer.decideAction();
      if (!decision.shouldRespond || !decision.message) {
        this.aiPendingMessage.delete(id);
        return;
      }
      const msgContent = decision.message;
      setTimeout(() => {
        const rem = this.state.phase === 'discussion' && this.state.discussionEndTime != null ? this.state.discussionEndTime - Date.now() : Infinity;
        if (rem <= DISCUSSION_LOCK_MS) { this.aiPendingMessage.delete(id); return; }
        this.lastAIMessageTime.set(id, Date.now());
        this.lastAIMessageShort.set(id, msgContent.length < 50);
        this.addMessage(id, msgContent);
        this.aiPendingMessage.delete(id);
      }, decision.delayMs ?? 1500);
    }, burstDelay);
  }

  private startVoting(): void {
    this.stopAIThinking();
    this.state.phase = 'voting';
    this.state.voteEndTime = Date.now() + VOTE_PHASE_MS;
    // Keep existing votes (cast during discussion); no reset
    this.emitState();

    this.aiVote();

    this.votePhaseTimeout = setTimeout(() => {
      this.votePhaseTimeout = null;
      this.processVotes();
    }, VOTE_PHASE_MS);
  }

  private async aiVote(): Promise<void> {
    if (this.aborted) return;
    const activePlayers = this.state.players
      .filter((p) => !p.isEliminated && p.id !== this.state.protectedPlayerId)
      .map((p) => ({ id: p.id, username: p.username }));

    for (const [id, aiPlayer] of this.aiPlayers) {
      const player = this.state.players.find((p) => p.id === id);
      if (!player || player.isEliminated) continue;
      const delay = Math.floor(Math.random() * 4000) + 2000;
      setTimeout(async () => {
        if (this.aborted) return;
        const targetId = await aiPlayer.decideVote(activePlayers);
        if (targetId) this.addVote(id, targetId);
      }, delay);
    }
    for (const [id, inspector] of this.inspectors) {
      const player = this.state.players.find((p) => p.id === id);
      if (!player || player.isEliminated) continue;
      const delay = Math.floor(Math.random() * 4000) + 2000;
      setTimeout(async () => {
        if (this.aborted) return;
        const targetId = await inspector.decideVote(activePlayers);
        if (targetId) this.addVote(id, targetId);
      }, delay);
    }
  }

  private processVotes(): void {
    if (this.aborted) return;
    if (this.state.phase !== 'voting') return;
    try {
      const voteCounts = new Map<string, number>();

      this.state.votes.forEach((vote) => {
        const count = voteCounts.get(vote.targetId) || 0;
        voteCounts.set(vote.targetId, count + 1);
      });

      // Trouver le joueur avec le plus de votes — égalité = personne d'éliminé
      let eliminatedId = '';
      if (voteCounts.size > 0) {
        const maxVotes = Math.max(...Array.from(voteCounts.values()));
        const topPlayers = Array.from(voteCounts.entries())
          .filter(([, count]) => count === maxVotes)
          .map(([id]) => id);
        if (topPlayers.length === 1) {
          eliminatedId = topPlayers[0];
        }
        // tie → eliminatedId stays '' → nobody eliminated
      }

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
      this.state.eliminatedPlayerIsAI = eliminatedPlayer ? eliminatedPlayer.type !== 'human' : null;

      // Archiver les votes de ce round pour le log
      const roundVotes = this.state.votes.map((v) => {
        const voter = this.state.players.find((p) => p.id === v.voterId);
        const target = this.state.players.find((p) => p.id === v.targetId);
        return { voter: voter?.username ?? v.voterId, target: target?.username ?? v.targetId };
      });
      this.votesByRound.set(this.state.currentRound, roundVotes);
      if (eliminatedPlayer) {
        this.eliminationsByRound.set(this.state.currentRound, {
          name: eliminatedPlayer.username,
          isAI: eliminatedPlayer.type !== 'human',
        });
        this.eliminationOrder.push(eliminatedPlayer.id);
      }

      this.state.phase = 'endround';
      this.state.voteEndTime = null;
      this.emitState();

      // Passer au round suivant
      setTimeout(() => {
        this.nextRound();
      }, 8000); // 8 secondes sur l'écran de fin de round
    } catch (err) {
      console.error('[GameRoom] processVotes error', err);
      this.state.phase = 'endround';
      this.state.eliminatedPlayerId = null;
      this.state.voteEndTime = null;
      this.emitState();
      setTimeout(() => this.nextRound(), 8000);
    }
  }

  private nextRound(): void {
    if (this.aborted) return;
    const activePlayers = this.state.players.filter((p) => !p.isEliminated);

    // Vérifier si le jeu est terminé
    const remainingAI = activePlayers.filter((p) => p.type === 'ai').length;
    // Only count real humans here — inspectors are AI-controlled and should not
    // keep the game alive once they are the only \"humans\" left.
    const remainingHumans = activePlayers.filter(
      (p) => p.type === 'human' && !this.inspectors.has(p.id)
    ).length;

    if (remainingAI === 0 || remainingHumans === 0 || activePlayers.length <= 2 || this.state.currentRound >= MAX_ROUNDS) {
      this.endGame(remainingAI, remainingHumans, activePlayers.length);
      return;
    }

    this.state.eliminatedPlayerId = null;
    if (!this.state.answersByRound) this.state.answersByRound = {};
    this.state.answersByRound[this.state.currentRound] = [...this.state.answers];
    this.state.currentRound++;
    this.state.currentQuestion = this.getRandomQuestion();
    this.questionsByRound.set(this.state.currentRound, this.state.currentQuestion ?? '');
    this.state.answers = [];
    this.state.votes = [];
    // protectedPlayerId is intentionally NOT reset here — it must persist through
    // the next round's voting phase so the immunity assigned in processVotes() is honoured.
    // It will be overwritten by the new processVotes() at the end of the next round.
    this.state.phase = 'question';
    this.state.questionEndTime = Date.now() + QUESTION_PHASE_MS;
    this.emitState();

    this.aiAnswerQuestion();

    if (this.questionPhaseTimeout) clearTimeout(this.questionPhaseTimeout);
    this.questionPhaseTimeout = setTimeout(() => {
      this.questionPhaseTimeout = null;
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
    this.persistGameLog();
  }

  private persistGameLog(): void {
    try {
      const now = new Date().toISOString();

      // ── Players ──────────────────────────────────────────────────────────
      const playerLogs: PlayerLog[] = this.state.players.map((p) => {
        // Find which round they were eliminated in
        let eliminatedRound: number | undefined;
        for (const [round, info] of this.eliminationsByRound) {
          if (info.name === p.username) { eliminatedRound = round; break; }
        }
        const entry: PlayerLog = {
          id: p.id,
          name: p.username,
          type: p.type === 'human' ? 'human' : (this.inspectors.has(p.id) ? 'inspector' : 'ai'),
          eliminated: p.isEliminated,
        };
        if (eliminatedRound !== undefined) entry.eliminatedRound = eliminatedRound;
        if (p.type !== 'human') {
          const strategy = this.aiStrategyNames.get(p.id);
          if (strategy) entry.strategy = strategy;
        }
        return entry;
      });

      // ── Rounds ───────────────────────────────────────────────────────────
      const allAnswersByRound: Record<number, typeof this.state.answers> = {
        ...(this.state.answersByRound ?? {}),
        // Le dernier round n'est pas encore archivé dans answersByRound
        [this.state.currentRound]: this.state.answers,
      };

      const roundLogs: RoundLog[] = [];
      for (let rd = 1; rd <= this.state.currentRound; rd++) {
        const question = this.questionsByRound.get(rd) ?? '';
        const answers = (allAnswersByRound[rd] ?? []).map((a) => {
          const p = this.state.players.find((pl) => pl.id === a.playerId);
          return {
            player: a.playerName,
            type: p?.type === 'human' ? 'human' : 'ai',
            answer: a.answer,
          };
        });
        roundLogs.push({
          round: rd,
          question,
          answers,
          votes: this.votesByRound.get(rd) ?? [],
          eliminated: this.eliminationsByRound.get(rd) ?? null,
        });
      }

      // ── Messages ─────────────────────────────────────────────────────────
      const messageLogs: MessageLog[] = this.state.messages
        .filter((m) => m.playerId !== 'system')
        .map((m) => {
          const p = this.state.players.find((pl) => pl.id === m.playerId);
          // Bug fix: inspector players have type 'human' on the Player object but must be
          // logged as 'inspector' — check the inspectors map explicitly.
          const msgType = p?.type !== 'human' ? 'ai'
            : this.inspectors.has(m.playerId) ? 'inspector'
            : 'human';
          return {
            round: m.round,
            player: m.playerName,
            type: msgType,
            content: m.content,
            timestamp: m.timestamp,
          };
        });

      const data = {
        gameId: this.state.roomId,
        date: now,
        language: (this.state.language ?? 'fr') as 'fr' | 'en',
        result: (this.state.gameOverReason ?? 'draw') as 'humans_win' | 'ai_win' | 'draw',
        players: playerLogs,
        rounds: roundLogs,
        messages: messageLogs,
      };

      saveGameLog(data);
      updateHumanProfiles(data);
    } catch (err) {
      console.error('[GameRoom] persistGameLog error:', err);
    }
  }

  // ====== ACTIONS ======

  addMessage(playerId: string, content: string): void {
    if (this.aborted) return;
    if (this.state.phase !== 'discussion') return;
    const player = this.state.players.find((p) => p.id === playerId);
    if (!player || player.isEliminated) return;
    if (this.state.discussionEndTime != null && Date.now() > this.state.discussionEndTime) return;

    // Dedup: block AI messages identical to their own recent messages or to other AIs' recent messages
    if (player.type === 'ai') {
      const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
      const norm = normalize(content);
      const recentOwn = (player as AIPlayerData).messageHistory.slice(-5);
      if (recentOwn.some((m) => normalize(m.content) === norm)) {
        return;
      }
      const otherAIMessages = this.state.messages
        .filter((m) => m.playerId !== playerId && this.aiPlayers.has(m.playerId))
        .slice(-20);
      if (otherAIMessages.some((m) => normalize(m.content) === norm)) {
        return;
      }
    }

    const message: GameMessage = {
      id: `msg-${Date.now()}-${Math.random()}`,
      playerId,
      playerName: player.username,
      content,
      timestamp: Date.now(),
      phase: this.state.phase,
      round: this.state.currentRound,
    };

    this.state.messages.push(message);

    // Si c'est une IA, on ajoute à son historique
    if (player.type === 'ai') {
      player.messageHistory.push(message);
    }

    this.emitState();

    // When a real human (not inspector, not AI) sends a message, trigger an
    // opportunistic AI thinking check after a short delay so AIs can react
    // to what was said — in addition to the regular timer-based polling.
    const isRealHuman = player.type === 'human' && !this.inspectors.has(playerId);
    if (isRealHuman) {
      const reactionDelay = 5000 + Math.floor(Math.random() * 10000); // 5–15s
      setTimeout(() => {
        if (this.aborted || this.state.phase !== 'discussion') return;
        this.runAIThinkingTick();
      }, reactionDelay);
    }
  }

  addAnswer(playerId: string, answer: string): void {
    if (this.state.phase !== 'question') return;
    const player = this.state.players.find((p) => p.id === playerId);
    if (!player || player.isEliminated) return; // Bug fix: guard against eliminated players answering
    this.state.answers = this.state.answers.filter((a) => a.playerId !== playerId);
    const questionAnswer: QuestionAnswer = {
      playerId,
      playerName: player.username,
      answer,
      timestamp: Date.now(),
    };
    this.state.answers.push(questionAnswer);
    this.emitState();

    // Si tous les joueurs actifs ont répondu, passer immédiatement à la discussion
    const activePlayers = this.state.players.filter((p) => !p.isEliminated);
    const answeredIds = new Set(this.state.answers.map((a) => a.playerId));
    const allAnswered = activePlayers.every((p) => answeredIds.has(p.id));
    if (allAnswered && this.questionPhaseTimeout) {
      clearTimeout(this.questionPhaseTimeout);
      this.questionPhaseTimeout = null;
      this.startDiscussion();
    }
  }

  addVote(voterId: string, targetId: string): void {
    if (this.state.phase !== 'voting') return;
    if (voterId === targetId) return;
    if (this.state.votes.some((v) => v.voterId === voterId)) return;

    const target = this.state.players.find((p) => p.id === targetId && !p.isEliminated);
    if (!target) return;
    if (targetId === this.state.protectedPlayerId) return;

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
      setImmediate(() => this.processVotes());
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
      round: this.state.currentRound,
    });
  }

  flagMessage(playerId: string, messageId: string, reason?: string): void {
    const player = this.state.players.find((p) => p.id === playerId);
    if (!player || player.type !== 'human' || player.isEliminated) return;
    const message = this.state.messages.find((m) => m.id === messageId);
    if (!message || message.playerId === playerId) return; // can't flag own messages
    saveMessageFlag(this.state.roomId, messageId, player.username, message.round, reason);
  }

  // ====== UTILS ======

  private getRandomQuestion(): string {
    const lang = this.state.language === 'en' ? 'en' : 'fr';
    const questions = getQuestionsForLanguage(lang);
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
      })),
      eliminationOrder: [...this.eliminationOrder],
    };
    if (this.state.phase === 'endround') {
      out.eliminatedPlayerId = this.state.eliminatedPlayerId ?? null;
      out.eliminatedPlayerIsAI = this.state.eliminatedPlayerIsAI ?? null;
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
