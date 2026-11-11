import { LLMCallEvent } from '../llm/llmCall.js';
import { GameFormat, GameMessage, GameRoomState } from '../types/game.types.js';
import { AISpeechEvent } from './aiSpeech.js';
import { Bot } from './Bot.js';
import { BotView, RoundRecord } from './botContext.js';
import { DecisionCue, DirectAddress } from './botPrompts.js';
import { Clock, TimerHandle, Timers } from './clock.js';
import { addressedTo } from './directAddress.js';
import { checkMessage } from './formGate.js';
import {
  answerTarget,
  botFloorWaitMs,
  cooldownMs,
  discussionDelay,
  firstMessageDelay,
  groupPaceOf,
  PACE_WINDOW_LINES,
  Pace,
  paceOf,
  skipProbability,
  voteDelay,
} from './humanTiming.js';

/** No bot line in the last 10 s of a discussion: a message landing while the vote opens reads as scripted. */
export const DISCUSSION_LOCK_MS = 10000;
/** Every bot vote is cast by then (the vote phase lasts 30 s), with a logged fallback when the model gave nothing usable. */
export const VOTE_DEADLINE_MS = 25000;
/** Share of direct addresses a bot answers for sure; humans ignore some too, but never twice in a row here. */
const DIRECT_REPLY_PROB = 0.85;
/** A named or accused bot that still has no usable model answer by then posts a short canned reply instead. */
const DIRECT_BUDGET_MS = 6500;
const SILENCE_MS = 12000;
const TICK_MIN_MS = 3000;
const TICK_SPREAD_MS = 3000;
const REACTION_MIN_MS = 2000;
const REACTION_SPREAD_MS = 4000;
const BURST_PROB = 0.15;

const CANNED: Record<'fr' | 'en', { accusation: string[]; named: string[] }> = {
  fr: {
    accusation: ['quoi ?', 'mdr non', 'pourquoi moi', "n'importe quoi", 't serieux la ?', 'euh non', 'ah bon pourquoi', 'c toi qui dis ca', 'hein ? non'],
    named: ['oui ?', 'hein ?', 'quoi ?', 'jsp', 'attends quoi', 'bah jsp'],
  },
  en: {
    accusation: ['what?', 'lol no', 'why me', 'nope', 'seriously?', 'huh no', 'says you', 'wait what? no'],
    named: ['yeah?', 'huh?', 'what?', 'idk', 'wait what', 'hmm idk'],
  },
};

export interface DirectorRoom {
  state(): Readonly<GameRoomState>;
  history(): RoundRecord[];
  postMessage(botId: string, text: string): boolean;
  submitAnswer(botId: string, text: string): void;
  castVote(botId: string, targetId: string): void;
}

export interface DirectorDeps {
  clock: Clock;
  rng: () => number;
  log: (line: string) => void;
}

/** Bot-side event (gate, parse, fallback vote, direct reply, dropped post). Logged as JSON lines, no DB table. */
export interface AIEventLog {
  round: number;
  phase: string;
  player: string;
  kind: string;
  reason: string | null;
  detail: string | null;
  ts: number;
}

interface Job {
  direct: DirectAddress | null;
  /** What the line reacts to: the direct message, else the last line of another player when the bot started deciding. */
  triggerAt: number;
  /** thinking = waiting for the model; scheduled = text ready, waiting for its posting time. */
  stage: 'thinking' | 'scheduled';
  timer: TimerHandle | null;
}

interface Slot {
  bot: Bot;
  job: Job | null;
  nextAllowedAt: number;
  ignoredDirect: number;
}

/**
 * Every bot behaviour of a room: answers, discussion ticks, direct replies, posting times, votes.
 * Each phase start bumps an epoch and clears every timer; any model result that comes back under an older epoch,
 * or for a superseded job, is dropped. The room only calls the phase hooks and receives posts, answers and votes.
 */
export class BotDirector {
  private slots = new Map<string, Slot>();
  private timers: Timers;
  private epoch = 0;
  private disposed = false;
  private format: GameFormat | null = null;
  private discussionStartedAt = 0;
  private lastBotPostAt = Number.NEGATIVE_INFINITY;
  private recentBotPosts: number[] = [];
  private reactionTick: TimerHandle | null = null;
  private llmEvents: (LLMCallEvent & { round: number; phase: string })[] = [];
  /** Trigger-to-chat delay of every posted bot line (analysis C, T12), summarised in the telemetry line. */
  private postDelays: { direct: boolean; ms: number }[] = [];
  private events: AIEventLog[] = [];
  /** Regular decisions started per pace, for the telemetry line. */
  private paceLaunches: Record<Pace, number> = { under: 0, balanced: 0, over: 0 };

