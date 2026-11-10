const URL_RE = /\bhttps?:\/\/\S+|\bwww\.\S+/gi;
const EMOJI_RE = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{200D}]/gu;

function cutAtWord(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const cut = text.slice(0, maxChars);
  const space = cut.lastIndexOf(' ');
  return (space > maxChars * 0.6 ? cut.slice(0, space) : cut).trim();
}

/** What TTS reads for a chat line: the same transform for every author. Empty when nothing is speakable. */
export function spokenText(content: string, maxChars: number): string {
  const text = content.replace(URL_RE, ' ').replace(EMOJI_RE, ' ').replace(/\s+/g, ' ').trim();
  if (!/[\p{L}\p{N}]/u.test(text)) return '';
  return cutAtWord(text, maxChars);
}

// Pure hesitation tokens only: "bah", "ben", "genre" carry meaning in typed chat and stay.
const FILLER_RE = /(^|[\s,;])(?:euh+|heu+|hum+|hm+|mmh*|uh+|um+|uhm+|erm+)(?=$|[\s,.;!?…])[,]?/gi;

export interface TranscriptStyle {
  /** The two typed-chat casings an AI line can carry (formGate): all lower-case, or a capital only at the start. */
  casing: 'lower' | 'sentence';
}

/** The discussion cap of an AI line (formGate): a longer line would read as "certainly a human". */
export const TRANSCRIPT_CAP = { chars: 140, words: 25 };

/**
 * Brings an STT transcript to the shape of a typed chat line, so a voice line does not stand out next to typed or AI
 * ones: hesitation tokens out, chat casing, no final period, the AI length cap. Wording stays as spoken.
 */
export function normalizeTranscript(raw: string, style: TranscriptStyle): { text: string; truncated: boolean } {
  let text = raw.replace(/\s+/g, ' ').replace(FILLER_RE, '$1');
  text = text
    .replace(/([.!?…,;])(\s+[.,;])+/g, '$1')
    .replace(/\s+([,.;!?…])/g, '$1')
    .replace(/([,;])(?=[,.;!?…])/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[,.;:!?…\s]+/, '')
    .toLowerCase();
  if (style.casing === 'sentence') text = text.replace(/\p{L}/u, (m) => m.toUpperCase());
  text = text.replace(/(?<!\.)\.$/, '').trim();
  const tokens = text.split(' ').filter(Boolean);
  const kept = cutAtWord(tokens.slice(0, TRANSCRIPT_CAP.words).join(' '), TRANSCRIPT_CAP.chars);
  return { text: kept.replace(/[,;:]$/, ''), truncated: kept.length < text.length };
}

function words(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}\s']/gu, ' ')
    .replace(/'/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/** 1 − word error rate, clamped to [0, 1]: used by the probe to score a TTS → STT round trip. */
export function wordSimilarity(reference: string, hypothesis: string): number {
  const a = words(reference);
  const b = words(hypothesis);
  if (a.length === 0) return b.length === 0 ? 1 : 0;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return Math.max(0, 1 - prev[b.length] / a.length);
}
