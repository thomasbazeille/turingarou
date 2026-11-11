import { strict as assert } from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { AudioCache, RateWindow } from '../src/voice/cache.js';
import { GradiumStt, GradiumTts, providersFromEnv, wavDurationSec } from '../src/voice/providers.js';
import type { Lang, SttProvider, SttResult, TtsProvider, TtsResult } from '../src/voice/providers.js';
import { registerVoiceRoutes, type VoiceOptions, type VoiceRoom } from '../src/voice/routes.js';
import { normalizeTranscript, spokenText, wordSimilarity } from '../src/voice/text.js';
import { assignVoices, loadGradiumVoices, VoiceBook, voicePool, type VoiceDef } from '../src/voice/voices.js';

const failures: string[] = [];
let passed = 0;
const queue: { name: string; fn: () => void | Promise<void> }[] = [];

function test(name: string, fn: () => void | Promise<void>): void {
  queue.push({ name, fn });
}

const PLAYERS = ['player-1-0.1', 'player-2-0.2', 'player-3-0.3', 'player-4-0.4', 'player-5-0.5', 'ai-1-0.6', 'ai-2-0.7', 'ai-3-0.8'];

// --- voice assignment ---

test('assignment is deterministic and independent of player order', () => {
  const pool = voicePool('cartesia', 'fr');
  const a = assignVoices('room-x', PLAYERS, pool);
  const b = assignVoices('room-x', [...PLAYERS].reverse(), pool);
  for (const id of PLAYERS) assert.equal(a.get(id)?.id, b.get(id)?.id, id);
});

test('8 players get 8 distinct voices, for every provider and language', () => {
  for (const provider of ['cartesia', 'elevenlabs', 'openai']) {
    for (const lang of ['fr', 'en'] as Lang[]) {
      const pool = voicePool(provider, lang);
      assert.ok(pool.length >= 8, `${provider}/${lang} pool ${pool.length}`);
      assert.equal(new Set(pool.map((v) => v.id)).size, pool.length, `${provider}/${lang} duplicate ids`);
      for (const seed of ['r1', 'r2', 'public-1793', 'game-abc']) {
        const map = assignVoices(seed, PLAYERS, pool);
        assert.equal(new Set([...map.values()].map((v) => v.id)).size, 8, `${provider}/${lang}/${seed}`);
      }
    }
  }
});

test('assignment varies across games', () => {
  const pool = voicePool('cartesia', 'en');
  const seeds = ['g1', 'g2', 'g3', 'g4', 'g5'];
  const firstVoices = new Set(seeds.map((s) => assignVoices(s, PLAYERS, pool).get(PLAYERS[0])!.id));
  assert.ok(firstVoices.size > 1, 'same voice for player 1 in 5 games');
});

test('VoiceBook freezes a room: a departure shifts nobody, the departed keeps their voice, strangers get none', () => {
  const book = new VoiceBook();
  const room = {};
  const pool = voicePool('cartesia', 'fr');
  const before = new Map(PLAYERS.map((id) => [id, book.voiceFor(room, 'room-y', PLAYERS, pool, id)!.id]));
  const remaining = PLAYERS.filter((id) => id !== 'player-3-0.3');
  for (const id of remaining) assert.equal(book.voiceFor(room, 'room-y', remaining, pool, id)!.id, before.get(id));
  assert.equal(book.voiceFor(room, 'room-y', remaining, pool, 'player-3-0.3')!.id, before.get('player-3-0.3'));
  assert.equal(book.voiceFor(room, 'room-y', remaining, pool, 'system'), null);
});

// --- cache and limits ---

const audio = (n: number, tag = 'x'): TtsResult => ({ audio: Buffer.alloc(n, tag), mime: 'audio/mpeg' });

test('cache evicts least-recently-used entries to stay under its byte cap', () => {
  const cache = new AudioCache(1000);
  cache.set('a', audio(400));
  cache.set('b', audio(400));
  cache.get('a');
  cache.set('c', audio(400));
  assert.ok(cache.totalBytes <= 1000, `bytes ${cache.totalBytes}`);
  assert.ok(cache.get('a'), 'recently read entry evicted');
  assert.equal(cache.get('b'), undefined, 'oldest entry kept');
  cache.set('huge', audio(1001));
  assert.equal(cache.get('huge'), undefined, 'entry larger than the cap stored');
  for (let i = 0; i < 50; i++) cache.set(`k${i}`, audio(90));
  assert.ok(cache.totalBytes <= 1000 && cache.size <= 11, `size ${cache.size}, bytes ${cache.totalBytes}`);
});

