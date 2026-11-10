/**
 * Deterministic analysis of a corpus of games (export JSONL). No LLM call: counts, rates and
 * distributions, each with its sample size, so a reader can tell a finding from noise.
 * Works the same on raw and pseudonymized games (names are excluded from every text feature).
 */

import { addressedTo } from '../game/directAddress.js';
import { makeNameReplacer } from './pseudonymize.js';
import type { HistoryGame, HistoryMessage, Language, PlayerKind } from './types.js';

export const ANALYSIS_SCHEMA = 'turingarou.history-analysis.v1';

export interface Rate { k: number; n: number; rate: number | null }
export interface Dist { n: number; p10: number | null; p50: number | null; p90: number | null; mean: number | null }

export interface GroupOutcome {
  key: string;
  aiPlayers: number;
  survived: Rate;
  teamWins: Rate;
  meanEliminationRound: number | null;
  accusationsPerRound: number | null;
}

export interface StyleStats {
  messages: number;
  chars: Dist;
  words: Dist;
  startsLower: Rate;
  allLower: Rate;
  endsWithPunctuation: Rate;
  question: Rate;
  exclamation: Rate;
  emoji: Rate;
  ellipsis: Rate;
  commasPerMessage: number | null;
}

export interface AnswerStats { answers: number; words: Dist; chars: Dist; startsLower: Rate; endsWithPunctuation: Rate }

export interface LexItem { word: string; aiMessages: number; humanMessages: number; aiShare: number; humanShare: number; ratio: number; games: number }

export interface QuestionExposure {
  question: string;
  rounds: number;
  aiEliminated: Rate;
  humanVotesOnAI: Rate;
  answerWordsAI: number | null;
  answerWordsHuman: number | null;
}

export type ResponseKind = 'silence' | 'counter_accusation' | 'denial' | 'humour' | 'question' | 'other';
export const RESPONSE_KINDS: ResponseKind[] = ['silence', 'counter_accusation', 'denial', 'humour', 'question', 'other'];

export interface CounterMove {
  target: 'ai' | 'human';
  response: ResponseKind;
  n: number;
  survived: Rate;
  meanVoteShare: number | null;
  replyLatencyMs: Dist;
}

export interface EliminationCase {
  gameId: string;
  round: number;
  player: string;
  strategy: string | null;
  provider: string | null;
  votesReceived: number;
  totalVotes: number;
  accusationsReceived: number;
  ownMessages: number;
  ownAnswer: string | null;
  preceding: { player: string; type: PlayerKind; content: string }[];
}

export interface FeatureComparison { feature: string; eliminated: number | null; survivors: number | null; nEliminated: number; nSurvivors: number }

export interface InspectorImpact {
  gamesWith: number;
  gamesWithout: number;
  humanWinWith: Rate;
  humanWinWithout: Rate;
  eliminationAccuracyWith: Rate;
  eliminationAccuracyWithout: Rate;
  inspectorVotesOnAI: Rate;
  humanVotesOnAIWith: Rate;
  humanVotesOnAIWithout: Rate;
  inspectorEliminated: Rate;
}

export interface Section {
  games: number;
  outcomes: { humansWin: Rate; aiWin: Rate; draw: Rate; meanRounds: number | null };
  byStrategy: GroupOutcome[];
  byProvider: GroupOutcome[];
  eliminations: {
    byRound: { round: number; ai: number; human: number; inspector: number; none: number }[];
    /** Eliminations that hit an AI. */
    accuracy: Rate;
    humanVotesOnAI: Rate;
    aiVotesOnHumans: Rate;
    /** Per round, AIs voted out that round vs AIs that survived it. */
    predictors: FeatureComparison[];
    cases: EliminationCase[];
  };
  /** Text features are computed with player names removed, so raw and pseudonymized corpora agree. */
  style: {
    messages: Record<PlayerKind, StyleStats>;
    answers: Record<PlayerKind, AnswerStats>;
    /** Time since the previous message of the round, when written by someone else. */
    latencyMs: Record<PlayerKind, Dist>;
    /** Mean, over rounds with ≥ 2 such answers, of the standard deviation of answer length in words. */
    answerSpread: { ai: number | null; human: number | null };
  };
  lexical: { aiOverused: LexItem[]; humanMarkers: LexItem[] };
  questions: QuestionExposure[];
  counterMoves: CounterMove[];
  inspector: InspectorImpact;
  flags: { total: number; resolved: number; onAI: Rate };
}

