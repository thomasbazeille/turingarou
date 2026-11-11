import express from 'express';
import type { Express, Request, Response } from 'express';
import { createHash } from 'crypto';
import { AudioCache, RateWindow } from './cache.js';
import { GradiumTts, providersFromEnv } from './providers.js';
import type { Lang, SttProvider, TtsProvider, TtsResult } from './providers.js';
import { normalizeTranscript, spokenText } from './text.js';
import type { LineInput } from '../game/measures.js';
import { loadGradiumVoices, VoiceBook, voicePool } from './voices.js';

/** The slice of GameRoom the voice routes need; GameRoom satisfies it structurally. */
export interface VoiceRoom {
  getState(): {
    roomId: string;
    phase: string;
    language?: 'fr' | 'en';
    players: ReadonlyArray<{ id: string; type: 'human' | 'ai'; isEliminated: boolean; socketId?: string }>;
    messages: ReadonlyArray<{ id: string; playerId: string; content: string }>;
  };
  addMessage(playerId: string, content: string, replyToId?: unknown, input?: LineInput): boolean;
}

export interface VoiceOptions {
  /** Providers; default: from env (VOICE_ENABLED, VOICE_TTS_PROVIDER, VOICE_STT_PROVIDER + their keys). */
  tts?: TtsProvider | null;
  stt?: SttProvider | null;
  maxTtsChars?: number;
  cacheBytes?: number;
  /** Provider syntheses per room per minute (cache hits are free). */
  roomSynthPerMin?: number;
  /** Characters synthesized per room over its whole life: the cost ceiling of one game. */
  roomCharBudget?: number;
  /** Characters synthesized per hour, all rooms together. */
  globalCharsPerHour?: number;
  /** TTS requests per member per minute, cache hits included. */
  memberTtsPerMin?: number;
  sttPerMin?: number;
  maxClipBytes?: number;
  maxClipSec?: number;
  now?: () => number;
}

const DEFAULTS = {
  maxTtsChars: 300,
  cacheBytes: 48 * 1024 * 1024,
  roomSynthPerMin: 60,
  roomCharBudget: 40_000,
  globalCharsPerHour: 200_000,
  memberTtsPerMin: 120,
  sttPerMin: 10,
  maxClipBytes: 800 * 1024,
  maxClipSec: 15,
};

const AUDIO_MIME = /^(audio\/[\w.+-]+|video\/webm|video\/mp4)$/;

