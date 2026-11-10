import { getRandomAIPlayerStrategy, getInspectorPromptContent, StrategyEntry } from './StrategyLoader.js';
import { addPlayerName, pickAIName } from './PlayerNamesStore.js';
import {
  GameRoomState,
  HumanPlayer,
  AIPlayerData,
  GameMessage,
  QuestionAnswer,
  AIPersonality,
  GameFormat,
} from '../types/game.types.js';
import { ChatProvider } from '../llm/chatClient.js';
import { getQuestionsForLanguage } from './QuestionBank.js';
import {
  saveGameLog,
  updateHumanProfiles,
  getRandomHumanProfile,
  saveMessageFlag,
  GameLogData,
  HumanPersona,
  PersonaQuery,
  RoundLog,
  MessageLog,
  PlayerLog,
} from './GameLogger.js';
import { drawStyleProfile } from './aiSpeech.js';
import { checkMessage } from './formGate.js';
import { Bot } from './Bot.js';
import { BotDirector, VOTE_DEADLINE_MS } from './BotDirector.js';
import { RoundRecord } from './botContext.js';
import { Clock, systemClock, TimerHandle, Timers } from './clock.js';

/** The part of Socket.io a room uses: broadcast to its own channel. */
export interface RoomEmitter {
  to(room: string): { emit(event: string, payload: unknown): unknown };
}

/** Everything a room touches outside itself; defaults are the production ones, the simulation swaps them. */
export interface GameRoomDeps {
  clock: Clock;
  rng: () => number;
  names: { add(name: string): void; pick(exclude: string[]): string };
  strategies: { aiPlayer(name: string): Promise<StrategyEntry>; inspector(): Promise<string> };
  persistence: {
    saveGameLog(data: GameLogData): Promise<void>;
    updateHumanProfiles(data: GameLogData): Promise<void>;
    saveMessageFlag(gameId: string, messageId: string, flaggedBy: string, round: number, reason?: string): Promise<void>;
    getRandomHumanProfile(opts?: PersonaQuery): Promise<HumanPersona | null>;
  };
  log: (line: string) => void;
}

const defaultDeps: GameRoomDeps = {
  clock: systemClock,
  rng: Math.random,
  names: { add: addPlayerName, pick: pickAIName },
  strategies: { aiPlayer: getRandomAIPlayerStrategy, inspector: getInspectorPromptContent },
  persistence: { saveGameLog, updateHumanProfiles, saveMessageFlag, getRandomHumanProfile },
  log: (line) => console.log(line),
};

type PlayerKind = 'human' | 'ai' | 'inspector';

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

export const QUESTION_PHASE_MS = 20000;
export const DISCUSSION_PHASE_MS = 100000;
export const VOTE_PHASE_MS = 30000;
export const ENDROUND_MS = 8000;
export const MAX_ROUNDS = 7;

if (VOTE_DEADLINE_MS >= VOTE_PHASE_MS) throw new Error('bot vote deadline must fall inside the vote phase');

const PERSONALITY_TEMPLATES: Omit<AIPersonality, 'name'>[] = [
  { traits: ['analytical', 'calm', 'logical'], systemPrompt: `You are {name}, a calm and analytical person. You tend to think before you speak and use logic. You're playing a social deduction game and must act like a human.`, responseStyle: 'thoughtful', suspicionLevel: 0.3 },
  { traits: ['friendly', 'chatty', 'enthusiastic'], systemPrompt: `You are {name}, a friendly and enthusiastic person. You like to chat and engage with others. Sometimes you type quickly and make small typos. You're playing a social deduction game.`, responseStyle: 'quick', suspicionLevel: 0.5 },
  { traits: ['quiet', 'observant', 'skeptical'], systemPrompt: `You are {name}, a quiet and observant person. You don't talk much but when you do, it's meaningful. You're naturally skeptical. You're playing a social deduction game.`, responseStyle: 'random', suspicionLevel: 0.7 },
  { traits: ['humorous', 'casual', 'witty'], systemPrompt: `You are {name}, a witty and humorous person. You like to make jokes and keep things light. You're playing a social deduction game and must act like a human.`, responseStyle: 'quick', suspicionLevel: 0.4 },
  { traits: ['strategic', 'thoughtful', 'careful'], systemPrompt: `You are {name}, a strategic and careful thinker. You analyze situations before acting. You're playing a social deduction game and must act like a human.`, responseStyle: 'thoughtful', suspicionLevel: 0.6 },
  { traits: ['emotional', 'reactive', 'passionate'], systemPrompt: `You are {name}, an emotional and passionate person. You react quickly and speak from the heart. You're playing a social deduction game and must act like a human.`, responseStyle: 'quick', suspicionLevel: 0.5 },
  { traits: ['neutral', 'balanced', 'diplomatic'], systemPrompt: `You are {name}, a balanced and diplomatic person. You try to see all sides and stay neutral. You're playing a social deduction game and must act like a human.`, responseStyle: 'random', suspicionLevel: 0.4 },
];