test('rate window: limit per window, by cost, and refills after the window', () => {
  let t = 0;
  const w = new RateWindow(3, 1000, () => t);
  assert.ok(w.take('k') && w.take('k') && w.take('k'));
  assert.equal(w.take('k'), false);
  assert.ok(w.take('other'));
  t = 1000;
  assert.ok(w.take('k'));
  const chars = new RateWindow(100, 1000, () => t);
  assert.ok(chars.take('all', 60));
  assert.equal(chars.take('all', 41), false);
  assert.ok(chars.take('all', 40));
});

// --- text ---

test('spokenText strips links and emoji, cuts at a word, refuses the unspeakable', () => {
  assert.equal(spokenText('regarde https://x.y/z 😂 trop drôle', 300), 'regarde trop drôle');
  assert.equal(spokenText('😂😂 ...', 300), '');
  const cut = spokenText('mot '.repeat(200), 50);
  assert.ok(cut.length <= 50 && !cut.endsWith(' ') && cut.endsWith('mot'), cut);
});

test('normalizeTranscript: fillers out, chat casing, no final period', () => {
  assert.deepEqual(normalizeTranscript('Euh, je pense que c’est Paul. Hum.', { casing: 'lower' }), { text: 'je pense que c’est paul', truncated: false });
  assert.equal(normalizeTranscript('Um, I think Jake is lying.', { casing: 'sentence' }).text, 'I think jake is lying');
  assert.equal(normalizeTranscript('Attends, quoi ?', { casing: 'lower' }).text, 'attends, quoi?');
  assert.equal(normalizeTranscript('Bah non...', { casing: 'lower' }).text, 'bah non...');
  assert.equal(normalizeTranscript('  euh  ', { casing: 'lower' }).text, '');
});

test('normalizeTranscript caps a long transcript like an AI line (25 words / 140 chars)', () => {
  const long = normalizeTranscript('alors '.repeat(40), { casing: 'lower' });
  assert.ok(long.truncated && long.text.split(' ').length <= 25 && long.text.length <= 140, long.text);
});

test('wordSimilarity: 1 for equal up to case/accents/punctuation, lower for errors', () => {
  assert.equal(wordSimilarity('Ça me paraît louche.', 'ca me parait louche'), 1);
  assert.ok(wordSimilarity('kinda sus', 'kinda suss') < 1);
});

test('voice is off by default and needs the chosen provider key', () => {
  assert.equal(providersFromEnv({ CARTESIA_API_KEY: 'k', DEEPGRAM_API_KEY: 'k' }).tts, null);
  const on = providersFromEnv({ VOICE_ENABLED: '1', CARTESIA_API_KEY: "'k'", DEEPGRAM_API_KEY: 'k' });
  assert.equal(on.tts?.name, 'cartesia');
  assert.equal(on.stt?.name, 'deepgram');
  assert.equal(providersFromEnv({ VOICE_ENABLED: '1', VOICE_TTS_PROVIDER: 'elevenlabs', CARTESIA_API_KEY: 'k' }).tts, null);
  assert.equal(providersFromEnv({ VOICE_ENABLED: 'true', DEEPGRAM_API_KEY: 'k' }).stt, null, 'STT without TTS');
});

// --- routes ---

