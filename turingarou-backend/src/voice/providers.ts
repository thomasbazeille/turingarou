// Speech providers behind two small interfaces, so the vendor is an env var (VOICE_TTS_PROVIDER, VOICE_STT_PROVIDER).
// Plain REST + fetch: CI runs Node 20 (no global WebSocket) and no SDK is added.

export type Lang = 'fr' | 'en';

export interface TtsResult {
  audio: Buffer;
  mime: string;
}

export interface TtsProvider {
  readonly name: string;
  readonly model: string;
  synthesize(text: string, voiceId: string, lang: Lang): Promise<TtsResult>;
}

export interface SttResult {
  text: string;
  /** Audio duration reported by the vendor, null when it does not report one. */
  durationSec: number | null;
}

export interface SttProvider {
  readonly name: string;
  readonly model: string;
  transcribe(audio: Buffer, mime: string, lang: Lang): Promise<SttResult>;
}

const TTS_TIMEOUT_MS = 10_000;
const STT_TIMEOUT_MS = 15_000;

async function okBytes(res: Response, who: string): Promise<Buffer> {
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${who} HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

async function okJson(res: Response, who: string): Promise<any> {
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${who} HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

export class CartesiaTts implements TtsProvider {
  readonly name = 'cartesia';
  constructor(private readonly apiKey: string, readonly model = 'sonic-3') {}

  async synthesize(text: string, voiceId: string, lang: Lang): Promise<TtsResult> {
    const res = await fetch('https://api.cartesia.ai/tts/bytes', {
      method: 'POST',
      headers: { 'X-API-Key': this.apiKey, 'Cartesia-Version': '2025-04-16', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model_id: this.model,
        transcript: text,
        voice: { mode: 'id', id: voiceId },
        language: lang,
        output_format: { container: 'mp3', sample_rate: 44100, bit_rate: 64000 },
      }),
      signal: AbortSignal.timeout(TTS_TIMEOUT_MS),
    });
    return { audio: await okBytes(res, 'cartesia'), mime: 'audio/mpeg' };
  }
}

export class ElevenLabsTts implements TtsProvider {
  readonly name = 'elevenlabs';
  constructor(private readonly apiKey: string, readonly model = 'eleven_flash_v2_5') {}

  async synthesize(text: string, voiceId: string, lang: Lang): Promise<TtsResult> {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_64`, {
      method: 'POST',
      headers: { 'xi-api-key': this.apiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({ text, model_id: this.model, language_code: lang }),
      signal: AbortSignal.timeout(TTS_TIMEOUT_MS),
    });
    return { audio: await okBytes(res, 'elevenlabs'), mime: 'audio/mpeg' };
  }
}

export class OpenAITts implements TtsProvider {
  readonly name = 'openai';
  constructor(private readonly apiKey: string, readonly model = 'gpt-4o-mini-tts') {}

  async synthesize(text: string, voiceId: string, lang: Lang): Promise<TtsResult> {
    const res = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        voice: voiceId,
        input: text,
        response_format: 'mp3',
        instructions:
          lang === 'fr'
            ? 'Native French speaker from France, casual and relaxed, like chatting with friends in a group game.'
            : 'Casual and relaxed, like chatting with friends in a group game.',
      }),
      signal: AbortSignal.timeout(TTS_TIMEOUT_MS),
    });
    return { audio: await okBytes(res, 'openai-tts'), mime: 'audio/mpeg' };
  }
}

export class DeepgramStt implements SttProvider {
  readonly name = 'deepgram';
  constructor(private readonly apiKey: string, readonly model = 'nova-3') {}

  async transcribe(audio: Buffer, mime: string, lang: Lang): Promise<SttResult> {
    const qs = new URLSearchParams({ model: this.model, language: lang, smart_format: 'true' });
    const res = await fetch(`https://api.deepgram.com/v1/listen?${qs}`, {
      method: 'POST',
      headers: { Authorization: `Token ${this.apiKey}`, 'Content-Type': mime },
      body: new Uint8Array(audio),
      signal: AbortSignal.timeout(STT_TIMEOUT_MS),
    });
    const json = await okJson(res, 'deepgram');
    const text = json?.results?.channels?.[0]?.alternatives?.[0]?.transcript;
    const duration = json?.metadata?.duration;
    return { text: typeof text === 'string' ? text : '', durationSec: typeof duration === 'number' ? duration : null };
  }
}

const EXT_BY_MIME: Record<string, string> = {
  'audio/webm': 'webm',
  'video/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'mp4',
  'video/mp4': 'mp4',
  'audio/x-m4a': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
};

export class OpenAIStt implements SttProvider {
  readonly name = 'openai';
  constructor(private readonly apiKey: string, readonly model = 'gpt-4o-mini-transcribe') {}

  async transcribe(audio: Buffer, mime: string, lang: Lang): Promise<SttResult> {
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(audio)], { type: mime }), `clip.${EXT_BY_MIME[mime] ?? 'webm'}`);
    form.append('model', this.model);
    form.append('language', lang);
    form.append('response_format', 'json');
    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body: form,
      signal: AbortSignal.timeout(STT_TIMEOUT_MS),
    });
    const json = await okJson(res, 'openai-stt');
    return { text: typeof json?.text === 'string' ? json.text : '', durationSec: null };
  }
}

const GRADIUM_STT_MIME: Record<string, string> = {
  'audio/wav': 'audio/wav',
  'audio/x-wav': 'audio/wav',
  'audio/wave': 'audio/wav',
  'audio/pcm': 'audio/pcm',
  'audio/ogg': 'audio/ogg',
  'audio/opus': 'audio/opus',
};