export interface HistoryAnalysis {
  schema: typeof ANALYSIS_SCHEMA;
  generatedAt: string;
  corpus: {
    games: number;
    excluded: number;
    synthetic: number;
    languages: Partial<Record<Language, number>>;
    dateRange: { from: string; to: string } | null;
    aiPlayers: number;
    aiPlayersWithProvider: number;
  };
  overall: Section;
  byLanguage: Partial<Record<Language, Section>>;
  notMeasured: string[];
}

export interface AnalysisOptions {
  includeSuspect?: boolean;
  maxCases?: number;
  minLexCount?: number;
  now?: () => Date;
}

// ─── Small numeric helpers ────────────────────────────────────────────────────

const r4 = (x: number) => Math.round(x * 10000) / 10000;
export const rate = (k: number, n: number): Rate => ({ k, n, rate: n > 0 ? r4(k / n) : null });
const mean = (xs: number[]) => (xs.length ? r4(xs.reduce((a, b) => a + b, 0) / xs.length) : null);

/** Linear interpolation between order statistics (numpy's default); p50 is the usual median. */
export function quantile(xs: number[], q: number): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const pos = q * (s.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return r4(s[lo] + (s[hi] - s[lo]) * (pos - lo));
}

export const dist = (xs: number[]): Dist => ({ n: xs.length, p10: quantile(xs, 0.1), p50: quantile(xs, 0.5), p90: quantile(xs, 0.9), mean: mean(xs) });

function std(xs: number[]): number {
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
}

// ─── Text features ────────────────────────────────────────────────────────────

const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[’‘]/g, "'");
const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const chars = (s: string) => [...s.trim()].length;
const EMOJI = /\p{Extended_Pictographic}/u;
const PSEUDONYM = /^p_[0-9a-f]{10}$/;
/** Function words: a difference in "je" or "the" is not something a prompt can act on. */
const STOPWORDS = new Set(
  (
    "le la les un une des de du et ou est c'est je tu il elle on nous vous ils elles me te se moi toi lui ça ce cette en au aux dans pour par sur avec que qui ne pas plus mais si mon ma mes ton ta tes son sa ses j'ai " +
    "the an and or is are am be it it's that this to of in on for with at so too just my me we they he she not no do don't was were have has been but if what i'm you you're your"
  ).split(' ')
);
const ANY_PSEUDONYM = /(?<![\p{L}\p{N}])p_[0-9a-f]{10}(?![\p{L}\p{N}])/giu;

export function textFeatures(content: string) {
  const t = content.trim();
  const firstLetter = [...t].find((c) => /\p{L}/u.test(c));
  const letters = [...t].filter((c) => /\p{L}/u.test(c));
  return {
    chars: chars(t),
    words: words(t),
    hasLetter: firstLetter !== undefined,
    startsLower: firstLetter !== undefined && firstLetter === firstLetter.toLowerCase() && firstLetter !== firstLetter.toUpperCase(),
    allLower: letters.length > 0 && letters.every((c) => c === c.toLowerCase()),
    endsWithPunctuation: /[.!?…]$/.test(t),
    question: t.includes('?'),
    exclamation: t.includes('!'),
    emoji: EMOJI.test(t),
    ellipsis: /\.\.\.|…/.test(t),
    commas: (t.match(/,/g) ?? []).length,
  };
}