function sha(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

function langOf(room: VoiceRoom): Lang {
  return room.getState().language === 'en' ? 'en' : 'fr';
}

export function registerVoiceRoutes(app: Express, rooms: ReadonlyMap<string, VoiceRoom>, opts: VoiceOptions = {}): { tts: boolean; stt: boolean } {
  const env = opts.tts === undefined || opts.stt === undefined ? providersFromEnv() : { tts: null, stt: null };
  const tts = opts.tts === undefined ? env.tts : opts.tts;
  const stt = tts ? (opts.stt === undefined ? env.stt : opts.stt) : null;
  const cfg = { ...DEFAULTS, ...Object.fromEntries(Object.entries(opts).filter(([, v]) => typeof v === 'number')) } as typeof DEFAULTS;
  const now = opts.now ?? Date.now;

  const cache = new AudioCache(cfg.cacheBytes);
  const inflight = new Map<string, Promise<TtsResult>>();
  const book = new VoiceBook();
  const roomChars = new WeakMap<VoiceRoom, number>();
  const roomSynth = new RateWindow(cfg.roomSynthPerMin, 60_000, now);
  const globalChars = new RateWindow(cfg.globalCharsPerHour, 3_600_000, now);
  const memberTts = new RateWindow(cfg.memberTtsPerMin, 60_000, now);
  const memberStt = new RateWindow(cfg.sttPerMin, 60_000, now);
  const sttBusy = new Set<string>();

  if (tts instanceof GradiumTts) {
    const apiKey = tts.apiKey;
    const load = (attempt: number): void => {
      loadGradiumVoices(apiKey)
        .then((n) => {
          if (n.fr === 0 || n.en === 0) throw new Error('empty catalogue');
        })
        .catch(() => {
          if (attempt < 3) setTimeout(() => load(attempt + 1), 30_000).unref();
        });
    };
    load(1);
  }

  console.log(tts ? `[voice] TTS ${tts.name}/${tts.model}, STT ${stt ? `${stt.name}/${stt.model}` : 'off'}` : '[voice] off');

  // The socket id is known only to its own client (never broadcast in the game state): it proves room membership.
  // A seat taken back after a dropped connection answers to its new socket only (GameRoom.resume).
  function member(req: Request, res: Response) {
    const roomId = req.get('x-voice-room') ?? '';
    const socketId = req.get('x-voice-socket') ?? '';
    if (!roomId || !socketId) {
      res.status(401).json({ error: 'auth' });
      return null;
    }
    const room = rooms.get(roomId);
    if (!room) {
      res.status(404).json({ error: 'room' });
      return null;
    }
    const player = room.getState().players.find((p) => p.type === 'human' && p.socketId === socketId);
    if (!player) {
      res.status(403).json({ error: 'not_member' });
      return null;
    }
    return { room, player, socketId };
  }

  function sendAudio(res: Response, audio: TtsResult): void {
    res.set({ 'Content-Type': audio.mime, 'Cache-Control': 'no-store' }).send(audio.audio);
  }

  app.get('/api/voice/config', (_req, res) => {
    res.json({ tts: !!tts, stt: !!stt, sttFormat: stt?.name === 'gradium' ? 'wav' : 'any', maxClipSec: cfg.maxClipSec, maxClipBytes: cfg.maxClipBytes });
  });

  // The client names a message, never a text: only lines that exist in the room get spoken.
  app.post('/api/voice/tts', express.json({ limit: '2kb' }), async (req, res) => {
    if (!tts) return void res.status(503).json({ error: 'disabled' });
    const m = member(req, res);
    if (!m) return;
    if (!memberTts.take(m.socketId)) return void res.status(429).json({ error: 'rate' });

    const messageId = typeof req.body?.messageId === 'string' ? req.body.messageId : '';
    const state = m.room.getState();
    const message = state.messages.find((msg) => msg.id === messageId);
    if (!message) return void res.status(404).json({ error: 'message' });

    const lang = langOf(m.room);
    const voice = book.voiceFor(m.room, state.roomId, state.players.map((p) => p.id), voicePool(tts.name, lang), message.playerId);
    if (!voice) return void res.status(404).json({ error: 'author' });
    const text = spokenText(message.content, cfg.maxTtsChars);
    if (!text) return void res.status(422).json({ error: 'unspeakable' });

    const key = sha(`${tts.name}|${tts.model}|${voice.id}|${lang}|${text}`);
    const cached = cache.get(key);
    if (cached) return sendAudio(res, cached);

    let pending = inflight.get(key);
    if (!pending) {
      const spent = roomChars.get(m.room) ?? 0;
      if (spent + text.length > cfg.roomCharBudget || !roomSynth.take(state.roomId) || !globalChars.take('all', text.length)) {
        return void res.status(429).json({ error: 'budget' });
      }
      roomChars.set(m.room, spent + text.length);
      pending = tts.synthesize(text, voice.id, lang).then((audio) => {
        cache.set(key, audio);
        return audio;
      });
      pending.finally(() => inflight.delete(key)).catch(() => {});
      inflight.set(key, pending);
    }
    try {
      sendAudio(res, await pending);
    } catch (err) {
      console.warn(`[voice] TTS failed: ${(err as Error).message}`);
      res.status(502).json({ error: 'tts_failed' });
    }
  });

  // Push-to-talk: the transcript goes through room.addMessage, the same path as a typed line, and is then spoken
  // by /tts in the player's assigned voice like everyone else's.
  const rawAudio = express.raw({ type: () => true, limit: cfg.maxClipBytes });
  const readAudio: express.RequestHandler = (req, res, next) =>
    rawAudio(req, res, (err?: any) => {
      if (!err) return next();
      res.status(err.status ?? 400).json({ error: err.type === 'entity.too.large' ? 'too_large' : 'body' });
    });

  app.post('/api/voice/stt', readAudio, async (req, res) => {
    if (!stt) return void res.status(503).json({ error: 'disabled' });
    const m = member(req, res);
    if (!m) return;
    const mime = (req.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    const audio = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    if (!AUDIO_MIME.test(mime)) return void res.status(415).json({ error: 'mime' });
    if (audio.length === 0) return void res.status(400).json({ error: 'empty_audio' });
    if (m.player.isEliminated || m.room.getState().phase !== 'discussion') return void res.status(409).json({ error: 'phase' });
    if (sttBusy.has(m.socketId)) return void res.status(429).json({ error: 'busy' });
    if (!memberStt.take(m.socketId)) return void res.status(429).json({ error: 'rate' });

    sttBusy.add(m.socketId);
    try {
      const result = await stt.transcribe(audio, mime, langOf(m.room));
      if (result.durationSec !== null && result.durationSec > cfg.maxClipSec + 1) {
        return void res.status(413).json({ error: 'too_long' });
      }
      // Stable per player, same 55 % lower-case share as the AI profiles.
      const lower = parseInt(sha(`${m.room.getState().roomId}|case|${m.player.id}`).slice(0, 8), 16) / 0xffffffff < 0.55;
      const { text, truncated } = normalizeTranscript(result.text, { casing: lower ? 'lower' : 'sentence' });
      if (!text) return void res.status(422).json({ error: 'empty' });
      // A spoken line may answer a message like a typed one (the client sends the quoted id in ?replyTo=).
      if (!m.room.addMessage(m.player.id, text, req.query.replyTo, { via: 'voice' })) return void res.status(409).json({ error: 'not_posted', text });
      res.json({ ok: true, text, truncated });
    } catch (err) {
      console.warn(`[voice] STT failed: ${(err as Error).message}`);
      res.status(502).json({ error: 'stt_failed' });
    } finally {
      sttBusy.delete(m.socketId);
    }
  });

  return { tts: !!tts, stt: !!stt };
}