  constructor(private readonly room: DirectorRoom, private readonly deps: DirectorDeps) {
    this.timers = new Timers(deps.clock);
  }

  readonly llmSink = (e: LLMCallEvent): void => {
    const s = this.room.state();
    this.llmEvents.push({ ...e, round: s.currentRound, phase: s.phase });
  };

  readonly speechSink = (e: AISpeechEvent): void => {
    this.logEvent(e.player, e.kind, e.reason, e.detail);
  };

  addBot(bot: Bot): void {
    this.slots.set(bot.id, { bot, job: null, nextAllowedAt: 0, ignoredDirect: 0 });
  }

  bots(): Bot[] {
    return [...this.slots.values()].map((s) => s.bot);
  }

  isBot(id: string): boolean {
    return this.slots.has(id);
  }

  roleOf(id: string): 'ai' | 'inspector' | null {
    return this.slots.get(id)?.bot.role ?? null;
  }

  pendingTimers(): number {
    return this.timers.size;
  }

  logEvent(player: string, kind: string, reason?: string, detail?: string): void {
    const s = this.room.state();
    const event: AIEventLog = { round: s.currentRound, phase: s.phase, player, kind, reason: reason ?? null, detail: detail ?? null, ts: this.now() };
    this.events.push(event);
    this.deps.log(`[ai-event] ${JSON.stringify({ room: s.roomId, ...event })}`);
  }

  // ====== PHASE HOOKS ======

  /** The format arrives with the first question: no prompt can be built before the language is known. */
  startQuestion(format: GameFormat): void {
    this.format = format;
    const epoch = this.beginPhase();
    const startedAt = this.now();
    const alive = () => this.isLive(epoch, 'question');
    // Each answer lands at its own target time as soon as ITS model returns: no barrier on the slowest provider,
    // no shared gate that made every bot answer in the same burst.
    for (const slot of this.activeSlots()) {
      const due = startedAt + answerTarget(this.deps.rng);
      slot.bot
        .answer(this.view(), alive)
        .then((text) => {
          if (!text || !alive()) return;
          const wait = Math.max(200 + this.deps.rng() * 800, due - this.now());
          this.timers.after(wait, () => {
            if (alive()) this.room.submitAnswer(slot.bot.id, text);
          });
        })
        .catch((err) => this.logEvent(slot.bot.name, 'answer_error', String(err).slice(0, 160)));
    }
  }

  startDiscussion(): void {
    const epoch = this.beginPhase();
    this.discussionStartedAt = this.now();
    this.lastBotPostAt = Number.NEGATIVE_INFINITY;
    this.recentBotPosts = [];
    for (const slot of this.slots.values()) slot.nextAllowedAt = 0;
    const loop = () => {
      if (!this.isLive(epoch, 'discussion') || this.remaining() <= DISCUSSION_LOCK_MS) return;
      this.tick(epoch);
      this.timers.after(TICK_MIN_MS + this.deps.rng() * TICK_SPREAD_MS, loop);
    };
    this.timers.after(TICK_MIN_MS + this.deps.rng() * TICK_SPREAD_MS, loop);
  }

  /**
   * Bots vote on a FRESH context, the model is asked right away, the vote lands at a human-plausible time, and a
   * deadline casts a logged fallback vote instead of a silent abstention.
   */
  startVoting(): void {
    const epoch = this.beginPhase();
    const voteStart = this.now();
    const alive = () => this.isLive(epoch, 'voting');
    const s = this.room.state();
    const eligible = s.players.filter((p) => !p.isEliminated && p.id !== s.protectedPlayerId);
    for (const slot of this.activeSlots()) {
      const candidates = eligible.filter((p) => p.id !== slot.bot.id).map((p) => ({ id: p.id, username: p.username }));
      if (candidates.length === 0) continue;
      let cast = false;
      const castVote = (targetId: string | null, reason: string | null) => {
        if (cast || !alive()) return;
        cast = true;
        let target = targetId;
        if (!target) {
          target = this.fallbackTarget(slot.bot, candidates);
          this.logEvent(slot.bot.name, 'vote_fallback', reason ?? 'unknown', this.nameOf(target));
        }
        this.room.castVote(slot.bot.id, target);
      };
      const deadline = this.timers.after(Math.max(1000, voteStart + VOTE_DEADLINE_MS - this.now()), () => castVote(null, 'deadline'));
      const landAt = voteStart + voteDelay(this.deps.rng);
      slot.bot
        .vote(this.view(), candidates, alive)
        .catch((err) => {
          this.logEvent(slot.bot.name, 'vote_error', String(err).slice(0, 160));
          return { targetId: null, reason: 'llm_failed' as const };
        })
        .then((r) => {
          if (cast || !alive()) return;
          this.timers.after(Math.max(0, landAt - this.now()), () => {
            this.timers.cancel(deadline);
            castVote(r.targetId, r.reason);
          });
        });
    }
  }

