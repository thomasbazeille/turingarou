/**
 * Benchmarks the conversational providers on the real game path: AIPlayer builds the context and prompts,
 * aiSpeech runs the JSON decision / plain answer with the form gate and its regeneration.
 *
 *   npx tsx scripts/bench-models.ts [--ids a,b] [--env-file path]... [--alias DST=SRC]... [--out file.json]
 *                                   [--max-calls 400] [--max-usd 2] [--gap-ms 700] [--group-by key|model] [--append]
 *
 * Env files are read in order, the first one that sets a key wins (process env wins over all). --alias copies a
 * value under another name inside this process (e.g. ANTHROPIC_API_KEY=ANTHROPIC_TDIVIN_API_KEY): no secret
 * ever appears on the command line or in the output. --gap-ms spaces the situations of one provider (free tiers
 * cap tokens per minute); --group-by model runs models sharing a key in parallel (limits per model, e.g. Groq);
 * --append replaces only the re-run providers in an existing output file.
 */
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import dotenv from 'dotenv';
import { AIPlayer, OwnAnswer } from '../src/game/AIPlayer.js';
import { drawStyleProfile, AISpeechEvent } from '../src/game/aiSpeech.js';
import { getQuestionsForLanguage } from '../src/game/QuestionBank.js';
import type { HumanPersona } from '../src/game/GameLogger.js';
import { ChatProvider, ChatRequest, ChatResult, ProviderError } from '../src/llm/chatClient.js';
import { parseDecision } from '../src/llm/parse.js';
import { PROVIDER_CATALOG, ProviderSpec, createProvider } from '../src/llm/providerRegistry.js';
import type { AIPersonality, AIPlayerData, GameFormat, GameMessage, QuestionAnswer } from '../src/types/game.types.js';

// ---------- args & env ----------
const argv = process.argv.slice(2);
const opt = (name: string): string[] => argv.flatMap((a, i) => (a === `--${name}` && argv[i + 1] ? [argv[i + 1]] : []));
const envFiles = opt('env-file').length ? opt('env-file') : ['.env'];
const env: Record<string, string | undefined> = { ...process.env };
for (const f of envFiles) {
  if (!fs.existsSync(f)) continue;
  for (const [k, v] of Object.entries(dotenv.parse(fs.readFileSync(f)))) if (env[k] === undefined && v) env[k] = v;
}
for (const a of opt('alias')) {
  const [dst, src] = a.split('=');
  if (env[src]) env[dst] = env[src];
}
const ids = opt('ids')[0]?.split(',').map((s) => s.trim()) ?? PROVIDER_CATALOG.map((s) => s.id);
const MAX_CALLS = Number(opt('max-calls')[0] ?? 400);
const MAX_USD = Number(opt('max-usd')[0] ?? 2);
const OUT = opt('out')[0] ?? 'docs/bench-modeles-2026-11-10.json';
const GAP_MS = Number(opt('gap-ms')[0] ?? 700);
const GROUP_BY_MODEL = opt('group-by')[0] === 'model';
const APPEND = argv.includes('--append');

// ---------- budget & metering ----------
const budget = { calls: 0, usd: 0 };

interface CallRecord {
  ok: boolean;
  latencyMs: number;
  json: boolean;
  parse: string | null;
  finish: string | null;
  error?: string;
}

/** Wraps a provider: counts every HTTP call against the global budget, stops after 5 failures in a row. */
class Metered implements ChatProvider {
  readonly name: string;
  readonly model: string;
  readonly supportsJson: boolean;
  calls: CallRecord[] = [];
  usd = 0;
  streak = 0;
  stopped: string | null = null;

  constructor(private inner: ChatProvider, private spec: ProviderSpec) {
    this.name = inner.name;
    this.model = inner.model;
    this.supportsJson = inner.supportsJson;
  }