class FakeTts implements TtsProvider {
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

class FakeStt implements SttProvider {
  readonly name = 'deepgram';
  readonly model = 'fake';
  calls = 0;
  next: SttResult = { text: 'Euh, je pense que c’est Paul.', durationSec: 3 };
  async transcribe(): Promise<SttResult> {
    this.calls++;
    return this.next;
  }
}

type FakePlayer = { id: string; type: 'human' | 'ai'; isEliminated: boolean; socketId?: string };

class FakeRoom implements VoiceRoom {
  posted: { playerId: string; content: string }[] = [];
  inputs: unknown[] = [];
  constructor(
    public roomId: string,
    public phase: string,
    public players: FakePlayer[],
    public messages: { id: string; playerId: string; content: string }[],
    public language: 'fr' | 'en' = 'fr'
  ) {}
  getState() {
    return { roomId: this.roomId, phase: this.phase, language: this.language, players: this.players, messages: this.messages };
  }
  addMessage(playerId: string, content: string, _replyToId?: unknown, input?: unknown): boolean {
    const p = this.players.find((x) => x.id === playerId);
    if (this.phase !== 'discussion' || !p || p.isEliminated) return false;
    this.posted.push({ playerId, content });
    this.inputs.push(input);
    this.messages.push({ id: `msg-${this.messages.length}`, playerId, content });
    return true;
  }
}

function makeRooms() {
  const a = new FakeRoom(
    'room-a',
    'discussion',
    [
      { id: 'player-h1', type: 'human', isEliminated: false, socketId: 'sock-h1' },
      { id: 'player-h2', type: 'human', isEliminated: false, socketId: 'sock-h2' },
      { id: 'player-out', type: 'human', isEliminated: true, socketId: 'sock-out' },
      { id: 'inspector-1', type: 'human', isEliminated: false, socketId: '' },
      { id: 'ai-1', type: 'ai', isEliminated: false },
      { id: 'ai-2', type: 'ai', isEliminated: false },
    ],
    [
      { id: 'm-ai', playerId: 'ai-1', content: 'salut tout le monde' },
      { id: 'm-h1', playerId: 'player-h1', content: 'qui a dit chaussettes rouges' },
      { id: 'm-h1b', playerId: 'player-h1', content: 'moi je vote lucas' },
      { id: 'm-long', playerId: 'ai-2', content: 'blabla '.repeat(200) },
      { id: 'm-emoji', playerId: 'ai-2', content: '😂😂' },
      { id: 'sys-1', playerId: 'system', content: 'Léa a voté.' },
    ]
  );
  const b = new FakeRoom('room-b', 'discussion', [{ id: 'player-b1', type: 'human', isEliminated: false, socketId: 'sock-b1' }], [
    { id: 'm-b', playerId: 'player-b1', content: 'hello' },
  ]);
  return { a, b, map: new Map<string, VoiceRoom>([['room-a', a], ['room-b', b]]) };
}

async function withServer(opts: VoiceOptions, rooms: Map<string, VoiceRoom>, fn: (base: string) => Promise<void>): Promise<void> {
  const app = express();
  app.use(express.json());
  registerVoiceRoutes(app, rooms, opts);
  const server = app.listen(0);
  await new Promise<void>((r) => server.once('listening', () => r()));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    await fn(base);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
}

function tts(base: string, body: unknown, room = 'room-a', socket = 'sock-h1'): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (room) headers['X-Voice-Room'] = room;
  if (socket) headers['X-Voice-Socket'] = socket;
  return fetch(`${base}/api/voice/tts`, { method: 'POST', headers, body: JSON.stringify(body) });
}

function stt(base: string, bytes: number, opts: { room?: string; socket?: string; mime?: string } = {}): Promise<Response> {
  return fetch(`${base}/api/voice/stt`, {
    method: 'POST',
    headers: { 'X-Voice-Room': opts.room ?? 'room-a', 'X-Voice-Socket': opts.socket ?? 'sock-h1', 'Content-Type': opts.mime ?? 'audio/webm;codecs=opus' },
    body: new Uint8Array(bytes),
  });
}

test('config reflects providers; everything answers 503 when voice is off', async () => {
  const { map } = makeRooms();
  await withServer({ tts: new FakeTts(), stt: new FakeStt() }, map, async (base) => {
    assert.deepEqual(await (await fetch(`${base}/api/voice/config`)).json(), { tts: true, stt: true, sttFormat: 'any', maxClipSec: 15, maxClipBytes: 800 * 1024 });
  });
  await withServer({ tts: null, stt: null }, map, async (base) => {
    const cfg = await (await fetch(`${base}/api/voice/config`)).json();
    assert.equal(cfg.tts, false);
    assert.equal(cfg.stt, false);
    assert.equal((await tts(base, { messageId: 'm-ai' })).status, 503);
    assert.equal((await stt(base, 100)).status, 503);
  });
});