function styleStats(texts: string[]): StyleStats {
  const f = texts.map(textFeatures);
  const withLetters = f.filter((x) => x.hasLetter);
  const count = (pred: (x: ReturnType<typeof textFeatures>) => boolean, pool = f) => rate(pool.filter(pred).length, pool.length);
  return {
    messages: f.length,
    chars: dist(f.map((x) => x.chars)),
    words: dist(f.map((x) => x.words)),
    startsLower: count((x) => x.startsLower, withLetters),
    allLower: count((x) => x.allLower, withLetters),
    endsWithPunctuation: count((x) => x.endsWithPunctuation),
    question: count((x) => x.question),
    exclamation: count((x) => x.exclamation),
    emoji: count((x) => x.emoji),
    ellipsis: count((x) => x.ellipsis),
    commasPerMessage: mean(f.map((x) => x.commas)),
  };
}

function answerStats(texts: string[]): AnswerStats {
  const f = texts.map(textFeatures);
  const withLetters = f.filter((x) => x.hasLetter);
  return {
    answers: f.length,
    words: dist(f.map((x) => x.words)),
    chars: dist(f.map((x) => x.chars)),
    startsLower: rate(withLetters.filter((x) => x.startsLower).length, withLetters.length),
    endsWithPunctuation: rate(f.filter((x) => x.endsWithPunctuation).length, f.length),
  };
}

