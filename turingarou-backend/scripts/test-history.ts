/**
 * test-history.ts — src/history on the synthetic fixtures: pseudonymization, analysis numbers (derived by
 * hand from scripts/fixtures/history/build-fixtures.ts), the export endpoint's auth, and read-only SQL
 * (asserted on a fake pg client: no database involved).
 */

import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { fixtureGames, fixtureJsonl, FIXTURE_CORPUS } from './fixtures/history/build-fixtures.js';
import { analyzeCorpus, classifyResponse, parseCorpus, type HistoryAnalysis, type Section } from '../src/history/analysis.js';
import { makeNameReplacer, makePseudonymizer, pseudonymizeGame, resolveSalt } from '../src/history/pseudonymize.js';
import { createReadOnlyPool, withReadOnly, type SqlClient, type SqlPool } from '../src/history/readonly.js';
import { readStrategy, streamGames } from '../src/history/reader.js';
import { registerHistoryRoutes, tokenMatches } from '../src/history/routes.js';
import { getLearnedBriefing, LEARNED_DIR, parseBriefingHeader, renderBriefing } from '../src/history/briefing.js';
import { selectHumanPersona, usableMessages } from '../src/history/persona.js';
import { applyProviders, parseTelemetry } from '../src/history/telemetry.js';
import { renderReport } from '../src/history/report.js';
import type { HistoryGame } from '../src/history/types.js';

const failures: string[] = [];
let passed = 0;

async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    passed++;
    console.log(`✅ ${name}`);
  } catch (err) {
    failures.push(name);
    console.log(`❌ ${name}\n   ${err instanceof Error ? err.message : String(err)}`);
  }
}

const near = (actual: number | null, expected: number, label: string) =>
  assert.ok(actual !== null && Math.abs(actual - expected) < 1e-3, `${label}: got ${actual}, expected ${expected}`);
const rateIs = (r: { k: number; n: number }, k: number, n: number, label: string) => assert.deepEqual([r.k, r.n], [k, n], label);
const canon = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

const games = fixtureGames();
const rawNames = [...new Set(games.flatMap((g) => g.players.map((p) => p.name)))];
const FIXED_NOW = () => new Date('2026-11-10T12:00:00.000Z');
const SALT = 'test-salt';

/** Whole-word, accent- and case-insensitive: does any raw player name survive in the text? */
function survivingNames(text: string): string[] {
  const tokens = new Set(canon(text).match(/[\p{L}\p{N}]+/gu) ?? []);
  return rawNames.filter((n) => tokens.has(canon(n)));
}

// ─── Fake pg: rows derived from the fixtures, SQL routed in JS, every statement logged ─────────────

type Row = Record<string, any>;
interface Tables { [table: string]: Row[] }

function gamesToRows(gs: HistoryGame[]): Tables {
  const t: Tables = { games: [], game_players: [], round_questions: [], round_answers: [], round_votes: [], round_eliminations: [], messages: [], message_flags: [] };
  for (const g of gs) {
    t.games.push({ game_id: g.gameId, date: g.date, language: g.language, result: g.result });
    for (const p of g.players)
      t.game_players.push({
        game_id: g.gameId,
        player_name: p.name,
        player_type: p.type,
        strategy: p.strategy ? (p.provider ? `${p.strategy}@${p.provider}` : p.strategy) : null,
        eliminated: p.eliminated ? 1 : 0,
        eliminated_round: p.eliminatedRound,
      });
    for (const r of g.rounds) {
      if (r.question) t.round_questions.push({ game_id: g.gameId, round: r.round, question: r.question });
      // GameRoom logs the inspector's answers as 'human': the reader must correct it from game_players.
      for (const a of r.answers) t.round_answers.push({ game_id: g.gameId, round: r.round, player_name: a.player, player_type: a.type === 'inspector' ? 'human' : a.type, answer: a.answer });
      for (const v of r.votes) t.round_votes.push({ game_id: g.gameId, round: r.round, voter: v.voter, target: v.target });
      if (r.eliminated) t.round_eliminations.push({ game_id: g.gameId, round: r.round, player_name: r.eliminated.name, is_ai: r.eliminated.isAI ? 1 : 0 });
    }
    // pg returns BIGINT as a string
    for (const m of g.messages) t.messages.push({ game_id: g.gameId, round: m.round, player_name: m.player, player_type: m.type, content: m.content, ts: String(m.ts) });
    for (const f of g.flags)
      t.message_flags.push({ game_id: g.gameId, message_id: f.target ? `msg-${f.target.ts}-0.4242` : 'msg-123-0.1', flagged_by: f.flaggedBy, round: f.round, ts: String(f.ts), reason: f.reason });
  }
  return t;
}

