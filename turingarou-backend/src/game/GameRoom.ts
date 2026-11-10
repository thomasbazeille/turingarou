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
import { ChatProvider } from '../llm/chatClient.js';
import { LLMCallEvent } from '../llm/llmCall.js';
import { getQuestionsForLanguage } from './QuestionBank.js';
import { saveGameLog, updateHumanProfiles, getRandomHumanProfile, saveMessageFlag, RoundLog, MessageLog, PlayerLog } from './GameLogger.js';
import { AISpeechEvent, drawStyleProfile } from './aiSpeech.js';
import { addressedTo } from './directAddress.js';
import { checkMessage } from './formGate.js';
import {
  ResponseStyle,
  answerTarget,
  cooldownMs,
  discussionDelay,
  firstMessageDelay,
  globalGapMs,
  skipProbability,
  voteDelay,
} from './humanTiming.js';

const DISCUSSION_LOCK_MS = 10000;
const VOTE_DEADLINE_MS = 25000;
/** Share of direct addresses / accusations an AI answers for sure; the rest goes through the normal flow (humans ignore some too). */
const DIRECT_REPLY_PROB = 0.85;

/** Bot-side event (gate, parse, fallback vote, direct reply, dropped post). Logged as JSON lines, no DB table. */
interface AIEventLog {
  round: number;
  phase: string;
  player: string;
  kind: string;
  reason: string | null;
  detail: string | null;
  ts: number;
}

type Speaker = { kind: 'ai'; id: string; actor: AIPlayer } | { kind: 'inspector'; id: string; actor: InspectorController };

const COLORS = [
  { name: 'Red', hex: '#ef4444' },
  { name: 'Orange', hex: '#f97316' },
  { name: 'Gold', hex: '#eab308' },
  { name: 'Silver', hex: '#94a3b8' },
  { name: 'Purple', hex: '#a855f7' },
  { name: 'Turquoise', hex: '#06b6d4' },
  { name: 'Pink', hex: '#ec4899' },
  { name: 'Lime', hex: '#84cc16' },
];

const QUESTION_PHASE_MS = 20000;
const DISCUSSION_PHASE_MS = 100000; // 100 s de discussion par round (+ temps de vote après)
const VOTE_PHASE_MS = 30000;
const MAX_ROUNDS = 7;

export class GameRoom {
  private state: GameRoomState;
  private io: SocketServer;
  private aiPlayers: Map<string, AIPlayer> = new Map();
  private llmProviders: ChatProvider[];
  private discussionTimer: NodeJS.Timeout | null = null;
  private aiThinkingInterval: NodeJS.Timeout | null = null;
  private votePhaseTimeout: NodeJS.Timeout | null = null;
  private questionPhaseTimeout: NodeJS.Timeout | null = null;
  /** AIs and inspectors with a decision or a message in flight. */
  private aiPendingMessage = new Set<string>();
  private inspectors: Map<string, InspectorController> = new Map();
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
  /** Earliest time each AI/inspector may post again (cooldown drawn at post time from its response style). */
  private nextAllowedAt: Map<string, number> = new Map();
  /** Last time ANY AI or inspector posted: two bots never post one second apart. */
  private lastAnyAIPostAt = 0;
  private discussionStartedAt = 0;
  private tickRunning = false;
  private tickQueued = false;
  /** Provider label per AI/inspector id, persisted with the game. */
  private providerNames: Map<string, string> = new Map();
  /** Every LLM call of the game (role, provider, latency, failures) — summarised in the game-end telemetry line. */
  private llmEvents: (LLMCallEvent & { round: number; phase: string })[] = [];
  /** Gate regenerations and drops, parse failures, fallback votes, direct replies — one JSON log line each. */
  private aiEvents: AIEventLog[] = [];

