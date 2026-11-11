/**
 * test-measures.ts — what the room collects from humans to study the games (src/game/measures.ts) and the consent
 * filter on the AIs' style references (GameLogger.writeHumanProfiles, asserted on a fake pg client: no database).
 */

import { strict as assert } from 'node:assert';
import { CLUE_MAX_CHARS, NO_CONSENT, parseConsent, parseFeedback, parseVoteReason, VOTE_REASONS } from '../src/game/measures.js';
import { styleReferencePlayers, updateHumanProfiles, writeHumanProfiles, type GameLogData, type Queryable } from '../src/game/GameLogger.js';

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

class RecordingClient implements Queryable {
  calls: { text: string; values: unknown[] }[] = [];
  async query(text: string, values: unknown[] = []): Promise<unknown> {
    this.calls.push({ text, values });
    return { rows: [] };
  }
  /** Every value written, as strings, for "does this name appear anywhere" checks. */
  written(): string[] {
    return this.calls.flatMap((c) => c.values.map(String));
  }
}

/** One game: ana ticked the box, bruno refused, chloe's client sent nothing, plus an AI and an inspector. */
function game(): GameLogData {
  const players: GameLogData['players'] = [
    { id: 'p-1', name: 'ana', type: 'human', eliminated: false, consent: { styleExamples: true, notice: '2026-11-11' } },
    { id: 'p-2', name: 'bruno', type: 'human', eliminated: false, consent: { styleExamples: false, notice: '2026-11-11' } },
    { id: 'p-3', name: 'chloe', type: 'human', eliminated: true, eliminatedRound: 1 },
    { id: 'p-4', name: 'robo', type: 'ai', strategy: 'v3@Deepseek', eliminated: false },
    { id: 'p-5', name: 'insp', type: 'inspector', strategy: 'inspector@Mistral', eliminated: false },
  ];
  const lines = players.map((p, i) => ({ round: 1, player: p.name, type: p.type, content: `ligne de ${p.name}`, timestamp: 1000 + i }));
  return {
    gameId: 'g1',
    date: '2026-11-11T10:00:00.000Z',
    language: 'fr',
    result: 'humans_win',
    players,
    rounds: [{ round: 1, question: 'Q ?', answers: players.map((p) => ({ player: p.name, type: p.type, answer: `réponse de ${p.name}` })), votes: [], eliminated: null }],
    messages: lines,
  };
}

async function main(): Promise<void> {
  // Never a real database from a unit test, whatever the shell exported.
  delete process.env.DATABASE_URL;

  await test('parseConsent: only an explicit true agrees; the notice version is kept when well-formed', () => {
    assert.deepEqual(parseConsent({ styleConsent: true, notice: '2026-11-11' }), { styleExamples: true, notice: '2026-11-11' });
    for (const v of [false, 'true', 1, 'yes', {}, null, undefined]) assert.equal(parseConsent({ styleConsent: v }).styleExamples, false, `styleConsent=${JSON.stringify(v)}`);
    for (const p of [null, undefined, 'x', 42]) assert.deepEqual(parseConsent(p), NO_CONSENT);
    assert.equal(parseConsent({ styleConsent: true, notice: 'x'.repeat(33) }).notice, null);
    assert.equal(parseConsent({ styleConsent: true, notice: '<script>' }).notice, null);
    assert.equal(parseConsent({ styleConsent: true, notice: 7 }).notice, null);
  });

  await test('parseVoteReason: the five chips pass, anything off the list is refused', () => {
    for (const r of VOTE_REASONS) assert.equal(parseVoteReason(r), r);
    for (const v of ['TOO_FAST', 'too fast', 'boring', '', ' gut', 'constructor', 'toString', 3, null, undefined, ['gut'], { reason: 'gut' }]) {
      assert.equal(parseVoteReason(v), null, `reason ${JSON.stringify(v)}`);
    }
  });

  await test('parseFeedback: note an integer from 1 to 5, clue optional and trimmed', () => {
    for (const r of [1, 2, 3, 4, 5]) assert.deepEqual(parseFeedback({ rating: r }), { rating: r, clue: null });
    assert.deepEqual(parseFeedback({ rating: 4, clue: '  il répondait trop vite  ' }), { rating: 4, clue: 'il répondait trop vite' });
    assert.deepEqual(parseFeedback({ rating: 2, clue: '   ' }), { rating: 2, clue: null });
    assert.deepEqual(parseFeedback({ rating: 2, clue: null }), { rating: 2, clue: null });
    for (const r of [0, 6, -1, 2.5, NaN, Infinity, '3', null, undefined, true]) assert.equal(parseFeedback({ rating: r }), null, `rating ${String(r)}`);
    for (const p of [null, undefined, 'x', 5]) assert.equal(parseFeedback(p), null);
  });

  await test('parseFeedback: a clue longer than the field allows is refused, not cut', () => {
    assert.deepEqual(parseFeedback({ rating: 3, clue: 'a'.repeat(CLUE_MAX_CHARS) }), { rating: 3, clue: 'a'.repeat(CLUE_MAX_CHARS) });
    assert.equal(parseFeedback({ rating: 3, clue: 'a'.repeat(CLUE_MAX_CHARS + 1) }), null);
    assert.deepEqual(parseFeedback({ rating: 3, clue: ` ${'a'.repeat(CLUE_MAX_CHARS)} ` }), { rating: 3, clue: 'a'.repeat(CLUE_MAX_CHARS) }, 'spaces around do not count');
    assert.equal(parseFeedback({ rating: 3, clue: 42 }), null, 'a clue that is not text');
  });

  await test('consent filter: only the human who ticked the box becomes a style reference', () => {
    assert.deepEqual(styleReferencePlayers(game()).map((p) => p.name), ['ana']);
  });

  await test('without consent, no style write at all: no profile, message or answer of bruno, chloe, the AI or the inspector', async () => {
    const db = new RecordingClient();
    await writeHumanProfiles(db, game());
    const written = db.written();
    for (const name of ['bruno', 'chloe', 'robo', 'insp']) {
      assert.ok(!written.some((v) => v.includes(name)), `${name} written: ${written.filter((v) => v.includes(name)).join(' | ')}`);
    }
    const tables = db.calls.map((c) => /INSERT INTO (\w+)/.exec(c.text)?.[1]);
    assert.deepEqual(tables, ['human_profiles', 'human_messages', 'human_answers']);
    assert.ok(db.calls.every((c) => c.values[0] === 'ana'));
  });

  await test('a game where nobody ticked the box writes nothing', async () => {
    const g = game();
    g.players = g.players.map((p) => (p.consent ? { ...p, consent: { ...p.consent, styleExamples: false } } : p));
    const db = new RecordingClient();
    await writeHumanProfiles(db, g);
    assert.equal(db.calls.length, 0);
  });

  await test('without DATABASE_URL the profile update stays silent and does not throw', async () => {
    await updateHumanProfiles(game());
  });

  console.log(`\n${passed} passed, ${failures.length} failed, ${passed + failures.length} total`);
  if (failures.length > 0) {
    console.error(`Failed cases: ${failures.join(' | ')}`);
    process.exit(1);
  }
}

main();
