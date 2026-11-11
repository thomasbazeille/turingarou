/**
 * Fast-forward simulation of full Turingarou games, in virtual time, with fake model providers (latency, 429, 400,
 * timeouts, 20 s calls, garbage and truncated JSON, form-gate bait) and fake humans (chat, answers, votes, direct
 * accusations). Every invariant is measured from the outside: posted messages, answers, votes, emitted phases,
 * logged events, and the fake provider's own record of which call produced which text.
 *
 *   npm run test:sim                       # 6 seeds x fr/en
 *   npx tsx scripts/simulate-game.ts --seeds 10 --verbose
 *
 * The LLM layer (src/llm) uses the global timers for its retry backoff, so the run swaps setTimeout, clearTimeout,
 * Date.now and Math.random for the virtual clock and a seeded generator during each game.
 */
import { performance } from 'node:perf_hooks';
import { GameRoom, GameRoomDeps, RoomEmitter, DISCUSSION_PHASE_MS } from '../src/game/GameRoom.js';
import { DISCUSSION_LOCK_MS, VOTE_DEADLINE_MS } from '../src/game/BotDirector.js';
import { ChatProvider, ChatRequest, ChatResult, ProviderError } from '../src/llm/chatClient.js';
import { makeSeededRng } from '../src/game/humanTiming.js';
import { getInspectorPromptContent, getRandomAIPlayerStrategy } from '../src/game/StrategyLoader.js';
import type { GameLogData } from '../src/game/GameLogger.js';
import type { GameMessage, GameRoomState, QuestionAnswer } from '../src/types/game.types.js';

type Lang = 'fr' | 'en';
type Kind = 'decision' | 'answer' | 'vote';

// ====== VIRTUAL CLOCK ======

interface Entry {
  at: number;
  seq: number;
  fn: () => void;
}

const realSetImmediate = setImmediate;
const flushMicrotasks = () => new Promise<void>((resolve) => realSetImmediate(resolve));

class VirtualClock {
  t: number;
  private seq = 0;
  private queue: Entry[] = [];
  private live = new Map<number, Entry>();
  readonly thrown: string[] = [];

  constructor(start: number) {
    this.t = start;
  }

  now = (): number => this.t;

  setTimeout = (fn: () => void, ms?: number): number => {
    const id = ++this.seq;
    const entry = { at: this.t + Math.max(0, Number(ms) || 0), seq: id, fn };
    this.live.set(id, entry);
    let lo = 0;
    let hi = this.queue.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      const q = this.queue[mid];
      if (q.at < entry.at || (q.at === entry.at && q.seq < id)) lo = mid + 1;
      else hi = mid;
    }
    this.queue.splice(lo, 0, entry);
    return id;
  };

  clearTimeout = (id: unknown): void => {
    this.live.delete(id as number);
  };

  /** Fires timers in order, letting every promise chain settle between two timers. */
  async run(stop: () => boolean, limitAt: number): Promise<'stopped' | 'drained' | 'limit'> {
    for (;;) {
      await flushMicrotasks();
      if (stop()) return 'stopped';
      let entry = this.queue.shift();
      while (entry && !this.live.has(entry.seq)) entry = this.queue.shift();
      if (!entry) return 'drained';
      if (entry.at > limitAt) {
        this.queue.unshift(entry);
        return 'limit';
      }
      this.live.delete(entry.seq);
      this.t = Math.max(this.t, entry.at);
      try {
        entry.fn();
      } catch (err) {
        this.thrown.push(String(err).slice(0, 200));
      }
    }
  }
}

// ====== FAKE MODEL PROVIDERS ======

interface Task {
  n: number;
  kind: Kind;
  bot: string;
  lang: Lang | '?';
  direct: boolean;
  quiet: boolean;
  candidates: string[];
  t0: number;
  phase0: string;
  round0: number;
  afterEnd: boolean;
  resolvedAt: number | null;
  text: string | null;
}

interface ProviderProfile {
  name: string;
  latency: [number, number];
  p429: number;
  p400: number;
  pSlow: number;
  pGarbage: number;
  pTrunc: number;
}

const PROFILES: ProviderProfile[] = [
  { name: 'FakeFast/a', latency: [300, 2500], p429: 0.03, p400: 0.005, pSlow: 0.02, pGarbage: 0.03, pTrunc: 0.02 },
  { name: 'FakeFlaky/b', latency: [600, 4000], p429: 0.12, p400: 0.01, pSlow: 0.06, pGarbage: 0.06, pTrunc: 0.05 },
  { name: 'FakeSlow/c', latency: [1500, 7500], p429: 0.03, p400: 0, pSlow: 0.1, pGarbage: 0.02, pTrunc: 0.02 },
];

const PHRASES: Record<Lang, { open: string[]; body: string[]; tail: string[]; answers: string[]; garbage: string[] }> = {
  fr: {
    open: ['ouais', 'bof', 'mdr', 'jsp', 'franchement', 'attends', 'perso', 'bon', 'ah', 'euh', 'grave', 'nan'],
    body: [
      'la reponse de {p} est chelou', 'personne a repondu pareil', 'jsuis pas convaincu', 'on vote qui du coup',
      'trop drole la question', "j'aurais dit pareil", 'ca se tient', 'il est ou le piege', 'on se calme',
      'bizarre ce silence', 'moi je trouve ca normal', '{p} tu reponds toujours vite', 'la pizza ananas cest non',
      'je sais plus qui a dit quoi', 'faut qu on parle des reponses', 'c est trop calme', 'je vote au feeling',
      'quelqu un a un avis', 'j ai rien vu de louche', 'ca devient tendu', 'reponse classique', 'pas fan de ta reponse',
    ],
    tail: ['', ' non ?', ' lol', ' quand meme', ' en vrai', ' je pense', ' bref'],
    answers: ['la mer', 'jsp trop', 'des frites', 'mon chat', 'dormir', 'le velo', 'aucune idee', 'la montagne', 'un bon film', 'mes potes'],
    garbage: ['hmm je sais pas', 'Sure! Here is my reply: ok', '{"shouldRespond": tru', 'shouldRespond: oui'],
  },
  en: {
    open: ['yeah', 'meh', 'lol', 'idk', 'honestly', 'wait', 'ok', 'hmm', 'nah', 'well', 'tbh', 'ah'],
    body: [
      "{p}'s answer is weird", 'nobody answered the same', "i'm not convinced", 'who do we vote then',
      'funny question', 'i would have said the same', 'makes sense', "where's the trap", 'calm down guys',
      'weird silence', 'sounds normal to me', '{p} you always answer fast', 'pineapple pizza is a no',
      "i forgot who said what", 'we should talk about the answers', "it's too quiet", 'voting on vibes',
      'anyone got a clue', 'nothing looked off to me', 'getting tense here', 'classic answer', 'not a fan of your answer',
    ],
    tail: ['', ' right?', ' lol', ' though', ' honestly', ' i think', ' anyway'],
    answers: ['the sea', 'no idea', 'fries', 'my cat', 'sleeping', 'cycling', 'dunno', 'mountains', 'a good movie', 'my friends'],
    garbage: ['hmm not sure', 'Sure! Here is my reply: ok', '{"shouldRespond": tru', 'shouldRespond: yes'],
  },
};

