/**
 * Learned briefing: a short, prompt-ready digest of what real games showed (tells to avoid, replies that
 * survived an accusation, human style targets with numbers). Written by scripts/analyze-history.ts to
 * strategies/learned/briefing.<lang>.md, read back by getLearnedBriefing.
 *
 * First line of the file: <!-- learned-briefing lang=fr games=42 synthetic=false generated=YYYY-MM-DD -->
 * getLearnedBriefing returns null for a synthetic briefing (fixtures) or one built on too few games:
 * a briefing of invented or noisy numbers must never reach a prompt.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CounterMove, HistoryAnalysis, Rate, Section } from './analysis.js';
import type { Language } from './types.js';

export interface BriefingThresholds {
  /** Messages per group (humans, AIs) before a style figure is used. */
  minStyleMessages: number;
  /** Accusations per reply kind before a counter-move is cited. */
  minCounterMoves: number;
  /** AIs on each side (voted out / survived) before a predictor is cited. */
  minPredictor: number;
}

export const DEFAULT_THRESHOLDS: BriefingThresholds = { minStyleMessages: 15, minCounterMoves: 3, minPredictor: 3 };

const HERE = path.dirname(fileURLToPath(import.meta.url));
/** src/history and dist/history both sit two levels below turingarou-backend/. */
export const LEARNED_DIR = path.join(HERE, '..', '..', 'strategies', 'learned');

