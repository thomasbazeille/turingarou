import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
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
  Vote,
} from '../types/game.types.js';
import { ChatProvider } from '../llm/chatClient.js';
import { modelLabel } from '../llm/providerRegistry.js';
import { drawQuestion } from './QuestionBank.js';
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
import { CastMember, drawCast, templatesFor } from './botCast.js';
import {
  BOT_ABSTAIN_PROB,
  BotDirector,
  REPLY_QUOTE_DIRECT_PROB,
  REPLY_QUOTE_NAMING_PROB,
  REPLY_QUOTE_OTHER_PROB,
  VOTE_DEADLINE_MS,
} from './BotDirector.js';
import { RoundRecord } from './botContext.js';
import { buildTranscript, flagResults, PlayerReview, scoreVotes, shareText, Transcript } from './gameReview.js';
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
  /** No human is connected or within their grace any more: the server forgets the room. */
  onVacant: () => void;
}

const defaultDeps: GameRoomDeps = {
  clock: systemClock,
  rng: Math.random,
  names: { add: addPlayerName, pick: pickAIName },
  strategies: { aiPlayer: getRandomAIPlayerStrategy, inspector: getInspectorPromptContent },
  persistence: { saveGameLog, updateHumanProfiles, saveMessageFlag, getRandomHumanProfile },
  log: (line) => console.log(line),
  onVacant: () => {},
};

type PlayerKind = 'human' | 'ai' | 'inspector';

/** What the room knows of a real human's connection. Never part of the game state. */
interface Session {
  /** Secret handed to this player's client only, to take the seat back from a new socket. */
  token: string;
  connected: boolean;
  disconnectedAt: number;
  /** Pending while a disconnected player may still come back. */
  timer: TimerHandle | null;
  /** Grace over or left on purpose: a silent seat that never comes back. */
  gone: boolean;
}

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
/**
 * Everyone answered: the discussion starts then, never before this point of the question phase. A short question
 * is read in about 3 s and a short answer typed in about 4 s: the transition never cuts anyone, and a bot that
 * answers fast can never end the phase before humans plausibly could.
 */
export const QUESTION_MIN_MS = 8000;
export const DISCUSSION_PHASE_MS = 100000;
export const VOTE_PHASE_MS = 30000;
/**
 * Round-end screen: about 5 s of staged reveal (vote count, then the name, then human or AI), then 5 s to read who
 * voted for whom and who is immune, as long as the old screen gave to read it all at once (it lasted 8 s).
 */
export const ENDROUND_MS = 10000;
export const MAX_ROUNDS = 7;
/** In the lobby a dropped player keeps their seat this long, then frees it so the room can still fill. */
export const LOBBY_GRACE_MS = 10_000;
/** Mid-game a dropped human can take their seat back this long; afterwards they stay as a silent player. */
export const RECONNECT_GRACE_MS = 90_000;
/**
 * A vote waiting only on players whose grace ran out closes at this point of the phase, never earlier: every bot has
 * voted by VOTE_DEADLINE_MS, so from then on a missing vote is already known to be a human's and closing without it
 * says nothing about who is an AI. An earlier close with a vote missing would point at that player.
 */
export const LOST_VOTE_CLOSE_MS = VOTE_DEADLINE_MS + 1000;

if (VOTE_DEADLINE_MS >= VOTE_PHASE_MS) throw new Error('bot vote deadline must fall inside the vote phase');
if (QUESTION_MIN_MS >= QUESTION_PHASE_MS) throw new Error('the early end floor must fall inside the question phase');
if (LOST_VOTE_CLOSE_MS >= VOTE_PHASE_MS) throw new Error('the close without lost players must fall inside the vote phase');

/** A private room's host may launch from this many humans: fewer leaves nothing to deduce. */
export const MIN_LAUNCH_HUMANS = 3;

