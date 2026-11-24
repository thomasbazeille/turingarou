/**
 * Scaffolding shared by the scripts/test-*.ts files: the case runner and its summary, virtual time, the
 * emit capture and room builders, the fake providers, the seeded RNG and the local HTTP server harness.
 *
 * Every test file runs in its own process (npm run test:unit chains one tsx per file), so one Suite singleton per
 * process holds its own counters.
 */
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { GameRoom, type RoomEmitter, type TableOptions } from '../src/game/GameRoom.js';
import type { Clock } from '../src/game/clock.js';
import type { GameLogData } from '../src/game/GameLogger.js';
import { makeSeededRng } from '../src/game/humanTiming.js';
import type { ChatProvider } from '../src/llm/chatClient.js';
import type { Lang, TtsProvider, TtsResult } from '../src/voice/providers.js';

export { makeSeededRng };

export type Case = () => void | Promise<void>;

const isThenable = (v: unknown): v is PromiseLike<void> =>
  (typeof v === 'object' || typeof v === 'function') &&
  v !== null &&
  typeof (v as { then?: unknown }).then === 'function';

let passed = 0;
const failures: string[] = [];

function record(ok: boolean, name: string, err?: unknown): void {
  if (ok) {
    passed++;
    console.log(`✅ ${name}`);
    return;
  }
  failures.push(name);
  console.log(`❌ ${name}\n   ${err instanceof Error ? err.message : String(err)}`);
}

/** Runs one case and prints its line. A promise comes back only for an async case, so a sync file stays sync. */
export function test(name: string, fn: Case): void | Promise<void> {
  let out: unknown;
  try {
    out = fn();
  } catch (err) {
    record(false, name, err);
    return;
  }
  if (!isThenable(out)) {
    record(true, name);
    return;
  }
  return Promise.resolve(out).then(
    () => record(true, name),
    (err) => record(false, name, err)
  );
}

/** The counts, one line per failed case, and exit code 1 when any failed (npm run test:unit reads only that). */
export function finish(): void {
  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length > 0) {
    console.log(failures.map((f) => `  - ${f}`).join('\n'));
    process.exit(1);
  }
}

/**
 * Virtual time. Timers fire only when the test advances. `flush` awaits setImmediate between every due timer (the
 * bot continuations of test-bot-core need to run in between); the sync flavour runs each timer as it is found.
 */
export class ManualClock implements Clock {
  t: number;
  private seq = 0;
  private readonly timers = new Map<number, { at: number; fn: () => void }>();
  private readonly flush: boolean;

  constructor({ start = 1_800_000_000_000, flush = false }: { start?: number; flush?: boolean } = {}) {
    this.t = start;
    this.flush = flush;
  }
  now = (): number => this.t;
  setTimeout = (fn: () => void, ms: number): number => {
    this.timers.set(++this.seq, { at: this.t + Math.max(0, ms), fn });
    return this.seq;
  };
  clearTimeout = (h: unknown): void => {
    this.timers.delete(h as number);
  };

  advance(ms: number): void | Promise<void> {
    return this.flush ? this.advanceFlushing(ms) : this.advanceSync(ms);
  }

  /** The earliest timer due by `end`, ties broken by registration order. */
  private next(end: number): [number, { at: number; fn: () => void }] | null {
    let next: [number, { at: number; fn: () => void }] | null = null;
    for (const e of this.timers) {
      if (e[1].at <= end && (!next || e[1].at < next[1].at || (e[1].at === next[1].at && e[0] < next[0]))) next = e;
    }
    return next;
  }
  private advanceSync(ms: number): void {
    const end = this.t + ms;
    for (let n = this.next(end); n !== null; n = this.next(end)) {
      this.timers.delete(n[0]);
      this.t = n[1].at;
      n[1].fn();
    }
    this.t = end;
  }
  private async advanceFlushing(ms: number): Promise<void> {
    const end = this.t + ms;
    for (;;) {
      await new Promise<void>((r) => setImmediate(r));
      const n = this.next(end);
      if (!n) break;
      this.timers.delete(n[0]);
      this.t = n[1].at;
      n[1].fn();
    }
    this.t = end;
    await new Promise<void>((r) => setImmediate(r));
  }
}

/** A clock that never moves: every timer is registered and forgotten (test-lobby). */
export function frozenClock(at = 1_800_000_000_000): Clock {
  return { now: () => at, setTimeout: () => 0, clearTimeout: () => {} };
}