const T = {
  fr: {
    n: (x: number) => String(Math.round(x * 10) / 10).replace('.', ','),
    pct: (x: number) => `${Math.round(x * 100)} %`,
    title: (n: number | string) => `# Ce que les vraies parties ont montré (${n} parties en français)`,
    synthetic: ' — DONNÉES SYNTHÉTIQUES (fixtures), ne pas utiliser',
    tells: '## Tells observés à éviter',
    moves: '## Répliques qui ont survécu à une accusation',
    targets: '## Cibles de style (humains)',
    none: (detail: string) => `- pas assez de données (${detail})`,
    counts: (h: number | string, ai: number | string, acc: number | string) => [`${h} messages humains, ${ai} messages IA`, `${acc} accusations visant une IA`, `${h} messages humains`],
    lex: (w: string, ai: number, h: number, n: number) => `- Les IA écrivent « ${w} » dans ${ai} % de leurs messages, les humains dans ${h} % (${n} messages IA) : évite-le.`,
    longer: (ai: number | string, h: number | string) => `- Messages IA trop longs : médiane ${ai} caractères contre ${h} chez les humains.`,
    shorter: (ai: number | string, h: number | string) => `- Messages IA trop courts : médiane ${ai} caractères contre ${h} chez les humains.`,
    share: (what: string, ai: number, h: number) => `- ${what} : ${ai} % des messages IA contre ${h} % chez les humains.`,
    punct: 'Ponctuation finale',
    lower: 'Minuscule en début de message',
    emoji: 'Emoji',
    question: 'Question (« ? »)',
    latency: (ai: number | string, h: number | string) => `- Délai après le message précédent : médiane ${ai} s chez les IA contre ${h} s chez les humains.`,
    answerLen: (ai: number | string, h: number | string) => `- Réponses à la question : médiane ${ai} mots chez les IA contre ${h} chez les humains.`,
    spread: (ai: number | string, h: number | string) => `- Réponses des IA trop semblables entre elles : écart-type ${ai} mot(s) contre ${h} chez les humains.`,
    predictor: (label: string, e: string, s: string) => `- Les IA éliminées : ${label} ${e}, contre ${s} pour celles qui ont passé le round.`,
    plabel: { messages_sent: 'messages par round', mean_message_chars: 'longueur moyenne des messages', ends_with_punctuation_share: 'part de messages ponctués', answer_words: 'mots dans la réponse' } as Record<string, string>,
    move: (r: string, k: number, n: number, p: number) => `- Accusée, une IA qui répond par ${r} survit au vote du round ${k} fois sur ${n} (${p} %).`,
    humanReply: (s: number | string) => `- Les humains accusés répliquent en médiane en ${s} s.`,
    response: { silence: 'le silence', counter_accusation: 'une contre-accusation', denial: 'une dénégation', humour: "l'humour", question: 'une question en retour', other: 'autre chose' } as Record<string, string>,
    len: (p50: number | string, w: number | string, p90: number | string) => `- Longueur : médiane ${p50} caractères (${w} mots), 90 % des messages sous ${p90} caractères.`,
    shares: (lower: number | string, punct: number | string, q: number | string, emoji: number | string) => `- Minuscule en début de message ${lower} % · ponctuation finale ${punct} % · « ? » ${q} % · emoji ${emoji} %.`,
    lat: (s: number | string) => `- Délai après le message précédent : médiane ${s} s.`,
    ans: (w: number | string) => `- Réponse à la question : médiane ${w} mots.`,
    markers: (ws: string) => `- Mots fréquents chez les humains, absents chez les IA : ${ws}.`,
  },
  en: {
    n: (x: number) => String(Math.round(x * 10) / 10),
    pct: (x: number) => `${Math.round(x * 100)}%`,
    title: (n: number | string) => `# What real games showed (${n} games in English)`,
    synthetic: ' — SYNTHETIC DATA (fixtures), do not use',
    tells: '## Observed tells to avoid',
    moves: '## Replies that survived an accusation',
    targets: '## Style targets (humans)',
    none: (detail: string) => `- not enough data (${detail})`,
    counts: (h: number | string, ai: number | string, acc: number | string) => [`${h} human messages, ${ai} AI messages`, `${acc} accusations of an AI`, `${h} human messages`],
    lex: (w: string, ai: number, h: number, n: number) => `- AIs write "${w}" in ${ai}% of their messages, humans in ${h}% (${n} AI messages): avoid it.`,
    longer: (ai: number | string, h: number | string) => `- AI messages too long: median ${ai} characters vs ${h} for humans.`,
    shorter: (ai: number | string, h: number | string) => `- AI messages too short: median ${ai} characters vs ${h} for humans.`,
    share: (what: string, ai: number, h: number) => `- ${what}: ${ai}% of AI messages vs ${h}% for humans.`,
    punct: 'Ending punctuation',
    lower: 'Lowercase first letter',
    emoji: 'Emoji',
    question: 'Question mark',
    latency: (ai: number | string, h: number | string) => `- Delay after the previous message: median ${ai} s for AIs vs ${h} s for humans.`,
    answerLen: (ai: number | string, h: number | string) => `- Question answers: median ${ai} words for AIs vs ${h} for humans.`,
    spread: (ai: number | string, h: number | string) => `- AI answers too alike: standard deviation ${ai} word(s) vs ${h} for humans.`,
    predictor: (label: string, e: string, s: string) => `- Voted-out AIs: ${label} ${e}, vs ${s} for AIs that got through the round.`,
    plabel: { messages_sent: 'messages per round', mean_message_chars: 'mean message length', ends_with_punctuation_share: 'share of punctuated messages', answer_words: 'words in their answer' } as Record<string, string>,
    move: (r: string, k: number, n: number, p: number) => `- Accused, an AI replying with ${r} survived the round's vote ${k} times out of ${n} (${p}%).`,
    humanReply: (s: number | string) => `- Accused humans reply after a median ${s} s.`,
    response: { silence: 'silence', counter_accusation: 'a counter-accusation', denial: 'a denial', humour: 'humour', question: 'a question back', other: 'something else' } as Record<string, string>,
    len: (p50: number | string, w: number | string, p90: number | string) => `- Length: median ${p50} characters (${w} words), 90% of messages under ${p90} characters.`,
    shares: (lower: number | string, punct: number | string, q: number | string, emoji: number | string) => `- Lowercase first letter ${lower}% · ending punctuation ${punct}% · "?" ${q}% · emoji ${emoji}%.`,
    lat: (s: number | string) => `- Delay after the previous message: median ${s} s.`,
    ans: (w: number | string) => `- Question answer: median ${w} words.`,
    markers: (ws: string) => `- Words humans use that AIs never do: ${ws}.`,
  },
};