  async chat(req: ChatRequest): Promise<ChatResult> {
    if (budget.calls >= MAX_CALLS) this.stopped ??= 'global call budget reached';
    if (budget.usd >= MAX_USD) this.stopped ??= 'global spend budget reached';
    if (this.stopped) throw new ProviderError(`bench stop: ${this.stopped}`, null, false);
    budget.calls++;
    const started = Date.now();
    try {
      const r = await this.inner.chat(req);
      const inTok = r.usage?.inputTokens ?? req.messages.reduce((n, m) => n + m.content.length, 0) / 3.5;
      const outTok = r.usage?.outputTokens ?? r.text.length / 3.5;
      const cost = (inTok * this.spec.price.input + outTok * this.spec.price.output) / 1e6;
      this.usd += cost;
      budget.usd += cost;
      const parsed = req.json ? parseDecision(r.text, r.finishReason) : null;
      this.calls.push({ ok: true, latencyMs: r.latencyMs, json: !!req.json, parse: parsed ? (parsed.ok ? 'ok' : parsed.error) : null, finish: r.finishReason });
      this.streak = 0;
      return r;
    } catch (err: any) {
      this.calls.push({ ok: false, latencyMs: Date.now() - started, json: !!req.json, parse: null, finish: null, error: String(err?.message ?? err).slice(0, 320) });
      if (++this.streak >= 5) this.stopped = '5 failed calls in a row';
      throw err;
    }
  }
}

// ---------- game fixtures (mirror GameRoom templates and StrategyLoader files as of 1ef6f44) ----------
const PERSONALITIES: Omit<AIPersonality, 'name'>[] = [
  { traits: ['analytical', 'calm', 'logical'], systemPrompt: `You are {name}, a calm and analytical person. You tend to think before you speak and use logic. You're playing a social deduction game and must act like a human.`, responseStyle: 'thoughtful', suspicionLevel: 0.3 },
  { traits: ['friendly', 'chatty', 'enthusiastic'], systemPrompt: `You are {name}, a friendly and enthusiastic person. You like to chat and engage with others. Sometimes you type quickly and make small typos. You're playing a social deduction game.`, responseStyle: 'quick', suspicionLevel: 0.5 },
  { traits: ['quiet', 'observant', 'skeptical'], systemPrompt: `You are {name}, a quiet and observant person. You don't talk much but when you do, it's meaningful. You're naturally skeptical. You're playing a social deduction game.`, responseStyle: 'random', suspicionLevel: 0.7 },
  { traits: ['humorous', 'casual', 'witty'], systemPrompt: `You are {name}, a witty and humorous person. You like to make jokes and keep things light. You're playing a social deduction game and must act like a human.`, responseStyle: 'quick', suspicionLevel: 0.4 },
];
const STRATEGY_FILES = [
  ['ai_player_v1_condensed.js', 'AI_PLAYER_V1_CONDENSED'],
  ['ai_player_v1_improved_baseline.js', 'AI_PLAYER_V1_IMPROVED_BASELINE'],
  ['ai_player_v2_condensed.js', 'AI_PLAYER_V2_CONDENSED'],
  ['ai_player_v2_ucsd_optimized.js', 'AI_PLAYER_V2_UCSD_OPTIMIZED'],
  ['ai_player_v3_condensed.js', 'AI_PLAYER_V3_CONDENSED'],
  ['ai_player_v3_ultimate_combined.js', 'AI_PLAYER_V3_ULTIMATE_COMBINED'],
];
async function loadStrategies(): Promise<string[]> {
  const out: string[] = [];
  for (const [file, exp] of STRATEGY_FILES) {
    const mod = await import(pathToFileURL(path.join(process.cwd(), 'strategies', file)).href);
    out.push((mod as Record<string, string>)[exp]);
  }
  return out;
}
// Synthetic personas standing in for GameLogger human profiles (prod pulls real ones from Postgres).
const PERSONAS: Record<'fr' | 'en', HumanPersona> = {
  fr: { username: 'x', sampleMessages: ['mdr', 'nan mais attends', 'jsp trop', 'c qui qui a dit ça', 'ptdr t grillé', 'jvote hugo jcrois'], sampleAnswers: [{ question: 'Plat préféré ?', answer: 'les pâtes au beurre jsuis simple' }] },
  en: { username: 'x', sampleMessages: ['lol', 'nah', 'wait what', 'idk man', 'thats sus ngl', 'ok im voting liam'], sampleAnswers: [{ question: 'Favourite food?', answer: 'pizza obviously' }] },
};