const HUMAN_LINES: Record<Lang, { casual: string[]; accuse: string[]; ask: string[]; replyAccuse: string[]; answers: string[] }> = {
  fr: {
    casual: ['mdr cette question', 'perso jsp', 'vous avez repondu quoi deja', 'ca sent le bot ici', 'on vote qui', 'jsuis perdu', 'trop marrant', 'ouais grave', 'nan mais serieux', 'jsp qui croire'],
    accuse: ["{n} t'es un bot ?", '{n} tu es une ia non', '@{n} t es suspect', "{n} c'est toi le robot", '{n} t es chelou toi'],
    ask: ['{n} tu en penses quoi ?', '{n} t as dit quoi deja', '@{n} ta reponse ?'],
    replyAccuse: ["t'es un bot toi", 'toi t es une ia', 'tu parles comme un robot'],
    answers: ['la mer', 'jsp', 'pizza', 'mon lit', 'les vacances', 'rien', 'le foot', 'mes amis'],
  },
  en: {
    casual: ['lol this question', 'idk tbh', 'what did you all answer', 'smells like a bot in here', 'who do we vote', "i'm lost", 'so funny', 'yeah totally', 'no but seriously', 'who to trust'],
    accuse: ['{n} are you a bot?', "{n} you're an ai right", '@{n} sus', "{n} you're the robot", '{n} you seem fake'],
    ask: ['{n} what do you think?', '{n} what did you say again', '@{n} your answer?'],
    replyAccuse: ["you're a bot", "you're an ai", 'you sound like a robot'],
    answers: ['the beach', 'idk', 'pizza', 'my bed', 'holidays', 'nothing', 'football', 'my friends'],
  },
};

const NAMES = ['lucas', 'emma', 'hugo', 'ines', 'jules', 'manon', 'nora', 'theo', 'zoe', 'axel', 'lina', 'sacha', 'yanis', 'louise'];

interface Counters {
  [key: string]: number;
}

class FakeLab {
  readonly tasks = new Map<ChatRequest, Task>();
  readonly byN = new Map<number, Task>();
  readonly counters: Counters = {};
  private n = 99;
  ended = false;
  cautiousRound1 = false;

  constructor(
    private readonly clock: VirtualClock,
    private readonly rng: () => number,
    private readonly room: () => GameRoom
  ) {}

  count(key: string): void {
    this.counters[key] = (this.counters[key] ?? 0) + 1;
  }

  providers(): ChatProvider[] {
    return PROFILES.map((profile) => ({
      name: profile.name,
      model: profile.name.split('/')[1],
      supportsJson: true,
      chat: (req: ChatRequest) => this.chat(profile, req),
    }));
  }

  private pick<T>(xs: T[]): T {
    return xs[Math.floor(this.rng() * xs.length)];
  }

  private classify(req: ChatRequest): Task {
    const sys = req.messages.find((m) => m.role === 'system')?.content ?? '';
    const user = req.messages.filter((m) => m.role === 'user').map((m) => m.content).join('\n');
    const lang: Lang | '?' = sys.includes('LANGUAGE: You must speak and write only in English')
      ? 'en'
      : sys.includes('LANGUAGE: You must speak and write only in French')
        ? 'fr'
        : '?';
    const votes = /Players you can vote for: (.+)\.\n/.exec(user);
    const kind: Kind = req.json ? 'decision' : votes ? 'vote' : 'answer';
    const s = this.room().getState();
    return {
      n: ++this.n,
      kind,
      bot: /^You are ([^,.\n]+)[,.]/.exec(sys)?.[1] ?? '?',
      lang,
      direct: kind === 'decision' && /just (accused you|talked to you)/.test(user),
      quiet: kind === 'decision' && user.includes('quiet for a while'),
      candidates: votes ? votes[1].split(', ') : [],
      t0: this.clock.now(),
      phase0: s.phase,
      round0: s.currentRound,
      afterEnd: this.ended,
      resolvedAt: null,
      text: null,
    };
  }

  private chat(profile: ProviderProfile, req: ChatRequest): Promise<ChatResult> {
    let task = this.tasks.get(req);
    if (task) this.count('attempt_retry_or_fallback');
    else {
      task = this.classify(req);
      this.tasks.set(req, task);
      this.byN.set(task.n, task);
    }
    this.count('attempts');
    const t = task;
    const timeout = req.timeoutMs ?? 8000;
    return new Promise<ChatResult>((resolve, reject) => {
      const r = this.rng();
      if (r < profile.p429) {
        this.count('fail_429');
        this.clock.setTimeout(() => reject(new ProviderError(`${profile.name} HTTP 429`, 429, true)), 100 + this.rng() * 400);
        return;
      }
      if (r < profile.p429 + profile.p400) {
        this.count('fail_400');
        this.clock.setTimeout(() => reject(new ProviderError(`${profile.name} HTTP 400`, 400, false)), 100 + this.rng() * 200);
        return;
      }
      const slow = r < profile.p429 + profile.p400 + profile.pSlow;
      const latency = slow ? 20000 : profile.latency[0] + this.rng() * (profile.latency[1] - profile.latency[0]);
      if (slow) this.count('slow_20s');
      if (latency > timeout) {
        this.count('fail_timeout');
        this.clock.setTimeout(() => reject(new ProviderError(`${profile.name} timeout`, null, true)), timeout);
        return;
      }
      const { text, finishReason } = this.respond(profile, t);
      this.clock.setTimeout(() => {
        t.resolvedAt = this.clock.now();
        t.text = text;
        resolve({ text, finishReason, latencyMs: latency, provider: profile.name, model: profile.name });
      }, latency);
    });
  }

  private respond(profile: ProviderProfile, task: Task): { text: string; finishReason: string } {
    const lang: Lang = task.lang === 'en' ? 'en' : 'fr';
    const P = PHRASES[lang];
    const mode = this.rng();
    if (task.kind === 'vote') {
      if (this.rng() < 0.12 || task.candidates.length === 0) {
        this.count('vote_garbage');
        return { text: lang === 'fr' ? 'hmm dur de choisir' : 'hmm hard to pick', finishReason: 'stop' };
      }
      return { text: this.pick(task.candidates), finishReason: 'stop' };
    }
    if (task.kind === 'answer') {
      if (mode < profile.pTrunc) {
        this.count('truncated');
        return { text: `k${task.n} parce que`, finishReason: 'length' };
      }
      if (this.rng() < 0.1) {
        this.count('answer_skip');
        return { text: 'SKIP', finishReason: 'stop' };
      }
      if (this.rng() < 0.06) {
        this.count('bait_answer_formula');
        return { text: `k${task.n} ${lang === 'fr' ? 'bonne question' : 'great question'}, ${this.pick(P.answers)}`, finishReason: 'stop' };
      }
      return { text: `k${task.n} ${this.pick(P.answers)}${this.rng() < 0.2 ? '. et puis bon ca depend des jours, et toi ?' : ''}`, finishReason: 'stop' };
    }
    if (mode < profile.pGarbage) {
      this.count('garbage');
      return { text: this.pick(P.garbage), finishReason: 'stop' };
    }
    if (mode < profile.pGarbage + profile.pTrunc) {
      this.count('truncated');
      return { text: `{"shouldRespond": true, "message": "k${task.n} ${this.pick(P.open)} mais att`, finishReason: 'length' };
    }
    // Bench (real providers): models almost never answer shouldRespond false, so the code's skip, cooldown and
    // ceilings are what pace the bots. Odd seeds open round 1 with cautious models so the silence watchdog runs.
    const pTrue = task.direct ? 0.97 : task.quiet ? 0.97 : this.cautiousRound1 && task.round0 === 1 ? 0.15 : 0.97;
    if (this.rng() >= pTrue) return { text: '{"shouldRespond": false}', finishReason: 'stop' };
    return { text: JSON.stringify({ shouldRespond: true, message: this.message(task, lang) }), finishReason: 'stop' };
  }