const P = (r: Rate) => Math.round((r.rate ?? 0) * 100);

function tellLines(s: Section, t: (typeof T)['fr'], th: BriefingThresholds): string[] {
  const out: string[] = [];
  for (const x of s.lexical.aiOverused.slice(0, 4)) out.push(t.lex(x.word, Math.round(x.aiShare * 100), Math.round(x.humanShare * 100), x.aiMessages));
  const h = s.style.messages.human;
  const ai = s.style.messages.ai;
  if (h.messages >= th.minStyleMessages && ai.messages >= th.minStyleMessages) {
    const hc = h.chars.p50 ?? 0;
    const ac = ai.chars.p50 ?? 0;
    if (hc > 0 && ac / hc >= 1.3) out.push(t.longer(t.n(ac), t.n(hc)));
    if (hc > 0 && ac / hc <= 0.77) out.push(t.shorter(t.n(ac), t.n(hc)));
    const shareGap = (label: string, a: Rate, b: Rate, gap = 0.15) => {
      if (a.rate !== null && b.rate !== null && Math.abs(a.rate - b.rate) >= gap) out.push(t.share(label, P(a), P(b)));
    };
    shareGap(t.punct, ai.endsWithPunctuation, h.endsWithPunctuation);
    shareGap(t.lower, ai.startsLower, h.startsLower);
    shareGap(t.question, ai.question, h.question);
    shareGap(t.emoji, ai.emoji, h.emoji, 0.1);
    const hl = s.style.latencyMs.human.p50;
    const al = s.style.latencyMs.ai.p50;
    if (hl && al && (al / hl >= 1.5 || al / hl <= 0.67)) out.push(t.latency(t.n(al / 1000), t.n(hl / 1000)));
  }
  const ha = s.style.answers.human;
  const aa = s.style.answers.ai;
  if (ha.answers >= th.minStyleMessages / 3 && aa.answers >= th.minStyleMessages / 3 && ha.words.p50 && aa.words.p50) {
    const ratio = aa.words.p50 / ha.words.p50;
    if (ratio >= 1.3 || ratio <= 0.77) out.push(t.answerLen(t.n(aa.words.p50), t.n(ha.words.p50)));
  }
  const { ai: sa, human: sh } = s.style.answerSpread;
  if (sa !== null && sh !== null && sh > 0 && sa < 0.6 * sh) out.push(t.spread(t.n(sa), t.n(sh)));
  for (const p of s.eliminations.predictors) {
    if (!(p.feature in t.plabel) || p.eliminated === null || p.survivors === null) continue;
    if (p.nEliminated < th.minPredictor || p.nSurvivors < th.minPredictor) continue;
    const base = Math.max(Math.abs(p.survivors), 1e-9);
    const v = (x: number) => (p.feature.endsWith('_share') ? t.pct(x) : t.n(x));
    if (Math.abs(p.eliminated - p.survivors) / base >= 0.3) out.push(t.predictor(t.plabel[p.feature], v(p.eliminated), v(p.survivors)));
  }
  return out;
}

function moveLines(s: Section, t: (typeof T)['fr'], th: BriefingThresholds): string[] {
  const out: string[] = [];
  const aiMoves = s.counterMoves
    .filter((c): c is CounterMove & { survived: { rate: number } } => c.target === 'ai' && c.n >= th.minCounterMoves && c.survived.rate !== null)
    .sort((a, b) => b.survived.rate - a.survived.rate || b.n - a.n);
  for (const c of aiMoves) out.push(t.move(t.response[c.response], c.survived.k, c.survived.n, P(c.survived)));
  const humanLat = s.counterMoves.filter((c) => c.target === 'human' && c.response !== 'silence').flatMap((c) => (c.replyLatencyMs.p50 === null ? [] : [{ p50: c.replyLatencyMs.p50, n: c.n }]));
  const nHuman = humanLat.reduce((a, x) => a + x.n, 0);
  if (nHuman >= th.minCounterMoves) out.push(t.humanReply(t.n(humanLat.reduce((a, x) => a + x.p50 * x.n, 0) / nHuman / 1000)));
  return out;
}

