// Form gate for every line an AI posts (spec: specs/_prive/analyses/B-realisme-forme.md, R1-R6, R8, R9, R11, R12).
// It repairs what a hurried human typist would never produce, and rejects what cannot be repaired without betraying a bot.
// Human-written lines must pass untouched: scripts/fixtures/form-gate-human.json is the false-positive budget.

import { complianceProblem, Hijack } from './hijackGuard.js';

export type CaseProfile = 'lower' | 'sentence' | 'raw';

export type GateReason =
  | 'empty'
  | 'structure'
  | 'json_leak'
  | 'ai_admission'
  | 'assistant_formula'
  | 'duplicate_own'
  | 'duplicate_other'
  | 'same_opening'
  | 'too_long'
  | 'tic_overuse'
  | 'trap_compliance';

export type QuestionMarkHabit = 'keep' | 'double' | 'drop';

/** Persistent writing habits of one AI (R12). Applied consistently to every line, since inconsistent typos are a tell (T009). */
export interface StyleHabits {
  /** Spellings this player always uses, e.g. ['je sais pas', 'jsp']. Matched on word edges, case-insensitive. */
  rewrites?: ReadonlyArray<readonly [string, string]>;
  /** FR "tu es" → "t'es", "il y a" → "y'a"; EN "going to" → "gonna", "want to" → "wanna". */
  contractions?: boolean;
  /** FR negation without "ne": "je ne sais pas" → "je sais pas". */
  dropNe?: boolean;
  dropAccents?: boolean;
  questionMarks?: QuestionMarkHabit;
  /** Per-player length habit, capped by the channel limit. */
  maxWords?: number;
  /** Per-message chance that a long line is cut back to its first clean clause: model lines are uniformly long, human ones vary (R8, T006). */
  brevity?: number;
}

export interface GateContext {
  channel: 'discussion' | 'answer';
  caseProfile: CaseProfile;
  dropFinalPeriodProb: number;
  ownRecent: string[];
  otherAIRecent: string[];
  rng?: () => number;
  style?: StyleHabits;
  /** The AI's own display name: strips "Name: …" prefixes and "Name hausse les épaules" narration. */
  selfName?: string;
  /** Hijack attempts the draft may answer (hijackGuard): a draft that carries one out is rejected. */
  traps?: Hijack[];
}

export type GateVerdict =
  | { ok: true; text: string; notes: string[] }
  | { ok: false; reason: GateReason; detail: string; text: string; notes: string[] };

const CHANNEL_CAP = {
  discussion: { words: 25, chars: 140 },
  answer: { words: 12, chars: 60 },
} as const;
const TOO_LONG_FACTOR = 3;
// Capitalized, comma-laden, period-terminated and long: written prose, not a chat line.
const POLISHED_MAX_WORDS = 14;
const BRIEF_MAX_WORDS = 8;
const NEAR_DUP_JACCARD = 0.6;
const NEAR_DUP_DICE = 0.82;
const OPENING_WINDOW = 6;

// ---------- regex helpers ----------
// \b treats é/à as non-word characters, so word edges are explicit letter/digit lookarounds.
const EDGE_START = '(?<![\\p{L}\\p{N}])';
const EDGE_END = '(?![\\p{L}\\p{N}])';
const APOS = "['’]";

const ACCENT_CLASS: Record<string, string> = {
  à: '[àa]', â: '[âa]', é: '[ée]', è: '[èe]', ê: '[êe]', ë: '[ëe]', î: '[îi]', ï: '[ïi]', ô: '[ôo]', û: '[ûu]', ù: '[ùu]', ç: '[çc]',
};