  /** Any phase without bot activity (endround). In-flight model calls finish, their results are dropped. */
  stop(): void {
    this.beginPhase();
  }

  dispose(): void {
    this.stop();
    this.disposed = true;
  }

  /**
   * A player (human, or inspector posing as one) posted. A named or accused bot starts deciding within a second,
   * superseding whatever it was about to say: silence after "lucas t'es un bot ?" is the loudest tell there is.
   * Real human lines also schedule one coalesced reaction tick.
   */
  onPlayerMessage(message: GameMessage, fromRealHuman: boolean): void {
    const epoch = this.epoch;
    if (!this.isLive(epoch, 'discussion') || this.remaining() <= DISCUSSION_LOCK_MS) return;
    const discussion = this.discussionMessages();
    const idx = discussion.findIndex((m) => m.id === message.id);
    const previous = idx > 0 ? discussion[idx - 1] : undefined;
    for (const slot of this.activeSlots()) {
      if (slot.bot.id === message.playerId || slot.job?.direct) continue;
      const verdict = addressedTo(message.content, slot.bot.name, { repliesToPlayer: previous?.playerId === slot.bot.id });
      if (!verdict.direct) continue;
      if (slot.ignoredDirect === 0 && this.deps.rng() >= DIRECT_REPLY_PROB) {
        slot.ignoredDirect++;
        this.logEvent(slot.bot.name, 'direct_ignored', verdict.accusation ? 'accusation' : 'named', message.content.slice(0, 120));
        continue;
      }
      slot.ignoredDirect = 0;
      if (slot.job) {
        this.timers.cancel(slot.job.timer);
        this.logEvent(slot.bot.name, 'superseded', slot.job.stage);
      }
      const direct: DirectAddress = { from: message.playerName, content: message.content, accusation: verdict.accusation, at: message.timestamp };
      const job: Job = { direct, triggerAt: direct.at, stage: 'thinking', timer: null };
      slot.job = job;
      job.timer = this.timers.after(Math.floor(this.deps.rng() * 1000), () => {
        if (!this.isLive(epoch, 'discussion') || slot.job !== job) return;
        job.timer = this.timers.after(direct.at + DIRECT_BUDGET_MS - this.now(), () => this.directFallback(slot, job, epoch, 'budget'));
        void this.runDecision(slot, job, epoch, { direct });
      });
    }
    if (fromRealHuman && !this.reactionTick) {
      this.reactionTick = this.timers.after(REACTION_MIN_MS + this.deps.rng() * REACTION_SPREAD_MS, () => {
        this.reactionTick = null;
        if (this.isLive(epoch, 'discussion')) this.tick(epoch);
      });
    }
  }

  // ====== DISCUSSION ======