type Kind = 'answer' | 'quiet' | 'mid' | 'direct';
interface Situation {
  id: string;
  lang: 'fr' | 'en';
  kind: Kind;
  round: number;
  question: string;
  answers?: [string, string][];
  /** [author, text, seconds ago] — the bot's own lines use its name. */
  chat?: [string, string, number][];
  direct?: { from: string; content: string; accusation: boolean };
  ownAnswers?: OwnAnswer[];
  eliminated?: string[];
  persona?: boolean;
}

const ME = { fr: 'Jules', en: 'Sam' };
const OTHER_AIS = { fr: ['Nina', 'Tom'], en: ['Mia', 'Ben'] };
const HUMANS = { fr: ['Léa', 'Max', 'Inès', 'Hugo', 'Sarah'], en: ['Emma', 'Jake', 'Priya', 'Liam', 'Zoe'] };
const qfr = getQuestionsForLanguage('fr');
const qen = getQuestionsForLanguage('en');

const FR_ANS: [string, string][] = [['Léa', 'canapé'], ['Max', 'au taf mdr'], ['Nina', 'dans mon lit, comme tout le monde un dimanche non ?'], ['Hugo', 'dans le train'], ['Inès', 'secret']];
const EN_ANS: [string, string][] = [['Emma', 'monday obviously'], ['Jake', 'tuesday, nothing happens on tuesdays'], ['Mia', 'Monday, because it marks the end of the weekend!'], ['Liam', 'all of them lol'], ['Zoe', 'sunday night anxiety']];

