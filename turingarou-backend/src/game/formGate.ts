export type CaseProfile = 'lower' | 'sentence' | 'raw';

export type GateReason =
  | 'empty'
  | 'structure'
  | 'json_leak'
  | 'ai_admission'
  | 'assistant_formula'
  | 'duplicate_own'
  | 'duplicate_other'
  | 'same_opening';

export interface GateContext {
  channel: 'discussion' | 'answer';
  caseProfile: CaseProfile;
  dropFinalPeriodProb: number;
  ownRecent: string[];
  otherAIRecent: string[];
  rng?: () => number;
}

export type GateVerdict =
  | { ok: true; text: string; notes: string[] }
  | { ok: false; reason: GateReason; detail: string; text: string; notes: string[] };

// \b breaks on é/à (they are non-word chars for \b), so word edges use explicit
// letter/digit lookarounds instead.
const EDGE_START = '(?<![\\p{L}\\p{N}])';
const EDGE_END = '(?![\\p{L}\\p{N}])';

function phraseRegex(phrases: string[]): RegExp {
  const body = phrases
    .map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/'/g, "['’]"))
    .map((p) => `${EDGE_START}${p}${EDGE_END}`)
    .join('|');
  return new RegExp(body, 'iu');
}

const AI_ADMISSION_RE = phraseRegex([
  'as an ai',
  'i am an ai',
  "i'm an ai",
  'language model',
  "en tant qu'ia",
  "en tant qu'intelligence artificielle",
  'je suis une ia',
  'je suis une intelligence artificielle',
  'modèle de langage',
]);

const ASSISTANT_FORMULA_RE = phraseRegex([
  'great question',
  'excellent question',
  'excellente question',
  'bonne question',
  'très bonne question',
  "n'hésitez pas",
  "n'hésite pas",
  'feel free to',
  'how can i help',
  'comment puis-je',
  "i'd be happy to",
  'je serais ravi',
]);

const AI_WORDS = [
  'delve',
  'moreover',
  'furthermore',
  'robust',
  'crucial',
  'leverage',
  'tapestry',
  'testament',
  'realm',
  'en outre',
  'par ailleurs',
];

const EMOJI_RE = /[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{1F000}-\u{1FAFF}]/gu;
const JSON_OBJECT_RE = /\{\s*"[^"]+"\s*:/;
const NUMBERED_LINE_RE = /^\d+[.)] /;

const FR_STOPWORDS = [
  'les', 'des', 'une', 'est', 'pas', 'que', 'qui', 'pour', 'dans', 'sur', 'avec',
  'mais', 'tout', 'ca', 'cette', 'son', 'ses', 'mon', 'mes', 'ton', 'tes', 'nous',
  'vous', 'ils', 'elles', 'aussi', 'bien', 'tres', 'plus', 'moi', 'toi', 'lui',
  'leur', 'oui', 'non',
];
const EN_STOPWORDS = [
  'the', 'and', 'you', 'are', 'for', 'not', 'but', 'with', 'that', 'this', 'was',
  'have', 'just', 'like', 'what', 'yeah',
];
const STOPWORDS = new Set([...FR_STOPWORDS, ...EN_STOPWORDS]);

function stripAccentsForCompare(s: string): string {
  return s.normalize('NFD').replace(/\p{M}+/gu, '');
}

function isListLine(line: string): boolean {
  return (
    line.startsWith('- ') ||
    line.startsWith('* ') ||
    line.startsWith('• ') ||
    NUMBERED_LINE_RE.test(line)
  );
}

function dupNormalized(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[^\p{L}\p{N}\s]/gu, '');
}