/** Median of the sorted values, the two middle ones averaged on an even length (test-human-timing). */
export function median(xs: number[]): number {
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
/** Element at floor(n/2), the upper median on an even length (test-form-gate's copy: they differ there). */
export function upperMedian(xs: number[]): number {
  return [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
}

/** Bots answer SKIP and their decisions fail to parse: the test places every line, answer and vote itself. */
export const quietModel: ChatProvider = {
  name: 'Fake/quiet',
  model: 'quiet',
  supportsJson: true,
  chat: async () => ({ text: 'SKIP', finishReason: 'stop', latencyMs: 1, provider: 'Fake/quiet', model: 'quiet' }),
};

export class FakeTts implements TtsProvider {
  readonly name = 'cartesia';
  readonly model = 'fake';
  calls: { text: string; voiceId: string; lang: Lang }[] = [];
  delayMs = 0;
  async synthesize(text: string, voiceId: string, lang: Lang): Promise<TtsResult> {
    this.calls.push({ text, voiceId, lang });
    if (this.delayMs) await new Promise((r) => setTimeout(r, this.delayMs));
    return { audio: Buffer.from(`${voiceId}|${text}`), mime: 'audio/mpeg' };
  }
}

type Payload = Record<string, any>;

/** Room broadcasts captured as bare gameState payloads, no clone (reconnect, round). */
export function payloadEmits(): { io: RoomEmitter; emits: Payload[] } {
  const emits: Payload[] = [];
  const io: RoomEmitter = {
    to: () => ({
      emit: (event: string, payload: unknown) => (event === 'gameState' ? emits.push(payload as Payload) : 0),
    }),
  };
  return { io, emits };
}

/** gameState broadcasts captured with their target and deep-cloned (lobby). */
export function targetEmits(): { io: RoomEmitter; emits: { target: string; payload: Payload }[] } {
  const emits: { target: string; payload: Payload }[] = [];
  const io: RoomEmitter = {
    to: (target: string) => ({
      emit: (event: string, payload: unknown) =>
        event === 'gameState' ? emits.push({ target, payload: JSON.parse(JSON.stringify(payload)) }) : 0,
    }),
  };
  return { io, emits };
}

/** Every broadcast captured with its target and event, deep-cloned (review). */
export function eventEmits(): { io: RoomEmitter; emits: { target: string; event: string; payload: any }[] } {
  const emits: { target: string; event: string; payload: any }[] = [];
  const io: RoomEmitter = {
    to: (target: string) => ({
      emit: (event: string, payload: unknown) => {
        emits.push({ target, event, payload: JSON.parse(JSON.stringify(payload)) });
      },
    }),
  };
  return { io, emits };
}

export const NAMES_10 = ['ana', 'ben', 'cleo', 'dan', 'eva', 'fred', 'gina', 'hugo', 'ivy', 'jo'];
export const NAMES_18 = [...NAMES_10, 'kim', 'lou', 'max', 'nina', 'otto', 'pia', 'quin', 'rita'];

export interface TestRoomOptions {
  clock: Clock;
  /** Default makeSeededRng(7). */
  rng?: () => number;
  /** Default NAMES_10. */
  names?: string[];
  /** Default 'first': the first free name of the pool; 'random' weights by the shared RNG and records every draw. */
  pick?: 'first' | 'random';
  table?: TableOptions;
  /** Lobby joins assert their result; the other rooms ignore it. */
  assertJoin?: boolean;
}

export interface TestRoom {
  room: GameRoom;
  sockets: string[];
  join(name: string): Promise<string>;
  seat(i: number): { id: string; token: string };
  /** Every pick() call's exclusion list, in order. */
  picks: string[][];
  /** Every game log the room saved. */
  saved: GameLogData[];
  vacant(): number;
}

/**
 * A GameRoom wired to a test clock and capture only. The clock is passed in so the caller keeps its own reference
 * (round and reconnect advance it); the RNG, names and picker differ per file, hence the options.
 */
export function testRoom(roomId: string, io: RoomEmitter, opts: TestRoomOptions): TestRoom {
  const used = new Set<string>();
  const picks: string[][] = [];
  const saved: GameLogData[] = [];
  let vacant = 0;
  const rng = opts.rng ?? makeSeededRng(7);
  const names = opts.names ?? NAMES_10;
  const room = new GameRoom(
    roomId,
    io,
    [quietModel],
    3,
    {
      clock: opts.clock,
      rng,
      names: {
        add: (n) => used.add(n),
        pick: (ex) => {
          picks.push([...ex]);
          if (opts.pick === 'random') {
            const free = names.filter((n) => !used.has(n) && !ex.includes(n));
            return free[Math.floor(rng() * free.length)] ?? 'zed';
          }
          return names.find((n) => !used.has(n) && !ex.includes(n)) ?? 'zed';
        },
      },
      strategies: { aiPlayer: async () => ({ name: 'test', content: 'play' }), inspector: async () => 'inspect' },
      persistence: {
        saveGameLog: async (d) => {
          saved.push(d);
        },
        updateHumanProfiles: async () => {},
        saveMessageFlag: async () => {},
        saveGameFeedback: async () => {},
        getRandomHumanProfile: async () => null,
      },
      log: () => {},
      onVacant: () => {
        vacant++;
      },
    },
    opts.table
  );
  const sockets: string[] = [];
  const join = async (name: string) => {
    const socket = `${roomId}-sock-${sockets.length}`;
    sockets.push(socket);
    const ok = await room.addHumanPlayer(socket, name, 'fr');
    if (opts.assertJoin) assert.equal(ok, true, `${name} could not join`);
    return socket;
  };
  const seat = (i: number) => {
    const id = room.playerIdBySocket(sockets[i])!;
    return { id, token: room.sessionToken(id)! };
  };
  return { room, sockets, join, seat, picks, saved, vacant: () => vacant };
}

/** testRoom with its first `humans` seats joined as h0, h1, … */
export async function testRoomWithHumans(
  roomId: string,
  io: RoomEmitter,
  opts: TestRoomOptions & { humans: number }
): Promise<TestRoom> {
  const r = testRoom(roomId, io, opts);
  for (let i = 0; i < opts.humans; i++) await r.join(`h${i}`);
  return r;
}

/**
 * express app on an ephemeral port for one scenario. `json` adds express.json() (the voice routes read a JSON body),
 * `host` binds one interface (history listens on 127.0.0.1 only).
 */
export async function withHttpServer(
  register: (app: express.Express) => void,
  fn: (base: string) => Promise<void>,
  opts: { json?: boolean; host?: string } = {}
): Promise<void> {
  const app = express();
  if (opts.json) app.use(express.json());
  register(app);
  const server = opts.host ? app.listen(0, opts.host) : app.listen(0);
  await new Promise<void>((r) => server.once('listening', () => r()));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    await fn(base);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
}