class FakeClient implements SqlClient {
  log: string[] = [];
  released = false;
  constructor(private tables: Tables, private failOn?: RegExp, private router?: (sql: string, values: unknown[]) => Row[] | null) {}
  async query<R extends Row = Row>(text: string, values: unknown[] = []): Promise<{ rows: R[] }> {
    const sql = text.replace(/\s+/g, ' ').trim();
    this.log.push(sql);
    if (this.failOn?.test(sql)) throw new Error('simulated failure');
    if (/^(BEGIN|COMMIT|ROLLBACK|SET )/i.test(sql)) return { rows: [] };
    const routed = this.router?.(sql, values);
    if (routed) return { rows: routed as R[] };
    if (/^SELECT game_id, date, language, result FROM games WHERE \(\$1/.test(sql)) {
      const [since, until, afterDate, afterId, limit] = values as [string | null, string | null, string | null, string | null, number];
      const rows = this.tables.games
        .filter((g) => (since === null || g.date >= since) && (until === null || g.date < until))
        .filter((g) => afterDate === null || g.date > afterDate || (g.date === afterDate && g.game_id > afterId!))
        .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.game_id < b.game_id ? -1 : 1))
        .slice(0, limit);
      return { rows: rows as R[] };
    }
    const any = /FROM (\w+) WHERE game_id = ANY\(\$1::text\[\]\)/.exec(sql);
    if (any) return { rows: this.tables[any[1]].filter((r) => (values[0] as string[]).includes(r.game_id)) as R[] };
    throw new Error(`unexpected SQL: ${sql}`);
  }
  release(): void {
    this.released = true;
  }
}

class FakePool implements SqlPool {
  clients: FakeClient[] = [];
  constructor(private tables: Tables, private failOn?: RegExp, private router?: (sql: string, values: unknown[]) => Row[] | null) {}
  async connect(): Promise<FakeClient> {
    const c = new FakeClient(this.tables, this.failOn, this.router);
    this.clients.push(c);
    return c;
  }
}

const WRITE_SQL = /^\s*(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE|GRANT|COPY)\b/i;

function assertReadOnlyTransactions(pool: FakePool) {
  assert.ok(pool.clients.length > 0, 'no connection used');
  for (const c of pool.clients) {
    assert.equal(c.log[0], 'BEGIN READ ONLY', `first statement: ${c.log[0]}`);
    assert.match(c.log[1], /^SET LOCAL statement_timeout/);
    assert.ok(['COMMIT', 'ROLLBACK'].includes(c.log[c.log.length - 1]), `last statement: ${c.log[c.log.length - 1]}`);
    assert.equal(c.log.filter((s) => /^BEGIN/i.test(s)).length, 1, 'one transaction per connection');
    for (const s of c.log) assert.ok(!WRITE_SQL.test(s), `write statement issued: ${s}`);
    assert.ok(c.released, 'connection not released');
  }
}

const stripCases = (a: HistoryAnalysis) => {
  const copy = JSON.parse(JSON.stringify(a)) as HistoryAnalysis;
  const drop = (s: Section | undefined) => s && (s.eliminations.cases = []);
  drop(copy.overall);
  drop(copy.byLanguage.fr);
  drop(copy.byLanguage.en);
  return copy;
};