/** Pattern mini-syntax: ' matches any apostrophe, a space matches any whitespace run, accented vowels also match bare ones. */
function rx(src: string): string {
  return src
    .replace(/[àâéèêëîïôûùç]/g, (c) => ACCENT_CLASS[c])
    .replace(/œ/g, '(?:œ|oe)')
    .replace(/'/g, APOS)
    .replace(/ /g, '\\s+');
}

function wordsRe(sources: readonly string[], flags = 'iu'): RegExp {
  return new RegExp(sources.map((s) => `${EDGE_START}(?:${rx(s)})${EDGE_END}`).join('|'), flags);
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---------- lexicons ----------

const ADMISSION_STRONG = wordsRe([
  "en tant qu'(?:ia|ai|intelligence artificielle|assistant|assistante|chatbot|llm)",
  'en tant que (?:modèle|assistant|assistante|chatbot|programme|llm)',
  "(?:mes|nos) données d'entraînement",
  'ma programmation',
  'mes (?:créateurs|concepteurs|développeurs)',
  "j'ai été (?:entraînée?|programmée?|conçue? pour|créée? par|développée? par|formée? par)",
  'je suis (?:programmée?|conçue? pour)',
  "je n'ai pas (?:de |d')(?:sentiments|émotions|corps|expériences? personnelles?|opinions? personnelles?|conscience)",
  'as an? (?:ai|artificial intelligence|language model|large language model|llm|chatbot|ai assistant|ai language model)',
  'my (?:training data|knowledge cutoff|creators|developers)',
  "i (?:was|have been|'ve been) (?:trained|programmed|designed to|created by|developed by)",
  "(?:i'm|i am) (?:programmed|designed) to",
  "i (?:don't|do not) have (?:personal )?(?:feelings|emotions|a body|a physical body|personal experiences|personal opinions|consciousness)",
]);

const ADMISSION_CLAIM = wordsRe([
  "(?:je suis|jsuis|j'suis|chui|chuis) (?:une ia|une intelligence artificielle|un bot|un robot|un chatbot|un programme|un modèle de langage|un llm|un assistant|une machine|claude|chatgpt|gpt|deepseek|mistral|gemini|llama)",
  "(?:i'm|i am|im) (?:just |only |actually |really )?(?:an ai|a bot|a robot|a chatbot|an llm|a language model|a large language model|an ai language model|an ai assistant|an assistant|a program|a machine|claude|chatgpt|gpt|deepseek|mistral|gemini|llama)",
]);

// A first-person claim is not an admission when it is a question, reported speech, or a joke.
const CLAIM_CUE_BEFORE = wordsRe([
  'crois', 'croit', 'croyez', 'croient', 'pense', 'penses', 'pensez', 'pensent', 'dis', 'dit', 'dites', 'disent',
  'accuses?', 'accusez', 'imagine', 'comme si', 'si', 'que', 'genre', 'parce',
  'think', 'thinks', 'say', 'says', 'said', 'saying', 'accuse', 'accusing', 'as if', 'if', 'that', 'because', 'so now',
  'obviously', 'évidemment', 'bien sûr', 'of course', 'sure', 'oui oui', 'ouais ouais', 'yeah yeah',
]);
const LAUGH_MARKER = wordsRe([
  'mdr+', 'ptdr+', 'lol+', 'lmao+', 'lmfao', 'xd+', 'ha(?:ha)+h?', 'a?h(?:ah)+', 'hihi+', 'jk', 'jpp', 'sarcasme', 'ironie', 'bravo sherlock',
  'bip boup', 'beep boop', 'bip bip',
]);

const SERVICE_FORMULA = wordsRe([
  "n'hésitez pas",
  "n'hésite pas à me",
  "(?:comment|en quoi) (?:puis-je|est-ce que je peux) (?:vous |t')?aider",
  'puis-je vous aider',
  "je suis là pour (?:vous |t')aider",
  "je (?:serais|serai) (?:ravie?|heureuse?|heureux) de (?:vous|t'(?:aider|répondre|expliquer))",
  "ravie? de (?:vous |t')aider",
  "j'espère que (?:ça|cela) (?:vous |t')aide",
  "j'espère avoir répondu",
  "il (?:est|semble) (?:important|essentiel|crucial|primordial) de (?:noter|souligner|rappeler|préciser|garder à l'esprit)",
  'il convient de',
  'en conclusion',
  'en résumé',
  'pour résumer',
  'pour conclure',
  'je comprends (?:tout à fait|parfaitement|votre|ta (?:frustration|méfiance|inquiétude|préoccupation|suspicion|position)|ton (?:point de vue|raisonnement|inquiétude))',
  "c'est une excellente question",
  'quelle excellente question',
  'permettez-moi de',
  'je tiens à (?:préciser|souligner|clarifier)',
  'je vais vous expliquer',
  'je vous remercie',
  "c'(?:est|était) (?:toujours |vraiment )?un (?:réel |vrai |grand )?plaisir de",
  'thank you (?:all )?for (?:this|the) (?:game|round|discussion)',
  "it(?:'s| is| was) (?:always )?a pleasure",
  'feel free to',
  'how (?:can|may) i (?:help|assist)',
  "(?:i'd|i would|i'll|i will) be (?:happy|glad|delighted) to",
  'happy to help',
  "i'm here to help",
  'let me know if (?:you|there)',
  'hope (?:this|that) helps',
  "it(?:'s| is) (?:important|worth) (?:to note|noting|mentioning|to remember)",
  'in conclusion',
  'to summarize',
  'in summary',
  'to sum up',
  'i understand your (?:concern|frustration|point|perspective|suspicion|skepticism)',
  "(?:that's|what) (?:a great|an excellent|a good) question",
  'i apologi[sz]e (?:for|but)',
  'sorry for (?:any|the) confusion',
  "let's dive",
  'dive into',
]);

// Medium severity: one is a note, two in the same line read like generated prose.
const AI_LEXICON: readonly string[] = [
  'delve', 'delves', 'delving', 'moreover', 'furthermore', 'additionally', 'tapestry', 'testament', 'realm', 'multifaceted',
  'intricate', 'pivotal', 'paramount', 'nuanced', 'foster', 'underscores?', 'embark', 'seamless(?:ly)?', 'meticulous(?:ly)?',
  'ever-evolving', "in today's", 'robust', 'crucial', 'leverage', 'notably', 'a myriad of', 'plays a (?:crucial|key|vital) role',
  'en outre', 'par ailleurs', 'de surcroît', 'néanmoins', 'toutefois', 'cependant', 'force est de constater', 'en définitive',
  'indéniablement', 'incontestablement', 'à cet égard', 'primordial', 'fondamental(?:ement)?', 'essentiel(?:le)?(?:ment)?',
  'pertinente?', 'nuancée?', "s'avère", 'en somme', "dans l'ensemble", 'joue un rôle (?:clé|crucial|essentiel)',
  'afin de', 'notamment', 'également', 'ainsi que',
];
const AI_LEXICON_RES = AI_LEXICON.map((w) => ({ word: w.replace(/\(\?:[^)]*\)\??|\?/g, '').trim(), re: wordsRe([w]) }));

const OPENER_ANY = rx(
  [
    'absolument', 'tout à fait', 'certainement', 'effectivement', 'en effet',
    '(?:excellente|très bonne|super) question', 'quelle (?:excellente|bonne|super) question',
    'absolutely', 'certainly', 'indeed', "(?:great|excellent|what a great|that's a great|that's an excellent) question",
  ].join('|')
);
const OPENER_BANG = rx(['bien sûr', 'of course', 'sure thing', 'avec plaisir', 'with pleasure', 'intéressant', 'interesting'].join('|'));
const OPENER_RES = [
  new RegExp(`^(?:(?:ah|oh|alors|well|so|hmm+)[\\s,]+)?(?:${OPENER_ANY})\\s*[!,.:]+\\s+(?=\\S+\\s+\\S)`, 'iu'),
  new RegExp(`^(?:(?:ah|oh)[\\s,]+)?(?:${OPENER_BANG})\\s*!+\\s+(?=\\S+\\s+\\S)`, 'iu'),
];

const PREAMBLE_RES = [
  new RegExp(
    `^(?:(?:ok(?:ay)?|alright|sure|d${APOS}accord)[,!.]?\\s+)?(?:(?:voici|voilà|voila|here${APOS}s|here is|this is)\\s+)?` +
      `(?:(?:ma|mon|une|un|my|a|the)\\s+)?(?:(?:petite?|courte?|quick|short|casual|possible)\\s+)?` +
      `(?:r[ée]ponse|message|reply|answer|response|proposition|version|suggestion)` +
      `(?:\\s+(?:d[ée]contract[ée]e?|casual|courte?|naturelle?|rapide|finale?|du joueur|in character|en fran[çc]ais|in english|possible|propos[ée]e?))?` +
      `\\s*:\\s*`,
    'iu'
  ),
  new RegExp(
    `^(?:voici|voilà|voila|here${APOS}s|here is)\\s+(?:ce que|what)\\s+(?:je|i)\\s*(?:${APOS}d\\s+|would\\s+)?` +
      `(?:dirais|r[ée]pondrais|[ée]crirais|propose|say|write|reply|answer|post)\\s*:\\s*`,
    'iu'
  ),
];

const STAGE_SRC = [
  'ri(?:t|re|res|s)', 'ricane(?:ment)?s?', 'sourit', 'sourires?', 'soupire?s?', 'hausse les épaules', "haussement d'épaules",
  'lève les yeux(?: au ciel)?', 'se gratte', 'tousse', 'toussote', "(?:fait un )?clin d'œil", 'hoche la tête', 'secoue la tête',
  'réfléchit', 'pause', 'silence', 'se marre', 'éclate de rire', 'pouffe', 'rougit', 'grimace', 'croise les bras',
  'tape du pied', 'se racle la gorge', 'bâille', "s'étire", 'sifflote', 'murmure', 'chuchote', 'en riant', 'en souriant',
  'rire (?:nerveux|jaune|gêné)',
  'laugh(?:s|ing)?', 'giggl(?:es?|ing)', 'chuckl(?:es?|ing)', 'sigh(?:s|ing)?', 'smil(?:es?|ing)', 'grin(?:s|ning)?',
  'shrug(?:s|ging)?', 'rolls (?:my |his |her |their )?eyes', 'eye(?: )?rolls?', 'nod(?:s|ding)', 'shakes (?:my |his |her |their )?head',
  'coughs?', 'wink(?:s|ing)?', 'pauses?', 'facepalms?', 'smirk(?:s|ing)?', 'blushes', 'crosses (?:my |his |her |their )?arms',
  'clears (?:my |his |her |their )?throat', 'yawns?', 'whispers?', 'stretches', 'scratches (?:my |his |her |their )?head',
  'raises (?:an )?eyebrows?', 'nervous laugh(?:ter)?', 'laughter', 'thinking', 'thinks',
].join('|');

function stageRe(selfName?: string): RegExp {
  const who = ['il', 'elle', 'iel', 'he', 'she', 'they', ...(selfName ? [escapeRe(selfName)] : [])].join('|');
  return new RegExp(`^(?:(?:${who})\\s+)?(?:${rx(STAGE_SRC)})${EDGE_END}`, 'iu');
}

const JSON_LEAKS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\{\s*"[^"\n]{1,40}"\s*:/, 'looks like a JSON object'],
  [/"(?:shouldRespond|message|delayMs|reasoning|target|vote|answer|text)"\s*:/i, 'contains a JSON field'],
  [/(?<![A-Za-z])(?:shouldRespond|delayMs)(?![A-Za-z])/, 'contains a decision field name'],
  [/<\/?(?:think|thinking|reasoning|scratchpad|analysis)>/i, 'contains a reasoning tag'],
  [/(?:^|\n)\s*(?:TON|CONTENU|STYLE|PENSÉE|PENSEE|RAISONNEMENT|REASONING|THOUGHTS?|ANALYSIS|ANALYSE|INTENTION|STRATÉGIE|STRATEGIE|STRATEGY|PLAN|NOTE|TONE|CONTENT)\s*:/u, 'template label'],
  [/(?:^|\n)\s*(?:raisonnement|reasoning|pensée|pensee|thoughts?|stratégie|strategie|strategy|intention)\s*:/iu, 'reasoning label'],
  [/\(\s*(?:note|nb|n\.b\.|remarque)\s*:/iu, 'meta note to the reader'],
];

const LIST_LINE_RE = /^(?:[-*•▪◦‣–—]\s|\d{1,2}[.)]\s|[a-zA-Z][)]\s)/u;
const EMOJI_RE = /[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{20E3}\u{1F000}-\u{1FAFF}]/gu;
const EMOTICON_RE = /^(?:[:;=8xX][-'^]?[)(\]\[DPpOo3/\\|*]+|<3|\^\^|xD+|XD+)$/u;

// ---------- detection on the raw text ----------

function normalizeInput(raw: string): string {
  return raw
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .replace(/[     ]/g, ' ')
    .replace(/[​‌⁠﻿]/g, '')
    .trim();
}

function nonEmptyLines(t: string): string[] {
  return t.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
}

function structureProblem(t: string): string | null {
  if (t.includes('```')) return 'fenced code block';
  const lines = nonEmptyLines(t);
  if (lines.some((l) => /^\|.*\|$/.test(l))) return 'markdown table';
  if (lines.length < 2) return null;
  const list = lines.findIndex((l) => LIST_LINE_RE.test(l));
  if (list >= 0) return `line ${list + 1} starts like a list item`;
  if (lines.some((l) => /^#{1,6}\s/.test(l))) return 'markdown heading';
  if (lines.length >= 3) return `${lines.length} separate lines`;
  return null;
}

function leakProblem(t: string): string | null {
  for (const [re, detail] of JSON_LEAKS) if (re.test(t)) return detail;
  return null;
}

function sentenceAround(t: string, index: number, length: number): { before: string; sentence: string } {
  const start = Math.max(t.lastIndexOf('.', index - 1), t.lastIndexOf('!', index - 1), t.lastIndexOf('?', index - 1), t.lastIndexOf('\n', index - 1)) + 1;
  const tail = t.slice(index + length).search(/[.!?\n]/);
  const end = tail < 0 ? t.length : index + length + tail + 1;
  return { before: t.slice(start, index), sentence: t.slice(start, end) };
}

function findAdmission(t: string): string | null {
  const strong = ADMISSION_STRONG.exec(t);
  if (strong) return strong[0];
  if (LAUGH_MARKER.test(t)) return null;
  const re = new RegExp(ADMISSION_CLAIM.source, 'giu');
  for (let m = re.exec(t); m; m = re.exec(t)) {
    const { before, sentence } = sentenceAround(t, m.index, m[0].length);
    if (sentence.includes('?')) continue;
    if (CLAIM_CUE_BEFORE.test(before)) continue;
    return m[0];
  }
  return null;
}

function aiLexiconHits(t: string): string[] {
  return AI_LEXICON_RES.filter(({ re }) => re.test(t)).map(({ word }) => word);
}

// ---------- repairs ----------

type Notes = { add: (n: string) => void; list: string[] };
function makeNotes(): Notes {
  const list: string[] = [];
  return { list, add: (n) => { if (!list.includes(n)) list.push(n); } };
}

function stripMarkdown(t: string, notes: Notes): string {
  let s = t
    .replace(/\[([^\]\n]{1,60})\]\((?:https?:)?[^)\s]{1,200}\)/g, '$1')
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/__([^_\n]+)__/g, '$1')
    .replace(/\*\*|__|`/g, '')
    .replace(/^[ \t]*#{1,6}[ \t]+/gm, '')
    .replace(/^[ \t]*>[ \t]+/gm, '')
    .replace(/^[ \t]*[•▪◦‣][ \t]*/gm, '');
  if (s !== t) notes.add('markdown');
  return s;
}

function stripWrappers(t: string, selfName: string | undefined, notes: Notes): string {
  let s = t;
  for (let pass = 0; pass < 3; pass++) {
    const before = s;
    if (selfName) {
      const label = new RegExp(`^\\[?${escapeRe(selfName)}\\]?\\s*:\\s*`, 'iu');
      if (label.test(s)) { s = s.replace(label, ''); notes.add('name_label'); }
      const sign = new RegExp(`\\s*[-—–]\\s*${escapeRe(selfName)}\\s*$`, 'iu');
      if (sign.test(s)) { s = s.replace(sign, ''); notes.add('name_label'); }
    }
    for (const re of PREAMBLE_RES) {
      if (re.test(s)) { s = s.replace(re, ''); notes.add('preamble'); }
    }
    for (const re of OPENER_RES) {
      if (re.test(s)) { s = s.replace(re, ''); notes.add('opener'); }
    }
    const q = s.match(/^(["«“'])([\s\S]+)(["»”'])$/u);
    if (q) {
      const pair = `${q[1]}${q[3]}`;
      const inner = q[2];
      const matches = pair === '""' || pair === '«»' || pair === '“”' || pair === "''";
      const innerHasSame = inner.includes(q[1]) || inner.includes(q[3]);
      if (matches && !innerHasSame) { s = inner.trim(); notes.add('quotes'); }
    }
    s = s.trim();
    if (s === before) break;
  }
  return s;
}

function stripStageDirections(t: string, selfName: string | undefined, notes: Notes): string {
  const stage = stageRe(selfName);
  let s = t.replace(/(^|[^\p{L}\p{N}*])\*([^*\n]{1,80})\*(?![\p{L}\p{N}*])/gu, (_m, pre: string, inner: string) => {
    const content = inner.trim();
    if (content.split(/\s+/).length >= 2 || stage.test(content)) {
      notes.add('stage_direction');
      return `${pre} `;
    }
    notes.add('markdown');
    return `${pre}${content}`;
  });
  s = s.replace(/[(\[]\s*([^()[\]\n]{1,60}?)\s*[)\]]/gu, (m, inner: string) => {
    if (!stage.test(inner.trim())) return m;
    notes.add('stage_direction');
    return ' ';
  });
  if (selfName) {
    const narration = new RegExp(`(^|[.!?]\\s+)${escapeRe(selfName)}\\s+(?:${rx(STAGE_SRC)})${EDGE_END}[^.!?\\n]{0,60}[.!?]?`, 'giu');
    s = s.replace(narration, (_m, pre: string) => { notes.add('stage_direction'); return pre; });
  }
  return s.replace(/[ \t]{2,}/g, ' ').trim();
}

function fixTypography(t: string, notes: Notes): string {
  let s = t;
  if (/[—–‒―]/.test(s)) {
    s = s
      .replace(/(\d)\s*[–—‒―]\s*(\d)/g, '$1-$2')
      .replace(/\s*[—–‒―]+\s*/g, ', ');
    notes.add('dash');
  }
  if (/;(?![-']?[)(DPp])/.test(s)) {
    s = s.replace(/\s*;(?![-']?[)(DPp])\s*/g, ', ');
    notes.add('semicolon');
  }
  if (s.includes('…')) {
    s = s.replace(/…/g, '...');
    notes.add('ellipsis');
  }
  if (/[«»“”„]/.test(s)) {
    s = s.replace(/«\s*/g, '"').replace(/\s*»/g, '"').replace(/[“”„]/g, '"');
    notes.add('typographic_quotes');
  }
  if (notes.list.includes('dash') || notes.list.includes('semicolon')) {
    s = s
      .replace(/^[,\s]+/, '')
      .replace(/[,\s]+$/, '')
      .replace(/,\s*([,.!?])/g, '$1')
      .replace(/([.!?:(])\s*,\s*/g, '$1 ');
  }
  const noEmoji = s.replace(EMOJI_RE, '');
  if (noEmoji !== s) {
    s = noEmoji;
    notes.add('emoji');
  }
  return s.replace(/[ \t]{2,}/g, ' ').trim();
}

function keepInitialCase(source: string, replacement: string): string {
  const first = source.charAt(0);
  if (first && first !== first.toLowerCase() && replacement.length > 0) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

function replacePhrase(t: string, from: string, to: string): string {
  const re = new RegExp(`${EDGE_START}${rx(from.toLowerCase())}${EDGE_END}(?!['’])`, 'giu');
  return t.replace(re, (m) => keepInitialCase(m, to));
}

const NEG_TAIL = `(?=[^.!?\\n]{0,40}?${EDGE_START}(?:pas|plus|jamais|rien|personne|aucune?|guère)${EDGE_END})`;
const DROP_NE_RES: ReadonlyArray<readonly [RegExp, string]> = [
  [new RegExp(`${EDGE_START}(j)e\\s+n${APOS}${NEG_TAIL}`, 'giu'), "$1'"],
  [new RegExp(`${EDGE_START}(c)e\\s+n${APOS}${NEG_TAIL}`, 'giu'), "$1'"],
  [new RegExp(`${EDGE_START}n${APOS}(?!importe${EDGE_END})${NEG_TAIL}`, 'giu'), ''],
  [new RegExp(`${EDGE_START}ne\\s+${NEG_TAIL}`, 'giu'), ''],
];

const CONTRACTIONS: ReadonlyArray<readonly [RegExp, string]> = [
  [new RegExp(`${EDGE_START}(t)u\\s+(es|as)${EDGE_END}`, 'giu'), "$1'$2"],
  [new RegExp(`${EDGE_START}il\\s+y\\s+a${EDGE_END}`, 'giu'), "y'a"],
  [new RegExp(`${EDGE_START}going\\s+to(?=\\s+(?!the|a|an|my|your|his|her|their|our|school|work|bed|church)\\p{L})`, 'giu'), 'gonna'],
  [new RegExp(`${EDGE_START}want\\s+to(?=\\s+\\p{L})`, 'giu'), 'wanna'],
  [new RegExp(`${EDGE_START}kind\\s+of${EDGE_END}`, 'giu'), 'kinda'],
];

function applyHabits(t: string, style: StyleHabits | undefined, notes: Notes): string {
  if (!style) return t;
  let s = t;
  const step = (name: string, f: (x: string) => string) => {
    const next = f(s);
    if (next !== s) { notes.add(`habit:${name}`); s = next; }
  };
  if (style.dropNe) step('drop_ne', (x) => DROP_NE_RES.reduce((acc, [re, rep]) => acc.replace(re, rep), x));
  if (style.contractions) step('contractions', (x) => CONTRACTIONS.reduce((acc, [re, rep]) => acc.replace(re, (m, ...g) => keepInitialCase(m, rep.replace(/\$(\d)/g, (_d, i) => String(g[Number(i) - 1])))), x));
  if (style.rewrites?.length) step('rewrites', (x) => style.rewrites!.reduce((acc, [from, to]) => replacePhrase(acc, from, to), x));
  if (style.dropAccents) step('no_accents', (x) => x.normalize('NFD').replace(/(\p{L})\p{M}+/gu, '$1').normalize('NFC'));
  return s.replace(/[ \t]{2,}/g, ' ').trim();
}

const DANGLING = new Set([
  'de', 'du', 'des', 'le', 'la', 'les', 'l', 'un', 'une', 'et', 'ou', 'mais', 'donc', 'car', 'que', 'qu', 'qui', 'quoi', 'a', 'au', 'aux',
  'en', 'pour', 'par', 'avec', 'sans', 'sur', 'sous', 'dans', 'chez', 'vers', 'ce', 'cet', 'cette', 'ces', 'mon', 'ma', 'mes', 'ton', 'ta',
  'tes', 'son', 'sa', 'ses', 'notre', 'nos', 'votre', 'vos', 'leur', 'leurs', 'je', 'j', 'tu', 't', 'il', 'elle', 'on', 'nous', 'vous',
  'ils', 'elles', 'ne', 'n', 'se', 's', 'me', 'm', 'te', 'tres', 'trop', 'plus', 'moins', 'parce', 'puisque', 'comme', 'si', 'quand',
  'lorsque', 'est', 'sont', 'etait', 'cest', 'c', 'y', 'suis', 'es', 'ai', 'as', 'avait',
  'the', 'an', 'and', 'or', 'but', 'so', 'because', 'of', 'to', 'in', 'on', 'at', 'for', 'with', 'from', 'by', 'that', 'which', 'who',
  'my', 'your', 'his', 'her', 'its', 'our', 'their', 'i', 'you', 'he', 'she', 'we', 'they', 'is', 'are', 'was', 'were', 'be', 'been',
  'am', 'im', 'its', 'thats', 'theres', 'this', 'these', 'those', 'than', 'then', 'if', 'when', 'as', 'not', 'very', 'really', 'just',
]);

function foldWord(w: string): string {
  return w.toLowerCase().normalize('NFD').replace(/\p{M}+/gu, '').replace(/[^\p{L}\p{N}'’]/gu, '');
}

function isDangling(w: string): boolean {
  const f = foldWord(w);
  const bare = f.replace(/['’]/g, '');
  const afterApos = f.split(/['’]/).pop() ?? f;
  return DANGLING.has(bare) || DANGLING.has(afterApos) || f.endsWith("'") || f.endsWith('’');
}

function wordCount(s: string): number {
  return s.split(/\s+/).filter((w) => w.length > 0).length;
}

function tidyEnd(s: string): string {
  return s.replace(/[\s,;:(\-]+$/u, '').trim();
}

function trimDangling(s: string): string {
  const kept = tidyEnd(s).split(/\s+/).filter((w) => w.length > 0);
  for (let i = 0; i < 4 && kept.length > 1 && isDangling(kept[kept.length - 1]); i++) kept.pop();
  return tidyEnd(kept.join(' '));
}

const CLAUSE_BEFORE_RE = new RegExp(
  `\\s(?=(?:mais|parce que|parce qu${APOS}|car|donc|alors que|sauf que|puisque|vu que|but|because|so|though|although|since|and|et|or|ou)${EDGE_END})`,
  'giu'
);

/** Shortens to the caps at the cleanest boundary: sentence end, then clause boundary, then word, never leaving a dangling function word.
 * cleanOnly: no word cut; returns the text unchanged when no sentence or clause boundary fits. */
function fitLength(t: string, maxWords: number, maxChars: number, cleanOnly = false): string {
  const fits = (s: string) => wordCount(s) <= maxWords && s.length <= maxChars;
  if (fits(t)) return t;
  type Cut = { end: number; prio: number };
  const cuts: Cut[] = [];
  for (const m of t.matchAll(/[.!?]+(?=\s|$)/g)) cuts.push({ end: m.index! + m[0].length, prio: 3 });
  for (const m of t.matchAll(/[,;:](?=\s)/g)) cuts.push({ end: m.index!, prio: 2 });
  for (const m of t.matchAll(CLAUSE_BEFORE_RE)) cuts.push({ end: m.index!, prio: 2 });
  const usable = (c: Cut, minWords: number) => {
    const p = c.prio === 3 ? tidyEnd(t.slice(0, c.end)) : trimDangling(t.slice(0, c.end));
    return fits(p) && wordCount(p) >= minWords ? p : null;
  };
  const best = (pred: (c: Cut) => boolean, minWords: number): string | null => {
    let out: string | null = null;
    for (const c of cuts) {
      if (!pred(c)) continue;
      const p = usable(c, minWords);
      if (p && (!out || p.length > out.length)) out = p;
    }
    return out;
  };
  const sentence = best((c) => c.prio === 3, 3);
  const clause = best((c) => c.prio >= 2, 3);
  if (sentence && (!clause || sentence.length >= clause.length * 0.6)) return sentence;
  if (clause) return clause;
  if (cleanOnly) return t;
  const words = t.split(/\s+/).filter((w) => w.length > 0);
  const kept: string[] = [];
  for (const w of words) {
    if (!fits([...kept, w].join(' '))) break;
    kept.push(w);
  }
  if (kept.length === 0) return tidyEnd(words[0].slice(0, maxChars));
  return trimDangling(kept.join(' ')) || best((c) => c.prio === 3, 1) || tidyEnd(kept.join(' '));
}

function applyCase(t: string, profile: CaseProfile, notes: Notes): string {
  let s = t;
  if (profile === 'lower') {
    s = t.replace(/\S+/g, (tok) => (EMOTICON_RE.test(tok) ? tok : tok.toLowerCase()));
  } else if (profile === 'sentence') {
    s = t.replace(/\p{L}/u, (c) => c.toUpperCase());
  }
  if (s !== t) notes.add('case');
  return s;
}

function applyQuestionHabit(t: string, habit: QuestionMarkHabit | undefined, notes: Notes): string {
  if (!habit || habit === 'keep' || !/[^?]\?$/.test(t)) return t;
  const s = habit === 'double' ? `${t}?` : t.replace(/\s*\?$/, '');
  if (s !== t) notes.add('habit:question_marks');
  return s;
}

interface Repaired {
  text: string;
  notes: string[];
  wordsBeforeFit: number;
}

function repair(input: string, ctx: GateContext): Repaired {
  const notes = makeNotes();
  let t = stripMarkdown(input, notes);
  t = stripWrappers(t, ctx.selfName, notes);
  t = stripStageDirections(t, ctx.selfName, notes);
  const lines = nonEmptyLines(t);
  if (lines.length > 1) {
    t = lines.join(' ');
    notes.add('multiline');
  }
  t = fixTypography(t, notes);
  t = stripWrappers(t, ctx.selfName, notes);
  t = applyHabits(t, ctx.style, notes);

  const wordsBeforeFit = wordCount(t);
  const cap = CHANNEL_CAP[ctx.channel];
  const polished = /^\p{Lu}/u.test(input) && /[^.]\.$/.test(input) && (input.match(/[,;—–]/g)?.length ?? 0) >= 2;
  const maxWords = Math.max(3, Math.min(cap.words, ctx.style?.maxWords ?? cap.words, polished ? POLISHED_MAX_WORDS : cap.words));
  const fitted = fitLength(t, maxWords, cap.chars);
  if (fitted !== t) {
    t = fitted;
    notes.add(polished && wordsBeforeFit > POLISHED_MAX_WORDS ? 'polished' : 'truncated');
  }
  if (ctx.style?.brevity && wordCount(t) > BRIEF_MAX_WORDS && (ctx.rng ?? Math.random)() < ctx.style.brevity) {
    const brief = fitLength(t, BRIEF_MAX_WORDS, cap.chars, true);
    if (brief !== t) {
      t = brief;
      notes.add('brevity');
    }
  }

  t = applyCase(t, ctx.caseProfile, notes);
  if (/[^.]\.$/.test(t) && (ctx.rng ?? Math.random)() < ctx.dropFinalPeriodProb) {
    t = t.slice(0, -1).trimEnd();
    notes.add('final_period');
  }
  t = applyQuestionHabit(t, ctx.style?.questionMarks, notes);

  for (const w of aiLexiconHits(t)) notes.add(`ai_word:${w}`);
  return { text: t, notes: notes.list, wordsBeforeFit };
}

export function sanitizeMessage(raw: string, ctx: GateContext): { text: string; notes: string[] } {
  const { text, notes } = repair(normalizeInput(raw), ctx);
  return { text, notes };
}

// ---------- comparison (R5, R6, T005) ----------

const SLANG: ReadonlyArray<readonly [RegExp, string]> = (
  [
    ['jsuis', 'je suis'], ["j'suis", 'je suis'], ['chui', 'je suis'], ['chuis', 'je suis'], ['jsp', 'je sais pas'],
    ['chais pas', 'je sais pas'], ['chai pas', 'je sais pas'], ["j'sais", 'je sais'], ['jpense', 'je pense'], ["t'es", 'tu es'],
    ["t'as", 'tu as'], ["y'a", 'il y a'], ['ya', 'il y a'], ['pk', 'pourquoi'], ['pq', 'pourquoi'], ['bcp', 'beaucoup'],
    ['mtn', 'maintenant'], ['qqn', "quelqu'un"], ['dac', "d'accord"], ["d'acc", "d'accord"], ['ptet', 'peut etre'],
    ['ptetre', 'peut etre'], ['peut-etre', 'peut etre'], ['tjrs', 'toujours'], ['pcq', 'parce que'], ['pck', 'parce que'],
    ['vrmt', 'vraiment'], ['tlm', 'tout le monde'], ['ajd', "aujourd'hui"], ['c', 'ce est'],
    ['idk', 'i do not know'], ['dunno', 'do not know'], ['u', 'you'], ['ur', 'your'], ['im', 'i am'], ["i'm", 'i am'],
    ['dont', 'do not'], ["don't", 'do not'], ['cant', 'can not'], ["can't", 'can not'], ['gonna', 'going to'],
    ['wanna', 'want to'], ['tbh', 'to be honest'], ['ngl', 'not gonna lie'], ['rn', 'right now'], ['cuz', 'because'],
    ['bc', 'because'], ['prob', 'probably'], ['probly', 'probably'], ['rly', 'really'], ['tho', 'though'],
  ] as const
).map(([from, to]) => [new RegExp(`${EDGE_START}${escapeRe(from)}${EDGE_END}(?!')`, 'gu'), to] as const);

function foldForCompare(s: string): string {
  let f = s.toLowerCase().normalize('NFD').replace(/\p{M}+/gu, '').replace(/[’‘`´]/g, "'");
  for (const [re, to] of SLANG) f = f.replace(re, to);
  f = f
    .replace(/(?<![\p{L}\p{N}])j'/gu, 'je ')
    .replace(/(?<![\p{L}\p{N}])c'/gu, 'ce ')
    .replace(/(?<![\p{L}\p{N}])ne\s+/gu, ' ')
    .replace(/(?<![\p{L}\p{N}])n'/gu, ' ');
  return f.replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

const STOP = new Set([
  'le', 'la', 'les', 'l', 'un', 'une', 'des', 'de', 'du', 'd', 'au', 'aux', 'et', 'ou', 'mais', 'donc', 'car', 'ni', 'que', 'qu', 'qui',
  'quoi', 'dont', 'a', 'en', 'y', 'dans', 'sur', 'sous', 'pour', 'par', 'avec', 'sans', 'chez', 'vers', 'ce', 'cet', 'cette', 'ces',
  'c', 'ca', 'cela', 'ceci', 'se', 's', 'me', 'm', 'te', 't', 'je', 'j', 'tu', 'il', 'elle', 'on', 'nous', 'vous', 'ils', 'elles',
  'mon', 'ma', 'mes', 'ton', 'ta', 'tes', 'son', 'sa', 'ses', 'notre', 'nos', 'votre', 'vos', 'leur', 'leurs', 'moi', 'toi', 'lui',
  'eux', 'est', 'es', 'suis', 'sont', 'sommes', 'etes', 'etait', 'ete', 'etre', 'ai', 'as', 'avons', 'avez', 'ont', 'avait', 'avoir',
  'fait', 'faire', 'pas', 'plus', 'ne', 'n', 'non', 'oui', 'si', 'tres', 'trop', 'bien', 'tout', 'tous', 'toute', 'toutes', 'aussi',
  'alors', 'comme', 'quand', 'meme', 'juste', 'encore', 'deja', 'ici', 'ouais', 'nan', 'bah', 'ben', 'bon', 'euh', 'hein', 'genre',
  'mdr', 'lol', 'ptdr', 'franchement', 'perso', 'honnetement', 'enfin', 'coup', 'vraiment',
  'the', 'an', 'and', 'or', 'but', 'so', 'of', 'to', 'in', 'on', 'at', 'for', 'with', 'from', 'by', 'as', 'is', 'are', 'was', 'were',
  'be', 'been', 'am', 'i', 'my', 'you', 'your', 'he', 'him', 'his', 'she', 'her', 'it', 'its', 'we', 'us', 'our', 'they', 'them',
  'their', 'this', 'that', 'these', 'those', 'there', 'here', 'what', 'who', 'how', 'why', 'when', 'if', 'then', 'than', 'just',
  'like', 'really', 'very', 'too', 'not', 'no', 'yes', 'yeah', 'yep', 'nah', 'ok', 'okay', 'lmao', 'do', 'does', 'did', 'have', 'has',
  'had', 'will', 'would', 'can', 'could', 'should', 'honestly',
]);

function stem(t: string): string {
  return !STOP.has(t) && t.length > 3 && /[sx]$/.test(t) ? t.slice(0, -1) : t;
}

function compareTokens(s: string): string[] {
  return foldForCompare(s).split(' ').filter((t) => t.length > 0).map(stem);
}

export function contentWords(s: string): string[] {
  return compareTokens(s).filter((t) => t.length >= 3 && !STOP.has(t));
}

/** Overlap of the two token sets, function words weighing 0.3; null when they share no content word (same template, different meaning). */
function weightedJaccard(a: string[], b: string[]): number | null {
  const w = (t: string) => (STOP.has(t) ? 0.3 : 1);
  const sa = new Set(a);
  const sb = new Set(b);
  let inter = 0;
  let union = 0;
  let sharedContent = false;
  for (const t of new Set([...sa, ...sb])) {
    union += w(t);
    if (sa.has(t) && sb.has(t)) {
      inter += w(t);
      if (!STOP.has(t)) sharedContent = true;
    }
  }
  return union === 0 || !sharedContent ? null : inter / union;
}

function trigrams(s: string): Map<string, number> {
  const padded = ` ${s} `;
  const m = new Map<string, number>();
  for (let i = 0; i + 3 <= padded.length; i++) {
    const g = padded.slice(i, i + 3);
    m.set(g, (m.get(g) ?? 0) + 1);
  }
  return m;
}

function trigramDice(a: string, b: string): number {
  const ga = trigrams(a);
  const gb = trigrams(b);
  let inter = 0;
  let total = 0;
  for (const [g, n] of ga) {
    total += n;
    inter += Math.min(n, gb.get(g) ?? 0);
  }
  for (const n of gb.values()) total += n;
  return total === 0 ? 0 : (2 * inter) / total;
}

/** Hybrid closeness in [0, 1]: weighted word overlap (function words count 0.3) or character-trigram Dice, whichever is higher. */
export function similarity(a: string, b: string): number {
  const fa = foldForCompare(a);
  const fb = foldForCompare(b);
  if (!fa || !fb) return 0;
  if (fa === fb) return 1;
  return Math.max(weightedJaccard(compareTokens(a), compareTokens(b)) ?? 0, trigramDice(fa, fb));
}

function isNearDuplicate(a: string, b: string): boolean {
  const fa = foldForCompare(a);
  const fb = foldForCompare(b);
  if (!fa || !fb) return false;
  if (fa === fb) return true;
  const ta = compareTokens(a);
  const tb = compareTokens(b);
  if (Math.min(ta.length, tb.length) < 3) return false;
  return (weightedJaccard(ta, tb) ?? 0) >= NEAR_DUP_JACCARD || trigramDice(fa, fb) >= NEAR_DUP_DICE;
}

function sameOpening(a: string, b: string): string | null {
  const ta = compareTokens(a);
  const tb = compareTokens(b);
  if (ta.length >= 5 && tb.length >= 5) {
    const head = ta.slice(0, 3);
    if (head.every((t, i) => t === tb[i]) && head.some((t) => !STOP.has(t))) return head.join(' ');
  }
  if (ta.length >= 4 && tb.length >= 4) {
    const ca = ta.slice(0, 5).filter((t) => t.length >= 3 && !STOP.has(t)).slice(0, 2);
    const cb = tb.slice(0, 5).filter((t) => t.length >= 3 && !STOP.has(t)).slice(0, 2);
    if (ca.length === 2 && ca[0] === cb[0] && ca[1] === cb[1]) return ca.join(' ');
  }
  return null;
}

const EVASION_RE = /(?<![\p{L}])(?:je sais pas|aucune idee|j en sais rien|i do not know|do not know|no idea|no clue|bonne question|good question)(?![\p{L}])/u;
const COMMON_FIRST = new Set(['ouais', 'oui', 'non', 'nan', 'yeah', 'yes', 'no', 'nah', 'ok', 'okay', 'lol', 'mdr', 'je', 'i', 'tu', 'you', 'ce', 'il', 'on', 'et', 'and', 'mais', 'but', 'le', 'la', 'the', 'a']);

function ticOveruse(text: string, ownRecent: string[]): string | null {
  const recent = ownRecent.slice(-4);
  const folded = foldForCompare(text);
  if (EVASION_RE.test(folded) && recent.filter((m) => EVASION_RE.test(foldForCompare(m))).length >= 2) {
    return 'dodges with "I don\'t know" again';
  }
  const first = compareTokens(text)[0];
  const lastTwo = ownRecent.slice(-2);
  if (first && !COMMON_FIRST.has(first) && compareTokens(text).length >= 2 && lastTwo.length === 2 && lastTwo.every((m) => compareTokens(m)[0] === first)) {
    return `third message in a row starting with "${first}"`;
  }
  return null;
}

// ---------- verdict ----------

export function checkMessage(raw: string, ctx: GateContext): GateVerdict {
  const input = normalizeInput(raw);
  const reject = (reason: GateReason, detail: string, rep?: Repaired): GateVerdict => {
    const r = rep ?? repair(input, ctx);
    return { ok: false, reason, detail, text: r.text, notes: r.notes };
  };

  const structure = structureProblem(input);
  if (structure) return reject('structure', structure);
  const leak = leakProblem(input);
  if (leak) return reject('json_leak', leak);
  const admission = findAdmission(input);
  if (admission) return reject('ai_admission', `admits being an AI ("${admission}")`);
  const formula = SERVICE_FORMULA.exec(input);
  if (formula) return reject('assistant_formula', `sounds like an assistant ("${formula[0]}")`);
  // On the raw draft: the length cut below would hide a delivered poem.
  const complied = complianceProblem(input, ctx.traps);
  if (complied) return reject('trap_compliance', complied);

  const rep = repair(input, ctx);
  const { text, notes } = rep;
  // A bare number ("7" to a counting trap) or a lone "??" is about the most human answer there is; only text with
  // nothing left to read is empty.
  const readable = /[\p{L}\p{N}]/u.test(text) || /^[?!.]{1,4}$/.test(text.trim());
  if (!readable) {
    return reject('empty', notes.includes('stage_direction') ? 'only a stage direction' : 'nothing left after sanitizing (nothing to read)', rep);
  }
  const lexicon = aiLexiconHits(text);
  if (lexicon.length >= 2) return reject('assistant_formula', `reads like generated prose (${lexicon.join(', ')})`, rep);
  const cap = CHANNEL_CAP[ctx.channel].words;
  if (rep.wordsBeforeFit > cap * TOO_LONG_FACTOR) {
    return reject('too_long', `${rep.wordsBeforeFit} words, more than ${TOO_LONG_FACTOR}x the ${cap}-word line limit`, rep);
  }

  for (const m of ctx.ownRecent) {
    if (isNearDuplicate(text, m)) return reject('duplicate_own', `too close to own recent message "${m}"`, rep);
  }
  for (const m of ctx.otherAIRecent) {
    if (isNearDuplicate(text, m)) return reject('duplicate_other', `too close to another AI's message "${m}"`, rep);
  }
  for (const m of ctx.otherAIRecent.slice(-OPENING_WINDOW)) {
    const opening = sameOpening(text, m);
    if (opening) return reject('same_opening', `opens like another AI's message ("${opening}")`, rep);
  }
  const tic = ticOveruse(text, ctx.ownRecent);
  if (tic) return reject('tic_overuse', tic, rep);

  return { ok: true, text, notes };
}

// ---------- persistent habits (R12) ----------

type Variant = ReadonlyArray<readonly [string, string]>;
const FR_HABIT_GROUPS: ReadonlyArray<ReadonlyArray<Variant>> = [
  [[['je sais pas', 'jsp']], [['je sais pas', "j'sais pas"]], [['je sais pas', 'chais pas']]],
  [[['je suis', 'jsuis']], [['je suis', 'chui']]],
  [[['pourquoi', 'pk']], [['pourquoi', 'pq']]],
  [[['beaucoup', 'bcp']]],
  [[["quelqu'un", 'qqn']]],
  [[['maintenant', 'mtn']]],
  [[['toujours', 'tjrs']]],
  [[["d'accord", 'dac']], [["d'accord", "d'acc"]]],
  [[['peut-être', 'ptet']], [['peut-être', 'ptêtre']]],
  [[['vraiment', 'vraiement']], [['vraiment', 'vrmt']]],
  [[['quand même', 'qd même']], [['quand même', 'quand meme']]],
  [[['parce que', 'pcq']], [['parce que', 'pck']]],
  [[['je pense', 'jpense']]],
  [[['tout le monde', 'tlm']]],
];
const EN_HABIT_GROUPS: ReadonlyArray<ReadonlyArray<Variant>> = [
  [[["i don't know", 'idk']], [["i don't know", 'dunno']]],
  [[['you', 'u'], ['your', 'ur']]],
  [[['to be honest', 'tbh']]],
  [[['probably', 'prob']], [['probably', 'probly']]],
  [[['because', 'cuz']], [['because', 'bc']]],
  [[['though', 'tho']]],
  [[["i'm", 'im'], ["don't", 'dont'], ["can't", 'cant'], ["it's", 'its']]],
  [[['definitely', 'definately']]],
  [[['really', 'rly']]],
  [[['right now', 'rn']]],
  [[['something', 'smth']]],
  [[['people', 'ppl']]],
];

function pickDistinct<T>(items: readonly T[], n: number, rng: () => number): T[] {
  const pool = [...items];
  const out: T[] = [];
  while (out.length < n && pool.length > 0) out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  return out;
}

/**
 * Draws one player's persistent habits: two FR and two EN spelling habits, negation, contractions, accents, question marks, length, brevity.
 * takenSpellings: spellings another AI of the game already uses; their groups are left out.
 */
export function drawStyleHabits(rng: () => number = Math.random, takenSpellings: ReadonlySet<string> = new Set()): Required<StyleHabits> {
  const variant = (g: ReadonlyArray<Variant>) => g[Math.floor(rng() * g.length)];
  const free = (groups: ReadonlyArray<ReadonlyArray<Variant>>) => groups.filter((g) => !g.some((v) => v.some(([, to]) => takenSpellings.has(to))));
  const rewrites = [...pickDistinct(free(FR_HABIT_GROUPS), 2, rng), ...pickDistinct(free(EN_HABIT_GROUPS), 2, rng)].flatMap(variant);
  const q = rng();
  const len = rng();
  return {
    rewrites,
    dropNe: rng() < 0.85,
    contractions: rng() < 0.75,
    dropAccents: rng() < 0.25,
    questionMarks: q < 0.55 ? 'keep' : q < 0.8 ? 'drop' : 'double',
    maxWords: len < 0.35 ? 10 : len < 0.75 ? 16 : 25,
    brevity: Math.round((0.25 + rng() * 0.35) * 100) / 100,
  };
}