  constructor(roomId: string, io: SocketServer, llmProvider: ChatProvider | ChatProvider[], aiCount: number = 1) {
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
      maxPlayers: 8,
      minPlayers: 5,
      aiCount,
      eliminatedPlayerId: null,
      gameOverReason: null,
      language: 'fr',
    };
  }

  /** Picks a random provider from the pool (uniform distribution). */
  private pickProvider(): ChatProvider {
    return this.llmProviders[Math.floor(Math.random() * this.llmProviders.length)];
  }

  private readonly llmSink = (e: LLMCallEvent): void => {
    this.llmEvents.push({ ...e, round: this.state.currentRound, phase: this.state.phase });
  };

  private readonly speechSink = (e: AISpeechEvent): void => {
    this.logAIEvent(e.player, e.kind, e.reason, e.detail);
  };

  private logAIEvent(player: string, kind: string, reason?: string, detail?: string): void {
    const event: AIEventLog = { round: this.state.currentRound, phase: this.state.phase, player, kind, reason: reason ?? null, detail: detail ?? null, ts: Date.now() };
    this.aiEvents.push(event);
    console.log(`[ai-event] ${JSON.stringify({ room: this.state.roomId, ...event })}`);
  }

  private aiDeps(caseProfile?: 'lower') {
    const profile = drawStyleProfile();
    if (caseProfile) profile.caseProfile = caseProfile;
    return { pool: this.llmProviders, profile, llmSink: this.llmSink, eventSink: this.speechSink };
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
    if (this.state.phase !== 'waiting' || humanCount !== 4 || this.state.players.length >= this.state.maxPlayers) {
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
      inspectorProvider,
      this.aiDeps('lower')
    );
    this.providerNames.set(inspectorId, inspectorProvider.name);
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
      let persona = await getRandomHumanProfile();
      let attempts = 0;
      while (persona && usedPersonaNames.has(persona.username) && attempts < 5) {
        persona = await getRandomHumanProfile();
        attempts++;
      }
      if (persona) {
        usedPersonaNames.add(persona.username);
        console.log(`[GameRoom] AI ${personality.name} uses human persona: ${persona.username} (${persona.sampleMessages.length} msgs)`);
      }

      const provider = this.pickProvider();
      const deps = this.aiDeps();
      const aiPlayer = new AIPlayer(aiPlayerData, provider, chosen.content, persona ?? null, deps);
      this.aiPlayers.set(aiPlayerData.id, aiPlayer);
      this.aiStrategyNames.set(aiPlayerData.id, chosen.name);
      this.providerNames.set(aiPlayerData.id, provider.name);
      console.log(`[GameRoom] AI ${personality.name} uses provider: ${provider.name}, style ${personality.responseStyle}, case ${deps.profile.caseProfile}`);
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

    // The format (language, timings) must reach the AIs BEFORE their first answer: the round-1 prompt used to be built
    // without it, so English games asked for French answers.
    this.setGameFormatForAllAI();
    this.aiAnswerQuestion();
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

  /** This AI's answers in previous rounds, with their questions. */
  private ownAnswersOf(id: string): { round: number; question: string; answer: string }[] {
    const out: { round: number; question: string; answer: string }[] = [];
    for (const [round, answers] of Object.entries(this.state.answersByRound ?? {})) {
      const mine = answers.find((a) => a.playerId === id);
      if (mine) out.push({ round: Number(round), question: this.questionsByRound.get(Number(round)) ?? '', answer: mine.answer });
    }
    return out;
  }

  private async aiAnswerQuestion(): Promise<void> {
    if (this.aborted) return;
    const question = this.state.currentQuestion;
    if (!question) return;
    const phaseStart = Date.now();
    const round = this.state.currentRound;

    // Each answer is scheduled as soon as ITS model returns, at an independent target time: no barrier waiting for the
    // slowest provider, no shared "first human answered" gate that made every AI answer in the same burst.
    const submitWhenDue = (id: string, answer: string | null): void => {
      if (answer == null || answer.trim() === '') return;
      const wait = Math.max(200 + Math.random() * 800, phaseStart + answerTarget() - Date.now());
      setTimeout(() => {
        if (this.aborted || this.state.phase !== 'question' || this.state.currentRound !== round) return;
        this.addAnswer(id, answer);
      }, wait);
    };

    for (const [id, aiPlayer] of this.aiPlayers) {
      const p = this.state.players.find((pl) => pl.id === id);
      if (!p || p.isEliminated) continue;
      aiPlayer.answerQuestion(question, this.ownAnswersOf(id)).then((a) => submitWhenDue(id, a));
    }
    for (const [id, inspector] of this.inspectors) {
      const p = this.state.players.find((pl) => pl.id === id);
      if (!p || p.isEliminated) continue;
      inspector.answerQuestion(question).then((a) => submitWhenDue(id, a));
    }
  }

  private startDiscussion(): void {
    this.state.phase = 'discussion';
    const discussionMs = DISCUSSION_PHASE_MS; // 100 s pour tous les rounds
    this.state.discussionEndTime = Date.now() + discussionMs;
    this.discussionStartedAt = Date.now();
    this.emitState();

    this.discussionTimer = setTimeout(() => {
      // Ne pas lancer une nouvelle phase si la room est déjà passée à autre chose
      if (this.aborted || this.state.phase !== 'discussion') return;
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

  private buildPreviousRoundsSummary(): string {
    const lines: string[] = [];
    for (let rd = 1; rd < this.state.currentRound; rd++) {
      const elim = this.eliminationsByRound.get(rd);
      const votes = this.votesByRound.get(rd) ?? [];
      const answers = this.state.answersByRound?.[rd] ?? [];
      const question = this.questionsByRound.get(rd);
      const parts: string[] = [];
      if (question) parts.push(`Question: "${question}"`);
      if (answers.length > 0) parts.push(`Answers: ${answers.map((a) => `${a.playerName}: ${a.answer}`).join(' / ')}`);
      parts.push(elim ? `Eliminated: ${elim.name} (${elim.isAI ? 'AI' : 'human'})` : 'Eliminated: none');
      parts.push(`Votes: ${votes.length > 0 ? votes.map((v) => `${v.voter} → ${v.target}`).join(', ') : 'none recorded'}`);
      lines.push(`Round ${rd}. ${parts.join('. ')}`);
    }
    return lines.join('\n');
  }

  private contextOptionsFor(id: string) {
    const activePlayers = this.state.players.filter((p) => !p.isEliminated);
    return {
      activePlayerIds: activePlayers.map((p) => p.id),
      eliminatedNames: this.state.players.filter((p) => p.isEliminated).map((p) => p.username),
      aiRemainingCount: activePlayers.filter((p) => p.type === 'ai').length,
      previousRoundsSummary: this.buildPreviousRoundsSummary(),
      ownAnswers: this.ownAnswersOf(id),
    };
  }

  private isBot(playerId: string): boolean {
    return this.aiPlayers.has(playerId) || this.inspectors.has(playerId);
  }

  private speechContextFor(id: string) {
    const discussion = this.state.messages.filter((m) => m.playerId !== 'system');
    return {
      ownRecent: discussion.filter((m) => m.playerId === id).slice(-5).map((m) => m.content),
      otherAIRecent: discussion.filter((m) => m.playerId !== id && this.isBot(m.playerId)).slice(-20).map((m) => m.content),
    };
  }

  private styleOf(speaker: Speaker): ResponseStyle {
    if (speaker.kind === 'inspector') return 'random';
    const p = this.state.players.find((pl) => pl.id === speaker.id) as AIPlayerData | undefined;
    return p?.personality.responseStyle ?? 'random';
  }

  private speakers(): Speaker[] {
    const list: Speaker[] = [
      ...[...this.aiPlayers.entries()].map(([id, actor]) => ({ kind: 'ai' as const, id, actor })),
      ...[...this.inspectors.entries()].map(([id, actor]) => ({ kind: 'inspector' as const, id, actor })),
    ];
    return list.sort(() => Math.random() - 0.5);
  }

  private discussionRemaining(): number {
    return this.state.phase === 'discussion' && this.state.discussionEndTime != null ? this.state.discussionEndTime - Date.now() : Infinity;
  }

  /**
   * Thinking tick (timer, human message, burst). One tick at a time; the AIs decide IN PARALLEL, so the slowest
   * provider no longer sets the pace of the others.
   */
  private async runAIThinkingTick(): Promise<void> {
    if (this.aborted || this.state.phase !== 'discussion') return;
    if (this.tickRunning) {
      this.tickQueued = true;
      return;
    }
    this.tickRunning = true;
    try {
      if (this.discussionRemaining() <= DISCUSSION_LOCK_MS) return;
      const now = Date.now();
      const discussion = this.state.messages.filter((m) => m.phase === 'discussion' && m.round === this.state.currentRound && m.playerId !== 'system');
      const lastAt = discussion.length > 0 ? discussion[discussion.length - 1].timestamp : this.discussionStartedAt;
      // Nobody has said anything for 12 s: one bot speaks up instead of everyone waiting for everyone.
      let watchdog = now - lastAt > 12000 && now - this.discussionStartedAt > 8000;

      const chosen: Speaker[] = [];
      for (const sp of this.speakers()) {
        const player = this.state.players.find((p) => p.id === sp.id);
        if (!player || player.isEliminated || this.aiPendingMessage.has(sp.id)) continue;
        if ((this.nextAllowedAt.get(sp.id) ?? 0) > now) continue;
        const style = this.styleOf(sp);
        if (watchdog) watchdog = false;
        else if (Math.random() < skipProbability(style)) continue;
        this.aiPendingMessage.add(sp.id);
        chosen.push(sp);
      }
      await Promise.allSettled(chosen.map((sp) => this.runOneDecision(sp)));
    } finally {
      this.tickRunning = false;
      if (this.tickQueued) {
        this.tickQueued = false;
        setTimeout(() => this.runAIThinkingTick(), 300);
      }
    }
  }

  /** One AI decides and, if it speaks, its message is scheduled at a human-plausible time. Caller holds the pending lock. */
  private async runOneDecision(sp: Speaker, direct?: { from: string; content: string; accusation: boolean }): Promise<void> {
    const release = (): void => {
      this.aiPendingMessage.delete(sp.id);
    };
    try {
      const style = this.styleOf(sp);
      sp.actor.buildGameContext(this.state.messages, this.state.currentQuestion, this.state.phase, this.state.currentRound, this.state.answers, this.contextOptionsFor(sp.id));
      const speech = this.speechContextFor(sp.id);
      const outcome = sp.kind === 'ai' ? await sp.actor.decideAction(speech, direct) : await sp.actor.decideAction(speech);
      if (this.aborted || this.state.phase !== 'discussion' || outcome.kind !== 'message') return release();
      if (direct) this.logAIEvent(this.nameOf(sp.id), 'direct_reply', direct.accusation ? 'accusation' : 'named', direct.content.slice(0, 120));

      const discussion = this.state.messages.filter((m) => m.phase === 'discussion' && m.round === this.state.currentRound && m.playerId !== 'system');
      const others = discussion.filter((m) => m.playerId !== sp.id);
      const myLast = discussion.filter((m) => m.playerId === sp.id).pop();
      const unseen = others.filter((m) => !myLast || m.timestamp > myLast.timestamp);
      let delay: number;
      if (discussion.length === 0 && !direct) {
        delay = Math.max(250, this.discussionStartedAt + firstMessageDelay() - Date.now());
      } else {
        delay = discussionDelay({
          triggerAt: others.length > 0 ? others[others.length - 1].timestamp : this.discussionStartedAt,
          now: Date.now(),
          newMsgCount: unseen.length,
          newChars: unseen.reduce((n, m) => n + m.content.length, 0),
          replyChars: outcome.message.length,
          style,
          direct: !!direct,
        });
      }
      this.schedulePost(sp, outcome.message, delay, style, !!direct);
    } catch (err) {
      console.error(`[GameRoom] decision error for ${sp.id}:`, err);
      release();
    }
  }

  private nameOf(id: string): string {
    return this.state.players.find((p) => p.id === id)?.username ?? id;
  }

  /** Posts at the scheduled time, keeping a jittered minimum gap between two bot messages. Releases the pending lock. */
  private schedulePost(sp: Speaker, text: string, delay: number, style: ResponseStyle, direct: boolean): void {
    const attempt = () => {
      if (this.aborted || this.state.phase !== 'discussion' || this.discussionRemaining() <= DISCUSSION_LOCK_MS) {
        this.aiPendingMessage.delete(sp.id);
        return;
      }
      const sinceLastBot = Date.now() - this.lastAnyAIPostAt;
      const gap = globalGapMs();
      if (!direct && sinceLastBot < gap) {
        setTimeout(attempt, gap - sinceLastBot + Math.random() * 600);
        return;
      }
      const posted = this.addMessage(sp.id, text);
      this.aiPendingMessage.delete(sp.id);
      if (!posted) return;
      const isShort = text.length < 50;
      const now = Date.now();
      this.lastAIMessageTime.set(sp.id, now);
      this.lastAIMessageShort.set(sp.id, isShort);
      this.nextAllowedAt.set(sp.id, now + cooldownMs(style, isShort));
      this.lastAnyAIPostAt = now;
      // Burst: ~15% chance that a short message gets a follow-up, like humans sending 2-3 lines in a row.
      if (sp.kind === 'ai' && isShort && Math.random() < 0.15) this.scheduleBurstCheck(sp);
    };
    setTimeout(attempt, delay);
  }

  private stopAIThinking(): void {
    if (this.aiThinkingInterval) {
      clearTimeout(this.aiThinkingInterval);
      this.aiThinkingInterval = null;
    }
    this.aiPendingMessage.clear();
    this.lastAIMessageTime.clear();
    this.lastAIMessageShort.clear();
    this.nextAllowedAt.clear();
    this.tickQueued = false;
  }

  /** Solo follow-up check for one AI after a short message (burst mode). */
  private scheduleBurstCheck(sp: Speaker): void {
    const burstDelay = 4000 + Math.floor(Math.random() * 5000); // 4–9s
    setTimeout(() => {
      if (this.aborted || this.state.phase !== 'discussion') return;
      if (this.aiPendingMessage.has(sp.id) || this.discussionRemaining() <= DISCUSSION_LOCK_MS) return;
      const player = this.state.players.find((p) => p.id === sp.id);
      if (!player || player.isEliminated) return;
      this.aiPendingMessage.add(sp.id);
      void this.runOneDecision(sp);
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

  /**
   * Bots vote: the model is asked right away on a FRESH context, the vote lands at a human-plausible time
   * (non-uniform, 1–20 s), and a deadline casts a logged fallback vote instead of a silent abstention.
   */
  private async aiVote(): Promise<void> {
    if (this.aborted) return;
    const voteStart = Date.now();
    const round = this.state.currentRound;
    const activePlayers = this.state.players
      .filter((p) => !p.isEliminated && p.id !== this.state.protectedPlayerId)
      .map((p) => ({ id: p.id, username: p.username }));

    for (const sp of this.speakers()) {
      const player = this.state.players.find((p) => p.id === sp.id);
      if (!player || player.isEliminated) continue;
      const candidates = activePlayers.filter((p) => p.id !== sp.id);
      if (candidates.length === 0) continue;
      sp.actor.buildGameContext(this.state.messages, this.state.currentQuestion, 'voting', round, this.state.answers, this.contextOptionsFor(sp.id));

      let cast = false;
      const castVote = (targetId: string | null) => {
        if (cast) return;
        cast = true;
        if (this.aborted || this.state.phase !== 'voting' || this.state.currentRound !== round) return;
        let target = targetId;
        if (!target) {
          target = candidates[Math.floor(Math.random() * candidates.length)].id;
          this.logAIEvent(player.username, 'vote_fallback', 'no_usable_answer', this.nameOf(target));
        }
        this.addVote(sp.id, target);
      };
      const deadline = setTimeout(() => castVote(null), Math.max(1000, voteStart + VOTE_DEADLINE_MS - Date.now()));
      const target = voteStart + voteDelay();
      sp.actor
        .decideVote(activePlayers)
        .catch(() => null)
        .then((targetId) => {
          setTimeout(() => {
            clearTimeout(deadline);
            castVote(targetId);
          }, Math.max(0, target - Date.now()));
        });
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

      // Protéger un joueur aléatoire (pas l'éliminé) — seulement si > 4 joueurs restants
      const survivorsAfterElim = this.state.players.filter(
        (p) => !p.isEliminated && p.id !== eliminatedId
      );
      if (survivorsAfterElim.length > 4) {
        const protectedIndex = Math.floor(Math.random() * survivorsAfterElim.length);
        this.state.protectedPlayerId = survivorsAfterElim[protectedIndex].id;
      } else {
        this.state.protectedPlayerId = null;
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
    this.logTelemetry();
  }

  /** One JSON line per game: LLM health per provider and bot events by kind (read with `railway logs | grep game-telemetry`). */
  private logTelemetry(): void {
    const pct = (xs: number[], q: number) => {
      if (xs.length === 0) return null;
      const sorted = [...xs].sort((a, b) => a - b);
      return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
    };
    const byProvider: Record<string, { calls: number; failed: number; fallback: number; retried: number; p50: number | null; p90: number | null }> = {};
    const groups = new Map<string, LLMCallEvent[]>();
    for (const e of this.llmEvents) {
      const list = groups.get(e.provider) ?? [];
      list.push(e);
      groups.set(e.provider, list);
    }
    for (const [provider, list] of groups) {
      const ok = list.filter((e) => e.ok).map((e) => e.latencyMs);
      byProvider[provider] = {
        calls: list.length,
        failed: list.filter((e) => !e.ok).length,
        fallback: list.filter((e) => e.fallback).length,
        retried: list.filter((e) => e.attempts > 1).length,
        p50: pct(ok, 0.5),
        p90: pct(ok, 0.9),
      };
    }
    const events: Record<string, number> = {};
    for (const e of this.aiEvents) {
      const key = e.reason ? `${e.kind}:${e.reason}` : e.kind;
      events[key] = (events[key] ?? 0) + 1;
    }
    const providers: Record<string, string> = {};
    for (const [id, name] of this.providerNames) providers[this.nameOf(id)] = name;
    console.log(
      `[game-telemetry] ${JSON.stringify({ room: this.state.roomId, result: this.state.gameOverReason, rounds: this.state.currentRound, providers, llm: byProvider, events })}`
    );
  }

  // ====== ACTIONS ======

  /** Returns true when the message was posted. */
  addMessage(playerId: string, content: string): boolean {
    if (this.aborted) return false;
    if (this.state.phase !== 'discussion') return false;
    const player = this.state.players.find((p) => p.id === playerId);
    if (!player || player.isEliminated) return false;

    if (this.isBot(playerId)) {
      // Last net before the chat: whatever path produced the text, a list, a JSON fragment or an AI admission never
      // reaches the players.
      const net = checkMessage(content, { channel: 'discussion', caseProfile: 'raw', dropFinalPeriodProb: 0, ownRecent: [], otherAIRecent: [] });
      if (!net.ok && (net.reason === 'structure' || net.reason === 'json_leak' || net.reason === 'ai_admission' || net.reason === 'empty')) {
        this.logAIEvent(player.username, 'post_drop', net.reason, content.slice(0, 160));
        return false;
      }
      // Exact duplicates of its own last 5 lines or of another bot's last 20.
      const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
      const norm = normalize(content);
      const recentOwn = this.state.messages.filter((m) => m.playerId === playerId).slice(-5);
      const otherBots = this.state.messages.filter((m) => m.playerId !== playerId && this.isBot(m.playerId)).slice(-20);
      if (recentOwn.some((m) => normalize(m.content) === norm) || otherBots.some((m) => normalize(m.content) === norm)) {
        this.logAIEvent(player.username, 'post_drop', 'exact_duplicate', content.slice(0, 160));
        return false;
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
      this.reactToDirectAddress(message);
      const reactionDelay = 5000 + Math.floor(Math.random() * 10000); // 5–15s
      setTimeout(() => {
        if (this.aborted || this.state.phase !== 'discussion') return;
        this.runAIThinkingTick();
      }, reactionDelay);
    }
    return true;
  }

  /**
   * A human names an AI, or accuses the AI whose message they answer: that AI starts deciding within a second instead
   * of waiting for the next tick. Silence after "lucas t'es un bot ?" is the loudest tell there is.
   */
  private reactToDirectAddress(message: GameMessage): void {
    if (this.discussionRemaining() <= DISCUSSION_LOCK_MS) return;
    const discussion = this.state.messages.filter((m) => m.phase === 'discussion' && m.round === this.state.currentRound && m.playerId !== 'system');
    const previous = discussion.length >= 2 ? discussion[discussion.length - 2] : undefined;
    for (const sp of this.speakers()) {
      if (sp.kind !== 'ai') continue;
      const player = this.state.players.find((p) => p.id === sp.id);
      if (!player || player.isEliminated || this.aiPendingMessage.has(sp.id)) continue;
      const verdict = addressedTo(message.content, player.username, { repliesToPlayer: previous?.playerId === sp.id });
      if (!verdict.direct || Math.random() >= DIRECT_REPLY_PROB) continue;
      this.aiPendingMessage.add(sp.id);
      setTimeout(() => {
        if (this.aborted || this.state.phase !== 'discussion') {
          this.aiPendingMessage.delete(sp.id);
          return;
        }
        void this.runOneDecision(sp, { from: message.playerName, content: message.content, accusation: verdict.accusation });
      }, Math.floor(Math.random() * 1000));
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
