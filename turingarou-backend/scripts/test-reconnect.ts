/**
 * A human's seat follows their session token to a new socket: valid token, unknown token, token of another room,
 * grace over, lobby grace, leaving on purpose, and the voice routes (X-Voice-Socket) following the new socket.
 *
 *   npx tsx scripts/test-reconnect.ts
 */
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { GameRoom, LOBBY_GRACE_MS, QUESTION_PHASE_MS, RECONNECT_GRACE_MS, RoomEmitter } from '../src/game/GameRoom.js';
import type { ChatProvider } from '../src/llm/chatClient.js';
import { makeSeededRng } from '../src/game/humanTiming.js';
import { registerVoiceRoutes, type VoiceRoom } from '../src/voice/routes.js';
import type { TtsProvider, TtsResult } from '../src/voice/providers.js';

let failures = 0;
const check = async (name: string, fn: () => void | Promise<void>) => {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
  } catch (e: any) {
    failures++;
    console.log(`  ✗ ${name} — ${e.message}`);
  }
};

class ManualClock {
  t = 1_800_000_000_000;
  private seq = 0;
  private timers = new Map<number, { at: number; fn: () => void }>();
  now = (): number => this.t;
  setTimeout = (fn: () => void, ms: number): number => {
    this.timers.set(++this.seq, { at: this.t + Math.max(0, ms), fn });
    return this.seq;
  };
  clearTimeout = (h: unknown): void => {
    this.timers.delete(h as number);
  };
  /** Fires every timer due within ms, in order, then lands exactly ms later. */
  advance(ms: number): void {
    const end = this.t + ms;
    for (;;) {
      let next: [number, { at: number; fn: () => void }] | null = null;
      for (const e of this.timers) if (e[1].at <= end && (!next || e[1].at < next[1].at || (e[1].at === next[1].at && e[0] < next[0]))) next = e;
      if (!next) break;
      this.timers.delete(next[0]);
      this.t = next[1].at;
      next[1].fn();
    }
    this.t = end;
  }
}

// Bots answer SKIP and their decisions fail to parse: none of this test depends on what they say.
const quietModel: ChatProvider = {
  name: 'Fake/quiet',
  model: 'quiet',
  supportsJson: true,
  chat: async () => ({ text: 'SKIP', finishReason: 'stop', latencyMs: 1, provider: 'Fake/quiet', model: 'quiet' }),
};

async function makeRoom(roomId: string, humans: number) {
  const clock = new ManualClock();
  const emits: Record<string, unknown>[] = [];
  const io: RoomEmitter = { to: () => ({ emit: (event: string, payload: unknown) => (event === 'gameState' ? emits.push(payload as Record<string, unknown>) : 0) }) };
  const pool = ['ana', 'ben', 'cleo', 'dan', 'eva', 'fred', 'gina', 'hugo', 'ivy', 'jo'];
  const used = new Set<string>();
  let vacant = 0;
  const room = new GameRoom(roomId, io, [quietModel], 3, {
    clock,
    rng: makeSeededRng(7),
    names: { add: (n) => used.add(n), pick: (ex) => pool.find((n) => !used.has(n) && !ex.includes(n)) ?? 'zed' },
    strategies: { aiPlayer: async () => ({ name: 'test', content: 'play' }), inspector: async () => 'inspect' },
    persistence: { saveGameLog: async () => {}, updateHumanProfiles: async () => {}, saveMessageFlag: async () => {}, getRandomHumanProfile: async () => null },
    log: () => {},
    onVacant: () => vacant++,
  });
  const sockets: string[] = [];
  for (let i = 0; i < humans; i++) {
    sockets.push(`${roomId}-sock-${i}`);
    await room.addHumanPlayer(sockets[i], `h${i}`, 'fr');
  }
  const seat = (i: number) => {
    const id = room.playerIdBySocket(sockets[i])!;
    return { id, token: room.sessionToken(id)! };
  };
  return { room, clock, emits, sockets, seat, vacant: () => vacant };
}

const started = async (roomId: string) => {
  const r = await makeRoom(roomId, 5);
  assert.equal(r.room.getState().phase, 'question', 'the room did not start with 5 humans');
  return r;
};

await check('valid token: the new socket takes the seat and plays, the old one plays for nobody, nothing is broadcast', async () => {
  const { room, clock, emits, sockets, seat } = await started('A');
  const { id, token } = seat(0);
  const before = emits.length;
  room.disconnect(sockets[0]);
  clock.advance(QUESTION_PHASE_MS + 5_000);
  const phaseEmits = emits.length;
  const got = room.resume('A-new', token);
  assert.equal(emits.length, phaseEmits, 'resume broadcast a state');
  assert.ok(phaseEmits > before, 'the game did not move on while the player was away');
  assert.deepEqual(got, { playerId: id, previousSocketId: sockets[0] });
  assert.equal(room.playerIdBySocket(sockets[0]), null);
  assert.equal(room.playerIdBySocket('A-new'), id);
  assert.equal(room.getState().phase, 'discussion');
  assert.equal(room.addMessage(room.playerIdBySocket('A-new')!, 'je suis revenu'), true, 'the resumed seat cannot post');
  assert.ok(!JSON.stringify(room.publicState()).includes(token), 'token in the public state');
  assert.ok(!emits.some((e) => JSON.stringify(e).includes(token)), 'token in a broadcast state');
});