  private message(task: Task, lang: Lang): string {
    const P = PHRASES[lang];
    const s = this.room().getState();
    const others = s.players.filter((p) => !p.isEliminated && p.username !== task.bot).map((p) => p.username);
    const base = `k${task.n} ${this.pick(P.open)} ${this.pick(P.body).replace('{p}', this.pick(others) ?? 'toi')}${this.pick(P.tail)}`;
    const b = this.rng();
    if (b < 0.015) {
      this.count('bait_list');
      return `k${task.n} bon\n- un\n- deux`;
    }
    if (b < 0.03) {
      this.count('bait_json');
      return `k${task.n} {"shouldRespond": true}`;
    }
    if (b < 0.045) {
      this.count('bait_admission');
      return `k${task.n} ${lang === 'fr' ? "en tant qu'ia je dirais oui" : 'as an ai i would say yes'}`;
    }
    if (b < 0.06) {
      this.count('bait_formula');
      return `k${task.n} ${lang === 'fr' ? 'bonne question franchement' : 'great question honestly'}`;
    }
    if (b < 0.08) {
      this.count('bait_dash_emoji');
      return `${base} — trop bien 😂`;
    }
    if (b < 0.1) {
      const lastBot = [...s.messages].reverse().find((m) => /^k\d+\b/i.test(m.content));
      if (lastBot) {
        this.count('bait_duplicate');
        return lastBot.content;
      }
    }
    if (b < 0.11) {
      this.count('bait_long');
      return `${base} ${'et en plus franchement je sais pas quoi dire de plus sur cette histoire '.repeat(2)}`.slice(0, 230);
    }
    return base;
  }
}

// ====== ONE GAME ======

interface Accusation {
  t: number;
  round: number;
  targetId: string;
  targetName: string;
  targetIsBot: boolean;
  remaining: number;
  named: boolean;
  accusation: boolean;
}

interface AIEvent {
  round: number;
  phase: string;
  player: string;
  kind: string;
  reason: string | null;
  detail: string | null;
  ts: number;
}

interface Offender {
  game: string;
  what: string;
}

interface Pace {
  tempo: Tempo;
  aiLines: number;
  otherLines: number;
  aiSeats: number;
  otherSeats: number;
  /** Per AI: its lines divided by its fair share, the sum over rounds of round lines / players alive. */
  botRatios: number[];
}

interface GameResult {
  id: string;
  lang: Lang;
  inspector: boolean;
  aborted: boolean;
  pace: Pace | null;
  m: Counters;
  offenders: Record<string, Offender[]>;
  telemetry: Telemetry | null;
  lab: Counters;
  events: Counters;
}

interface Telemetry {
  result?: string;
  paceLaunches?: Record<string, number>;
  postDelayMs?: { direct: { n: number; p50: number | null }; regular: { n: number; p50: number | null } };
}

/** quiet: a human line every 18-45 s (2-3 per discussion, Time to Talk humans post ~4 per day phase); chatty: every 6-22 s (6-7). */
type Tempo = 'quiet' | 'chatty';

interface Scenario {
  seed: number;
  lang: Lang;
  inspector: boolean;
  abortInRound: number | null;
  tempo: Tempo;
}

const realTimers = { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout, now: Date.now, random: Math.random };
const unhandled: string[] = [];
process.on('unhandledRejection', (reason) => unhandled.push(String(reason).slice(0, 200)));