  /** One selection pass: synchronous, so two ticks never pick the same bot; each chosen bot then decides on its own. */
  private tick(epoch: number): void {
    if (this.remaining() <= DISCUSSION_LOCK_MS) return;
    const now = this.now();
    const discussion = this.discussionMessages();
    const lastAt = discussion.length > 0 ? discussion[discussion.length - 1].timestamp : this.discussionStartedAt;
    const anyBusy = [...this.slots.values()].some((s) => s.job);
    const free = this.shuffle(this.activeSlots().filter((s) => !s.job && s.nextAllowedAt <= now));
    // Nobody has said anything for 12 s: one bot breaks the silence instead of everyone waiting for everyone, the one
    // that spoke least, a quick one on a tie.
    if (!anyBusy && free.length > 0 && now - lastAt > SILENCE_MS && now - this.discussionStartedAt > 8000) {
      const lines = discussion.slice(-PACE_WINDOW_LINES);
      const own = (s: Slot) => lines.filter((m) => m.playerId === s.bot.id).length * 2 + (s.bot.responseStyle === 'quick' ? 0 : 1);
      const speaker = free.reduce((a, b) => (own(b) < own(a) ? b : a));
      this.logEvent(speaker.bot.name, 'watchdog');
      this.launch(speaker, epoch, { quiet: true });
    }
    for (const slot of free) {
      const pace = this.paceFor(slot);
      if (slot.job || this.deps.rng() < skipProbability(slot.bot.responseStyle, pace)) continue;
      this.paceLaunches[pace]++;
      this.launch(slot, epoch, { pace });
    }
  }

  private launch(slot: Slot, epoch: number, cue: DecisionCue): void {
    const others = this.discussionMessages().filter((m) => m.playerId !== slot.bot.id);
    const triggerAt = others.length > 0 ? others[others.length - 1].timestamp : this.discussionStartedAt;
    const job: Job = { direct: null, triggerAt, stage: 'thinking', timer: null };
    slot.job = job;
    void this.runDecision(slot, job, epoch, cue);
  }

  private async runDecision(slot: Slot, job: Job, epoch: number, cue: DecisionCue): Promise<void> {
    const alive = () => this.isLive(epoch, 'discussion') && slot.job === job && job.stage === 'thinking';
    try {
      const outcome = await slot.bot.decide(this.view(), cue, alive);
      if (!alive()) {
        if (outcome.kind === 'message') this.logEvent(slot.bot.name, 'result_dropped', !this.isLive(epoch, 'discussion') ? 'phase' : slot.job !== job ? 'superseded' : 'budget');
        if (slot.job === job && job.stage === 'thinking') this.release(slot, job);
        return;
      }
      if (outcome.kind !== 'message') {
        if (job.direct) this.directFallback(slot, job, epoch, outcome.kind);
        else this.release(slot, job);
        return;
      }
      if (job.direct) this.logEvent(slot.bot.name, 'direct_reply', job.direct.accusation ? 'accusation' : 'named', job.direct.content.slice(0, 120));
      this.schedulePost(slot, job, epoch, outcome.message, this.delayFor(slot, outcome.message, job.direct));
    } catch (err) {
      this.logEvent(slot.bot.name, 'decision_error', String(err).slice(0, 160));
      if (slot.job === job) this.release(slot, job);
    }
  }

  /** The model failed, stayed silent or ran out of budget on a direct address: a short canned reply, never silence. */
  private directFallback(slot: Slot, job: Job, epoch: number, why: string): void {
    if (!this.isLive(epoch, 'discussion') || slot.job !== job || job.stage !== 'thinking' || !job.direct) return;
    const direct = job.direct;
    const text = this.cannedReply(slot, direct);
    if (!text) {
      this.logEvent(slot.bot.name, 'direct_unanswered', why);
      this.release(slot, job);
      return;
    }
    this.logEvent(slot.bot.name, 'direct_fallback', why, text);
    this.schedulePost(slot, job, epoch, text, this.delayFor(slot, text, direct));
  }

  private cannedReply(slot: Slot, direct: DirectAddress): string | null {
    const lang = this.format?.language === 'en' ? 'en' : 'fr';
    const pool = this.shuffle([...CANNED[lang][direct.accusation ? 'accusation' : 'named']]);
    const lines = this.room.state().messages;
    const own = lines.filter((m) => m.playerId === slot.bot.id).slice(-5).map((m) => m.content);
    // Other bots draw from the same list: an exact repeat of theirs would be dropped by the room's last net.
    const others = lines.filter((m) => m.playerId !== slot.bot.id && this.isBot(m.playerId)).slice(-20).map((m) => m.content);
    const p = slot.bot.spec.profile;
    for (const candidate of pool) {
      const v = checkMessage(candidate, {
        channel: 'discussion',
        caseProfile: p.caseProfile,
        dropFinalPeriodProb: p.dropFinalPeriodProb,
        style: p,
        selfName: slot.bot.name,
        ownRecent: own,
        otherAIRecent: others,
        rng: this.deps.rng,
      });
      if (v.ok) return v.text;
    }
    return null;
  }