test('TTS auth: headers required, room must exist, socket must be a human member of THAT room', async () => {
  const { map } = makeRooms();
  const fake = new FakeTts();
  await withServer({ tts: fake, stt: null }, map, async (base) => {
    assert.equal((await tts(base, { messageId: 'm-ai' }, '', '')).status, 401);
    assert.equal((await tts(base, { messageId: 'm-ai' }, 'room-a', '')).status, 401, 'empty socket id (inspector) accepted');
    assert.equal((await tts(base, { messageId: 'm-ai' }, 'room-zzz')).status, 404);
    assert.equal((await tts(base, { messageId: 'm-ai' }, 'room-a', 'sock-unknown')).status, 403);
    assert.equal((await tts(base, { messageId: 'm-ai' }, 'room-a', 'sock-b1')).status, 403, 'member of another room');
    assert.equal((await tts(base, { messageId: 'm-b' }, 'room-a', 'sock-h1')).status, 404, 'message of another room');
    assert.equal((await tts(base, { messageId: 'm-ai' }, 'room-a', 'sock-out')).status, 200, 'eliminated players still listen');
  });
});

test('TTS speaks only the stored line: client text is ignored, unknown/system lines refused', async () => {
  const { map } = makeRooms();
  const fake = new FakeTts();
  await withServer({ tts: fake, stt: null }, map, async (base) => {
    const res = await tts(base, { messageId: 'm-ai', text: 'INJECTED', voiceId: 'evil' });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'audio/mpeg');
    assert.ok((await res.text()).endsWith('|salut tout le monde'));
    assert.equal((await tts(base, { text: 'free text please' })).status, 404);
    assert.equal((await tts(base, { messageId: 'nope' })).status, 404);
    assert.equal((await tts(base, { messageId: 'sys-1' })).status, 404, 'system line spoken');
    assert.equal((await tts(base, { messageId: 'm-emoji' })).status, 422);
    assert.ok(fake.calls.every((c) => !c.text.includes('INJECTED') && c.voiceId !== 'evil'));
  });
});

test('TTS: one voice per author, distinct between authors, long lines capped', async () => {
  const { map } = makeRooms();
  const fake = new FakeTts();
  await withServer({ tts: fake, stt: null, maxTtsChars: 120 }, map, async (base) => {
    for (const id of ['m-ai', 'm-h1', 'm-h1b', 'm-long']) assert.equal((await tts(base, { messageId: id })).status, 200, id);
    const [ai, h1, h1b, long] = fake.calls;
    assert.equal(h1.voiceId, h1b.voiceId);
    assert.notEqual(ai.voiceId, h1.voiceId);
    assert.ok(long.text.length <= 120, `${long.text.length} chars`);
    assert.ok(voicePool('cartesia', 'fr').some((v: VoiceDef) => v.id === ai.voiceId));
  });
});

test('TTS cache and in-flight dedup: 5 listeners, one synthesis', async () => {
  const { map } = makeRooms();
  const fake = new FakeTts();
  fake.delayMs = 60;
  await withServer({ tts: fake, stt: null }, map, async (base) => {
    const sockets = ['sock-h1', 'sock-h2', 'sock-out', 'sock-h1', 'sock-h2'];
    const res = await Promise.all(sockets.map((s) => tts(base, { messageId: 'm-h1' }, 'room-a', s)));
    assert.deepEqual(res.map((r) => r.status), [200, 200, 200, 200, 200]);
    assert.equal(fake.calls.length, 1, 'concurrent requests synthesized twice');
    assert.equal((await tts(base, { messageId: 'm-h1' })).status, 200);
    assert.equal(fake.calls.length, 1, 'cache miss on a repeated line');
  });
});

test('TTS limits: per-member request rate, per-room character budget', async () => {
  const { map } = makeRooms();
  await withServer({ tts: new FakeTts(), stt: null, memberTtsPerMin: 2 }, map, async (base) => {
    assert.equal((await tts(base, { messageId: 'm-ai' })).status, 200);
    assert.equal((await tts(base, { messageId: 'm-ai' })).status, 200);
    assert.equal((await tts(base, { messageId: 'm-ai' })).status, 429);
    assert.equal((await tts(base, { messageId: 'm-ai' }, 'room-a', 'sock-h2')).status, 200, 'limit shared between members');
  });
  const fresh = makeRooms();
  await withServer({ tts: new FakeTts(), stt: null, roomCharBudget: 40 }, fresh.map, async (base) => {
    assert.equal((await tts(base, { messageId: 'm-ai' })).status, 200);
    const over = await tts(base, { messageId: 'm-h1' });
    assert.equal(over.status, 429);
    assert.equal((await over.json()).error, 'budget');
    assert.equal((await tts(base, { messageId: 'm-ai' })).status, 200, 'cached line refused once over budget');
  });
});