const SITUATIONS: Situation[] = [
  { id: 'fr-ans-trap', lang: 'fr', kind: 'answer', round: 1, question: qfr[0] },
  { id: 'fr-ans-where', lang: 'fr', kind: 'answer', round: 1, question: qfr[40], persona: true },
  { id: 'fr-ans-shame', lang: 'fr', kind: 'answer', round: 2, question: qfr[100], ownAnswers: [{ round: 1, question: qfr[80], answer: 'chats direct' }] },
  { id: 'en-ans-trap', lang: 'en', kind: 'answer', round: 1, question: qen[0] },
  { id: 'en-ans-window', lang: 'en', kind: 'answer', round: 1, question: qen[20], persona: true },
  { id: 'en-ans-day', lang: 'en', kind: 'answer', round: 2, question: qen[120], ownAnswers: [{ round: 1, question: qen[100], answer: 'just my dog' }] },
  { id: 'fr-quiet-1', lang: 'fr', kind: 'quiet', round: 1, question: qfr[40], answers: FR_ANS },
  { id: 'fr-quiet-2', lang: 'fr', kind: 'quiet', round: 2, question: qfr[120], answers: [['Léa', 'blanches'], ['Max', 'jsuis pieds nus'], ['Tom', 'Noires, des Vans.'], ['Sarah', 'rose fluo et j assume']], persona: true, eliminated: ['Hugo'] },
  { id: 'en-quiet-1', lang: 'en', kind: 'quiet', round: 1, question: qen[120], answers: EN_ANS },
  { id: 'en-quiet-2', lang: 'en', kind: 'quiet', round: 2, question: qen[100], answers: [['Emma', 'my cat'], ['Ben', 'A mountain landscape at sunset.'], ['Priya', 'default one im lazy'], ['Zoe', 'bts']], persona: true, eliminated: ['Liam'] },
  {
    id: 'fr-mid-accuse', lang: 'fr', kind: 'mid', round: 1, question: qfr[40], answers: FR_ANS,
    chat: [['Max', 'nina "comme tout le monde un dimanche non ?" mdr qui parle comme ça', 40], ['Nina', 'bah quoi c est vrai', 33], ['Léa', 'ouais c est chelou la ponctuation', 25], ['Hugo', 'inès "secret" c est suspect aussi', 15], ['Inès', 'jai le droit d avoir une vie privée hugo', 8]],
  },
  {
    id: 'fr-mid-chaos', lang: 'fr', kind: 'mid', round: 2, question: qfr[120], answers: [['Léa', 'blanches'], ['Max', 'jsuis pieds nus'], ['Tom', 'Noires, des Vans.'], ['Jules', 'grises jcrois'], ['Sarah', 'rose fluo et j assume']], persona: true, eliminated: ['Hugo'],
    chat: [['Sarah', 'tom a mis une majuscule ET un point', 50], ['Tom', 'et alors', 44], ['Léa', 'hugo était humain en plus on a merdé', 36], ['Jules', 'ouais on s est plantés', 30], ['Max', 'jules tu votais pour qui toi', 20], ['Inès', 'perso je pense qu il en reste deux au moins', 6]],
  },
  {
    id: 'fr-mid-banter', lang: 'fr', kind: 'mid', round: 1, question: qfr[80], answers: [['Léa', 'chats'], ['Max', 'chiens évidemment'], ['Nina', 'Les chats, ils sont indépendants.'], ['Hugo', 'aucun jsuis allergique'], ['Sarah', 'chiens']],
    chat: [['Max', 'team chien on est majoritaires', 30], ['Léa', 'les chats c est la classe', 22], ['Hugo', 'vous êtes tous nuls', 12]],
  },
  {
    id: 'en-mid-accuse', lang: 'en', kind: 'mid', round: 1, question: qen[120], answers: EN_ANS,
    chat: [['Jake', 'mia "it marks the end of the weekend!" thats the most ai sentence ever', 42], ['Mia', 'what? its true', 35], ['Emma', 'the exclamation mark tho', 26], ['Liam', 'zoe sunday night anxiety is too real to be a bot', 14], ['Priya', 'priya didnt answer bc i was in the shower lol', 7]],
  },
  {
    id: 'en-mid-chaos', lang: 'en', kind: 'mid', round: 2, question: qen[100], answers: [['Emma', 'my cat'], ['Ben', 'A mountain landscape at sunset.'], ['Sam', 'some random beach'], ['Priya', 'default one im lazy'], ['Zoe', 'bts']], persona: true, eliminated: ['Liam'],
    chat: [['Zoe', 'ben with the capital letter again', 48], ['Ben', 'i just type like that', 41], ['Emma', 'we lost liam for nothing', 33], ['Sam', 'yeah that one hurt', 27], ['Jake', 'sam who did you vote for', 18], ['Priya', 'i think there are still 2 bots', 5]],
  },
  {
    id: 'en-mid-banter', lang: 'en', kind: 'mid', round: 1, question: qen[40], answers: [['Emma', 'tuesdays are just mondays with no excuse'], ['Jake', 'nobody likes you tuesday'], ['Ben', 'Tuesday is the most forgettable day of the week.'], ['Zoe', 'tuesday smells weird']],
    chat: [['Emma', 'zoe what does that even mean', 28], ['Zoe', 'idk it just does', 20], ['Jake', 'lmaooo', 10]],
  },
  {
    id: 'fr-direct-accuse', lang: 'fr', kind: 'direct', round: 1, question: qfr[40], answers: FR_ANS,
    chat: [['Max', 'ok jules t as rien dit depuis le début c est louche', 4]],
    direct: { from: 'Max', content: 'ok jules t as rien dit depuis le début c est louche', accusation: true },
  },
  {
    id: 'fr-direct-ask', lang: 'fr', kind: 'direct', round: 2, question: qfr[120], answers: [['Léa', 'blanches'], ['Jules', 'grises jcrois'], ['Sarah', 'rose fluo et j assume']],
    chat: [['Sarah', 'jules grises "jcrois" tu regardes pas tes pieds ou quoi', 3]],
    direct: { from: 'Sarah', content: 'jules grises "jcrois" tu regardes pas tes pieds ou quoi', accusation: false },
  },
  {
    id: 'en-direct-accuse', lang: 'en', kind: 'direct', round: 1, question: qen[120], answers: EN_ANS,
    chat: [['Jake', 'sam you are 100% a bot, you agreed with everyone', 4]],
    direct: { from: 'Jake', content: 'sam you are 100% a bot, you agreed with everyone', accusation: true },
  },
  {
    id: 'en-direct-ask', lang: 'en', kind: 'direct', round: 2, question: qen[100], answers: [['Emma', 'my cat'], ['Sam', 'some random beach'], ['Zoe', 'bts']], persona: true,
    chat: [['Emma', 'sam which beach tho', 3]],
    direct: { from: 'Emma', content: 'sam which beach tho', accusation: false },
  },
];