/**
 * AIs at a table of this many seats on the humans' side (an inspector sits there): close to the full game's 3 in 8,
 * never topped up to 8 seats, where 6 AIs would outvote 2 humans every round. 4 humans get 3 AIs: in simulated games
 * (scripts/simulate-game.ts --balance, 200 per table) 4 + 3 ends closest to 5 + 3 when humans vote an AI on purpose
 * 0 or 30 % of the time, 4 + 2 when they do 50 % of the time; how often real humans spot an AI is not measured yet.
 */
export function aiCountFor(humanSide: number): number {
  return humanSide >= 4 ? 3 : 2;
}

/** What kind of table a room is; the default is the public room. */
export interface TableOptions {
  /** Private room: its earliest human still seated is the host and may launch from MIN_LAUNCH_HUMANS humans. */
  hostLaunch?: boolean;
  /** Rematch: every human sits under a name drawn like the AIs', never one of these (the previous game's names). */
  freshNames?: { reserved: string[] };
  /** AIs of a launched table; aiCountFor, unless a simulation compares another scale. */
  aiCountFor?: (humanSide: number) => number;
}

export type LaunchRefusal = 'not_private' | 'not_waiting' | 'not_host' | 'too_few';

/** A lobby seat as the other humans see it: taken, nothing more. */
const HIDDEN_SEAT = { id: '', username: '', color: '', colorName: '', isReady: true, isEliminated: false };