async function runGame(sc: Scenario): Promise<GameResult> {
  const id = `${sc.lang}-s${sc.seed}-${sc.tempo}${sc.inspector ? '-insp' : ''}${sc.abortInRound ? '-abort' : ''}`;
  const roomRng = makeSeededRng(sc.seed * 1000 + (sc.lang === 'en' ? 1 : 0));
  const simRng = makeSeededRng(sc.seed * 7919 + (sc.lang === 'en' ? 17 : 3));
  const clock = new VirtualClock(1_800_000_000_000);
  const pick = <T,>(xs: T[]): T => xs[Math.floor(simRng() * xs.length)];
  const m: Counters = {};
  const inc = (k: string, by = 1) => (m[k] = (m[k] ?? 0) + by);
  const offenders: Record<string, Offender[]> = {};
  const offend = (key: string, what: string) => {
    inc(key);
    (offenders[key] ??= []).push({ game: id, what });
  };

  const logLines: string[] = [];
  const errorLines: string[] = [];
  let saved: GameLogData | null = null;
  const unhandledBefore = unhandled.length;

  // ---- swap globals ----
  const origLog = console.log;
  const origError = console.error;
  globalThis.setTimeout = clock.setTimeout as unknown as typeof setTimeout;
  globalThis.clearTimeout = clock.clearTimeout as unknown as typeof clearTimeout;
  Date.now = clock.now;
  Math.random = roomRng;
  console.log = () => {};
  console.error = (...args: unknown[]) => errorLines.push(args.map(String).join(' ').slice(0, 200));

  let room!: GameRoom;
  const lab = new FakeLab(clock, simRng, () => room);
  lab.cautiousRound1 = sc.seed % 2 === 1;
  const phases: { t: number; phase: string; round: number }[] = [];
  const endroundVotes = new Map<number, { voterId: string; targetId: string }[]>();
  const eliminatedIn = new Map<number, string | null>();
  let finished = false;
  let emitsAfterEnd = 0;
  const humans: { socketId: string; name: string; id: string }[] = [];
  const accusations: Accusation[] = [];

  const usedNames = new Set<string>();
  const names: GameRoomDeps['names'] = {
    add: (n) => usedNames.add(n),
    pick: (exclude) => {
      const ex = new Set([...exclude, ...usedNames].map((x) => x.toLowerCase()));
      return pick(NAMES.filter((n) => !ex.has(n)));
    },
  };

  const state = (): GameRoomState => room.getState();
  const isActive = (pid: string) => state().players.some((p) => p.id === pid && !p.isEliminated);
  const remaining = () => (state().discussionEndTime ?? 0) - clock.now();

  // ---- fake humans ----
  const L = HUMAN_LINES[sc.lang];
  const humanPost = (h: { id: string; name: string }, round: number) => {
    const s = state();
    if (s.phase !== 'discussion' || s.currentRound !== round || !isActive(h.id)) return;
    const others = s.players.filter((p) => !p.isEliminated && p.id !== h.id);
    const discussion = s.messages.filter((x) => x.phase === 'discussion' && x.round === round && x.playerId !== 'system');
    const last = discussion[discussion.length - 1];
    const r = simRng();
    let text: string;
    let target: { id: string; username: string } | null = null;
    let named = false;
    let accusation = false;
    if (r < 0.28 && others.length > 0) {
      target = pick(others);
      text = pick(L.accuse).replace('{n}', target.username);
      named = true;
      accusation = true;
    } else if (r < 0.35 && others.length > 0) {
      target = pick(others);
      text = pick(L.ask).replace('{n}', target.username);
      named = true;
    } else if (r < 0.41 && last && last.playerId !== h.id && isActive(last.playerId)) {
      target = { id: last.playerId, username: last.playerName };
      text = pick(L.replyAccuse);
      accusation = true;
    } else {
      text = pick(L.casual);
    }
    const remainingAtSend = remaining();
    const posted = room.addMessage(h.id, text);
    if (posted && target) {
      const botIds = botIdSet();
      accusations.push({ t: clock.now(), round, targetId: target.id, targetName: target.username, targetIsBot: botIds.has(target.id), remaining: remainingAtSend, named, accusation });
    }
  };

  const botIdSet = () => new Set(state().players.filter((p) => p.type === 'ai' || (p.type === 'human' && p.socketId === '')).map((p) => p.id));

  const onPhase = (phase: string, round: number) => {
    if (finished) return;
    const present = humans.filter((h) => isActive(h.id));
    if (phase === 'question') {
      for (const h of present) {
        if (simRng() < 0.08) continue;
        clock.setTimeout(() => {
          if (state().phase === 'question' && state().currentRound === round) room.addAnswer(h.id, pick(L.answers));
        }, 2000 + simRng() * 15000);
      }
    } else if (phase === 'discussion') {
      for (const h of present) {
        const chain = () => {
          if (finished || state().phase !== 'discussion' || state().currentRound !== round) return;
          if (remaining() < 3000) return;
          humanPost(h, round);
          clock.setTimeout(chain, sc.tempo === 'quiet' ? 18000 + simRng() * 27000 : 6000 + simRng() * 16000);
        };
        // Round 1 opens shy (humans read the answers first): the silence watchdog has to break it.
        clock.setTimeout(chain, round === 1 ? 14000 + simRng() * 20000 : 2000 + simRng() * 10000);
      }
      if (sc.abortInRound === round) {
        clock.setTimeout(() => {
          for (const h of humans) room.removePlayer(h.socketId);
          finished = true;
        }, 30000 + simRng() * 30000);
      }
    } else if (phase === 'voting') {
      for (const h of present) {
        if (simRng() < 0.05) continue;
        clock.setTimeout(() => {
          const st = state();
          if (st.phase !== 'voting' || st.currentRound !== round) return;
          const candidates = st.players.filter((p) => !p.isEliminated && p.id !== h.id && p.id !== st.protectedPlayerId);
          if (candidates.length > 0) room.addVote(h.id, pick(candidates).id);
        }, 2000 + simRng() * 25000);
      }
    }
  };

  const io: RoomEmitter = {
    to: () => ({
      emit: (event: string, payload: unknown) => {
        if (event !== 'gameState') return true;
        if (finished) {
          emitsAfterEnd++;
          return true;
        }
        // What every browser receives must not say who is an AI.
        for (const pl of (payload as { players?: Record<string, unknown>[] }).players ?? []) {
          if (!/^p-[0-9a-f]{16}$/.test(String(pl.id))) offend('revealing_id', `player id "${String(pl.id)}" is not opaque`);
          for (const k of ['type', 'personality', 'socketId', 'messageHistory']) {
            if (k in pl) offend('revealing_id', `player ${String(pl.username)} exposes "${k}"`);
          }
        }
        const p = payload as { phase: string; currentRound: number; votes?: { voterId: string; targetId: string }[]; eliminatedPlayerId?: string | null };
        const last = phases[phases.length - 1];
        if (!last || last.phase !== p.phase || last.round !== p.currentRound) {
          phases.push({ t: clock.now(), phase: p.phase, round: p.currentRound });
          if (p.phase === 'endround') {
            endroundVotes.set(p.currentRound, [...(p.votes ?? [])]);
            eliminatedIn.set(p.currentRound, p.eliminatedPlayerId ?? null);
          }
          if (p.phase === 'gameover') finished = true;
          else onPhase(p.phase, p.currentRound);
        }
        return true;
      },
    }),
  };

  try {
    room = new GameRoom(`sim-${id}`, io, lab.providers(), 3, {
      clock,
      rng: roomRng,
      names,
      persistence: {
        saveGameLog: async (d) => {
          saved = d;
        },
        updateHumanProfiles: async () => {},
        saveMessageFlag: async () => {},
        getRandomHumanProfile: async () => null,
      },
      log: (line) => {
        if (line.startsWith('[ai-event]') || line.startsWith('[game-telemetry]')) logLines.push(line);
      },
    });

    const humanCount = sc.inspector ? 4 : 5;
    for (let i = 0; i < humanCount; i++) {
      const name = names.pick([]);
      const socketId = `sock-${i}`;
      await room.addHumanPlayer(socketId, name, sc.lang);
      const p = state().players.find((x) => x.type === 'human' && x.socketId === socketId)!;
      humans.push({ socketId, name, id: p.id });
    }
    if (sc.inspector) await room.addInspectorPlayer();

    const outcome = await clock.run(() => finished, clock.now() + 3 * 3600_000);
    if (outcome !== 'stopped') offend('game_not_finished', `run ended ${outcome} in phase ${state().phase}`);
    lab.ended = true;
    const endAt = clock.now();
    const timersAtEnd = room.pendingTimers();
    if (timersAtEnd !== 0) offend('room_timers_left', `${timersAtEnd} room timers pending at end`);
    const drained = await clock.run(() => false, endAt + 300_000);
    if (drained !== 'drained') offend('clock_not_drained', `virtual clock still busy 300 s after the end (${drained})`);
    if (room.pendingTimers() !== 0) offend('room_timers_left', `${room.pendingTimers()} room timers pending after drain`);
  } finally {
    globalThis.setTimeout = realTimers.setTimeout;
    globalThis.clearTimeout = realTimers.clearTimeout;
    Date.now = realTimers.now;
    Math.random = realTimers.random;
    console.log = origLog;
    console.error = origError;
  }

  // ====== MEASURES ======
  const s = state();
  const aborted = sc.abortInRound !== null;
  if (aborted) {
    if (s.phase !== 'waiting') offend('abort_not_clean', `phase ${s.phase} after abort`);
  } else if (s.phase !== 'gameover') offend('no_gameover', `final phase ${s.phase}`);
  inc(aborted ? 'games_aborted' : 'games_completed');
  if (emitsAfterEnd > 0) offend('emits_after_end', `${emitsAfterEnd} state emits after ${aborted ? 'abort' : 'game over'}`);

  const events: AIEvent[] = logLines.filter((l) => l.startsWith('[ai-event] ')).map((l) => JSON.parse(l.slice(11)));
  const eventCounts: Counters = {};
  for (const e of events) {
    const key = e.reason ? `${e.kind}:${e.reason}` : e.kind;
    eventCounts[key] = (eventCounts[key] ?? 0) + 1;
  }
  for (const e of events) if (/_error$/.test(e.kind)) offend('bot_errors', `${e.player} ${e.kind} ${e.detail}`);
  // The room's last net should find nothing the upstream gate missed.
  for (const e of events) if (e.kind === 'post_drop') offend('final_net_drop', `${e.player} r${e.round} ${e.reason}: "${e.detail}"`);

  const telemetryLines = logLines.filter((l) => l.startsWith('[game-telemetry] '));
  let telemetry: Telemetry | null = null;
  if (telemetryLines.length !== 1) offend('telemetry', `${telemetryLines.length} telemetry lines`);
  else {
    try {
      telemetry = JSON.parse(telemetryLines[0].slice(17));
      const expected = aborted ? 'aborted' : s.gameOverReason;
      if (telemetry?.result !== expected) offend('telemetry', `telemetry result ${telemetry?.result} != ${expected}`);
    } catch {
      offend('telemetry', 'telemetry line is not JSON');
    }
  }

  for (const line of errorLines) if (!line.startsWith('[llm]')) offend('unexpected_errors', line);
  for (const err of clock.thrown) offend('uncaught', err);
  for (const err of unhandled.slice(unhandledBefore)) offend('unhandled_rejection', err);

  // Phase timeline.
  const startOf = (phase: string, round: number) => phases.find((p) => p.phase === phase && p.round === round)?.t ?? null;
  const endOfPhase = (phase: string, round: number): number => {
    const idx = phases.findIndex((p) => p.phase === phase && p.round === round);
    return idx >= 0 && idx + 1 < phases.length ? phases[idx + 1].t : Number.POSITIVE_INFINITY;
  };

  const botIds = botIdSet();
  const nameToId = new Map(s.players.map((p) => [p.username, p.id]));
  const tokenOf = (text: string) => {
    const t = /^k(\d+)\b/i.exec(text.trim());
    return t ? lab.byN.get(Number(t[1])) ?? null : null;
  };
  const fallbackTexts = new Set(events.filter((e) => e.kind === 'direct_fallback').map((e) => `${e.player}|${e.detail}`));

  // Bot lines: phase, lock, origin, gap.
  const botMsgs = s.messages.filter((x) => botIds.has(x.playerId));
  const seenTokens = new Set<number>();
  const isDirect = new Map<string, boolean>();
  for (const msg of botMsgs) {
    inc('bot_lines');
    const discStart = startOf('discussion', msg.round);
    // The lock is measured against the scheduled end (the vote start); an abort only bounds the phase.
    const voteAt = startOf('voting', msg.round) ?? (discStart ?? 0) + DISCUSSION_PHASE_MS;
    if (msg.phase !== 'discussion' || discStart === null || msg.timestamp < discStart || msg.timestamp >= endOfPhase('discussion', msg.round)) {
      offend('bot_line_outside_discussion', `${msg.playerName} r${msg.round} "${msg.content}"`);
    } else if (msg.timestamp > voteAt - DISCUSSION_LOCK_MS) {
      offend('bot_line_in_last_10s', `${msg.playerName} r${msg.round} ${((voteAt - msg.timestamp) / 1000).toFixed(1)} s before the vote`);
    }
    const task = tokenOf(msg.content);
    if (task) {
      if (seenTokens.has(task.n)) offend('duplicate_posted', `${msg.playerName} "${msg.content}"`);
      seenTokens.add(task.n);
      if (task.kind !== 'decision' || task.phase0 !== 'discussion' || task.round0 !== msg.round || discStart === null || task.t0 < discStart) {
        offend('stale_result_posted', `${msg.playerName} r${msg.round} posted a ${task.kind} result started in ${task.phase0} r${task.round0}`);
      }
      if (task.bot !== msg.playerName) offend('stale_result_posted', `${msg.playerName} posted ${task.bot}'s result`);
      isDirect.set(msg.id, task.direct);
      if (task.direct) inc('bot_lines_direct');
    } else if (fallbackTexts.has(`${msg.playerName}|${msg.content}`)) {
      isDirect.set(msg.id, true);
      inc('bot_lines_canned');
    } else {
      offend('bot_line_unexplained', `${msg.playerName} "${msg.content}" matches no model call and no canned reply`);
    }
  }
  const byRound = new Map<number, GameMessage[]>();
  for (const msg of botMsgs) byRound.set(msg.round, [...(byRound.get(msg.round) ?? []), msg]);
  let minGap = Number.POSITIVE_INFINITY;
  for (const list of byRound.values()) {
    list.sort((a, b) => a.timestamp - b.timestamp);
    for (let i = 1; i < list.length; i++) {
      if (isDirect.get(list[i].id)) continue;
      const gap = list[i].timestamp - list[i - 1].timestamp;
      inc('gap_pairs');
      minGap = Math.min(minGap, gap);
      if (gap < 2500) offend('gap_below_2500', `${list[i - 1].playerName} → ${list[i].playerName} r${list[i].round} ${gap.toFixed(0)} ms`);
    }
  }
  if (Number.isFinite(minGap)) m.min_gap_ms = minGap;
  const aiIds = new Set(s.players.filter((p) => p.type === 'ai').map((p) => p.id));
  const fairLines = new Map<string, number>();
  const ownLines = new Map<string, number>();
  const pace: Pace = { tempo: sc.tempo, aiLines: 0, otherLines: 0, aiSeats: 0, otherSeats: 0, botRatios: [] };
  for (let rd = 1; rd <= s.currentRound; rd++) {
    if (startOf('voting', rd) === null) continue;
    const lines = s.messages.filter((x) => x.round === rd && x.phase === 'discussion' && x.playerId !== 'system');
    const present = s.players.filter((p) => !p.isEliminated || eliminatedIn.get(rd) === p.id || [...eliminatedIn.entries()].some(([r, pid]) => pid === p.id && r >= rd));
    const nBots = present.filter((p) => botIds.has(p.id)).length;
    const nHumans = present.filter((p) => !botIds.has(p.id)).length;
    inc('pace_bot_lines', lines.filter((x) => botIds.has(x.playerId)).length);
    inc('pace_human_lines', lines.filter((x) => !botIds.has(x.playerId)).length);
    inc('pace_bot_seats', nBots);
    inc('pace_human_seats', nHumans);
    // Humans leave on abort: only complete games have a known table per round.
    if (aborted) continue;
    const ais = present.filter((p) => aiIds.has(p.id));
    pace.aiLines += lines.filter((x) => aiIds.has(x.playerId)).length;
    pace.otherLines += lines.filter((x) => !aiIds.has(x.playerId)).length;
    pace.aiSeats += ais.length;
    pace.otherSeats += present.length - ais.length;
    for (const p of ais) {
      fairLines.set(p.id, (fairLines.get(p.id) ?? 0) + lines.length / present.length);
      ownLines.set(p.id, (ownLines.get(p.id) ?? 0) + lines.filter((x) => x.playerId === p.id).length);
    }
  }
  for (const [pid, fair] of fairLines) if (fair > 0) pace.botRatios.push((ownLines.get(pid) ?? 0) / fair);

  // Answers.
  const answersOf = (round: number): QuestionAnswer[] => (round === s.currentRound ? s.answers : s.answersByRound?.[round] ?? []);
  for (let rd = 1; rd <= s.currentRound; rd++) {
    const qStart = startOf('question', rd);
    const qEnd = endOfPhase('question', rd);
    for (const a of answersOf(rd).filter((x) => botIds.has(x.playerId))) {
      inc('bot_answers');
      if (qStart === null || a.timestamp < qStart || a.timestamp > qEnd) offend('answer_outside_question', `${a.playerName} r${rd}`);
      const task = tokenOf(a.answer);
      if (!task) offend('answer_unexplained', `${a.playerName} r${rd} "${a.answer}"`);
      else if (task.kind !== 'answer' || task.round0 !== rd || task.phase0 !== 'question') {
        offend('stale_result_posted', `${a.playerName} answer r${rd} came from a ${task.kind} call of ${task.phase0} r${task.round0}`);
      }
    }
  }

  // Votes: every active bot votes; a fallback is logged exactly when the model gave nothing usable in time.
  const eliminatedBefore = new Set<string>();
  for (let rd = 1; rd <= s.currentRound; rd++) {
    const vStart = startOf('voting', rd);
    const votes = endroundVotes.get(rd);
    if (vStart === null || !votes) continue;
    for (const botId of botIds) {
      if (eliminatedBefore.has(botId) || !s.players.some((p) => p.id === botId)) continue;
      const name = s.players.find((p) => p.id === botId)!.username;
      inc('bot_votes_expected');
      const voted = votes.some((v) => v.voterId === botId);
      if (!voted) offend('bot_did_not_vote', `${name} r${rd}`);
      else inc('bot_votes_cast');
      const usable = [...lab.tasks.values()].some(
        (t) => t.kind === 'vote' && t.bot === name && t.round0 === rd && t.text !== null && t.candidates.includes(t.text) && t.resolvedAt !== null && t.resolvedAt < vStart + VOTE_DEADLINE_MS
      );
      const fallback = events.some((e) => e.kind === 'vote_fallback' && e.round === rd && e.player === name);
      if (fallback) inc('vote_fallbacks');
      if (!usable) inc('vote_fallbacks_needed');
      if (fallback === usable) offend('vote_fallback_mismatch', `${name} r${rd}: usable model vote=${usable}, fallback logged=${fallback}`);
    }
    const elimId = eliminatedIn.get(rd);
    if (elimId) eliminatedBefore.add(elimId);
  }

  // Language of every prompt.
  for (const t of lab.tasks.values()) {
    inc('llm_tasks');
    if (t.lang !== sc.lang) offend('prompt_wrong_language', `${t.kind} r${t.round0} for ${t.bot}: ${t.lang}`);
    if (t.round0 === 1 && t.kind === 'answer') inc('round1_answer_prompts');
    const expectedPhase = t.kind === 'decision' ? 'discussion' : t.kind === 'answer' ? 'question' : 'voting';
    if (t.phase0 !== expectedPhase) offend('call_started_outside_phase', `${t.kind} for ${t.bot} started in ${t.phase0} r${t.round0}`);
    if (t.afterEnd) offend('call_started_after_end', `${t.kind} for ${t.bot}`);
    if (t.resolvedAt !== null && t.resolvedAt >= endOfPhase(expectedPhase, t.round0)) inc('results_after_phase_end');
  }

  // Direct accusations: a reply from the accused bot within 10 s.
  for (const a of accusations) {
    // Only accusations whose 10 s reply window fits before the lock and before the phase really ends (abort).
    if (!a.targetIsBot || a.remaining < DISCUSSION_LOCK_MS + 10000 || a.t + 10000 >= endOfPhase('discussion', a.round)) continue;
    const key = a.named && a.accusation ? 'named_accusations' : a.named ? 'named_questions' : 'reply_accusations';
    inc(key);
    const replied = botMsgs.some((x) => x.playerId === a.targetId && x.timestamp > a.t && x.timestamp <= a.t + 10000 && isDirect.get(x.id));
    if (replied) inc(`${key}_replied`);
    else if (key === 'named_accusations') {
      // Name what happened to the accused bot right after, so a red rate says what to fix.
      const trail = events
        .filter((e) => e.player === a.targetName && e.ts >= a.t - 500 && e.ts <= a.t + 12000)
        .map((e) => {
          let what = `${e.kind}${e.reason ? ':' + e.reason : ''}@+${((e.ts - a.t) / 1000).toFixed(1)}`;
          if (e.kind === 'post_drop' && e.detail) {
            const norm = (x: string) => x.toLowerCase().replace(/\s+/g, ' ').trim();
            const twin = [...s.messages].reverse().find((x) => x.timestamp <= e.ts && norm(x.content) === norm(e.detail!));
            what += `("${e.detail}"${twin ? ` = ${twin.playerName} @${((twin.timestamp - a.t) / 1000).toFixed(1)}` : ''})`;
          }
          return what;
        });
      const late = botMsgs.find((x) => x.playerId === a.targetId && x.timestamp > a.t + 10000 && isDirect.get(x.id));
      if (late) trail.push(`late_reply@+${((late.timestamp - a.t) / 1000).toFixed(1)}`);
      inc(`unanswered:${trail.map((x) => x.split('@')[0]).join('+') || 'no_event'}`);
      (offenders.unanswered_accusation ??= []).push({ game: id, what: `${a.targetName} r${a.round} at +${((a.t - (startOf('discussion', a.round) ?? 0)) / 1000).toFixed(0)} s: ${trail.join(', ') || 'no bot event'}` });
    }
  }

  // Persisted kinds: inspectors and bots never logged as humans.
  if (!aborted) {
    const log = saved as GameLogData | null;
    if (!log) offend('not_persisted', 'saveGameLog not called');
    else {
      for (const p of log.players) {
        const live = s.players.find((x) => x.id === p.id);
        const kind = live?.type === 'ai' ? 'ai' : live && live.type === 'human' && live.socketId === '' ? 'inspector' : 'human';
        if (p.type !== kind) offend('persisted_kind', `${p.name} persisted as ${p.type}, is ${kind}`);
        // Bots carry "strategy@Provider" so elimination rates can be read per model (src/history/reader.ts).
        if (kind !== 'human' && !/^[^@]+@[^@]+$/.test(p.strategy ?? '')) offend('persisted_kind', `${p.name} strategy "${p.strategy ?? ''}" has no @provider`);
        if (kind === 'human' && p.strategy) offend('persisted_kind', `human ${p.name} persisted with strategy "${p.strategy}"`);
      }
      for (const msg of log.messages) {
        const pid = nameToId.get(msg.player);
        const kind = pid && botIds.has(pid) ? (s.players.find((x) => x.id === pid)?.type === 'ai' ? 'ai' : 'inspector') : 'human';
        if (msg.type !== kind) offend('persisted_kind', `line of ${msg.player} persisted as ${msg.type}, is ${kind}`);
      }
    }
  }

  return { id, lang: sc.lang, inspector: sc.inspector, aborted, pace: aborted ? null : pace, m, offenders, telemetry, lab: lab.counters, events: eventCounts };
}