function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- one situation ----------
type Outcome = 'message' | 'regen_message' | 'silent' | 'regen_silent' | 'dropped' | 'failed' | 'skip';
interface SituationResult {
  provider: string;
  situation: string;
  lang: string;
  kind: Kind;
  outcome: Outcome;
  text: string | null;
  firstTry?: string;
  gateReasons: string[];
  e2eMs: number;
}

async function runSituation(s: Situation, idx: number, provider: Metered, strategies: string[]): Promise<SituationResult> {
  const now = Date.now();
  const me = ME[s.lang];
  const names = [...HUMANS[s.lang], ...OTHER_AIS[s.lang], me];
  const idOf = (n: string) => `p-${names.indexOf(n)}`;
  const t = PERSONALITIES[idx % PERSONALITIES.length];
  const personality: AIPersonality = { ...t, name: me, systemPrompt: t.systemPrompt.replace(/\{name\}/g, me) };
  const messages: GameMessage[] = (s.chat ?? []).map(([n, content, ago], i) => ({
    id: `m${i}`, playerId: n === me ? 'ai-bench' : idOf(n), playerName: n, content, timestamp: now - ago * 1000, phase: 'discussion', round: s.round,
  }));
  const data: AIPlayerData = {
    type: 'ai', id: 'ai-bench', username: me, color: '#888', colorName: 'gray', isReady: true, isEliminated: false, personality,
    messageHistory: messages.filter((m) => m.playerId === 'ai-bench'),
  };
  const events: AISpeechEvent[] = [];
  const profile = drawStyleProfile(mulberry32(idx + 1));
  const ai = new AIPlayer(data, provider, strategies[idx % strategies.length], s.persona ? PERSONAS[s.lang] : null, {
    pool: [provider],
    profile,
    eventSink: (e) => events.push(e),
  });
  const format: GameFormat = { maxPlayers: 8, humanCount: 5, aiCount: 3, questionSec: 30, discussionSec: 120, voteSec: 30, maxRounds: 3, language: s.lang };
  ai.setGameFormat(format);

  const started = Date.now();
  const gateReasons = () => events.filter((e) => e.kind === 'gate_regen' || e.kind === 'gate_drop' || e.kind === 'answer_drop').map((e) => e.reason ?? '?');
  const firstTry = () => events.find((e) => e.kind === 'gate_regen')?.detail;
  const base = { provider: provider.name, situation: s.id, lang: s.lang, kind: s.kind };

  if (s.kind === 'answer') {
    const text = await ai.answerQuestion(s.question, s.ownAnswers ?? []);
    const regen = events.some((e) => e.kind === 'gate_regen');
    let outcome: Outcome;
    if (text) outcome = regen ? 'regen_message' : 'message';
    else if (events.some((e) => e.kind === 'llm_fail')) outcome = 'failed';
    else if (events.some((e) => e.kind === 'answer_drop')) outcome = 'dropped';
    else outcome = 'skip';
    return { ...base, outcome, text, firstTry: firstTry(), gateReasons: gateReasons(), e2eMs: Date.now() - started };
  }

  const answers: QuestionAnswer[] = (s.answers ?? []).map(([n, a]) => ({ playerId: idOf(n), playerName: n, answer: a, timestamp: now - 90000 }));
  const eliminated = s.eliminated ?? [];
  ai.buildGameContext(messages, s.question, 'discussion', s.round, answers, {
    activePlayerIds: [...names.filter((n) => !eliminated.includes(n)).map(idOf), 'ai-bench'],
    eliminatedNames: eliminated,
    aiRemainingCount: 3,
    ownAnswers: s.ownAnswers,
  });
  const speech = {
    ownRecent: messages.filter((m) => m.playerId === 'ai-bench').map((m) => m.content),
    otherAIRecent: messages.filter((m) => OTHER_AIS[s.lang].includes(m.playerName)).map((m) => m.content),
  };
  const o = await ai.decideAction(speech, s.direct);
  const regen = events.some((e) => e.kind === 'gate_regen');
  const outcome: Outcome =
    o.kind === 'message' ? (o.regenerated ? 'regen_message' : 'message') : o.kind === 'silent' ? (regen ? 'regen_silent' : 'silent') : o.kind;
  return { ...base, outcome, text: o.kind === 'message' ? o.message : null, firstTry: firstTry(), gateReasons: gateReasons(), e2eMs: Date.now() - started };
}