test('STT posts the normalized transcript through room.addMessage as the speaker', async () => {
  const { a, map } = makeRooms();
  const fake = new FakeStt();
  await withServer({ tts: new FakeTts(), stt: fake }, map, async (base) => {
    const res = await stt(base, 2000);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.deepEqual(a.posted, [{ playerId: 'player-h1', content: body.text }]);
    assert.deepEqual(a.inputs, [{ via: 'voice' }], 'a spoken line is marked as such for the text/voice A/B');
    assert.match(body.text, /^je pense que c’est paul$/i);
  });
});

test('STT refusals: auth, phase, eliminated, mime, empty, size, duration', async () => {
  const { a, map } = makeRooms();
  const fake = new FakeStt();
  await withServer({ tts: new FakeTts(), stt: fake, maxClipBytes: 1000 }, map, async (base) => {
    assert.equal((await stt(base, 100, { socket: 'sock-b1' })).status, 403);
    assert.equal((await stt(base, 100, { socket: 'sock-out' })).status, 409, 'eliminated player posted');
    assert.equal((await stt(base, 100, { mime: 'text/plain' })).status, 415);
    assert.equal((await stt(base, 0)).status, 400);
    assert.equal((await stt(base, 2000)).status, 413);
    fake.next = { text: 'un très long monologue', durationSec: 40 };
    assert.equal((await stt(base, 500)).status, 413);
    fake.next = { text: 'euh...', durationSec: 2 };
    assert.equal((await stt(base, 500)).status, 422);
    a.phase = 'voting';
    assert.equal((await stt(base, 500)).status, 409);
    assert.equal(a.posted.length, 0, `posted: ${JSON.stringify(a.posted)}`);
    assert.equal(fake.calls, 2, 'STT paid for a request refused before transcription');
  });
});

test('STT rate limit per member', async () => {
  const { map } = makeRooms();
  await withServer({ tts: new FakeTts(), stt: new FakeStt(), sttPerMin: 2 }, map, async (base) => {
    assert.equal((await stt(base, 100)).status, 200);
    assert.equal((await stt(base, 100)).status, 200);
    assert.equal((await stt(base, 100)).status, 429);
    assert.equal((await stt(base, 100, { socket: 'sock-h2' })).status, 200);
  });
});

// --- gradium ---

type Call = { url: string; init: RequestInit };

async function withFetch<T>(reply: (url: string) => Response, fn: (calls: Call[]) => Promise<T>): Promise<T> {
  const real = globalThis.fetch;
  const calls: Call[] = [];
  globalThis.fetch = (async (input: any, init: RequestInit = {}) => {
    const url = String(input);
    calls.push({ url, init });
    return reply(url);
  }) as typeof fetch;
  try {
    return await fn(calls);
  } finally {
    globalThis.fetch = real;
  }
}

function wavBytes(seconds: number, opts: { listChunk?: boolean; rate?: number } = {}): Buffer {
  const rate = opts.rate ?? 24000;
  const data = Buffer.alloc(Math.round(seconds * rate * 2));
  const list = opts.listChunk ? Buffer.concat([Buffer.from('LIST'), Buffer.from([4, 0, 0, 0]), Buffer.from('INFO')]) : Buffer.alloc(0);
  const head = Buffer.alloc(36);
  head.write('RIFF', 0);
  head.writeUInt32LE(36 + list.length + 8 + data.length, 4);
  head.write('WAVE', 8);
  head.write('fmt ', 12);
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20);
  head.writeUInt16LE(1, 22);
  head.writeUInt32LE(rate, 24);
  head.writeUInt32LE(rate * 2, 28);
  head.writeUInt16LE(2, 32);
  head.writeUInt16LE(16, 34);
  const dataHead = Buffer.alloc(8);
  dataHead.write('data', 0);
  dataHead.writeUInt32LE(data.length, 4);
  return Buffer.concat([head, list, dataHead, data]);
}