// ====== MAIN ======

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const seedsArg = args.indexOf('--seeds');
  const seeds = seedsArg >= 0 ? Number(args[seedsArg + 1]) : 6;
  const verbose = args.includes('--verbose');
  process.env.DATABASE_URL = '';

  // Strategy files are imported once, for real, before any clock swap.
  const quiet = console.log;
  console.log = () => {};
  await getRandomAIPlayerStrategy();
  await getInspectorPromptContent();
  console.log = quiet;

  const scenarios: Scenario[] = [];
  for (let seed = 1; seed <= seeds; seed++) {
    for (const lang of ['fr', 'en'] as Lang[]) {
      scenarios.push({ seed, lang, inspector: seed % 2 === 0, abortInRound: seed === 3 ? 2 : null, tempo: (seed + (lang === 'en' ? 1 : 0)) % 2 === 0 ? 'quiet' : 'chatty' });
    }
  }

  const started = performance.now();
  const results: GameResult[] = [];
  for (const sc of scenarios) {
    const r = await runGame(sc);
    results.push(r);
    if (verbose) {
      console.log(
        `${r.id.padEnd(18)} ${r.aborted ? 'aborted ' : (r.telemetry?.result ?? '?').padEnd(10)} lines=${r.m.bot_lines ?? 0} direct=${(r.m.bot_lines_direct ?? 0) + (r.m.bot_lines_canned ?? 0)} acc=${r.m.named_accusations_replied ?? 0}/${r.m.named_accusations ?? 0} votes=${r.m.bot_votes_cast ?? 0}/${r.m.bot_votes_expected ?? 0} fb=${r.m.vote_fallbacks ?? 0} tasks=${r.m.llm_tasks ?? 0} pace=${JSON.stringify(r.telemetry?.paceLaunches ?? {})} watchdog=${r.events.watchdog ?? 0}`
      );
    }
  }
  const elapsed = (performance.now() - started) / 1000;
  report(results, elapsed, scenarios.length);
}