await check('unknown, empty or malformed token: refused', async () => {
  const { room, sockets } = await started('B');
  room.disconnect(sockets[1]);
  assert.equal(room.resume('B-x', 'not-a-token'), null);
  assert.equal(room.resume('B-x', ''), null);
  assert.equal(room.resume('B-x', undefined as unknown as string), null);
  assert.equal(room.resume('', room.sessionToken(room.getState().players.find((p) => p.type === 'human' && p.socketId === sockets[1])!.id)!), null, 'empty socket id accepted');
});

await check('token of another room: refused both ways', async () => {
  const a = await started('C1');
  const b = await makeRoom('C2', 2);
  a.room.disconnect(a.sockets[0]);
  b.room.disconnect(b.sockets[0]);
  assert.equal(a.room.resume('C-x', b.seat(1).token), null);
  assert.equal(b.room.resume('C-y', a.seat(1).token), null);
});

await check('grace: accepted 1 ms before its end; once over, refused and the seat stays as a silent player', async () => {
  const early = await started('D1');
  const e0 = early.seat(0);
  early.room.disconnect(early.sockets[0]);
  early.clock.advance(RECONNECT_GRACE_MS - 1);
  assert.equal(early.room.resume('D1-new', e0.token)?.playerId, e0.id);

  const late = await started('D2');
  const { id, token } = late.seat(0);
  late.room.disconnect(late.sockets[0]);
  late.clock.advance(RECONNECT_GRACE_MS);
  assert.equal(late.room.resume('D2-new', token), null);
  assert.equal(late.room.playerIdBySocket(late.sockets[0]), null, 'the dropped socket still plays');
  assert.ok(late.room.getState().players.some((p) => p.id === id && !p.isEliminated), 'the seat left the game');
});

await check('lobby: the seat waits LOBBY_GRACE_MS then frees, a resume within keeps it', async () => {
  const { room, clock, emits, sockets, seat } = await makeRoom('E', 2);
  const { id, token } = seat(0);
  room.disconnect(sockets[0]);
  clock.advance(LOBBY_GRACE_MS - 1);
  assert.equal(room.getState().players.length, 2);
  assert.equal(room.resume('E-new', token)?.playerId, id);
  room.disconnect('E-new');
  const before = emits.length;
  clock.advance(LOBBY_GRACE_MS);
  assert.equal(room.getState().players.length, 1, 'the lobby seat was not freed');
  assert.equal(emits.length, before + 1, 'the freed lobby seat was not broadcast');
  assert.equal(room.resume('E-again', token), null);
});

await check('leaving on purpose: seat kept silent, never resumable; last human out aborts and frees the room once', async () => {
  const { room, sockets, seat, vacant } = await started('F');
  const tokens = sockets.map((_, i) => seat(i).token);
  room.leave(sockets[0]);
  assert.equal(room.resume('F-new', tokens[0]), null);
  assert.equal(room.getState().players.length, 8, 'a player who left vanished from the list');
  for (const s of sockets.slice(1)) room.leave(s);
  assert.equal(room.getState().phase, 'waiting', 'the game was not aborted');
  assert.equal(room.pendingTimers(), 0);
  assert.equal(vacant(), 1);
  assert.equal(room.resume('F-x', tokens[1]), null, 'resume into an aborted room');
});

class FakeTts implements TtsProvider {
  readonly name = 'cartesia';
  readonly model = 'fake';
  async synthesize(text: string, voiceId: string): Promise<TtsResult> {
    return { audio: Buffer.from(`${voiceId}|${text}`), mime: 'audio/mpeg' };
  }
}

await check('voice routes follow the seat to its new socket (X-Voice-Socket)', async () => {
  const { room, clock, sockets, seat } = await started('G');
  const { token } = seat(2);
  clock.advance(QUESTION_PHASE_MS);
  assert.equal(room.addMessage(seat(1).id, 'salut'), true);
  const messageId = room.getState().messages.at(-1)!.id;
  room.disconnect(sockets[2]);
  assert.ok(room.resume('G-new', token));
  const app = express();
  registerVoiceRoutes(app, new Map<string, VoiceRoom>([['G', room]]), { tts: new FakeTts(), stt: null });
  const server = app.listen(0);
  await new Promise<void>((r) => server.once('listening', () => r()));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const tts = (socket: string) =>
    fetch(`${base}/api/voice/tts`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Voice-Room': 'G', 'X-Voice-Socket': socket }, body: JSON.stringify({ messageId }) });
  try {
    assert.equal((await tts('G-new')).status, 200, 'new socket refused');
    assert.equal((await tts(sockets[2])).status, 403, 'old socket still accepted');
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
});

console.log(failures ? `\n${failures} échec(s)` : '\nTout est vert');
process.exit(failures ? 1 : 0);