const ndjson = (...lines: object[]) => new Response(lines.map((l) => JSON.stringify(l)).join('\n') + '\n', { headers: { 'Content-Type': 'application/x-ndjson' } });

test('gradium TTS: URL, x-api-key, JSON body, wav result', async () => {
  await withFetch(() => new Response(wavBytes(1), { headers: { 'Content-Type': 'audio/wav' } }), async (calls) => {
    const out = await new GradiumTts('k-test', 'm1').synthesize('salut', 'voice-uid', 'fr');
    assert.equal(out.mime, 'audio/wav');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://api.gradium.ai/api/post/speech/tts');
    assert.equal(calls[0].init.method, 'POST');
    assert.equal((calls[0].init.headers as Record<string, string>)['x-api-key'], 'k-test');
    const body = JSON.parse(calls[0].init.body as string);
    assert.deepEqual(body, { text: 'salut', voice_id: 'voice-uid', output_format: 'wav', only_audio: true, model_name: 'm1', json_config: '{"rewrite_rules":"fr"}' });
  });
  await withFetch(() => new Response('boom', { status: 500 }), async () => {
    await assert.rejects(new GradiumTts('k').synthesize('x', 'v', 'en'), /gradium-tts HTTP 500: boom/);
  });
});

test('gradium STT: request shape, texts joined, ndjson without text lines', async () => {
  const reply = () => ndjson({ type: 'text', text: 'je pense', start_s: 0 }, { type: 'text', text: 'que c’est Paul', start_s: 1 }, { type: 'end_text', stop_s: 2.5 });
  await withFetch(reply, async (calls) => {
    const out = await new GradiumStt('k-test').transcribe(Buffer.from('OggS-fake'), 'audio/ogg;codecs=opus', 'fr');
    assert.deepEqual(out, { text: 'je pense que c’est Paul', durationSec: 2.5 });
    const u = new URL(calls[0].url);
    assert.equal(u.origin + u.pathname, 'https://api.gradium.ai/api/post/speech/asr');
    assert.equal(u.searchParams.get('json_config'), '{"language":"fr"}');
    assert.equal(u.searchParams.get('model'), 'default');
    const h = calls[0].init.headers as Record<string, string>;
    assert.equal(h['x-api-key'], 'k-test');
    assert.equal(h['Content-Type'], 'audio/ogg');
  });
  await withFetch(() => ndjson({ type: 'end_text', stop_s: 1 }), async () => {
    assert.deepEqual(await new GradiumStt('k').transcribe(Buffer.from('x'), 'audio/pcm', 'en'), { text: '', durationSec: 1 });
  });
});

test('gradium STT: error line throws, HTTP error throws', async () => {
  await withFetch(() => ndjson({ type: 'text', text: 'début' }, { type: 'error', message: 'bad audio' }), async () => {
    await assert.rejects(new GradiumStt('k').transcribe(Buffer.from('x'), 'audio/wav', 'fr'), /bad audio/);
  });
  await withFetch(() => new Response('nope', { status: 401 }), async () => {
    await assert.rejects(new GradiumStt('k').transcribe(Buffer.from('x'), 'audio/wav', 'fr'), /HTTP 401/);
  });
});

test('gradium STT refuses webm, mp4, mp3 before any request', async () => {
  await withFetch(() => ndjson(), async (calls) => {
    for (const mime of ['audio/webm;codecs=opus', 'audio/mp4', 'audio/mpeg', 'video/webm']) {
      await assert.rejects(new GradiumStt('k').transcribe(Buffer.from('x'), mime, 'fr'), /accepts wav, pcm, ogg or opus/, mime);
    }
    assert.equal(calls.length, 0);
  });
});