/**
 * One game: phase state machine, socket emits, persistence. Every bot behaviour lives in BotDirector; the room
 * only tells it when a phase starts and receives its posts, answers and votes through the same doors as humans.
 */
export class GameRoom {
  private state: GameRoomState;
  private io: RoomEmitter;
  private llmProviders: ChatProvider[];
  private deps: GameRoomDeps;
  private director: BotDirector;
  private phaseTimers: Timers;
  private phaseTimer: TimerHandle | null = null;
  /** Kind of every player who ever joined, departed humans included (their messages stay in the log). */
  private kinds = new Map<string, PlayerKind>();
  private votesByRound = new Map<number, { voter: string; target: string }[]>();
  private eliminationsByRound = new Map<number, { name: string; isAI: boolean }>();
  private questionsByRound = new Map<number, string>();
  private eliminationOrder: string[] = [];
  /** True once all humans have left: blocks every further timer, bot call and join. */
  private aborted = false;
  /** Bots are being created for a full room: no further join. */
  private starting = false;

  constructor(roomId: string, io: RoomEmitter, llmProvider: ChatProvider | ChatProvider[], aiCount: number = 1, deps: Partial<GameRoomDeps> = {}) {
    this.io = io;
    this.llmProviders = Array.isArray(llmProvider) ? llmProvider : [llmProvider];
    this.deps = { ...defaultDeps, ...deps };
    this.phaseTimers = new Timers(this.deps.clock);
    this.director = new BotDirector(
      {
        state: () => this.state,
        history: () => this.history(),
        postMessage: (id, text) => this.addMessage(id, text),
        submitAnswer: (id, text) => this.addAnswer(id, text),
        castVote: (id, target) => this.addVote(id, target),
      },
      { clock: this.deps.clock, rng: this.deps.rng, log: this.deps.log }
    );

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

  private now(): number {
    return this.deps.clock.now();
  }

  private newId(prefix: string): string {
    return `${prefix}-${this.now()}-${this.deps.rng()}`;
  }

  /**
   * Player ids reach every browser, so they must say nothing about the player: same shape for humans, AIs and
   * inspectors, no prefix, no creation time (the AIs are all created in the same millisecond at game start).
   */
  private newPlayerId(): string {
    const hex = () => Math.floor(this.deps.rng() * 0x100000000).toString(16).padStart(8, '0');
    for (;;) {
      const id = `p-${hex()}${hex()}`;
      if (!this.state.players.some((p) => p.id === id)) return id;
    }
  }

  private pickProvider(): ChatProvider {
    return this.llmProviders[Math.floor(this.deps.rng() * this.llmProviders.length)];
  }

  private freeColor(): (typeof COLORS)[number] | undefined {
    const used = this.state.players.map((p) => p.color);
    return COLORS.find((c) => !used.includes(c.hex));
  }

  // ====== PLAYER MANAGEMENT ======

  /** A public lobby may send new players here. */
  isJoinable(): boolean {
    return this.state.phase === 'waiting' && !this.aborted && !this.starting;
  }

  async addHumanPlayer(socketId: string, username: string, language?: 'fr' | 'en'): Promise<boolean> {
    // Human slots full (an inspector may hold the last one while its prompt loads): a room past them never starts.
    if (!this.isJoinable() || this.state.players.length >= this.state.maxPlayers - this.state.aiCount) return false;
    if (language && !this.state.players.length) this.state.language = language;
    const color = this.freeColor();
    if (!color) return false;

    const player: HumanPlayer = {
      type: 'human',
      id: this.newPlayerId(),
      socketId,
      username,
      color: color.hex,
      colorName: color.name,
      isReady: true,
      isEliminated: false,
    };
    this.state.players.push(player);
    this.kinds.set(player.id, 'human');
    this.deps.names.add(username);
    this.emitState();
    await this.startIfFull();
    return true;
  }

  /** Add an AI Inspector to fill the last human slot (4 humans waiting). */
  async addInspectorPlayer(): Promise<boolean> {
    const humanCount = this.state.players.filter((p) => p.type === 'human').length;
    if (!this.isJoinable() || humanCount !== 4 || this.state.players.length >= this.state.maxPlayers) return false;
    const color = this.freeColor();
    if (!color) return false;

    const humanNames = this.state.players.filter((p) => p.type === 'human').map((p) => p.username);
    const player: HumanPlayer = {
      type: 'human',
      id: this.newPlayerId(),
      socketId: '',
      username: this.deps.names.pick(humanNames),
      color: color.hex,
      colorName: color.name,
      isReady: true,
      isEliminated: false,
    };
    this.state.players.push(player);
    this.kinds.set(player.id, 'inspector');
    const prompt = await this.deps.strategies.inspector();
    const provider = this.pickProvider();
    const profile = drawStyleProfile(this.deps.rng);
    profile.caseProfile = 'lower';
    this.director.addBot(
      new Bot(
        { id: player.id, name: player.username, role: 'inspector', provider, pool: this.llmProviders, profile, responseStyle: 'random', strategy: prompt },
        { llm: this.director.llmSink, speech: this.director.speechSink, rng: this.deps.rng }
      )
    );
    this.deps.log(`[GameRoom] Inspector ${player.username} uses provider: ${provider.name}`);
    this.emitState();
    await this.startIfFull();
    return true;
  }

  private async startIfFull(): Promise<void> {
    if (this.starting || this.state.players.length !== this.state.maxPlayers - this.state.aiCount) return;
    this.starting = true;
    await this.addAIPlayers();
    if (this.aborted) return;
    this.shufflePlayers();
    this.startGame();
  }

  removePlayer(socketId: string): void {
    this.state.players = this.state.players.filter((p) => p.type !== 'human' || p.socketId !== socketId);

    // A game where no real human is left (inspectors are bots) stops instead of burning model calls.
    const gameInProgress = !['waiting', 'gameover'].includes(this.state.phase);
    const humanCount = this.state.players.filter((p) => this.kinds.get(p.id) === 'human' && !p.isEliminated).length;
    if (gameInProgress && humanCount === 0) {
      this.abortGame();
      return;
    }
    this.emitState();
    if (this.state.phase === 'voting') this.tryEndVotingEarly();
  }

  private abortGame(): void {
    if (this.aborted) return;
    this.aborted = true;
    this.deps.log(`[GameRoom ${this.state.roomId}] All humans disconnected — aborting game.`);
    this.phaseTimers.clearAll();
    this.phaseTimer = null;
    this.director.dispose();
    this.logTelemetry('aborted');
    // Back to waiting so the frontend shows the waiting screen.
    this.state.phase = 'waiting';
    this.emitState();
  }

  private async addAIPlayers(): Promise<void> {
    const usedPersonaNames = new Set<string>();
    for (const personality of this.generateAIPersonalities(this.state.aiCount)) {
      const color = this.freeColor();
      if (!color) return;
      const player: AIPlayerData = {
        type: 'ai',
        id: this.newPlayerId(),
        username: personality.name,
        color: color.hex,
        colorName: color.name,
        isReady: true,
        isEliminated: false,
        personality,
      };
      this.state.players.push(player);
      this.kinds.set(player.id, 'ai');

      const strategy = await this.deps.strategies.aiPlayer(personality.name);
      // Style reference: a real player of the game's language, never the same one for two AIs.
      const persona = await this.deps.persistence.getRandomHumanProfile({ language: this.state.language ?? 'fr', exclude: [...usedPersonaNames] });
      if (persona) usedPersonaNames.add(persona.username);

      const provider = this.pickProvider();
      const profile = drawStyleProfile(this.deps.rng);
      this.director.addBot(
        new Bot(
          {
            id: player.id,
            name: player.username,
            role: 'ai',
            provider,
            pool: this.llmProviders,
            profile,
            responseStyle: personality.responseStyle,
            strategy: strategy.content,
            strategyName: strategy.name,
            personality: personality.systemPrompt,
            persona: persona ?? null,
          },
          { llm: this.director.llmSink, speech: this.director.speechSink, rng: this.deps.rng }
        )
      );
      this.deps.log(
        `[GameRoom] AI ${personality.name} uses provider: ${provider.name}, style ${personality.responseStyle}, case ${profile.caseProfile}` +
          (persona ? `, persona ${persona.username}` : '')
      );
    }
  }

  private shuffle<T>(items: T[]): T[] {
    const arr = [...items];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.deps.rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /** The AIs are not always in the same seats nor the same colors. */
  private shufflePlayers(): void {
    this.state.players = this.shuffle(this.state.players);
    const colors = this.shuffle(COLORS);
    this.state.players.forEach((p, idx) => {
      const c = colors[idx % colors.length];
      p.color = c.hex;
      p.colorName = c.name;
    });
  }

  private generateAIPersonalities(count: number): AIPersonality[] {
    const used = this.state.players.filter((p) => p.type === 'human').map((p) => p.username);
    const templates = this.shuffle(PERSONALITY_TEMPLATES);
    const result: AIPersonality[] = [];
    for (let i = 0; i < count; i++) {
      const name = this.deps.names.pick(used);
      used.push(name);
      this.deps.names.add(name);
      const t = templates[i % templates.length];
      result.push({ name, traits: t.traits, systemPrompt: t.systemPrompt.replace(/\{name\}/g, name), responseStyle: t.responseStyle, suspicionLevel: t.suspicionLevel });
    }
    return result;
  }

  // ====== GAME FLOW ======

  private schedulePhase(ms: number, next: () => void): void {
    this.phaseTimers.cancel(this.phaseTimer);
    this.phaseTimer = this.phaseTimers.after(ms, () => {
      this.phaseTimer = null;
      next();
    });
  }

  private startGame(): void {
    this.starting = false;
    this.eliminationOrder = [];
    this.beginQuestion(1);
  }

  private beginQuestion(round: number): void {
    this.state.phase = 'question';
    this.state.currentRound = round;
    this.state.currentQuestion = this.getRandomQuestion();
    this.questionsByRound.set(round, this.state.currentQuestion ?? '');
    this.state.answers = [];
    this.state.votes = [];
    this.state.questionEndTime = this.now() + QUESTION_PHASE_MS;
    this.emitState();
    // The format (language, timings) reaches the bots with the question: round 1 of an English game used to be
    // prompted in French because the format was set after the first answers were requested.
    this.director.startQuestion(this.getGameFormat());
    this.schedulePhase(QUESTION_PHASE_MS, () => this.startDiscussion());
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

  private startDiscussion(): void {
    if (this.aborted || this.state.phase !== 'question') return;
    this.state.phase = 'discussion';
    this.state.discussionEndTime = this.now() + DISCUSSION_PHASE_MS;
    this.emitState();
    this.director.startDiscussion();
    this.schedulePhase(DISCUSSION_PHASE_MS, () => this.startVoting());
  }

  private startVoting(): void {
    if (this.aborted || this.state.phase !== 'discussion') return;
    this.state.phase = 'voting';
    this.state.voteEndTime = this.now() + VOTE_PHASE_MS;
    // Votes cast during the discussion are kept.
    this.emitState();
    this.director.startVoting();
    this.schedulePhase(VOTE_PHASE_MS, () => this.processVotes());
  }

  private processVotes(): void {
    if (this.aborted || this.state.phase !== 'voting') return;
    this.director.stop();
    const voteCounts = new Map<string, number>();
    for (const vote of this.state.votes) voteCounts.set(vote.targetId, (voteCounts.get(vote.targetId) ?? 0) + 1);

    // Most votes is eliminated; a tie eliminates nobody.
    let eliminatedId = '';
    if (voteCounts.size > 0) {
      const maxVotes = Math.max(...voteCounts.values());
      const top = [...voteCounts.entries()].filter(([, c]) => c === maxVotes).map(([id]) => id);
      if (top.length === 1) eliminatedId = top[0];
    }

    // A random survivor (not the eliminated) is protected next round, only while more than 4 players remain.
    const survivors = this.state.players.filter((p) => !p.isEliminated && p.id !== eliminatedId);
    this.state.protectedPlayerId = survivors.length > 4 ? survivors[Math.floor(this.deps.rng() * survivors.length)].id : null;

    const eliminated = this.state.players.find((p) => p.id === eliminatedId);
    if (eliminated) eliminated.isEliminated = true;
    this.state.eliminatedPlayerId = eliminatedId || null;
    this.state.eliminatedPlayerIsAI = eliminated ? eliminated.type !== 'human' : null;

    this.votesByRound.set(
      this.state.currentRound,
      this.state.votes.map((v) => ({ voter: this.nameOf(v.voterId), target: this.nameOf(v.targetId) }))
    );
    if (eliminated) {
      this.eliminationsByRound.set(this.state.currentRound, { name: eliminated.username, isAI: eliminated.type !== 'human' });
      this.eliminationOrder.push(eliminated.id);
    }

    this.state.phase = 'endround';
    this.state.voteEndTime = null;
    this.emitState();
    this.schedulePhase(ENDROUND_MS, () => this.nextRound());
  }

  private nextRound(): void {
    if (this.aborted || this.state.phase !== 'endround') return;
    const active = this.state.players.filter((p) => !p.isEliminated);
    const remainingAI = active.filter((p) => p.type === 'ai').length;
    // Inspectors are bots: they do not keep the game alive once they are the only "humans" left.
    const remainingHumans = active.filter((p) => this.kinds.get(p.id) === 'human').length;

    if (remainingAI === 0 || remainingHumans === 0 || active.length <= 2 || this.state.currentRound >= MAX_ROUNDS) {
      this.endGame(remainingAI, remainingHumans);
      return;
    }

    this.state.eliminatedPlayerId = null;
    if (!this.state.answersByRound) this.state.answersByRound = {};
    this.state.answersByRound[this.state.currentRound] = [...this.state.answers];
    // protectedPlayerId persists through the next vote: the immunity drawn in processVotes() is honoured there.
    this.beginQuestion(this.state.currentRound + 1);
  }

  private endGame(remainingAI: number, remainingHumans: number): void {
    this.state.gameOverReason = remainingAI === 0 ? 'humans_win' : remainingHumans === 0 ? 'ai_win' : 'draw';
    this.state.phase = 'gameover';
    this.state.eliminatedPlayerId = null;
    this.phaseTimers.clearAll();
    this.phaseTimer = null;
    this.director.dispose();
    this.emitState();
    this.persistGameLog();
    this.logTelemetry(this.state.gameOverReason);
  }

  /** Finished rounds as humans saw them between rounds (the current round is not included). */
  private history(): RoundRecord[] {
    const out: RoundRecord[] = [];
    for (let rd = 1; rd < this.state.currentRound; rd++) {
      out.push({
        round: rd,
        question: this.questionsByRound.get(rd) ?? '',
        answers: this.state.answersByRound?.[rd] ?? [],
        votes: this.votesByRound.get(rd) ?? [],
        eliminated: this.eliminationsByRound.get(rd) ?? null,
      });
    }
    return out;
  }

  private persistGameLog(): void {
    try {
      const kindOf = (id: string): PlayerKind => this.kinds.get(id) ?? 'human';
      // Inspectors were persisted as humans, so their lines fed the human style profiles that AIs imitate.
      const players: PlayerLog[] = this.state.players.map((p) => {
        let eliminatedRound: number | undefined;
        for (const [round, info] of this.eliminationsByRound) {
          if (info.name === p.username) {
            eliminatedRound = round;
            break;
          }
        }
        const entry: PlayerLog = { id: p.id, name: p.username, type: kindOf(p.id), eliminated: p.isEliminated };
        if (eliminatedRound !== undefined) entry.eliminatedRound = eliminatedRound;
        // "strategy@Provider" in the existing column: per-provider elimination rates without a schema change
        // (read back by src/history/reader.ts readStrategy).
        const bot = this.director.bots().find((b) => b.id === p.id);
        if (bot) entry.strategy = `${bot.spec.strategyName ?? kindOf(p.id)}@${bot.providerName}`;
        return entry;
      });

      const answersByRound: Record<number, QuestionAnswer[]> = { ...(this.state.answersByRound ?? {}), [this.state.currentRound]: this.state.answers };
      const rounds: RoundLog[] = [];
      for (let rd = 1; rd <= this.state.currentRound; rd++) {
        rounds.push({
          round: rd,
          question: this.questionsByRound.get(rd) ?? '',
          answers: (answersByRound[rd] ?? []).map((a) => ({ player: a.playerName, type: kindOf(a.playerId), answer: a.answer })),
          votes: this.votesByRound.get(rd) ?? [],
          eliminated: this.eliminationsByRound.get(rd) ?? null,
        });
      }

      // A human who left mid-game is no longer in players: their lines used to be logged as 'ai'.
      const messages: MessageLog[] = this.state.messages
        .filter((m) => m.playerId !== 'system')
        .map((m) => ({ round: m.round, player: m.playerName, type: kindOf(m.playerId), content: m.content, timestamp: m.timestamp }));

      const data: GameLogData = {
        gameId: this.state.roomId,
        date: new Date(this.now()).toISOString(),
        language: this.state.language ?? 'fr',
        result: this.state.gameOverReason ?? 'draw',
        players,
        rounds,
        messages,
      };
      void this.deps.persistence.saveGameLog(data);
      void this.deps.persistence.updateHumanProfiles(data);
    } catch (err) {
      console.error('[GameRoom] persistGameLog error:', err);
    }
  }

  /** One JSON line per game: LLM health per provider and bot events by kind (`railway logs | grep game-telemetry`). */
  private logTelemetry(result: string): void {
    this.deps.log(`[game-telemetry] ${JSON.stringify({ room: this.state.roomId, result, rounds: this.state.currentRound, ...this.director.telemetry() })}`);
  }

  // ====== ACTIONS ======

  /** Returns true when the message was posted. Single exit to the chat for humans and bots alike. */
  addMessage(playerId: string, content: string): boolean {
    if (this.aborted || this.state.phase !== 'discussion') return false;
    const player = this.state.players.find((p) => p.id === playerId);
    if (!player || player.isEliminated) return false;

    if (this.director.isBot(playerId)) {
      // Last net before the chat: whatever path produced the text, a list, a JSON fragment or an AI admission never
      // reaches the players.
      const net = checkMessage(content, { channel: 'discussion', caseProfile: 'raw', dropFinalPeriodProb: 0, ownRecent: [], otherAIRecent: [] });
      if (!net.ok && (net.reason === 'structure' || net.reason === 'json_leak' || net.reason === 'ai_admission' || net.reason === 'empty')) {
        this.director.logEvent(player.username, 'post_drop', net.reason, content.slice(0, 160));
        return false;
      }
      const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
      const norm = normalize(content);
      const recentOwn = this.state.messages.filter((m) => m.playerId === playerId).slice(-5);
      const otherBots = this.state.messages.filter((m) => m.playerId !== playerId && this.director.isBot(m.playerId)).slice(-20);
      if (recentOwn.some((m) => normalize(m.content) === norm) || otherBots.some((m) => normalize(m.content) === norm)) {
        this.director.logEvent(player.username, 'post_drop', 'exact_duplicate', content.slice(0, 160));
        return false;
      }
    }

    const message: GameMessage = {
      id: this.newId('msg'),
      playerId,
      playerName: player.username,
      content,
      timestamp: this.now(),
      phase: this.state.phase,
      round: this.state.currentRound,
    };
    this.state.messages.push(message);
    this.emitState();

    const kind = this.kinds.get(playerId);
    if (kind !== 'ai') this.director.onPlayerMessage(message, kind === 'human');
    return true;
  }

  addAnswer(playerId: string, answer: string): void {
    if (this.aborted || this.state.phase !== 'question') return;
    const player = this.state.players.find((p) => p.id === playerId);
    if (!player || player.isEliminated) return;
    this.state.answers = this.state.answers.filter((a) => a.playerId !== playerId);
    this.state.answers.push({ playerId, playerName: player.username, answer, timestamp: this.now() });
    this.emitState();

    // Everyone answered: discussion starts now. A bot that skips keeps the phase open like a silent human would,
    // otherwise an early close with one missing answer would point at a bot.
    const answered = new Set(this.state.answers.map((a) => a.playerId));
    if (this.state.players.filter((p) => !p.isEliminated).every((p) => answered.has(p.id))) {
      this.schedulePhase(0, () => this.startDiscussion());
    }
  }

  addVote(voterId: string, targetId: string): void {
    if (this.aborted || this.state.phase !== 'voting') return;
    if (voterId === targetId || this.state.votes.some((v) => v.voterId === voterId)) return;
    const target = this.state.players.find((p) => p.id === targetId && !p.isEliminated);
    if (!target || targetId === this.state.protectedPlayerId) return;
    const voter = this.state.players.find((p) => p.id === voterId);
    if (!voter || voter.isEliminated) return;

    this.state.votes.push({ voterId, targetId });
    this.addSystemMessage(this.state.language === 'en' ? `${voter.username} has voted.` : `${voter.username} a voté.`);
    this.emitState();
    this.tryEndVotingEarly();
  }

  private tryEndVotingEarly(): void {
    if (this.state.phase !== 'voting') return;
    const active = this.state.players.filter((p) => !p.isEliminated);
    const voted = new Set(this.state.votes.map((v) => v.voterId));
    if (active.length > 0 && active.every((p) => voted.has(p.id))) this.schedulePhase(0, () => this.processVotes());
  }

  private addSystemMessage(content: string): void {
    this.state.messages.push({
      id: this.newId('sys'),
      playerId: 'system',
      playerName: '',
      content,
      timestamp: this.now(),
      phase: this.state.phase,
      round: this.state.currentRound,
    });
  }

  flagMessage(playerId: string, messageId: string, reason?: string): void {
    const player = this.state.players.find((p) => p.id === playerId);
    if (!player || player.type !== 'human' || player.isEliminated) return;
    const message = this.state.messages.find((m) => m.id === messageId);
    if (!message || message.playerId === playerId) return;
    void this.deps.persistence.saveMessageFlag(this.state.roomId, messageId, player.username, message.round, reason);
  }

  // ====== UTILS ======

  private nameOf(id: string): string {
    return this.state.players.find((p) => p.id === id)?.username ?? id;
  }

  private getRandomQuestion(): string {
    const questions = getQuestionsForLanguage(this.state.language === 'en' ? 'en' : 'fr');
    return questions[Math.floor(this.deps.rng() * questions.length)];
  }

  private emitState(): void {
    this.io.to(this.state.roomId).emit('gameState', this.sanitizeState());
  }

  /** Never reveals who is an AI to the clients. */
  private sanitizeState(): Record<string, unknown> {
    const out: Record<string, unknown> = {
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
    if (this.state.phase === 'gameover') out.gameOverReason = this.state.gameOverReason ?? null;
    if (this.state.phase === 'voting' || this.state.phase === 'discussion') out.votes = this.state.votes;
    out.language = this.state.language ?? 'fr';
    return out;
  }

  /** Timers still pending for this room (phases and bots); 0 after game over or abort. */
  pendingTimers(): number {
    return this.phaseTimers.size + this.director.pendingTimers();
  }

  getState(): GameRoomState {
    return this.state;
  }

  getRoomId(): string {
    return this.state.roomId;
  }
}