  private delayFor(slot: Slot, text: string, direct: DirectAddress | null): number {
    const now = this.now();
    const discussion = this.discussionMessages();
    const others = discussion.filter((m) => m.playerId !== slot.bot.id);
    let myLast: GameMessage | undefined;
    for (const m of discussion) if (m.playerId === slot.bot.id) myLast = m;
    if (discussion.length === 0 && !direct) return Math.max(250, this.discussionStartedAt + firstMessageDelay(this.deps.rng) - now);
    const unseen = others.filter((m) => !myLast || m.timestamp > myLast.timestamp);
    return discussionDelay(
      {
        triggerAt: direct ? direct.at : others.length > 0 ? others[others.length - 1].timestamp : this.discussionStartedAt,
        now,
        newMsgCount: unseen.length,
        newChars: unseen.reduce((n, m) => n + m.content.length, 0),
        replyChars: text.length,
        style: slot.bot.responseStyle,
        direct: direct !== null,
      },
      this.deps.rng
    );
  }

  /** Posts at the scheduled time; non-direct lines keep a jittered gap after any bot line and a 2-per-10 s ceiling. */
  private schedulePost(slot: Slot, job: Job, epoch: number, text: string, delay: number): void {
    this.timers.cancel(job.timer);
    job.stage = 'scheduled';
    const attempt = () => {
      job.timer = null;
      if (!this.isLive(epoch, 'discussion') || slot.job !== job) return;
      if (this.remaining() <= DISCUSSION_LOCK_MS) {
        this.logEvent(slot.bot.name, 'post_late', job.direct ? 'direct' : undefined);
        this.release(slot, job);
        return;
      }
      const now = this.now();
      if (!job.direct) {
        const wait = botFloorWaitMs(now, this.lastBotPostAt, this.recentBotPosts, this.groupPace(), this.deps.rng);
        if (wait > 0) {
          job.timer = this.timers.after(wait, attempt);
          return;
        }
      }
      const posted = this.room.postMessage(slot.bot.id, text);
      this.release(slot, job);
      if (!posted) return;
      this.postDelays.push({ direct: job.direct !== null, ms: now - job.triggerAt });
      this.lastBotPostAt = now;
      this.recentBotPosts = [...this.recentBotPosts.filter((t) => now - t < 10000), now];
      const short = text.length < 50;
      const pace = this.paceFor(slot);
      slot.nextAllowedAt = now + cooldownMs(slot.bot.responseStyle, short, this.deps.rng, pace);
      // ~15 % of short lines get a follow-up, like humans sending 2-3 lines in a row; never from a bot already over its share.
      if (short && pace !== 'over' && this.deps.rng() < BURST_PROB) this.scheduleBurst(slot, epoch);
    };
    job.timer = this.timers.after(delay, attempt);
  }

  private scheduleBurst(slot: Slot, epoch: number): void {
    this.timers.after(4000 + this.deps.rng() * 5000, () => {
      if (!this.isLive(epoch, 'discussion') || slot.job || this.remaining() <= DISCUSSION_LOCK_MS) return;
      if (!this.activeSlots().includes(slot)) return;
      this.launch(slot, epoch, {});
    });
  }

  private release(slot: Slot, job: Job): void {
    if (slot.job === job) slot.job = null;
  }

  // ====== VOTES ======