function tokens(content: string, names: Set<string>): Set<string> {
  const out = new Set<string>();
  for (const raw of content.toLowerCase().replace(/[’‘]/g, "'").match(/[\p{L}\p{N}_']+/gu) ?? []) {
    const tok = raw.replace(/^'+|'+$/g, '');
    if (tok.length < 2 || STOPWORDS.has(tok) || PSEUDONYM.test(tok) || names.has(norm(tok))) continue;
    out.add(tok);
  }
  return out;
}

const word = (alternatives: string) => new RegExp(`(?<![\\p{L}\\p{N}])(?:${alternatives})(?![\\p{L}\\p{N}])`, 'u');
const DENIAL = word(
  [
    "pas (?:une? )?(?:ia|ai|bot|robot)",
    "(?:suis|chui|jsuis) (?:un |une )?humaine?",
    "(?:je suis|j'suis|jsuis|chui) pas",
    "c'est pas moi",
    'not (?:a |an )?(?:bot|ai|robot)',
    "(?:i'?m|i am) (?:a )?human",
    "i'?m not",
    'not me',
  ].join('|')
);
const HUMOUR = /(?<![\p{L}])(?:mdr+|ptdr+|lol+|lmao|haha\w*|hihi|xd|jpp)(?![\p{L}])|[😂🤣😅😆😹]/u;

export function classifyResponse(text: string | null, self: string, others: string[]): ResponseKind {
  if (text === null) return 'silence';
  if (others.some((o) => o !== self && addressedTo(text, o).accusation)) return 'counter_accusation';
  const n = norm(text);
  if (DENIAL.test(n)) return 'denial';
  if (HUMOUR.test(n)) return 'humour';
  if (text.includes('?')) return 'question';
  return 'other';
}

// ─── Per-game derived facts ───────────────────────────────────────────────────

interface Accusation { round: number; ts: number; accuser: string; target: string }

interface GameFacts {
  game: HistoryGame;
  /** Content without player names: input of every text feature. */
  clean: (content: string) => string;
  kind: (name: string) => PlayerKind;
  elimRound: Map<string, number>;
  alive: (name: string, round: number) => boolean;
  accusations: Accusation[];
  names: Set<string>;
  hasInspector: boolean;
}

const REPLY_WINDOW_MS = 90_000;

function factsOf(game: HistoryGame): GameFacts {
  const kinds = new Map<string, PlayerKind>(game.players.map((p) => [p.name, p.type]));
  for (const m of game.messages) if (!kinds.has(m.player)) kinds.set(m.player, m.type);
  const kind = (name: string): PlayerKind => kinds.get(name) ?? 'human';
  const elimRound = new Map<string, number>();
  for (const r of game.rounds) if (r.eliminated) elimRound.set(r.eliminated.name, r.round);
  for (const p of game.players) if (p.eliminated && p.eliminatedRound !== null && !elimRound.has(p.name)) elimRound.set(p.name, p.eliminatedRound);
  const alive = (name: string, round: number) => {
    const e = elimRound.get(name);
    return e === undefined || e >= round;
  };
  const accusations: Accusation[] = [];
  for (const m of game.messages) {
    for (const p of game.players) {
      if (p.name === m.player || !alive(p.name, m.round)) continue;
      if (addressedTo(m.content, p.name).accusation) accusations.push({ round: m.round, ts: m.ts, accuser: m.player, target: p.name });
    }
  }
  const names = new Set(game.players.map((p) => norm(p.name).trim()));
  const strip = makeNameReplacer(new Map(game.players.map((p) => [p.name, ''])));
  const clean = (content: string) => strip(content).replace(ANY_PSEUDONYM, '').replace(/\s+/g, ' ').trim();
  return { game, clean, kind, elimRound, alive, accusations, names, hasInspector: game.players.some((p) => p.type === 'inspector') };
}

// ─── Section ──────────────────────────────────────────────────────────────────

function groupOutcomes(facts: GameFacts[], keyOf: (p: HistoryGame['players'][number]) => string): GroupOutcome[] {
  const groups = new Map<string, { ai: number; survived: number; wins: number; elimRounds: number[]; accusations: number; roundsAlive: number }>();
  for (const f of facts) {
    const lastRound = f.game.rounds.length ? Math.max(...f.game.rounds.map((r) => r.round)) : 0;
    for (const p of f.game.players) {
      if (p.type !== 'ai') continue;
      const key = keyOf(p);
      const g = groups.get(key) ?? { ai: 0, survived: 0, wins: 0, elimRounds: [], accusations: 0, roundsAlive: 0 };
      g.ai++;
      const e = f.elimRound.get(p.name);
      if (e === undefined) g.survived++;
      else g.elimRounds.push(e);
      if (f.game.result === 'ai_win') g.wins++;
      g.accusations += f.accusations.filter((a) => a.target === p.name).length;
      g.roundsAlive += e ?? lastRound;
      groups.set(key, g);
    }
  }
  return [...groups.entries()]
    .map(([key, g]) => ({
      key,
      aiPlayers: g.ai,
      survived: rate(g.survived, g.ai),
      teamWins: rate(g.wins, g.ai),
      meanEliminationRound: mean(g.elimRounds),
      accusationsPerRound: g.roundsAlive ? r4(g.accusations / g.roundsAlive) : null,
    }))
    .sort((a, b) => b.aiPlayers - a.aiPlayers || a.key.localeCompare(b.key));
}

function votesOn(facts: GameFacts[], voterKind: PlayerKind, hit: (target: PlayerKind) => boolean): Rate {
  let k = 0;
  let n = 0;
  for (const f of facts)
    for (const r of f.game.rounds)
      for (const v of r.votes) {
        if (f.kind(v.voter) !== voterKind) continue;
        n++;
        if (hit(f.kind(v.target))) k++;
      }
  return rate(k, n);
}

function eliminationAccuracy(facts: GameFacts[]): Rate {
  let k = 0;
  let n = 0;
  for (const f of facts)
    for (const r of f.game.rounds)
      if (r.eliminated) {
        n++;
        if (f.kind(r.eliminated.name) === 'ai') k++;
      }
  return rate(k, n);
}

function section(facts: GameFacts[], opts: Required<Pick<AnalysisOptions, 'maxCases' | 'minLexCount'>>): Section {
  const games = facts.map((f) => f.game);
  const count = (res: string) => games.filter((g) => g.result === res).length;

  // Eliminations by round
  const byRoundMap = new Map<number, { round: number; ai: number; human: number; inspector: number; none: number }>();
  for (const f of facts)
    for (const r of f.game.rounds) {
      const row = byRoundMap.get(r.round) ?? { round: r.round, ai: 0, human: 0, inspector: 0, none: 0 };
      if (r.eliminated) row[f.kind(r.eliminated.name)]++;
      else row.none++;
      byRoundMap.set(r.round, row);
    }

  // Predictors and cases
  const elimFeat: Record<string, number[]> = {};
  const survFeat: Record<string, number[]> = {};
  const push = (bucket: Record<string, number[]>, k: string, v: number | null) => {
    if (v === null) return;
    (bucket[k] ??= []).push(v);
  };
  const cases: EliminationCase[] = [];
  for (const f of facts) {
    for (const r of f.game.rounds) {
      if (r.votes.length === 0) continue;
      const roundMsgs = f.game.messages.filter((m) => m.round === r.round);
      for (const p of f.game.players) {
        if (p.type !== 'ai' || !f.alive(p.name, r.round)) continue;
        const own = roundMsgs.filter((m) => m.player === p.name);
        const ownF = own.map((m) => textFeatures(f.clean(m.content)));
        const answer = r.answers.find((a) => a.player === p.name)?.answer ?? null;
        const accused = f.accusations.filter((a) => a.round === r.round && a.target === p.name).length;
        const votes = r.votes.filter((v) => v.target === p.name).length;
        const out = r.eliminated?.name === p.name;
        const bucket = out ? elimFeat : survFeat;
        push(bucket, 'messages_sent', own.length);
        push(bucket, 'mean_message_chars', ownF.length ? ownF.reduce((a, x) => a + x.chars, 0) / ownF.length : null);
        push(bucket, 'ends_with_punctuation_share', ownF.length ? ownF.filter((x) => x.endsWithPunctuation).length / ownF.length : null);
        push(bucket, 'accusations_received', accused);
        push(bucket, 'answer_words', answer === null ? null : words(f.clean(answer)));
        push(bucket, 'vote_share', votes / r.votes.length);
        if (out) {
          const others = roundMsgs.filter((m) => m.player !== p.name);
          const mentioning = others.filter((m) => addressedTo(m.content, p.name).direct);
          cases.push({
            gameId: f.game.gameId,
            round: r.round,
            player: p.name,
            strategy: p.strategy,
            provider: p.provider,
            votesReceived: votes,
            totalVotes: r.votes.length,
            accusationsReceived: accused,
            ownMessages: own.length,
            ownAnswer: answer,
            preceding: (mentioning.length ? mentioning : others).slice(-3).map((m) => ({ player: m.player, type: m.type, content: m.content.slice(0, 160) })),
          });
        }
      }
    }
  }
  const predictors: FeatureComparison[] = ['vote_share', 'accusations_received', 'messages_sent', 'mean_message_chars', 'ends_with_punctuation_share', 'answer_words'].map(
    (feature) => ({
      feature,
      eliminated: mean(elimFeat[feature] ?? []),
      survivors: mean(survFeat[feature] ?? []),
      nEliminated: (elimFeat[feature] ?? []).length,
      nSurvivors: (survFeat[feature] ?? []).length,
    })
  );

  // Style
  const kinds: PlayerKind[] = ['human', 'ai', 'inspector'];
  const msgsBy = (k: PlayerKind) => facts.flatMap((f) => f.game.messages.filter((m) => f.kind(m.player) === k).map((m) => f.clean(m.content)));
  const answersBy = (k: PlayerKind) => facts.flatMap((f) => f.game.rounds.flatMap((r) => r.answers.filter((a) => f.kind(a.player) === k).map((a) => f.clean(a.answer))));
  const latency: Record<PlayerKind, number[]> = { human: [], ai: [], inspector: [] };
  for (const f of facts) {
    const sorted = [...f.game.messages].sort((a, b) => a.ts - b.ts);
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const cur = sorted[i];
      if (prev.round !== cur.round || prev.player === cur.player) continue;
      latency[f.kind(cur.player)].push(cur.ts - prev.ts);
    }
  }
  const spread = (k: PlayerKind) => {
    const stds: number[] = [];
    for (const f of facts)
      for (const r of f.game.rounds) {
        const lens = r.answers.filter((a) => f.kind(a.player) === k).map((a) => words(f.clean(a.answer)));
        if (lens.length >= 2) stds.push(std(lens));
      }
    return mean(stds);
  };

  // Lexical
  const df = { ai: new Map<string, number>(), human: new Map<string, number>() };
  const gamesOf = new Map<string, Set<string>>();
  const nMsgs = { ai: 0, human: 0 };
  for (const f of facts)
    for (const m of f.game.messages) {
      const k = f.kind(m.player);
      if (k !== 'ai' && k !== 'human') continue;
      nMsgs[k]++;
      for (const t of tokens(f.clean(m.content), f.names)) {
        df[k].set(t, (df[k].get(t) ?? 0) + 1);
        const g = gamesOf.get(t) ?? new Set<string>();
        g.add(f.game.gameId);
        gamesOf.set(t, g);
      }
    }
  const lex: LexItem[] = [...new Set([...df.ai.keys(), ...df.human.keys()])].map((w) => {
    const a = df.ai.get(w) ?? 0;
    const h = df.human.get(w) ?? 0;
    return {
      word: w,
      aiMessages: a,
      humanMessages: h,
      aiShare: nMsgs.ai ? r4(a / nMsgs.ai) : 0,
      humanShare: nMsgs.human ? r4(h / nMsgs.human) : 0,
      ratio: r4((a + 0.5) / (nMsgs.ai + 1) / ((h + 0.5) / (nMsgs.human + 1))),
      games: gamesOf.get(w)?.size ?? 0,
    };
  });
  const aiOverused = lex
    .filter((x) => x.aiMessages >= opts.minLexCount && x.ratio >= 2)
    .sort((a, b) => b.ratio - a.ratio || b.aiMessages - a.aiMessages || a.word.localeCompare(b.word))
    .slice(0, 10);
  const humanMarkers = lex
    .filter((x) => x.humanMessages >= opts.minLexCount && x.ratio <= 0.5)
    .sort((a, b) => a.ratio - b.ratio || b.humanMessages - a.humanMessages || a.word.localeCompare(b.word))
    .slice(0, 10);

  // Questions
  const qMap = new Map<string, { rounds: number; aiOut: number; hv: number; hvAI: number; aiW: number[]; hW: number[] }>();
  for (const f of facts)
    for (const r of f.game.rounds) {
      if (!r.question) continue;
      const key = r.question.trim();
      const q = qMap.get(key) ?? { rounds: 0, aiOut: 0, hv: 0, hvAI: 0, aiW: [], hW: [] };
      q.rounds++;
      if (r.eliminated && f.kind(r.eliminated.name) === 'ai') q.aiOut++;
      for (const v of r.votes)
        if (f.kind(v.voter) === 'human') {
          q.hv++;
          if (f.kind(v.target) === 'ai') q.hvAI++;
        }
      for (const a of r.answers) {
        const k = f.kind(a.player);
        if (k === 'ai') q.aiW.push(words(f.clean(a.answer)));
        else if (k === 'human') q.hW.push(words(f.clean(a.answer)));
      }
      qMap.set(key, q);
    }
  const questions: QuestionExposure[] = [...qMap.entries()]
    .map(([question, q]) => ({
      question,
      rounds: q.rounds,
      aiEliminated: rate(q.aiOut, q.rounds),
      humanVotesOnAI: rate(q.hvAI, q.hv),
      answerWordsAI: quantile(q.aiW, 0.5),
      answerWordsHuman: quantile(q.hW, 0.5),
    }))
    .sort((a, b) => (b.humanVotesOnAI.rate ?? -1) - (a.humanVotesOnAI.rate ?? -1) || b.rounds - a.rounds || a.question.localeCompare(b.question));

  // Counter-moves: first accusation of a player in a round, then that player's next message
  const cm = new Map<string, { target: 'ai' | 'human'; response: ResponseKind; n: number; survived: number; shares: number[]; lat: number[] }>();
  for (const f of facts) {
    const seen = new Set<string>();
    for (const a of [...f.accusations].sort((x, y) => x.ts - y.ts)) {
      const key = `${a.round}|${a.target}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const k = f.kind(a.target);
      if (k === 'inspector') continue;
      const reply: HistoryMessage | undefined = f.game.messages
        .filter((m) => m.round === a.round && m.player === a.target && m.ts > a.ts && m.ts - a.ts <= REPLY_WINDOW_MS)
        .sort((x, y) => x.ts - y.ts)[0];
      const response = classifyResponse(reply?.content ?? null, a.target, f.game.players.map((p) => p.name));
      const round = f.game.rounds.find((r) => r.round === a.round);
      const g = cm.get(`${k}|${response}`) ?? { target: k, response, n: 0, survived: 0, shares: [], lat: [] };
      g.n++;
      if (f.elimRound.get(a.target) !== a.round) g.survived++;
      if (round && round.votes.length) g.shares.push(round.votes.filter((v) => v.target === a.target).length / round.votes.length);
      if (reply) g.lat.push(reply.ts - a.ts);
      cm.set(`${k}|${response}`, g);
    }
  }
  const counterMoves: CounterMove[] = [...cm.values()]
    .map((g) => ({ target: g.target, response: g.response, n: g.n, survived: rate(g.survived, g.n), meanVoteShare: mean(g.shares), replyLatencyMs: dist(g.lat) }))
    .sort((a, b) => a.target.localeCompare(b.target) || RESPONSE_KINDS.indexOf(a.response) - RESPONSE_KINDS.indexOf(b.response));

  // Inspector
  const withI = facts.filter((f) => f.hasInspector);
  const withoutI = facts.filter((f) => !f.hasInspector);
  const inspectors = withI.flatMap((f) => f.game.players.filter((p) => p.type === 'inspector').map((p) => f.elimRound.has(p.name)));

  // Flags
  const flags = facts.flatMap((f) => f.game.flags.map((fl) => ({ f, fl })));
  const resolved = flags.filter((x) => x.fl.target !== null);

  return {
    games: games.length,
    outcomes: {
      humansWin: rate(count('humans_win'), games.length),
      aiWin: rate(count('ai_win'), games.length),
      draw: rate(count('draw'), games.length),
      meanRounds: mean(games.map((g) => g.rounds.length)),
    },
    byStrategy: groupOutcomes(facts, (p) => p.strategy ?? 'unknown'),
    byProvider: groupOutcomes(facts, (p) => p.provider ?? 'unknown'),
    eliminations: {
      byRound: [...byRoundMap.values()].sort((a, b) => a.round - b.round),
      accuracy: eliminationAccuracy(facts),
      humanVotesOnAI: votesOn(facts, 'human', (t) => t === 'ai'),
      aiVotesOnHumans: votesOn(facts, 'ai', (t) => t !== 'ai'),
      predictors,
      cases: cases.slice(0, opts.maxCases),
    },
    style: {
      messages: Object.fromEntries(kinds.map((k) => [k, styleStats(msgsBy(k))])) as Record<PlayerKind, StyleStats>,
      answers: Object.fromEntries(kinds.map((k) => [k, answerStats(answersBy(k))])) as Record<PlayerKind, AnswerStats>,
      latencyMs: Object.fromEntries(kinds.map((k) => [k, dist(latency[k])])) as Record<PlayerKind, Dist>,
      answerSpread: { ai: spread('ai'), human: spread('human') },
    },
    lexical: { aiOverused, humanMarkers },
    questions,
    counterMoves,
    inspector: {
      gamesWith: withI.length,
      gamesWithout: withoutI.length,
      humanWinWith: rate(withI.filter((f) => f.game.result === 'humans_win').length, withI.length),
      humanWinWithout: rate(withoutI.filter((f) => f.game.result === 'humans_win').length, withoutI.length),
      eliminationAccuracyWith: eliminationAccuracy(withI),
      eliminationAccuracyWithout: eliminationAccuracy(withoutI),
      inspectorVotesOnAI: votesOn(withI, 'inspector', (t) => t === 'ai'),
      humanVotesOnAIWith: votesOn(withI, 'human', (t) => t === 'ai'),
      humanVotesOnAIWithout: votesOn(withoutI, 'human', (t) => t === 'ai'),
      inspectorEliminated: rate(inspectors.filter(Boolean).length, inspectors.length),
    },
    flags: { total: flags.length, resolved: resolved.length, onAI: rate(resolved.filter((x) => x.f.kind(x.fl.target!.player) === 'ai').length, resolved.length) },
  };
}

export function analyzeCorpus(all: HistoryGame[], options: AnalysisOptions = {}): HistoryAnalysis {
  const opts = { maxCases: options.maxCases ?? 200, minLexCount: options.minLexCount ?? 3 };
  const kept = all.filter((g) => g.rounds.length > 0 && (options.includeSuspect || !g.quality?.suspectMerged));
  const facts = kept.map(factsOf);
  const dates = kept.map((g) => g.date).sort();
  const aiPlayers = kept.flatMap((g) => g.players.filter((p) => p.type === 'ai'));
  const byLanguage: Partial<Record<Language, Section>> = {};
  for (const lang of ['fr', 'en'] as Language[]) {
    const sub = facts.filter((f) => f.game.language === lang);
    if (sub.length) byLanguage[lang] = section(sub, opts);
  }
  const overall = section(facts, opts);
  const withProvider = aiPlayers.filter((p) => p.provider !== null).length;

  const notMeasured = [
    'vote timing — round_votes carries no timestamp',
    'answer timing — round_answers carries no timestamp',
    'message phase (question / discussion / vote) — not persisted',
    'LLM latency and fallbacks per AI — only in the Railway `[game-telemetry]` log lines',
  ];
  if (withProvider === 0) notMeasured.push('provider — not persisted (game_players.strategy has no "@Provider"); byProvider is all "unknown"');
  else if (withProvider < aiPlayers.length) notMeasured.push(`provider — known for ${withProvider}/${aiPlayers.length} AI players only`);
  if (overall.flags.total > overall.flags.resolved) notMeasured.push(`flag target — ${overall.flags.total - overall.flags.resolved}/${overall.flags.total} flags not matched to a message`);

  const languages: Partial<Record<Language, number>> = {};
  for (const g of kept) languages[g.language] = (languages[g.language] ?? 0) + 1;

  return {
    schema: ANALYSIS_SCHEMA,
    generatedAt: (options.now ?? (() => new Date()))().toISOString(),
    corpus: {
      games: kept.length,
      excluded: all.length - kept.length,
      synthetic: kept.filter((g) => g.synthetic).length,
      languages,
      dateRange: dates.length ? { from: dates[0], to: dates[dates.length - 1] } : null,
      aiPlayers: aiPlayers.length,
      aiPlayersWithProvider: withProvider,
    },
    overall,
    byLanguage,
    notMeasured,
  };
}

/** Parses a JSONL corpus; blank lines skipped, a malformed line throws with its number. */
export function parseCorpus(text: string): HistoryGame[] {
  const games: HistoryGame[] = [];
  text.split('\n').forEach((line, i) => {
    if (!line.trim()) return;
    try {
      games.push(JSON.parse(line) as HistoryGame);
    } catch (err) {
      throw new Error(`corpus line ${i + 1}: ${err instanceof Error ? err.message : err}`);
    }
  });
  return games;
}
