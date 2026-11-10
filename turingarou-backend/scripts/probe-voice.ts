// Live TTS → STT round trip on 4 casual chat lines (FR/EN): latency and transcript similarity.
// Costs a few cents. Audio stays in memory, nothing is written to disk.
//   npx tsx scripts/probe-voice.ts          providers from VOICE_TTS_PROVIDER / VOICE_STT_PROVIDER (default cartesia/deepgram)
//   npx tsx scripts/probe-voice.ts --all    every provider whose key is set
import dotenv from 'dotenv';
import { makeStt, makeTts } from '../src/voice/providers.js';
import type { Lang, SttProvider, TtsProvider } from '../src/voice/providers.js';
import { voicePool } from '../src/voice/voices.js';
import { normalizeTranscript, spokenText, wordSimilarity } from '../src/voice/text.js';

dotenv.config();

const LINES: { lang: Lang; text: string }[] = [
  { lang: 'fr', text: "franchement je sais pas, Léa répond toujours trop vite, ça me paraît louche" },
  { lang: 'fr', text: "attends, t'as dit que tu portais des chaussettes rouges ? moi j'en ai même pas" },
  { lang: 'en', text: "honestly I don't know, Jake always answers way too fast, kinda sus" },
  { lang: 'en', text: "wait, you said your socks were red? I'm not even wearing any right now" },
];

const all = process.argv.includes('--all');
const ttsNames = all ? ['cartesia', 'elevenlabs', 'openai'] : [process.env.VOICE_TTS_PROVIDER || 'cartesia'];
const sttNames = all ? ['deepgram', 'openai'] : [process.env.VOICE_STT_PROVIDER || 'deepgram'];
const ttsList = ttsNames.map((n) => makeTts(n, process.env)).filter((p): p is TtsProvider => !!p);
const sttList = sttNames.map((n) => makeStt(n, process.env)).filter((p): p is SttProvider => !!p);

if (ttsList.length === 0 || sttList.length === 0) {
  console.error(`missing keys: TTS [${ttsNames.join(', ')}] → ${ttsList.length}, STT [${sttNames.join(', ')}] → ${sttList.length}`);
  process.exit(1);
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length === 0 ? NaN : s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

async function timed<T>(fn: () => Promise<T>): Promise<{ ms: number; value: T }> {
  const t0 = performance.now();
  const value = await fn();
  return { ms: Math.round(performance.now() - t0), value };
}

const summary: string[] = [];
for (const tts of ttsList) {
  const ttsMs: number[] = [];
  const sim = new Map<string, number[]>();
  const sttMs = new Map<string, number[]>();
  let chars = 0;
  let audioSec = 0;
  console.log(`\n=== TTS ${tts.name}/${tts.model}`);
  for (const [i, line] of LINES.entries()) {
    const voice = voicePool(tts.name, line.lang)[i % 2 === 0 ? 0 : 6];
    const text = spokenText(line.text, 300);
    chars += text.length;
    let audio: Buffer;
    try {
      const r = await timed(() => tts.synthesize(text, voice.id, line.lang));
      audio = r.value.audio;
      ttsMs.push(r.ms);
      console.log(`  [${line.lang}] tts ${r.ms} ms, ${Math.round(audio.length / 1024)} KB, voice ${voice.label}`);
    } catch (err) {
      console.log(`  [${line.lang}] tts FAILED: ${(err as Error).message}`);
      continue;
    }
    let lineSec = 0;
    for (const stt of sttList) {
      try {
        const r = await timed(() => stt.transcribe(audio, 'audio/mpeg', line.lang));
        const s = wordSimilarity(text, r.value.text);
        if (r.value.durationSec && !lineSec) lineSec = r.value.durationSec;
        sim.set(stt.name, [...(sim.get(stt.name) ?? []), s]);
        sttMs.set(stt.name, [...(sttMs.get(stt.name) ?? []), r.ms]);
        const chat = normalizeTranscript(r.value.text, { casing: 'lower' }).text;
        console.log(`      stt ${stt.name}: ${r.ms} ms, sim ${s.toFixed(2)} | "${r.value.text}" → chat "${chat}"`);
      } catch (err) {
        console.log(`      stt ${stt.name}: FAILED ${(err as Error).message}`);
      }
    }
    audioSec += lineSec;
  }
  const sttPart = sttList
    .map((s) => `${s.name} p50 ${median(sttMs.get(s.name) ?? [])} ms sim ${median(sim.get(s.name) ?? []).toFixed(2)}`)
    .join(' | ');
  summary.push(
    `${tts.name}/${tts.model}: tts p50 ${median(ttsMs)} ms (max ${Math.max(...ttsMs)}), ${ttsMs.length}/${LINES.length} ok, ${chars} chars` +
      (audioSec ? `, ~${audioSec.toFixed(1)} s audio` : '') +
      ` || ${sttPart}`
  );
}

console.log('\n=== summary');
for (const line of summary) console.log(line);