  /**
   * Fallback target, never an abstention: weighted towards players who already gather votes. An AI never falls back
   * on another AI while a non-AI candidate exists.
   */
  private fallbackTarget(bot: Bot, candidates: { id: string }[]): string {
    let pool = candidates;
    if (bot.role === 'ai') {
      const nonAI = candidates.filter((c) => this.roleOf(c.id) !== 'ai');
      if (nonAI.length > 0) pool = nonAI;
    }
    const votes = this.room.state().votes;
    const weights = pool.map((c) => 1 + votes.filter((v) => v.targetId === c.id).length);
    let r = this.deps.rng() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < pool.length; i++) {
      r -= weights[i];
      if (r < 0) return pool[i].id;
    }
    return pool[pool.length - 1].id;
  }

  // ====== HELPERS ======

  private now(): number {
    return this.deps.clock.now();
  }

  private beginPhase(): number {
    this.epoch++;
    this.timers.clearAll();
    this.reactionTick = null;
    for (const slot of this.slots.values()) slot.job = null;
    return this.epoch;
  }

  private isLive(epoch: number, phase: GameRoomState['phase']): boolean {
    return !this.disposed && this.epoch === epoch && this.room.state().phase === phase;
  }

  private remaining(): number {
    const s = this.room.state();
    return s.phase === 'discussion' && s.discussionEndTime != null ? s.discussionEndTime - this.now() : Number.NEGATIVE_INFINITY;
  }

  private activeSlots(): Slot[] {
    const active = new Set(this.room.state().players.filter((p) => !p.isEliminated).map((p) => p.id));
    return [...this.slots.values()].filter((s) => active.has(s.bot.id));
  }

  private groupPace(): Pace {
    const ids = new Set(this.activeSlots().map((s) => s.bot.id));
    const lines = this.discussionMessages().slice(-PACE_WINDOW_LINES);
    const players = this.room.state().players.filter((p) => !p.isEliminated).length;
    return groupPaceOf(lines.filter((m) => ids.has(m.playerId)).length, lines.length, players, ids.size);
  }

  /** This bot's share of the current discussion against 1/n players still in the game. */
  private paceFor(slot: Slot): Pace {
    const lines = this.discussionMessages().slice(-PACE_WINDOW_LINES);
    const own = lines.filter((m) => m.playerId === slot.bot.id).length;
    const players = this.room.state().players.filter((p) => !p.isEliminated).length;
    return paceOf(own, lines.length, players);
  }

  private discussionMessages(): GameMessage[] {
    const s = this.room.state();
    return s.messages.filter((m) => m.phase === 'discussion' && m.round === s.currentRound && m.playerId !== 'system');
  }

  private nameOf(id: string): string {
    return this.room.state().players.find((p) => p.id === id)?.username ?? id;
  }

  private shuffle<T>(items: T[]): T[] {
    const arr = [...items];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.deps.rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  private view(): BotView {
    if (!this.format) throw new Error('game format not set before the first bot call');
    const s = this.room.state();
    const active = s.players.filter((p) => !p.isEliminated);
    return {
      now: this.now(),
      format: this.format,
      round: s.currentRound,
      phase: s.phase,
      question: s.currentQuestion,
      answers: [...s.answers],
      messages: s.messages,
      activePlayerIds: new Set(active.map((p) => p.id)),
      botIds: new Set(this.slots.keys()),
      eliminatedNames: s.players.filter((p) => p.isEliminated).map((p) => p.username),
      aiRemaining: active.filter((p) => p.type === 'ai').length,
      history: this.room.history(),
    };
  }

  // ====== TELEMETRY ======

  /** LLM health per provider and bot events by kind, for the one-line game telemetry. */
  telemetry(): { providers: Record<string, string>; llm: Record<string, unknown>; events: Record<string, number>; postDelayMs: Record<string, unknown>; paceLaunches: Record<Pace, number> } {
    const pct = (xs: number[], q: number) => {
      if (xs.length === 0) return null;
      const sorted = [...xs].sort((a, b) => a - b);
      return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
    };
    const groups = new Map<string, LLMCallEvent[]>();
    for (const e of this.llmEvents) {
      const list = groups.get(e.provider) ?? [];
      list.push(e);
      groups.set(e.provider, list);
    }
    const llm: Record<string, unknown> = {};
    for (const [provider, list] of groups) {
      const ok = list.filter((e) => e.ok).map((e) => e.latencyMs);
      llm[provider] = {
        calls: list.length,
        failed: list.filter((e) => !e.ok).length,
        fallback: list.filter((e) => e.fallback).length,
        retried: list.filter((e) => e.attempts > 1).length,
        p50: pct(ok, 0.5),
        p90: pct(ok, 0.9),
      };
    }
    const events: Record<string, number> = {};
    for (const e of this.events) {
      const key = e.reason ? `${e.kind}:${e.reason}` : e.kind;
      events[key] = (events[key] ?? 0) + 1;
    }
    const providers: Record<string, string> = {};
    for (const slot of this.slots.values()) providers[slot.bot.name] = slot.bot.providerName;
    const delays = (direct: boolean) => {
      const xs = this.postDelays.filter((d) => d.direct === direct).map((d) => Math.round(d.ms));
      return { n: xs.length, p50: pct(xs, 0.5), p90: pct(xs, 0.9) };
    };
    return { providers, llm, events, postDelayMs: { direct: delays(true), regular: delays(false) }, paceLaunches: { ...this.paceLaunches } };
  }
}