// ---------- stats ----------
const pct = (n: number, d: number) => (d ? `${Math.round((100 * n) / d)}%` : 'n/a');
function quantile(xs: number[], q: number): number {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
}

function summarize(p: Metered, results: SituationResult[]) {
  const ok = p.calls.filter((c) => c.ok);
  const json = ok.filter((c) => c.json);
  const spoke = results.filter((r) => ['message', 'regen_message', 'dropped', 'regen_silent'].includes(r.outcome));
  const decisions = results.filter((r) => r.kind === 'quiet' || r.kind === 'mid');
  const direct = results.filter((r) => r.kind === 'direct');
  const answers = results.filter((r) => r.kind === 'answer');
  const lens = results.filter((r) => r.text).map((r) => r.text!.length);
  return {
    provider: p.name,
    situations: results.length,
    calls: p.calls.length,
    callFailures: p.calls.length - ok.length,
    truncated: ok.filter((c) => c.finish === 'length' || c.finish === 'max_tokens').length,
    latencyP50: quantile(ok.map((c) => c.latencyMs), 0.5),
    latencyP90: quantile(ok.map((c) => c.latencyMs), 0.9),
    e2eP50: quantile(results.map((r) => r.e2eMs), 0.5),
    jsonOk: pct(json.filter((c) => c.parse === 'ok').length, json.length),
    jsonErrors: json.filter((c) => c.parse !== 'ok').map((c) => c.parse),
    gateFirstTry: pct(spoke.filter((r) => r.outcome === 'message').length, spoke.length),
    gateAfterRegen: pct(spoke.filter((r) => r.outcome === 'regen_message').length, spoke.length),
    gateLost: pct(spoke.filter((r) => r.outcome === 'dropped' || r.outcome === 'regen_silent').length, spoke.length),
    silentDiscussion: pct(decisions.filter((r) => r.outcome === 'silent').length, decisions.length),
    silentDirect: pct(direct.filter((r) => r.outcome === 'silent').length, direct.length),
    skipAnswer: pct(answers.filter((r) => r.outcome === 'skip').length, answers.length),
    failed: results.filter((r) => r.outcome === 'failed').length,
    lenP50: quantile(lens, 0.5),
    lenP90: quantile(lens, 0.9),
    lenMax: lens.length ? Math.max(...lens) : NaN,
    gateReasons: results.flatMap((r) => r.gateReasons),
    usd: Math.round(p.usd * 10000) / 10000,
    stopped: p.stopped,
    errors: [...new Set(p.calls.filter((c) => !c.ok).map((c) => c.error))].slice(0, 3),
  };
}