function report(results: GameResult[], elapsed: number, games: number): void {
  const sum = (k: string) => results.reduce((n, r) => n + (r.m[k] ?? 0), 0);
  const lab = (k: string) => results.reduce((n, r) => n + (r.lab[k] ?? 0), 0);
  const ev = (prefix: string) => results.reduce((n, r) => n + Object.entries(r.events).filter(([k]) => k.startsWith(prefix)).reduce((a, [, v]) => a + v, 0), 0);
  const offenders = (k: string) => results.flatMap((r) => r.offenders[k] ?? []);
  const minGap = Math.min(...results.map((r) => r.m.min_gap_ms ?? Number.POSITIVE_INFINITY));
  const accRate = sum('named_accusations') > 0 ? sum('named_accusations_replied') / sum('named_accusations') : 0;
  const completed = sum('games_completed');
  const medianOf = (k: 'direct' | 'regular') => {
    const xs = results.map((r) => r.telemetry?.postDelayMs?.[k].p50).filter((x): x is number => typeof x === 'number').sort((a, b) => a - b);
    return xs.length > 0 ? (xs[Math.floor(xs.length / 2)] / 1000).toFixed(1) : 'n/a';
  };
  const aborted = sum('games_aborted');
  // Per-capita lines of the AIs over those of the other players. Time to Talk (arXiv 2506.05309): the 70B agent posted
  // 2.95 messages per day phase against 4.23 for humans (ratio 0.70) and was spotted at chance (14.86 %); the upper
  // bound mirrors it (not sourced). At a full table, 0.70-1.30 is an AI share of 0.30-0.44 around 3/8.
  const RATE_BAND = [0.7, 1.3] as const;
  const BOT_SHARE_MAX = 2;
  const paces = results.map((r) => r.pace).filter((p): p is Pace => p !== null);
  const rateOf = (ps: Pace[]) => {
    const a = ps.reduce((n, p) => n + p.aiLines, 0) / Math.max(1, ps.reduce((n, p) => n + p.aiSeats, 0));
    const o = ps.reduce((n, p) => n + p.otherLines, 0) / Math.max(1, ps.reduce((n, p) => n + p.otherSeats, 0));
    return o > 0 ? a / o : Number.NaN;
  };
  const shareOf = (ps: Pace[]) => ps.reduce((n, p) => n + p.aiLines, 0) / Math.max(1, ps.reduce((n, p) => n + p.aiLines + p.otherLines, 0));
  const inBand = (x: number) => x >= RATE_BAND[0] && x <= RATE_BAND[1];
  const byTempo = (['quiet', 'chatty'] as Tempo[]).map((t) => ({ t, ps: paces.filter((p) => p.tempo === t) }));
  const gamesOut = paces.filter((p) => !inBand(rateOf([p]))).length;
  const botRatios = paces.flatMap((p) => p.botRatios).sort((a, b) => a - b);
  const q = (xs: number[], f: number) => (xs.length > 0 ? xs[Math.min(xs.length - 1, Math.floor(f * xs.length))] : Number.NaN);

  const rows: { name: string; value: string; ok: boolean; keys: string[] }[] = [
    { name: 'game reaches gameover', value: `${completed - sum('no_gameover')}/${completed} (+${aborted} aborted, back to waiting)`, ok: sum('no_gameover') + sum('game_not_finished') + sum('abort_not_clean') === 0, keys: ['no_gameover', 'game_not_finished', 'abort_not_clean'] },
    { name: 'bot line outside discussion / last 10 s', value: `${sum('bot_line_outside_discussion')} / ${sum('bot_line_in_last_10s')} of ${sum('bot_lines')}`, ok: sum('bot_line_outside_discussion') + sum('bot_line_in_last_10s') === 0, keys: ['bot_line_outside_discussion', 'bot_line_in_last_10s'] },
    { name: 'lines per player per discussion (info)', value: `bots ${(sum('pace_bot_lines') / Math.max(1, sum('pace_bot_seats'))).toFixed(1)}, humans ${(sum('pace_human_lines') / Math.max(1, sum('pace_human_seats'))).toFixed(1)}`, ok: true, keys: [] },
    {
      name: `AI lines per capita / others' (band ${RATE_BAND.join('-')})`,
      value: `${byTempo.map(({ t, ps }) => `${t} ${rateOf(ps).toFixed(2)} (AI share ${shareOf(ps).toFixed(3)}, ${ps.length} games)`).join('; ')}; games out of band ${gamesOut}/${paces.length}`,
      ok: byTempo.every(({ ps }) => ps.length > 0 && inBand(rateOf(ps))),
      keys: [],
    },
    {
      name: `AI lines / fair share 1/n, per bot and game (max ${BOT_SHARE_MAX})`,
      value: `min ${q(botRatios, 0).toFixed(2)}, p10 ${q(botRatios, 0.1).toFixed(2)}, median ${q(botRatios, 0.5).toFixed(2)}, p90 ${q(botRatios, 0.9).toFixed(2)}, max ${q(botRatios, 1).toFixed(2)} over ${botRatios.length}`,
      ok: botRatios.length > 0 && q(botRatios, 1) <= BOT_SHARE_MAX,
      keys: [],
    },
    { name: 'min gap between bot lines (non-direct)', value: `${(minGap / 1000).toFixed(2)} s over ${sum('gap_pairs')} pairs`, ok: sum('gap_below_2500') === 0, keys: ['gap_below_2500'] },
    { name: 'active bots voted / fallback = no usable vote', value: `${sum('bot_votes_cast')}/${sum('bot_votes_expected')}, fallback ${sum('vote_fallbacks')} (needed ${sum('vote_fallbacks_needed')})`, ok: sum('bot_did_not_vote') + sum('vote_fallback_mismatch') === 0, keys: ['bot_did_not_vote', 'vote_fallback_mismatch'] },
    { name: 'bot answers outside question phase', value: `${sum('answer_outside_question') + sum('answer_unexplained')} of ${sum('bot_answers')}`, ok: sum('answer_outside_question') + sum('answer_unexplained') === 0, keys: ['answer_outside_question', 'answer_unexplained'] },
    { name: 'prompts in the game language', value: `${sum('llm_tasks') - sum('prompt_wrong_language')}/${sum('llm_tasks')} (round-1 answers: ${sum('round1_answer_prompts')})`, ok: sum('prompt_wrong_language') === 0, keys: ['prompt_wrong_language'] },
    { name: 'named accusation replied within 10 s', value: `${(accRate * 100).toFixed(1)} % (${sum('named_accusations_replied')}/${sum('named_accusations')}); unnamed ${sum('reply_accusations_replied')}/${sum('reply_accusations')}, questions ${sum('named_questions_replied')}/${sum('named_questions')}`, ok: accRate >= 0.8 && sum('named_accusations') >= 30, keys: ['unanswered_accusation'] },
    { name: 'model result posted after its phase', value: `${sum('stale_result_posted')} (late results dropped: ${sum('results_after_phase_end')})`, ok: sum('stale_result_posted') === 0, keys: ['stale_result_posted'] },
    { name: 'model call started outside its phase / after end', value: `${sum('call_started_outside_phase')} / ${sum('call_started_after_end')}`, ok: sum('call_started_outside_phase') + sum('call_started_after_end') === 0, keys: ['call_started_outside_phase', 'call_started_after_end'] },
    { name: 'bot lines with no origin / duplicates posted', value: `${sum('bot_line_unexplained')} / ${sum('duplicate_posted')}`, ok: sum('bot_line_unexplained') + sum('duplicate_posted') === 0, keys: ['bot_line_unexplained', 'duplicate_posted'] },
    { name: "lines dropped by the room's last net (<= 0.5 %)", value: `${sum('final_net_drop')} of ${sum('bot_lines') + sum('final_net_drop')}`, ok: sum('final_net_drop') <= 0.005 * (sum('bot_lines') + sum('final_net_drop')), keys: ['final_net_drop'] },
    { name: 'unhandled rejection / uncaught / unexpected error', value: `${sum('unhandled_rejection')} / ${sum('uncaught')} / ${sum('unexpected_errors') + sum('bot_errors')}`, ok: sum('unhandled_rejection') + sum('uncaught') + sum('unexpected_errors') + sum('bot_errors') === 0, keys: ['unhandled_rejection', 'uncaught', 'unexpected_errors', 'bot_errors'] },
    { name: 'telemetry line per game', value: `${games - sum('telemetry')}/${games}; trigger→post p50 ${medianOf('direct')} s direct, ${medianOf('regular')} s regular`, ok: sum('telemetry') === 0, keys: ['telemetry'] },
    { name: 'timers / emits / calls after end', value: `${sum('room_timers_left')} / ${sum('emits_after_end')} / ${sum('call_started_after_end')}, clock drained ${games - sum('clock_not_drained')}/${games}`, ok: sum('room_timers_left') + sum('emits_after_end') + sum('clock_not_drained') === 0, keys: ['room_timers_left', 'emits_after_end', 'clock_not_drained'] },
    { name: 'player ids and fields sent to clients reveal nothing', value: `${sum('revealing_id')} leaks`, ok: sum('revealing_id') === 0, keys: ['revealing_id'] },
    { name: 'persisted player kinds', value: `${sum('persisted_kind') + sum('not_persisted')} wrong`, ok: sum('persisted_kind') + sum('not_persisted') === 0, keys: ['persisted_kind', 'not_persisted'] },
  ];

  // A failure mode never drawn proves nothing about its handling.
  const exercised: [string, number][] = [
    ['429', lab('fail_429')],
    ['400', lab('fail_400')],
    ['timeout', lab('fail_timeout')],
    ['20s call', lab('slow_20s')],
    ['garbage JSON', lab('garbage')],
    ['truncated', lab('truncated')],
    ['retry/fallback attempts', lab('attempt_retry_or_fallback')],
    ['gate regen', ev('gate_regen')],
    ['gate drop', ev('gate_drop') + ev('answer_drop')],
    ['parse fail', ev('parse_fail')],
    ['vote fallback', ev('vote_fallback')],
    ['direct fallback', ev('direct_fallback')],
    ['superseded', ev('superseded')],
    ['watchdog', ev('watchdog')],
    ['late result dropped', sum('results_after_phase_end')],
  ];
  const missing = exercised.filter(([, n]) => n === 0).map(([k]) => k);
  rows.push({ name: 'failure modes exercised', value: exercised.map(([k, n]) => `${k} ${n}`).join(', '), ok: missing.length === 0, keys: [] });

  console.log(`\nsimulate-game: ${games} games (${completed} complete, ${aborted} aborted; fr+en; inspector on even seeds) in ${elapsed.toFixed(1)} s real time`);
  const width = Math.max(...rows.map((r) => r.name.length));
  for (const r of rows) {
    console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name.padEnd(width)}  ${r.value}`);
    if (!r.ok) {
      if (r.keys.length === 0 && missing.length > 0) console.log(`      never drawn: ${missing.join(', ')}`);
      for (const k of r.keys) for (const o of offenders(k).slice(0, 5)) console.log(`      ${k}: [${o.game}] ${o.what}`);
    }
  }
  const causes: Counters = {};
  for (const r of results) for (const [k, v] of Object.entries(r.m)) if (k.startsWith('unanswered:')) causes[k.slice(11)] = (causes[k.slice(11)] ?? 0) + v;
  if (Object.keys(causes).length > 0) console.log(`      unanswered by cause: ${Object.entries(causes).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  const unanswered = offenders('unanswered_accusation');
  const shown = process.argv.includes('--all') ? unanswered : unanswered.slice(0, 5);
  if (unanswered.length > 0) console.log(`      unanswered named accusations (${shown.length} of ${unanswered.length}): ${shown.map((o) => `[${o.game}] ${o.what}`).join('; ')}`);
  const failed = rows.filter((r) => !r.ok).length;
  console.log(failed === 0 ? '\nAll invariants hold' : `\n${failed} invariant(s) failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