/** Duration of a PCM WAV from its header: byteRate at offset 28, `data` chunk found by walking the chunk list. */
export function wavDurationSec(wav: Buffer): number | null {
  if (wav.length < 44 || wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE') return null;
  const byteRate = wav.readUInt32LE(28);
  if (byteRate === 0) return null;
  let pos = 12;
  while (pos + 8 <= wav.length) {
    const id = wav.toString('ascii', pos, pos + 4);
    const size = wav.readUInt32LE(pos + 4);
    if (id === 'data') {
      const available = wav.length - (pos + 8);
      const bytes = size === 0 || size === 0xffffffff || size > available ? available : size;
      return bytes / byteRate;
    }
    pos += 8 + size + (size % 2);
  }
  return null;
}

export class GradiumTts implements TtsProvider {
  readonly name = 'gradium';
  constructor(readonly apiKey: string, readonly model = 'default') {}

  async synthesize(text: string, voiceId: string, lang: Lang): Promise<TtsResult> {
    const res = await fetch('https://api.gradium.ai/api/post/speech/tts', {
      method: 'POST',
      headers: { 'x-api-key': this.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        voice_id: voiceId,
        output_format: 'wav',
        only_audio: true,
        model_name: this.model,
        json_config: JSON.stringify({ rewrite_rules: lang }),
      }),
      signal: AbortSignal.timeout(TTS_TIMEOUT_MS),
    });
    return { audio: await okBytes(res, 'gradium-tts'), mime: 'audio/wav' };
  }
}

export class GradiumStt implements SttProvider {
  readonly name = 'gradium';
  constructor(private readonly apiKey: string, readonly model = 'default') {}

  async transcribe(audio: Buffer, mime: string, lang: Lang): Promise<SttResult> {
    const sent = GRADIUM_STT_MIME[mime.split(';')[0].trim().toLowerCase()];
    if (!sent) throw new Error(`gradium-stt accepts wav, pcm, ogg or opus audio, not ${mime || 'unknown'}`);
    const qs = new URLSearchParams({ json_config: JSON.stringify({ language: lang }), model: this.model });
    const res = await fetch(`https://api.gradium.ai/api/post/speech/asr?${qs}`, {
      method: 'POST',
      headers: { 'x-api-key': this.apiKey, 'Content-Type': sent },
      body: new Uint8Array(audio),
      signal: AbortSignal.timeout(STT_TIMEOUT_MS),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`gradium-stt HTTP ${res.status}: ${body.slice(0, 200)}`);
    }
    const parts: string[] = [];
    let stop: number | null = null;
    for (const line of (await res.text()).split('\n')) {
      if (!line.trim()) continue;
      let msg: any;
      try {
        msg = JSON.parse(line);
      } catch {
        continue;
      }
      if (msg?.type === 'error') throw new Error(`gradium-stt: ${String(msg.message ?? 'error').slice(0, 200)}`);
      if (msg?.type === 'text' && typeof msg.text === 'string') parts.push(msg.text.trim());
      if (typeof msg?.stop_s === 'number' && (stop === null || msg.stop_s > stop)) stop = msg.stop_s;
    }
    const wav = sent === 'audio/wav' ? wavDurationSec(audio) : null;
    return { text: parts.filter(Boolean).join(' '), durationSec: wav ?? stop };
  }
}

type Env = Record<string, string | undefined>;

function clean(value: string | undefined): string {
  return (value ?? '').trim().replace(/^'(.*)'$/s, '$1').replace(/^"(.*)"$/s, '$1');
}

export function makeTts(name: string, env: Env): TtsProvider | null {
  const model = clean(env.VOICE_TTS_MODEL) || undefined;
  if (name === 'cartesia' && clean(env.CARTESIA_API_KEY)) return new CartesiaTts(clean(env.CARTESIA_API_KEY), model);
  if (name === 'elevenlabs' && clean(env.ELEVENLABS_API_KEY)) return new ElevenLabsTts(clean(env.ELEVENLABS_API_KEY), model);
  if (name === 'openai' && clean(env.OPENAI_API_KEY)) return new OpenAITts(clean(env.OPENAI_API_KEY), model);
  if (name === 'gradium' && clean(env.GRADIUM_API_KEY)) return new GradiumTts(clean(env.GRADIUM_API_KEY), model);
  return null;
}

export function makeStt(name: string, env: Env): SttProvider | null {
  const model = clean(env.VOICE_STT_MODEL) || undefined;
  if (name === 'deepgram' && clean(env.DEEPGRAM_API_KEY)) return new DeepgramStt(clean(env.DEEPGRAM_API_KEY), model);
  if (name === 'openai' && clean(env.OPENAI_API_KEY)) return new OpenAIStt(clean(env.OPENAI_API_KEY), model);
  if (name === 'gradium' && clean(env.GRADIUM_API_KEY)) return new GradiumStt(clean(env.GRADIUM_API_KEY), model);
  return null;
}

/** Voice is off unless VOICE_ENABLED is truthy AND the chosen provider's key is present. */
export function providersFromEnv(env: Env = process.env): { tts: TtsProvider | null; stt: SttProvider | null } {
  if (!/^(1|true|yes|on)$/i.test(clean(env.VOICE_ENABLED))) return { tts: null, stt: null };
  const tts = makeTts(clean(env.VOICE_TTS_PROVIDER) || 'cartesia', env);
  const stt = tts ? makeStt(clean(env.VOICE_STT_PROVIDER) || 'deepgram', env) : null;
  return { tts, stt };
}