async function main() {
  const analysis = analyzeCorpus(games, { now: FIXED_NOW });
  const s = analysis.overall;

  // ─── Fixtures ────────────────────────────────────────────────────────────────

  await test('fixture corpus.jsonl matches its builder, ≥ 6 synthetic games in FR and EN', () => {
    assert.equal(fs.readFileSync(FIXTURE_CORPUS, 'utf8'), fixtureJsonl(), 'run: npx tsx scripts/fixtures/history/build-fixtures.ts');
    const parsed = parseCorpus(fs.readFileSync(FIXTURE_CORPUS, 'utf8'));
    assert.ok(parsed.length >= 6);
    assert.ok(parsed.every((g) => g.synthetic === true));
    assert.deepEqual(analysis.corpus.languages, { fr: 3, en: 3 });
  });

  // ─── Pseudonymization ───────────────────────────────────────────────────────

  const pz = makePseudonymizer(SALT);
  const pseudo = games.map((g) => pseudonymizeGame(g, pz));

  await test('pseudonymization: no raw username survives anywhere in the exported lines', () => {
    const out = pseudo.map((g) => JSON.stringify(g)).join('\n');
    assert.deepEqual(survivingNames(out), []);
    assert.ok(survivingNames(fixtureJsonl()).length === rawNames.length, 'the check itself finds every name in the raw corpus');
  });

  await test('pseudonymization: room codes hashed, pseudonyms stable across games and case, salt-dependent', () => {
    const out = pseudo.map((g) => JSON.stringify(g)).join('\n');
    for (const g of games) assert.ok(!out.includes(g.gameId), `room code ${g.gameId} leaked`);
    assert.ok(pseudo.every((g) => /^g_[0-9a-f]{12}$/.test(g.gameId)));
    assert.equal(pz.name('Lucas'), pz.name('lucas'));
    assert.match(pz.name('Lucas'), /^p_[0-9a-f]{10}$/);
    assert.notEqual(makePseudonymizer('other-salt').name('Lucas'), pz.name('Lucas'));
    assert.deepEqual(games, fixtureGames(), 'input mutated');
  });

  await test('pseudonymization: mentions replaced without accents or case, whole words only', () => {
    const rep = makeNameReplacer(new Map([['Hélène', 'p_x'], ['Lucas', 'p_y']]));
    assert.equal(rep('helene t ou'), 'p_x t ou');
    assert.equal(rep('HÉLÈNE et @Lucas ?'), 'p_x et @p_y ?');
    assert.equal(rep('lucastor est nul'), 'lucastor est nul');
  });

  await test('salt: HISTORY_PSEUDONYM_SALT, else derived from ADMIN_SECRET (never the secret itself), else none', () => {
    assert.equal(resolveSalt({ HISTORY_PSEUDONYM_SALT: 's1', ADMIN_SECRET: 'a' }), 's1');
    const derived = resolveSalt({ ADMIN_SECRET: 'a' });
    assert.ok(derived && derived !== 'a' && derived.length === 64);
    assert.equal(resolveSalt({}), null);
  });

  // ─── Analysis numbers (hand-derived from the fixture scripts) ───────────────

  await test('analysis: results and per-strategy outcomes', () => {
    rateIs(s.outcomes.humansWin, 3, 6, 'humans win');
    rateIs(s.outcomes.aiWin, 1, 6, 'ai win');
    rateIs(s.outcomes.draw, 2, 6, 'draw');
    near(s.outcomes.meanRounds, 17 / 6, 'mean rounds');
    const by = Object.fromEntries(s.byStrategy.map((g) => [g.key, g]));
    rateIs(by.v1_condensed.survived, 1, 6, 'v1 survived');
    rateIs(by.v1_condensed.teamWins, 1, 6, 'v1 team wins');
    near(by.v1_condensed.meanEliminationRound, 1.6, 'v1 elim round');
    rateIs(by.v2_condensed.survived, 3, 6, 'v2 survived');
    near(by.v2_condensed.meanEliminationRound, 7 / 3, 'v2 elim round');
    rateIs(by.v3_condensed.survived, 3, 6, 'v3 survived');
    near(by.v3_condensed.meanEliminationRound, 2, 'v3 elim round');
  });

  await test('analysis: per-provider outcomes', () => {
    const by = Object.fromEntries(s.byProvider.map((g) => [g.key, g]));
    rateIs(by.Deepseek.survived, 4, 6, 'Deepseek survived');
    rateIs(by.Deepseek.teamWins, 2, 6, 'Deepseek team wins');
    near(by.Deepseek.meanEliminationRound, 1, 'Deepseek elim round');
    rateIs(by.Mistral.survived, 1, 6, 'Mistral survived');
    near(by.Mistral.meanEliminationRound, 1.8, 'Mistral elim round');
    rateIs(by.Anthropic.survived, 2, 6, 'Anthropic survived');
    rateIs(by.Anthropic.teamWins, 0, 6, 'Anthropic team wins');
    near(by.Anthropic.meanEliminationRound, 2.5, 'Anthropic elim round');
  });

  await test('analysis: eliminations by round, accuracy, vote accuracy', () => {
    assert.deepEqual(s.eliminations.byRound, [
      { round: 1, ai: 4, human: 1, inspector: 1, none: 0 },
      { round: 2, ai: 4, human: 0, inspector: 0, none: 2 },
      { round: 3, ai: 3, human: 2, inspector: 0, none: 0 },
    ]);
    rateIs(s.eliminations.accuracy, 11, 15, 'eliminations hitting an AI');
    rateIs(s.eliminations.humanVotesOnAI, 66, 77, 'human votes on AIs');
    rateIs(s.eliminations.aiVotesOnHumans, 40, 40, 'AI votes on non-AIs');
    assert.equal(s.eliminations.cases.length, 11);
    const lucas = s.eliminations.cases.find((c) => c.player === 'Lucas')!;
    assert.deepEqual([lucas.round, lucas.votesReceived, lucas.totalVotes, lucas.accusationsReceived], [1, 4, 8, 1]);
    assert.ok(lucas.preceding.some((m) => m.content.startsWith("lucas t'es une ia")));
  });

  await test('analysis: stylometry and latency', () => {
    assert.deepEqual([s.style.messages.human.messages, s.style.messages.ai.messages, s.style.messages.inspector.messages], [54, 31, 4]);
    rateIs(s.style.messages.human.emoji, 2, 54, 'human emoji');
    rateIs(s.style.messages.ai.emoji, 0, 31, 'AI emoji');
    rateIs(s.style.messages.human.startsLower, 54, 54, 'human lowercase start');
    assert.equal(s.style.latencyMs.ai.n, 31);
    assert.equal(s.style.latencyMs.human.n, 37);
    near(s.style.latencyMs.ai.p50, 5000, 'AI latency median');
    rateIs(s.style.answers.ai.endsWithPunctuation, 28, 40, 'AI answers punctuated');
  });

  await test('analysis: lexical tells per language', () => {
    assert.equal(analysis.byLanguage.fr!.lexical.aiOverused[0].word, 'honnêtement');
    assert.equal(analysis.byLanguage.en!.lexical.aiOverused[0].word, 'honestly');
    assert.deepEqual([analysis.byLanguage.en!.lexical.aiOverused[0].aiMessages, analysis.byLanguage.en!.lexical.aiOverused[0].humanMessages], [8, 0]);
    const jsp = analysis.byLanguage.fr!.lexical.humanMarkers.find((x) => x.word === 'jsp');
    assert.ok(jsp && jsp.humanMessages === 4 && jsp.games === 3, 'jsp: 4 human messages over 3 games');
    assert.ok(analysis.byLanguage.en!.lexical.humanMarkers.some((x) => x.word === 'lol'));
    assert.ok(!s.lexical.aiOverused.some((x) => ['je', 'la', "i'm", 'the'].includes(x.word)), 'function words filtered');
  });

  await test('analysis: questions that expose AIs', () => {
    assert.equal(s.questions[0].question, 'What superpower would you pick?');
    rateIs(s.questions[0].humanVotesOnAI, 14, 14, 'superpower EN votes');
    const food = s.questions.find((q) => q.question === 'Quel est ton plat préféré ?')!;
    rateIs(food.aiEliminated, 2, 3, 'food FR AI eliminated');
    rateIs(food.humanVotesOnAI, 11, 14, 'food FR votes');
  });

  await test('analysis: replies to an accusation vs survival', () => {
    const cm = (target: string, response: string) => s.counterMoves.find((c) => c.target === target && c.response === response)!;
    rateIs(cm('ai', 'counter_accusation').survived, 5, 7, 'AI counter-accusation');
    rateIs(cm('ai', 'denial').survived, 0, 4, 'AI denial');
    near(cm('ai', 'denial').meanVoteShare, 0.5179, 'AI denial vote share');
    near(cm('ai', 'denial').replyLatencyMs.p50, 5000, 'AI denial reply latency');
    rateIs(cm('ai', 'humour').survived, 2, 3, 'AI humour');
    rateIs(cm('ai', 'silence').survived, 0, 1, 'AI silence');
    rateIs(cm('ai', 'other').survived, 1, 2, 'AI other');
    rateIs(cm('human', 'silence').survived, 3, 3, 'human silence');
    rateIs(cm('human', 'denial').survived, 1, 2, 'human denial');
    assert.equal(classifyResponse("moi sus ? c'est romain qui parle comme un robot", 'Jade', ['Jade', 'Romain']), 'counter_accusation');
    assert.equal(classifyResponse('lol no im human', 'Ben', ['Ben']), 'denial');
  });

  await test('analysis: inspector impact and flags', () => {
    const i = s.inspector;
    assert.deepEqual([i.gamesWith, i.gamesWithout], [2, 4]);
    rateIs(i.humanWinWith, 1, 2, 'human win with inspector');
    rateIs(i.humanWinWithout, 2, 4, 'human win without');
    rateIs(i.eliminationAccuracyWith, 3, 5, 'accuracy with');
    rateIs(i.eliminationAccuracyWithout, 8, 10, 'accuracy without');
    rateIs(i.inspectorVotesOnAI, 4, 4, 'inspector votes');
    rateIs(i.humanVotesOnAIWith, 19, 24, 'human votes with');
    rateIs(i.humanVotesOnAIWithout, 47, 53, 'human votes without');
    rateIs(i.inspectorEliminated, 1, 2, 'inspector eliminated');
    assert.deepEqual([s.flags.total, s.flags.resolved], [4, 3]);
    rateIs(s.flags.onAI, 3, 3, 'flags on AIs');
  });

  await test('analysis: identical on the pseudonymized corpus (names never feed a number)', () => {
    assert.deepEqual(stripCases(analyzeCorpus(pseudo, { now: FIXED_NOW })), stripCases(analysis));
  });

  await test('analysis: merged games excluded, unknown provider reported as not measured', () => {
    const merged: HistoryGame = { ...games[0], gameId: 'merged', quality: { suspectMerged: true } };
    assert.equal(analyzeCorpus([...games, merged]).corpus.excluded, 1);
    const noProvider = games.map((g) => ({ ...g, players: g.players.map((p) => ({ ...p, provider: null })) }));
    const a = analyzeCorpus(noProvider);
    assert.ok(a.notMeasured.some((x) => x.startsWith('provider')));
    assert.deepEqual(a.overall.byProvider.map((g) => g.key), ['unknown']);
    assert.match(renderReport(analysis), /SYNTHÉTIQUES/);
  });

  // ─── Briefing ───────────────────────────────────────────────────────────────

  await test('briefing: rendered per language, null when synthetic, under-sampled or missing', () => {
    const fr = renderBriefing(analysis, 'fr');
    assert.deepEqual(parseBriefingHeader(fr), { lang: 'fr', games: 3, synthetic: true, generated: '2026-11-10' });
    assert.match(fr, /« honnêtement »/);
    assert.match(renderBriefing(analysis, 'en'), /"honestly"/);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'turingarou-briefing-'));
    try {
      fs.writeFileSync(path.join(dir, 'briefing.fr.md'), fr.replace('games=3', 'games=500'));
      assert.equal(getLearnedBriefing('fr', { dir }), null, 'synthetic briefing must not reach a prompt, whatever its size');
      const real = fr.replace('games=3 synthetic=true', 'games=25 synthetic=false');
      fs.writeFileSync(path.join(dir, 'briefing.en.md'), real.replace('lang=fr', 'lang=en'));
      const body = getLearnedBriefing('en', { dir });
      assert.ok(body && !body.includes('<!--') && body.startsWith('# '), 'header stripped');
      assert.equal(getLearnedBriefing('en', { dir, minGames: 30 }), null, 'under-sampled');
      assert.equal(getLearnedBriefing('fr', { dir: path.join(dir, 'missing') }), null);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    for (const lang of ['fr', 'en'] as const) {
      const file = path.join(LEARNED_DIR, `briefing.${lang}.md`);
      if (fs.existsSync(file) && parseBriefingHeader(fs.readFileSync(file, 'utf8'))?.synthetic) assert.equal(getLearnedBriefing(lang), null);
    }
  });

  // ─── Read-only data access ──────────────────────────────────────────────────

  const tables = gamesToRows(games);

  await test('reader: DB rows round-trip to the fixture games (inspector answers relabelled, flags matched, BIGINT ts)', async () => {
    const pool = new FakePool(tables);
    const read: HistoryGame[] = [];
    await streamGames(pool, {}, (g) => {
      read.push(g);
    });
    const expected = [...games].sort((a, b) => a.date.localeCompare(b.date)).map(({ synthetic, ...g }) => g);
    assert.deepEqual(read, expected);
    assert.deepEqual(readStrategy('v1_condensed'), { strategy: 'v1_condensed', provider: null });
  });

  await test('read-only: every statement runs inside BEGIN READ ONLY, one short transaction per page, nothing written', async () => {
    const pool = new FakePool(tables);
    const n = await streamGames(pool, { since: '2026-10-02T00:00:00.000Z' }, () => {}, 2);
    assert.equal(n, 5);
    assert.equal(pool.clients.length, 3, 'pages of 2: 2 + 2 + 1');
    assertReadOnlyTransactions(pool);
    assert.equal(pool.clients[0].log[2].startsWith('SELECT game_id, date, language, result FROM games'), true);
  });

  await test('read-only: a failing query rolls back, releases the connection and propagates', async () => {
    const pool = new FakePool(tables, /FROM messages/);
    await assert.rejects(streamGames(pool, {}, () => {}), /simulated failure/);
    assert.equal(pool.clients[0].log[pool.clients[0].log.length - 1], 'ROLLBACK');
    assertReadOnlyTransactions(pool);
  });

  await test('read-only: pools created by the history module set default_transaction_read_only', async () => {
    const pool = createReadOnlyPool('postgres://user@127.0.0.1:1/none');
    assert.equal((pool as any).options.options, '-c default_transaction_read_only=on');
    await pool.end();
  });

  // ─── Persona (banque de discussion) ─────────────────────────────────────────

  await test('persona: same language, enough messages, no message naming a player of its game, read-only', async () => {
    const seen: { sql: string; values: unknown[] }[] = [];
    const router = (sql: string, values: unknown[]): Row[] | null => {
      seen.push({ sql, values });
      if (sql.includes('GROUP BY m.player_name')) return values[1] === 0 ? [] : [{ username: 'Margaux' }];
      if (sql.includes('FROM messages m JOIN games g') && sql.includes('ORDER BY m.ts DESC'))
        return [
          { content: 'mdr lucas grillé', game_id: 'g1' },
          { content: 'loutre obligé', game_id: 'g1' },
          { content: 'Loutre obligé', game_id: 'g2' },
          { content: 'jsp quoi dire', game_id: 'g2' },
          { content: 'trop bien ce jeu', game_id: 'g2' },
        ];
      if (sql.includes('FROM round_answers a')) return [{ question: 'Si tu étais un animal ?', answer: ' loutre ', game_id: 'g1' }];
      if (sql.startsWith('SELECT game_id, player_name FROM game_players')) return [{ game_id: 'g1', player_name: 'Lucas' }, { game_id: 'g1', player_name: 'Margaux' }];
      return null;
    };
    const pool = new FakePool({}, undefined, router);
    const persona = await withReadOnly(pool, (c) => selectHumanPersona(c, { language: 'fr', minMessages: 3, exclude: ['Hélène'], rng: () => 0.5, now: Date.parse('2026-11-10') }));
    assert.ok(persona);
    assert.equal(persona.username, 'Margaux');
    assert.deepEqual([...persona.sampleMessages].sort(), ['jsp quoi dire', 'loutre obligé', 'trop bien ce jeu']);
    assert.deepEqual(persona.sampleAnswers, [{ question: 'Si tu étais un animal ?', answer: 'loutre' }]);
    const cand = seen.find((x) => x.sql.includes('GROUP BY'))!;
    assert.deepEqual([cand.values[0], cand.values[2], cand.values[3]], ['fr', ['hélène'], 3]);
    assert.ok((cand.values[1] as number) > 0, 'first step restricted to recent messages');
    assertReadOnlyTransactions(pool);
  });

  await test('persona: no candidate in the language → null, never another language', async () => {
    const pool = new FakePool({}, undefined, (sql, values) => (sql.includes('GROUP BY') ? (assert.equal(values[0], 'en'), []) : null));
    assert.equal(await withReadOnly(pool, (c) => selectHumanPersona(c, { language: 'en' })), null);
    assert.equal(pool.clients[0].log.filter((q) => q.includes('GROUP BY')).length, 3, 'three relaxation steps');
    assert.deepEqual(usableMessages([{ content: '@Lucas ?', game_id: 'g' }, { content: 'ok', game_id: 'g' }, { content: 'OK', game_id: 'g' }], new Map([['g', ['Lucas']]])), ['ok']);
  });

  // ─── Telemetry ──────────────────────────────────────────────────────────────

  await test('telemetry: providers joined back from [game-telemetry] lines', () => {
    const log = [
      `2026-10-01T20:00:01Z [game-telemetry] ${JSON.stringify({ room: games[0].gameId, result: 'humans_win', providers: { Lucas: 'Deepseek' } })}`,
      '2026-10-01T20:00:02Z [game-telemetry] {"room":"trunc',
    ].join('\n');
    const byRoom = parseTelemetry(log);
    assert.equal(byRoom.size, 1);
    const g = { ...games[0], players: games[0].players.map((p) => ({ ...p, provider: null })) };
    assert.equal(applyProviders(g, byRoom).players.find((p) => p.name === 'Lucas')!.provider, 'Deepseek');
    assert.equal(applyProviders(games[1], byRoom), games[1]);
  });

  // ─── Endpoint ───────────────────────────────────────────────────────────────

  const SECRET = 'test-admin-secret-0123456789';

  async function withServer(opts: Parameters<typeof registerHistoryRoutes>[1], fn: (base: string) => Promise<void>) {
    const app = express();
    registerHistoryRoutes(app, opts);
    const server = app.listen(0, '127.0.0.1');
    await new Promise<void>((r) => server.once('listening', () => r()));
    try {
      await fn(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  }

  await test('endpoint: 401 without or with a wrong token, 503 when ADMIN_SECRET is unset', async () => {
    const pool = new FakePool(tables);
    await withServer({ secret: SECRET, salt: SALT, pool }, async (base) => {
      assert.equal((await fetch(`${base}/admin/history/export`)).status, 401);
      assert.equal((await fetch(`${base}/admin/history/export`, { headers: { Authorization: `Bearer ${SECRET}x` } })).status, 401);
      assert.equal((await fetch(`${base}/admin/history/export`, { headers: { Authorization: SECRET } })).status, 401);
      assert.equal((await fetch(`${base}/admin/history/export?since=nope`, { headers: { Authorization: `Bearer ${SECRET}` } })).status, 400);
    });
    assert.equal(pool.clients.length, 0, 'no database access before authentication');
    await withServer({ secret: null, salt: SALT, pool }, async (base) => {
      assert.equal((await fetch(`${base}/admin/history/export`, { headers: { Authorization: 'Bearer anything' } })).status, 503);
    });
  });

  await test('endpoint: authorized export streams pseudonymized JSONL, read-only, and analyses like the source', async () => {
    const pool = new FakePool(tables);
    await withServer({ secret: SECRET, salt: SALT, pool }, async (base) => {
      const res = await fetch(`${base}/admin/history/export?since=2026-10-01`, { headers: { Authorization: `Bearer ${SECRET}` } });
      assert.equal(res.status, 200);
      assert.match(res.headers.get('content-type') ?? '', /application\/x-ndjson/);
      const body = await res.text();
      assert.deepEqual(survivingNames(body), []);
      const exported = parseCorpus(body);
      assert.equal(exported.length, 6);
      assert.ok(exported.every((g) => /^g_/.test(g.gameId)));
      const expected = [...games].sort((a, b) => a.date.localeCompare(b.date)).map(({ synthetic, ...g }) => pseudonymizeGame(g as HistoryGame, pz));
      assert.deepEqual(exported, expected);
      const fromExport = stripCases(analyzeCorpus(exported, { now: FIXED_NOW }));
      const fromSource = stripCases(analysis);
      fromSource.corpus.synthetic = 0;
      assert.deepEqual(fromExport, fromSource);
    });
    assert.equal(pool.clients[0].log[2].includes('games'), true);
    assertReadOnlyTransactions(pool);
  });

  await test('endpoint: rate-limited (429 once the window is spent, failed attempts included)', async () => {
    await withServer({ secret: SECRET, salt: SALT, pool: new FakePool(tables), rateLimit: { max: 2, windowMs: 60_000 } }, async (base) => {
      assert.equal((await fetch(`${base}/admin/history/export`)).status, 401);
      assert.equal((await fetch(`${base}/admin/history/export`)).status, 401);
      const third = await fetch(`${base}/admin/history/export`, { headers: { Authorization: `Bearer ${SECRET}` } });
      assert.equal(third.status, 429);
      assert.ok(Number(third.headers.get('retry-after')) > 0);
    });
  });

  await test('endpoint: constant-time token comparison (SHA-256 digests + timingSafeEqual, no === on the secret)', () => {
    assert.equal(tokenMatches(SECRET, SECRET), true);
    assert.equal(tokenMatches(SECRET.slice(0, -1), SECRET), false);
    assert.equal(tokenMatches(`${SECRET}0`, SECRET), false);
    assert.equal(tokenMatches('', SECRET), false);
    assert.equal(tokenMatches(undefined, SECRET), false);
    assert.equal(tokenMatches(SECRET, ''), false);
    const src = fs.readFileSync(new URL('../src/history/routes.ts', import.meta.url), 'utf8');
    assert.ok(/timingSafeEqual\(a, b\)/.test(src), 'routes.ts no longer compares with timingSafeEqual');
    const comparisons = [...src.matchAll(/\bsecret\s*(?:===|!==)\s*([\w.]+)|([\w.()]+)\s*(?:===|!==)\s*secret\b/g)].map((m) => m[1] ?? m[2]);
    const direct = comparisons.filter((operand) => !['undefined', 'null'].includes(operand));
    assert.deepEqual(direct, [], `direct comparison with the secret: ${direct.join(', ')}`);
  });

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    console.log(failures.map((f) => `  - ${f}`).join('\n'));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