export function contentWords(s: string): string[] {
  const folded = stripAccentsForCompare(s.toLowerCase());
  return folded
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

export function similarity(a: string, b: string): number {
  const wa = new Set(contentWords(a));
  const wb = new Set(contentWords(b));
  if (wa.size === 0 || wb.size === 0) return 0;
  let inter = 0;
  for (const w of wa) if (wb.has(w)) inter++;
  return inter / (wa.size + wb.size - inter);
}

export function sanitizeMessage(raw: string, ctx: GateContext): { text: string; notes: string[] } {
  const notes: string[] = [];
  const add = (n: string) => {
    if (!notes.includes(n)) notes.push(n);
  };

  let t = raw.trim();

  const wrappedQuote =
    (t.length >= 2 &&
      ((t.startsWith('"') && t.endsWith('"')) ||
        (t.startsWith('«') && t.endsWith('»')) ||
        (t.startsWith("'") && t.endsWith("'"))));
  if (wrappedQuote) {
    t = t.slice(1, -1).trim();
    add('quotes');
  }

  const beforeMarkdown = t;
  t = t.replace(/\*\*/g, '').replace(/__/g, '').replace(/`/g, '').replace(/^#+\s+/, '');
  if (t !== beforeMarkdown) add('markdown');

  if (/[–—]/.test(t)) {
    t = t.replace(/\s*[–—]\s*/g, ', ');
    if (t.startsWith(', ')) t = t.slice(2);
    add('dash');
  }

  const beforeSemi = t;
  t = t.replace(/;/g, ',');
  if (t !== beforeSemi) add('semicolon');

  const beforeEmoji = t;
  t = t.replace(EMOJI_RE, '');
  if (t !== beforeEmoji) add('emoji');

  if (/\n/.test(t)) {
    t = t.replace(/\s*\n+\s*/g, ' ');
    add('multiline');
  }

  t = t.replace(/ {2,}/g, ' ').replace(/ ,/g, ',').trim();

  if (ctx.caseProfile === 'lower') {
    const lowered = t.toLowerCase();
    if (lowered !== t) add('case');
    t = lowered;
  } else if (ctx.caseProfile === 'sentence') {
    const lowered = t.toLowerCase();
    const uppered = lowered.replace(/(\p{L})/u, (m) => m.toUpperCase());
    if (uppered !== t) add('case');
    t = uppered;
  }

  if (
    t.endsWith('.') &&
    !t.endsWith('..') &&
    (ctx.rng ?? Math.random)() < ctx.dropFinalPeriodProb
  ) {
    t = t.slice(0, -1).trimEnd();
    add('final_period');
  }

  const caps = ctx.channel === 'answer' ? { chars: 80, words: 14 } : { chars: 140, words: 25 };
  const words = t.split(/\s+/).filter((w) => w.length > 0);
  if (words.length > caps.words || t.length > caps.chars) {
    let kept = 0;
    let len = 0;
    for (let i = 0; i < words.length; i++) {
      if (i + 1 > caps.words) break;
      const nextLen = words[i].length + (i > 0 ? 1 : 0);
      if (len + nextLen > caps.chars) break;
      len += nextLen;
      kept = i + 1;
    }
    if (kept === 0 && words.length > 0) {
      t = words[0].slice(0, caps.chars).replace(/[\s,;:]+$/, '');
    } else {
      t = words.slice(0, kept).join(' ').replace(/[\s,;:]+$/, '');
    }
    add('truncated');
  }

  for (const w of AI_WORDS) {
    if (new RegExp(`${EDGE_START}${w.replace(/'/g, "['’]")}${EDGE_END}`, 'iu').test(t)) {
      add(`ai_word:${w}`);
    }
  }

  return { text: t, notes };
}

export function checkMessage(raw: string, ctx: GateContext): GateVerdict {
  const lines = raw
    .split(/\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const hasFence = raw.includes('```');
  const hasListLine = lines.some(isListLine);
  if (hasFence || (lines.length >= 2 && hasListLine)) {
    const { text, notes } = sanitizeMessage(raw, ctx);
    return {
      ok: false,
      reason: 'structure',
      detail: hasFence
        ? 'message contains a fenced code block'
        : `line ${lines.findIndex(isListLine) + 1} starts like a list item`,
      text,
      notes,
    };
  }

  if (raw.includes('shouldRespond') || raw.includes('delayMs') || JSON_OBJECT_RE.test(raw)) {
    const { text, notes } = sanitizeMessage(raw, ctx);
    return {
      ok: false,
      reason: 'json_leak',
      detail: raw.includes('shouldRespond')
        ? 'message contains shouldRespond'
        : raw.includes('delayMs')
          ? 'message contains delayMs'
          : 'message looks like a JSON object',
      text,
      notes,
    };
  }

  const admissionMatch = AI_ADMISSION_RE.exec(raw);
  if (admissionMatch) {
    const { text, notes } = sanitizeMessage(raw, ctx);
    return {
      ok: false,
      reason: 'ai_admission',
      detail: `admits being an AI ("${admissionMatch[0]}")`,
      text,
      notes,
    };
  }

  const formulaMatch = ASSISTANT_FORMULA_RE.exec(raw);
  if (formulaMatch) {
    const { text, notes } = sanitizeMessage(raw, ctx);
    return {
      ok: false,
      reason: 'assistant_formula',
      detail: `sounds like an assistant ("${formulaMatch[0]}")`,
      text,
      notes,
    };
  }

  const { text, notes } = sanitizeMessage(raw, ctx);

  if (!/\p{L}/u.test(text)) {
    return {
      ok: false,
      reason: 'empty',
      detail: 'nothing left after sanitizing (no letter)',
      text,
      notes,
    };
  }

  const normSelf = dupNormalized(text);
  for (const m of ctx.ownRecent) {
    if (dupNormalized(m) === normSelf || similarity(text, m) >= 0.6) {
      return {
        ok: false,
        reason: 'duplicate_own',
        detail: `too close to own recent message "${m}"`,
        text,
        notes,
      };
    }
  }

  for (const m of ctx.otherAIRecent) {
    if (dupNormalized(m) === normSelf || similarity(text, m) >= 0.6) {
      return {
        ok: false,
        reason: 'duplicate_other',
        detail: `too close to another AI's message "${m}"`,
        text,
        notes,
      };
    }
  }

  const rawWords = text.split(/\s+/).filter((w) => w.length > 0);
  if (rawWords.length >= 4) {
    const myOpening = contentWords(text).slice(0, 2);
    if (myOpening.length === 2) {
      for (const m of ctx.otherAIRecent) {
        const theirOpening = contentWords(m).slice(0, 2);
        if (theirOpening[0] === myOpening[0] && theirOpening[1] === myOpening[1]) {
          return {
            ok: false,
            reason: 'same_opening',
            detail: `opens like another AI's message ("${theirOpening.join(' ')}")`,
            text,
            notes,
          };
        }
      }
    }
  }

  return { ok: true, text, notes };
}