function targetLines(s: Section, t: (typeof T)['fr'], th: BriefingThresholds): string[] {
  const h = s.style.messages.human;
  if (h.messages < th.minStyleMessages) return [];
  const out = [t.len(t.n(h.chars.p50 ?? 0), t.n(h.words.p50 ?? 0), t.n(h.chars.p90 ?? 0)), t.shares(P(h.startsLower), P(h.endsWithPunctuation), P(h.question), P(h.emoji))];
  const lat = s.style.latencyMs.human.p50;
  if (lat !== null) out.push(t.lat(t.n(lat / 1000)));
  const ans = s.style.answers.human.words.p50;
  if (ans !== null) out.push(t.ans(t.n(ans)));
  const markers = s.lexical.humanMarkers.filter((x) => x.games >= 3);
  if (markers.length) out.push(t.markers(markers.slice(0, 6).map((x) => (x.word.includes(' ') ? `"${x.word}"` : x.word)).join(', ')));
  return out;
}

export function renderBriefing(a: HistoryAnalysis, lang: Language, thresholds: BriefingThresholds = DEFAULT_THRESHOLDS): string {
  const t = T[lang];
  const s = a.byLanguage[lang];
  const games = s?.games ?? 0;
  const header = `<!-- learned-briefing lang=${lang} games=${games} synthetic=${a.corpus.synthetic > 0} generated=${a.generatedAt.slice(0, 10)} -->`;
  if (!s) return `${header}\n${t.title(0)}\n\n${t.none('0')}\n`;
  const accusedAIs = s.counterMoves.filter((c) => c.target === 'ai').reduce((n, c) => n + c.n, 0);
  const [tellsN, movesN, targetsN] = t.counts(s.style.messages.human.messages, s.style.messages.ai.messages, accusedAIs);
  const block = (title: string, lines: string[], detail: string) => [title, ...(lines.length ? lines : [t.none(detail)])].join('\n');
  return [
    header,
    t.title(games) + (a.corpus.synthetic > 0 ? t.synthetic : ''),
    '',
    block(t.tells, tellLines(s, t, thresholds), tellsN),
    '',
    block(t.moves, moveLines(s, t, thresholds), movesN),
    '',
    block(t.targets, targetLines(s, t, thresholds), targetsN),
    '',
  ].join('\n');
}

export interface BriefingHeader { lang: string; games: number; synthetic: boolean; generated: string }

export function parseBriefingHeader(text: string): BriefingHeader | null {
  const m = /^<!-- learned-briefing (.*?) -->/.exec(text);
  if (!m) return null;
  const kv = Object.fromEntries(m[1].split(/\s+/).map((p) => p.split('=') as [string, string]));
  return { lang: kv.lang ?? '', games: Number(kv.games ?? 0), synthetic: kv.synthetic !== 'false', generated: kv.generated ?? '' };
}

const cache = new Map<string, string | null>();

/**
 * Prompt-ready briefing for the language, or null when there is none worth using: file missing,
 * header missing, synthetic data, or fewer than minGames games behind it.
 */
export function getLearnedBriefing(lang: Language, opts: { minGames?: number; dir?: string } = {}): string | null {
  const minGames = opts.minGames ?? 20;
  const file = path.join(opts.dir ?? LEARNED_DIR, `briefing.${lang}.md`);
  const key = `${file}|${minGames}`;
  if (cache.has(key)) return cache.get(key)!;
  let out: string | null = null;
  try {
    const text = fs.readFileSync(file, 'utf8');
    const h = parseBriefingHeader(text);
    if (h && !h.synthetic && h.lang === lang && h.games >= minGames) out = text.replace(/^<!--.*?-->\s*/, '').trim();
  } catch {
    out = null;
  }
  cache.set(key, out);
  return out;
}