function sameSecret(a: string, b: string): boolean {
  const digest = (x: string) => createHash('sha256').update(x).digest();
  return timingSafeEqual(digest(a), digest(b));
}

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
  private graceTimers: Timers;
  /** Real humans only (inspectors are bots), by player id. */
  private sessions = new Map<string, Session>();
  private vacant = false;
  /** Kind of every player who ever joined, departed humans included (their messages stay in the log). */
  private kinds = new Map<string, PlayerKind>();
  private votesByRound = new Map<number, { voter: string; target: string }[]>();
  /** Every finished vote by player id, revealed with the game over. */
  private voteHistory: { round: number; votes: Vote[]; eliminatedId: string | null }[] = [];
  private eliminationsByRound = new Map<number, { name: string; isAI: boolean }>();
  private questionsByRound = new Map<number, string>();
  private eliminationOrder: string[] = [];
  /** Lines each human flagged, by player id: never shown to anyone before the game over, then only to its author. */
  private flagsBy = new Map<string, string[]>();
  private startedAt = 0;
  /**
   * Votes of the finished round as every browser sees them: one entry per player who could vote, in seat order (never
   * in casting order), a missing vote shown as an abstention. Bots always vote by the deadline, so a missing vote or
   * the casting order would point at humans.
   */
  private revealedVotes: Vote[] = [];
  private abstainersByRound = new Map<number, string[]>();
  /** Votes, abstentions, chat lines and reply quotes by kind of player, for the game-telemetry line. */
  private ux: Record<PlayerKind, { votes: number; abstain: number; noVote: number; lines: number; replies: number }> = {
    human: { votes: 0, abstain: 0, noVote: 0, lines: 0, replies: 0 },
    ai: { votes: 0, abstain: 0, noVote: 0, lines: 0, replies: 0 },
    inspector: { votes: 0, abstain: 0, noVote: 0, lines: 0, replies: 0 },
  };
  /** True once all humans have left: blocks every further timer, bot call and join. */
  private aborted = false;
  /** Bots are being created for a full room: no further join. */
  private starting = false;
  private table: TableOptions;

  constructor(
    roomId: string,
    io: RoomEmitter,
    llmProvider: ChatProvider | ChatProvider[],
    aiCount: number = 1,
    deps: Partial<GameRoomDeps> = {},
    table: TableOptions = {}
  ) {
    this.table = table;
    this.io = io;
    this.llmProviders = Array.isArray(llmProvider) ? llmProvider : [llmProvider];
    this.deps = { ...defaultDeps, ...deps };
    this.phaseTimers = new Timers(this.deps.clock);
    this.graceTimers = new Timers(this.deps.clock);
    this.director = new BotDirector(
      {
        state: () => this.state,
        history: () => this.history(),
        postMessage: (id, text, replyToId) => this.addMessage(id, text, replyToId),
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
    // A rematch would hand the new AIs away if the humans kept the names everyone just saw revealed.
    const name = this.table.freshNames ? this.deps.names.pick(this.takenNames()) : username;

    const player: HumanPlayer = {
      type: 'human',
      id: this.newPlayerId(),
      socketId,
      username: name,
      color: color.hex,
      colorName: color.name,
      isReady: true,
      isEliminated: false,
    };
    this.state.players.push(player);
    this.kinds.set(player.id, 'human');
    this.sessions.set(player.id, { token: randomBytes(24).toString('base64url'), connected: true, disconnectedAt: 0, timer: null, gone: false });
    this.deps.names.add(name);
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

    const player: HumanPlayer = {
      type: 'human',
      id: this.newPlayerId(),
      socketId: '',
      username: this.deps.names.pick(this.takenNames()),
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
    await this.start();
  }

  private async start(): Promise<void> {
    this.starting = true;
    await this.addAIPlayers();
    if (this.aborted) return;
    this.shufflePlayers();
    this.startGame();
  }

  /** Names no newly drawn player may take: everyone seated, and in a rematch every name of the previous game. */
  private takenNames(): string[] {
    return [...this.state.players.map((p) => p.username), ...(this.table.freshNames?.reserved ?? [])];
  }

  private humanSeats(): number {
    return this.state.players.filter((p) => this.kinds.get(p.id) === 'human').length;
  }

  /** The earliest human still seated in a private room's lobby. */
  private hostId(): string | null {
    if (!this.table.hostLaunch) return null;
    return this.state.players.find((p) => this.kinds.get(p.id) === 'human')?.id ?? null;
  }

  /**
   * The host of a private room starts now with the humans present; the AIs added follow the table size instead of
   * filling it to 8. Refused to anyone else, below MIN_LAUNCH_HUMANS humans, and once the room no longer waits.
   */
  async launch(socketId: string): Promise<LaunchRefusal | null> {
    if (!this.table.hostLaunch) return 'not_private';
    if (!this.isJoinable()) return 'not_waiting';
    const id = this.playerIdBySocket(socketId);
    if (!id || id !== this.hostId()) return 'not_host';
    if (this.humanSeats() < MIN_LAUNCH_HUMANS) return 'too_few';
    this.state.aiCount = (this.table.aiCountFor ?? aiCountFor)(this.state.players.length);
    this.state.maxPlayers = this.state.players.length + this.state.aiCount;
    await this.start();
    return null;
  }

  /** Secret of a human's seat, for their own client only (joinSuccess); never in the game state. */
  sessionToken(playerId: string): string | null {
    return this.sessions.get(playerId)?.token ?? null;
  }

  /** The seat a socket plays for. A socket replaced by a resume, or of a player who left, plays for nobody. */
  playerIdBySocket(socketId: string): string | null {
    if (!socketId) return null;
    const player = this.state.players.find((p) => p.type === 'human' && p.socketId === socketId);
    const session = player ? this.sessions.get(player.id) : undefined;
    return player && session && !session.gone ? player.id : null;
  }

  /**
   * A human's socket dropped. Nothing public changes: an AI never disconnects, so the seat stays exactly as it was
   * while the player may come back (LOBBY_GRACE_MS in the lobby, RECONNECT_GRACE_MS mid-game).
   */
  disconnect(socketId: string): void {
    const id = this.playerIdBySocket(socketId);
    const session = id ? this.sessions.get(id) : undefined;
    if (!id || !session || !session.connected) return;
    session.connected = false;
    session.disconnectedAt = this.now();
    // Nothing waits for anyone once the game is over or aborted; after the game over the player may still resume.
    if (this.state.phase === 'gameover' || this.aborted) {
      this.notifyIfVacant();
      return;
    }
    const inLobby = this.state.phase === 'waiting' && !this.starting;
    session.timer = this.graceTimers.after(inLobby ? LOBBY_GRACE_MS : RECONNECT_GRACE_MS, () => this.graceCheck(id));
  }

  /** Back to home on purpose: the lobby frees the seat now, a game keeps it as a silent one. */
  leave(socketId: string): void {
    const id = this.playerIdBySocket(socketId);
    if (!id) return;
    if (this.state.phase === 'waiting' && !this.starting) this.removeFromLobby(id);
    else this.markGone(id);
    this.notifyIfVacant();
  }

  /**
   * A client back with its token takes its seat on a new socket and plays on. Refused for a token of another room,
   * once the grace is over, after the player left, or in an aborted room. Nothing is broadcast.
   */
  resume(socketId: string, token: string): { playerId: string; previousSocketId: string } | null {
    if (!socketId || typeof token !== 'string' || !token || this.aborted) return null;
    for (const [id, session] of this.sessions) {
      if (session.gone || !sameSecret(session.token, token)) continue;
      const player = this.state.players.find((p): p is HumanPlayer => p.id === id && p.type === 'human');
      if (!player) return null;
      const previousSocketId = player.socketId;
      player.socketId = socketId;
      this.graceTimers.cancel(session.timer);
      session.timer = null;
      session.connected = true;
      return { playerId: id, previousSocketId };
    }
    return null;
  }

  /** Connected, or disconnected and still within their grace. */
  private present(id: string): boolean {
    const session = this.sessions.get(id);
    return !!session && (session.connected || session.timer !== null);
  }

  /** Some human is connected or may still come back; once false the server can forget the room. */
  hasLiveHuman(): boolean {
    return [...this.sessions.keys()].some((id) => this.present(id));
  }

  private graceCheck(id: string): void {
    const session = this.sessions.get(id);
    if (!session || session.connected) return;
    session.timer = null;
    if (this.state.phase === 'waiting' && !this.starting && !this.aborted) {
      this.removeFromLobby(id);
      this.notifyIfVacant();
      return;
    }
    // Dropped in the lobby, but the game started meanwhile: the mid-game grace applies.
    const left = session.disconnectedAt + RECONNECT_GRACE_MS - this.now();
    if (left > 0 && !this.aborted) {
      session.timer = this.graceTimers.after(left, () => this.graceCheck(id));
      return;
    }
    this.markGone(id);
    this.notifyIfVacant();
  }

  private removeFromLobby(id: string): void {
    this.graceTimers.cancel(this.sessions.get(id)?.timer);
    this.sessions.delete(id);
    this.state.players = this.state.players.filter((p) => p.id !== id);
    this.emitState();
  }

  /** The seat stays, silent like a taciturn AI: still a vote target, no longer awaited, never resumed. */
  private markGone(id: string): void {
    const session = this.sessions.get(id);
    if (!session || session.gone) return;
    this.graceTimers.cancel(session.timer);
    session.timer = null;
    session.connected = false;
    session.gone = true;
    if (this.abortIfNoLiveHuman()) return;
    this.tryEndVotingEarly();
  }

  private isGone(id: string): boolean {
    return this.sessions.get(id)?.gone === true;
  }

  /** A game where no real human still plays (connected or in grace; inspectors are bots) stops instead of burning model calls. */
  private abortIfNoLiveHuman(): boolean {
    const inProgress = this.starting || !['waiting', 'gameover'].includes(this.state.phase);
    if (!inProgress || this.aborted) return false;
    if (this.state.players.some((p) => !p.isEliminated && this.present(p.id))) return false;
    this.abortGame();
    return true;
  }

  private notifyIfVacant(): void {
    if (this.vacant || this.hasLiveHuman()) return;
    this.vacant = true;
    this.deps.onVacant();
  }

  private abortGame(): void {
    if (this.aborted) return;
    this.aborted = true;
    this.deps.log(`[GameRoom ${this.state.roomId}] No human connected or in grace — aborting game.`);
    this.phaseTimers.clearAll();
    this.phaseTimer = null;
    this.graceTimers.clearAll();
    for (const session of this.sessions.values()) session.timer = null;
    this.director.dispose();
    this.logTelemetry('aborted');
    // Back to waiting so the frontend shows the waiting screen.
    this.state.phase = 'waiting';
    this.emitState();
    this.notifyIfVacant();
  }

  private async addAIPlayers(): Promise<void> {
    const usedPersonaNames = new Set<string>();
    const cast = drawCast(this.state.aiCount, this.deps.rng);
    for (const [i, personality] of this.generateAIPersonalities(cast).entries()) {
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
      const profile = cast[i].profile;
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
            conversationRole: cast[i].conversationRole,
          },
          { llm: this.director.llmSink, speech: this.director.speechSink, rng: this.deps.rng }
        )
      );
      this.deps.log(
        `[GameRoom] AI ${personality.name} uses provider: ${provider.name}, style ${personality.responseStyle}, role ${cast[i].conversationRole}, case ${profile.caseProfile}` +
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

  private generateAIPersonalities(cast: CastMember[]): AIPersonality[] {
    const used = this.takenNames();
    const templates = templatesFor(PERSONALITY_TEMPLATES, cast, this.deps.rng);
    const result: AIPersonality[] = [];
    for (let i = 0; i < cast.length; i++) {
      const name = this.deps.names.pick(used);
      used.push(name);
      this.deps.names.add(name);
      const t = templates[i];
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
    this.startedAt = this.now();
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
    this.revealedVotes = [];
    this.state.endRoundEndTime = null;
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
    this.revealedVotes = this.revealVotes();
    const voteCounts = new Map<string, number>();
    for (const vote of this.state.votes) if (vote.targetId) voteCounts.set(vote.targetId, (voteCounts.get(vote.targetId) ?? 0) + 1);

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
      this.state.votes.flatMap((v) => (v.targetId ? [{ voter: this.nameOf(v.voterId), target: this.nameOf(v.targetId) }] : []))
    );
    this.abstainersByRound.set(this.state.currentRound, this.revealedVotes.filter((v) => !v.targetId).map((v) => this.nameOf(v.voterId)));
    this.voteHistory.push({ round: this.state.currentRound, votes: [...this.revealedVotes], eliminatedId: eliminatedId || null });
    if (eliminated) {
      this.eliminationsByRound.set(this.state.currentRound, { name: eliminated.username, isAI: eliminated.type !== 'human' });
      this.eliminationOrder.push(eliminated.id);
    }

    this.state.phase = 'endround';
    this.state.voteEndTime = null;
    this.state.endRoundEndTime = this.now() + ENDROUND_MS;
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
    // The vote may have just eliminated the last human still playing.
    if (this.abortIfNoLiveHuman()) return;

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
    this.state.endRoundEndTime = null;
    this.phaseTimers.clearAll();
    this.phaseTimer = null;
    // The game is over: a player still away may come back to see the end, but nothing waits for anyone any more.
    this.graceTimers.clearAll();
    for (const session of this.sessions.values()) session.timer = null;
    this.director.dispose();
    this.emitState();
    this.emitReviews();
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
        votes: [...(this.votesByRound.get(rd) ?? []), ...(this.abstainersByRound.get(rd) ?? []).map((voter) => ({ voter, target: 'nobody (abstained)' }))],
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
    this.deps.log(`[game-telemetry] ${JSON.stringify({ room: this.state.roomId, result, rounds: this.state.currentRound, ...this.director.telemetry(), roundUx: this.roundUxTelemetry() })}`);
  }

  // ====== ACTIONS ======

  /**
   * Returns true when the message was posted. Single exit to the chat for humans and bots alike. A reply-to that
   * names no earlier message of this room is dropped, the line itself is still posted.
   */
  addMessage(playerId: string, content: string, replyToId?: unknown): boolean {
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

    const quoted = this.quotableMessage(replyToId);
    const message: GameMessage = {
      id: this.newId('msg'),
      playerId,
      playerName: player.username,
      content,
      timestamp: this.now(),
      phase: this.state.phase,
      round: this.state.currentRound,
      ...(quoted ? { replyToId: quoted.id } : {}),
    };
    this.state.messages.push(message);
    this.emitState();

    const kind = this.kinds.get(playerId);
    if (kind) {
      this.ux[kind].lines++;
      if (quoted) this.ux[kind].replies++;
    }
    if (kind !== 'ai') this.director.onPlayerMessage(message, kind === 'human');
    return true;
  }

  addAnswer(playerId: string, answer: string): void {
    if (this.aborted || this.state.phase !== 'question') return;
    const player = this.state.players.find((p) => p.id === playerId);
    if (!player || player.isEliminated) return;
    this.state.answers = this.state.answers.filter((a) => a.playerId !== playerId);
    this.state.answers.push({ playerId, playerName: player.username, answer, timestamp: this.now() });
    // No broadcast: a state sent now would say that someone answered at this instant. The author gets answerOf.

    // Everyone answered: discussion starts now, or at QUESTION_MIN_MS if that is later. A bot that skips keeps the
    // phase open like a silent human would, otherwise an early close with one missing answer would point at a bot.
    const answered = new Set(this.state.answers.map((a) => a.playerId));
    if (this.state.players.filter((p) => !p.isEliminated).every((p) => answered.has(p.id))) {
      const questionStart = (this.state.questionEndTime ?? this.now()) - QUESTION_PHASE_MS;
      this.schedulePhase(Math.max(0, questionStart + QUESTION_MIN_MS - this.now()), () => this.startDiscussion());
    }
  }

  /**
   * targetId null: an abstention, which counts as a vote rendered (the vote may close early) and eliminates nobody.
   * Nothing says who voted before the round end: no system line, only an anonymous count in the state.
   */
  addVote(voterId: string, targetId: string | null): void {
    if (this.aborted || this.state.phase !== 'voting') return;
    if (voterId === targetId || this.state.votes.some((v) => v.voterId === voterId)) return;
    if (targetId !== null) {
      const target = this.state.players.find((p) => p.id === targetId && !p.isEliminated);
      if (!target || targetId === this.state.protectedPlayerId) return;
    }
    const voter = this.state.players.find((p) => p.id === voterId);
    if (!voter || voter.isEliminated) return;

    this.state.votes.push({ voterId, targetId });
    this.emitState();
    this.tryEndVotingEarly();
  }

  /** This player's own answer of the round, for their client only (never broadcast before the question ends). */
  answerOf(playerId: string): { round: number; answer: string } | null {
    const own = this.state.answers.find((a) => a.playerId === playerId);
    return own ? { round: this.state.currentRound, answer: own.answer } : null;
  }

  /** Answers as browsers see them once the question is over: in seat order, without the time each one came in. */
  private shownAnswers(answers: QuestionAnswer[]): Omit<QuestionAnswer, 'timestamp'>[] {
    const byPlayer = new Map(answers.map((a) => [a.playerId, a]));
    return this.state.players.flatMap((p) => {
      const a = byPlayer.get(p.id);
      return a ? [{ playerId: a.playerId, playerName: a.playerName, answer: a.answer }] : [];
    });
  }

  /** This player's own vote of the round, for their client only (never broadcast before the round end). */
  voteOf(playerId: string): { round: number; targetId: string | null } | null {
    const vote = this.state.votes.find((v) => v.voterId === playerId);
    return vote ? { round: this.state.currentRound, targetId: vote.targetId } : null;
  }

  private revealVotes(): Vote[] {
    const cast = new Map(this.state.votes.map((v) => [v.voterId, v.targetId]));
    const out: Vote[] = [];
    for (const p of this.state.players) {
      if (p.isEliminated) continue;
      const kind = this.kinds.get(p.id);
      const targetId = cast.has(p.id) ? cast.get(p.id)! : null;
      if (kind) this.ux[kind][!cast.has(p.id) ? 'noVote' : targetId ? 'votes' : 'abstain']++;
      out.push({ voterId: p.id, targetId });
    }
    return out;
  }

  /** A message of this room a new line may quote: an existing player line, never a system line. */
  private quotableMessage(id: unknown): GameMessage | null {
    if (typeof id !== 'string' || !id) return null;
    return this.state.messages.find((m) => m.id === id && m.playerId !== 'system') ?? null;
  }

  /** Observed rates on both sides and the bots' target rates, to recalibrate the bots on real games. */
  private roundUxTelemetry(): Record<string, unknown> {
    return {
      ...this.ux,
      botTargets: { abstain: BOT_ABSTAIN_PROB, replyDirect: REPLY_QUOTE_DIRECT_PROB, replyNaming: REPLY_QUOTE_NAMING_PROB, replyOther: REPLY_QUOTE_OTHER_PROB },
    };
  }

  private tryEndVotingEarly(): void {
    if (this.state.phase !== 'voting') return;
    const active = this.state.players.filter((p) => !p.isEliminated);
    const voted = new Set(this.state.votes.map((v) => v.voterId));
    const missing = active.filter((p) => !voted.has(p.id));
    if (active.length > 0 && missing.length === 0) {
      this.schedulePhase(0, () => this.processVotes());
    } else if (missing.length > 0 && missing.every((p) => this.isGone(p.id))) {
      const voteStart = (this.state.voteEndTime ?? this.now()) - VOTE_PHASE_MS;
      this.schedulePhase(voteStart + LOST_VOTE_CLOSE_MS - this.now(), () => this.processVotes());
    }
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
    if (!message || message.playerId === playerId || message.playerId === 'system') return;
    const own = this.flagsBy.get(playerId) ?? [];
    if (own.includes(messageId)) return;
    this.flagsBy.set(playerId, [...own, messageId]);
    void this.deps.persistence.saveMessageFlag(this.state.roomId, messageId, player.username, message.round, reason);
  }

  // ====== UTILS ======

  private nameOf(id: string): string {
    return this.state.players.find((p) => p.id === id)?.username ?? id;
  }

  private getRandomQuestion(): string {
    const asked = Array.from({ length: this.state.currentRound - 1 }, (_, i) => this.questionsByRound.get(i + 1) ?? '');
    return drawQuestion(this.state.language === 'en' ? 'en' : 'fr', asked, this.deps.rng);
  }

  private emitState(): void {
    if (this.inLobby()) {
      for (const p of this.state.players) {
        if (p.type === 'human' && p.socketId) this.io.to(p.socketId).emit('gameState', this.lobbyState(p.id));
      }
      return;
    }
    this.io.to(this.state.roomId).emit('gameState', this.sanitizeState());
  }

  /**
   * What the browser of this socket was last sent, for a client that just joined or took its seat back. Mid-game every
   * browser gets the same state; in the lobby each one gets its own.
   */
  publicState(socketId?: string): Record<string, unknown> {
    if (this.inLobby()) return this.lobbyState(socketId ? this.playerIdBySocket(socketId) : null);
    return this.sanitizeState();
  }

  /** Before the game starts only humans sit here: anyone listed now would be known human once the AIs join. */
  private inLobby(): boolean {
    return this.state.phase === 'waiting' && !this.aborted;
  }

  /** The lobby as one human sees it: their own seat, how many other seats are taken, whether they may launch. */
  private lobbyState(viewerId: string | null): Record<string, unknown> {
    const out = this.sanitizeState();
    out.players = (out.players as { id: string }[]).map((p) => (p.id === viewerId ? p : { ...HIDDEN_SEAT }));
    const host = viewerId !== null && viewerId === this.hostId();
    out.lobby = {
      private: !!this.table.hostLaunch,
      host,
      launchFrom: this.table.hostLaunch ? MIN_LAUNCH_HUMANS : null,
      launchAIs: this.table.hostLaunch ? (this.table.aiCountFor ?? aiCountFor)(this.state.players.length) : null,
      canLaunch: host && this.isJoinable() && this.humanSeats() >= MIN_LAUNCH_HUMANS,
      freshName: !!this.table.freshNames,
    };
    return out;
  }

  /** Who each player was, and the model behind each bot (inspectors are bots on the humans' side). Game over only. */
  private revealOf(id: string): { isAI: boolean; model?: string } {
    const bot = this.director.bots().find((b) => b.id === id);
    return bot ? { isAI: true, model: modelLabel(bot.providerName) } : { isAI: false };
  }

  /** What this human gets at the game over, for their client only; null before it, and for any other seat. */
  reviewOf(playerId: string): PlayerReview | null {
    if (this.state.phase !== 'gameover' || !this.sessions.has(playerId)) return null;
    const isAI = (id: string) => this.revealOf(id).isAI;
    const score = scoreVotes(playerId, this.voteHistory, isAI);
    return {
      gameKey: `${this.state.roomId}-${this.startedAt}`,
      score,
      share: shareText(score, this.state.language ?? 'fr'),
      flags: flagResults(this.flagsBy.get(playerId) ?? [], this.state.messages, isAI),
    };
  }

  /** Each connected human gets their own review on their own socket; one away gets it when they resume. */
  private emitReviews(): void {
    for (const p of this.state.players) {
      if (p.type !== 'human' || !p.socketId || !this.sessions.get(p.id)?.connected) continue;
      this.io.to(p.socketId).emit('myReview', this.reviewOf(p.id));
    }
  }

  /** Every round of a finished game with each author revealed, for the replay (game over only). */
  private transcript(): Transcript {
    return buildTranscript({
      players: this.state.players.map((p) => ({ id: p.id, name: p.username, color: p.color, ...this.revealOf(p.id) })),
      rounds: this.state.currentRound,
      question: (rd) => this.questionsByRound.get(rd) ?? '',
      answers: (rd) => (rd === this.state.currentRound ? this.state.answers : this.state.answersByRound?.[rd] ?? []),
      messages: this.state.messages,
      eliminatedId: (rd) => this.voteHistory.find((r) => r.round === rd)?.eliminatedId ?? null,
    });
  }

  /** Never reveals who is an AI to the clients before the game is over. */
  private sanitizeState(): Record<string, unknown> {
    const over = this.state.phase === 'gameover';
    const out: Record<string, unknown> = {
      ...this.state,
      players: this.state.players.map((p) => ({
        id: p.id,
        username: p.username,
        color: p.color,
        colorName: p.colorName,
        isReady: p.isReady,
        isEliminated: p.isEliminated,
        ...(over ? this.revealOf(p.id) : {}),
      })),
      eliminationOrder: [...this.eliminationOrder],
    };
    // Answers stay hidden until the question ends (each author gets their own through answerOf), then show in seat
    // order without their time: who answered, when or in what order would point at the bots.
    const answered = ['discussion', 'voting', 'endround', 'gameover'].includes(this.state.phase);
    out.answers = answered ? this.shownAnswers(this.state.answers) : [];
    if (this.state.answersByRound) {
      out.answersByRound = Object.fromEntries(Object.entries(this.state.answersByRound).map(([rd, list]) => [rd, this.shownAnswers(list)]));
    }
    // Votes stay hidden until the round end: each player gets their own through voteOf, everyone an anonymous count.
    out.votes = this.state.phase === 'endround' || over ? [...this.revealedVotes] : [];
    if (this.state.phase === 'voting') out.voteCount = this.state.votes.length;
    if (this.state.phase === 'endround') {
      out.eliminatedPlayerId = this.state.eliminatedPlayerId ?? null;
      out.eliminatedPlayerIsAI = this.state.eliminatedPlayerIsAI ?? null;
      out.eliminatedAiCount = this.state.players.filter((p) => p.isEliminated && p.type === 'ai').length;
    }
    if (over) {
      out.gameOverReason = this.state.gameOverReason ?? null;
      out.voteHistory = this.voteHistory.map((r) => ({ ...r, votes: [...r.votes] }));
      out.transcript = this.transcript();
    }
    out.language = this.state.language ?? 'fr';
    return out;
  }

  /** Timers still pending for this room (phases, graces and bots); 0 after game over or abort. */
  pendingTimers(): number {
    return this.phaseTimers.size + this.graceTimers.size + this.director.pendingTimers();
  }

  getState(): GameRoomState {
    return this.state;
  }

  getRoomId(): string {
    return this.state.roomId;
  }
}