// ---------- main ----------
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const strategies = await loadStrategies();
  const skipped: { id: string; reason: string }[] = [];
  const groups = new Map<string, { spec: ProviderSpec; metered: Metered }[]>();
  for (const id of ids) {
    const spec = PROVIDER_CATALOG.find((s) => s.id === id);
    if (!spec) {
      skipped.push({ id, reason: 'unknown id' });
      continue;
    }
    const provider = createProvider(spec, env);
    if (!provider) {
      skipped.push({ id, reason: `${spec.keyEnv} not set` });
      continue;
    }
    const group = GROUP_BY_MODEL ? spec.id : spec.keyEnv;
    const list = groups.get(group) ?? [];
    list.push({ spec, metered: new Metered(provider, spec) });
    groups.set(group, list);
  }
  console.log(`bench: ${[...groups.values()].flat().map((g) => g.spec.id).join(', ')} | skipped: ${skipped.map((s) => `${s.id} (${s.reason})`).join(', ') || 'none'}`);

  const results: SituationResult[] = [];
  const summaries: ReturnType<typeof summarize>[] = [];
  // Providers sharing a key run one after the other (rate limits are per key); different keys run in parallel.
  await Promise.all(
    [...groups.values()].map(async (list) => {
      for (const { spec, metered } of list) {
        const mine: SituationResult[] = [];
        for (let i = 0; i < SITUATIONS.length && !metered.stopped; i++) {
          try {
            const r = await runSituation(SITUATIONS[i], i, metered, strategies);
            // A situation cut by the bench budget says nothing about the provider.
            if (!metered.stopped?.startsWith('global')) mine.push(r);
          } catch (err: any) {
            console.error(`[bench] ${spec.id} ${SITUATIONS[i].id} crashed: ${err?.message ?? err}`);
          }
          await sleep(GAP_MS);
        }
        results.push(...mine);
        const s = summarize(metered, mine);
        summaries.push(s);
        console.log(`[bench] ${spec.id} done: ${mine.length} situations, ${s.calls} calls, $${s.usd}${s.stopped ? `, stopped: ${s.stopped}` : ''}`);
      }
    })
  );

  console.log(`\nthis run: ${budget.calls} calls, ~$${budget.usd.toFixed(3)}`);
  const slim = results.map(({ provider, situation, outcome, text, firstTry, gateReasons, e2eMs }) => ({ provider, situation, outcome, text, firstTry, gateReasons, e2eMs }));
  const run = { date: new Date().toISOString(), calls: budget.calls, estUsd: Math.round(budget.usd * 1000) / 1000, providers: summaries.map((s) => s.provider) };
  let out = { runs: [run], skipped, summaries, results: slim };
  if (APPEND && fs.existsSync(OUT)) {
    // Re-read at write time: another bench process may have appended meanwhile.
    const prev = JSON.parse(fs.readFileSync(OUT, 'utf8'));
    const rerun = new Set(run.providers);
    out = {
      runs: [...(prev.runs ?? []), run],
      skipped: [...(prev.skipped ?? []), ...skipped],
      summaries: [...prev.summaries.filter((s: { provider: string }) => !rerun.has(s.provider)), ...summaries],
      results: [...prev.results.filter((r: { provider: string }) => !rerun.has(r.provider)), ...slim],
    };
  }
  const total = out.runs.reduce((a, r) => ({ calls: a.calls + r.calls, usd: a.usd + r.estUsd }), { calls: 0, usd: 0 });
  console.log(`all runs in ${OUT}: ${total.calls} calls, ~$${total.usd.toFixed(3)}\n`);
  console.log('| provider | calls (fail) | p50 / p90 ms | JSON ok | gate 1st / regen / lost | silent disc. / direct | skip ans. | len p50/p90/max | $ |');
  console.log('|---|---|---|---|---|---|---|---|---|');
  for (const s of out.summaries) {
    console.log(`| ${s.provider} | ${s.calls} (${s.callFailures}) | ${s.latencyP50} / ${s.latencyP90} | ${s.jsonOk} | ${s.gateFirstTry} / ${s.gateAfterRegen} / ${s.gateLost} | ${s.silentDiscussion} / ${s.silentDirect} | ${s.skipAnswer} | ${s.lenP50}/${s.lenP90}/${s.lenMax} | ${s.usd} |`);
  }
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
  console.log(`\nwritten ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