test('WAV duration from the header: data chunk found past an extra chunk, WAV beats stop_s', async () => {
  assert.equal(wavDurationSec(wavBytes(3)), 3);
  assert.equal(wavDurationSec(wavBytes(2, { listChunk: true })), 2);
  assert.equal(wavDurationSec(wavBytes(1.5, { rate: 16000 })), 1.5);
  assert.equal(wavDurationSec(Buffer.from('not a wav at all, just text padding to pass 44 bytes....')), null);
  await withFetch(() => ndjson({ type: 'text', text: 'a', start_s: 0 }, { type: 'end_text', stop_s: 9 }), async () => {
    const out = await new GradiumStt('k').transcribe(wavBytes(4, { listChunk: true }), 'audio/wav', 'fr');
    assert.equal(out.durationSec, 4);
  });
});

test('providersFromEnv picks gradium for both directions, only with its key', () => {
  const env = { VOICE_ENABLED: '1', VOICE_TTS_PROVIDER: 'gradium', VOICE_STT_PROVIDER: 'gradium', GRADIUM_API_KEY: "'dummy'" };
  const on = providersFromEnv(env);
  assert.equal(on.tts?.name, 'gradium');
  assert.equal(on.stt?.name, 'gradium');
  assert.equal(providersFromEnv({ ...env, GRADIUM_API_KEY: '' }).tts, null);
  assert.equal(providersFromEnv({ VOICE_ENABLED: '1', CARTESIA_API_KEY: 'k', DEEPGRAM_API_KEY: 'k' }).tts?.name, 'cartesia', 'default changed');
});

test('gradium catalogue loader: is_catalog only, sorted by rank, per-language pool, warns under 8', async () => {
  const fr = [
    { uid: 'c', name: 'C', is_catalog: true, rank: 3 },
    { uid: 'mine', name: 'Mine', is_catalog: false, rank: 0 },
    { uid: 'a', name: 'A', is_catalog: true, rank: 1 },
    { uid: 'b', name: 'B', is_catalog: true, rank: 2 },
  ];
  const en = Array.from({ length: 9 }, (_, i) => ({ uid: `e${8 - i}`, name: `E${i}`, is_catalog: true, rank: 8 - i }));
  const warns: string[] = [];
  const realWarn = console.warn;
  console.warn = (m: string) => void warns.push(String(m));
  const urls: string[] = [];
  try {
    assert.deepEqual(voicePool('gradium', 'fr'), [], 'not empty before loading');
    const fakeFetch = (async (url: any, init: any) => {
      urls.push(String(url));
      assert.equal(init.headers['x-api-key'], 'k-test');
      return new Response(JSON.stringify(String(url).includes('fr-fr') ? fr : en));
    }) as typeof fetch;
    const counts = await loadGradiumVoices('k-test', fakeFetch);
    assert.deepEqual(counts, { fr: 3, en: 9 });
  } finally {
    console.warn = realWarn;
  }
  assert.ok(urls[0].includes('include_catalog=true') && urls[0].includes('locale=fr-fr') && urls[1].includes('locale=en-us'));
  assert.deepEqual(voicePool('gradium', 'fr').map((v) => v.id), ['a', 'b', 'c']);
  assert.deepEqual(voicePool('gradium', 'en').map((v) => v.id), Array.from({ length: 9 }, (_, i) => `e${i}`));
  assert.equal(warns.length, 1);
  assert.match(warns[0], /3 fr voices/);
  assert.ok(!warns[0].includes('k-test'));
  const map = assignVoices('seed', PLAYERS, voicePool('gradium', 'en'));
  assert.equal(new Set([...map.values()].map((v) => v.id)).size, 8);
});

test('config says sttFormat wav for a gradium STT', async () => {
  const { map } = makeRooms();
  const g = new GradiumStt('k');
  await withServer({ tts: new FakeTts(), stt: g }, map, async (base) => {
    const cfg = await (await fetch(`${base}/api/voice/config`)).json();
    assert.equal(cfg.sttFormat, 'wav');
    assert.equal(cfg.maxClipBytes, 800 * 1024);
  });
});

for (const { name, fn } of queue) {
  try {
    await fn();
    passed++;
    console.log(`✅ ${name}`);
  } catch (err) {
    failures.push(name);
    console.log(`❌ ${name}\n   ${err instanceof Error ? err.message : String(err)}`);
  }
}

console.log(`\n${passed} passed, ${failures.length} failed, ${passed + failures.length} total`);
if (failures.length > 0) {
  console.error(`Failed cases: ${failures.join(' | ')}`);
  process.exit(1);
}
