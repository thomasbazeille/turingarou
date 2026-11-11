/**
 * Consent against a real Postgres: a player who refused never serves as an AI's style example, and a refusal is never
 * overwritten. Needs a throwaway local database (initDB creates the schema in it); refuses any other host.
 *
 *   TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55432/t npx tsx scripts/test-pg-consent.ts
 */
import assert from 'node:assert/strict';
import pg from 'pg';
import type { GameLogData } from '../src/game/GameLogger.js';

const url = process.env.TEST_DATABASE_URL ?? '';
const host = (() => { try { return new URL(url).hostname; } catch { return ''; } })();
if (!['127.0.0.1', 'localhost', '::1'].includes(host)) {
  console.log('NOT MEASURED: TEST_DATABASE_URL must name a local throwaway database');
  process.exit(2);
}
process.env.DATABASE_URL = url;
const { initDB, saveGameLog, getRandomHumanProfile } = await import('../src/game/GameLogger.js');

const msgs = (who: string, n: number, base: number) => Array.from({ length: n }, (_, i) => ({ round: 1, player: who, type: 'human', content: `${who === 'alice' ? 'ouais trop bien' : 'bof je sais pas'} ${i}`, timestamp: base + i }));
const game = (id: string, bobConsents: boolean): GameLogData => ({
  gameId: id, date: '2026-11-11T20:00:00.000Z', language: 'fr', result: 'draw',
  players: [
    { id: 'p1', name: 'alice', type: 'human', eliminated: false, consent: { styleExamples: true, notice: 'v' } },
    { id: 'p2', name: 'bob', type: 'human', eliminated: false, consent: { styleExamples: bobConsents, notice: 'v' } },
    { id: 'p3', name: 'zed', type: 'ai', strategy: 's@x', eliminated: false },
  ],
  rounds: [], messages: [...msgs('alice', 6, Date.now()), ...msgs('bob', 6, Date.now() + 100)],
});

await initDB();
await initDB();
await saveGameLog(game('ROOM-1', false));
await saveGameLog(game('ROOM-1', false));
const seen = new Set<string>();
for (let i = 0; i < 40; i++) { const p = await getRandomHumanProfile({ language: 'fr', minMessages: 3 }); if (p) seen.add(p.username); }
console.log('picked after refusal:', [...seen].sort().join(','));
assert.ok(!seen.has('bob'), 'a refused player served as a style example');
assert.ok(seen.has('alice'));

const client = new pg.Client({ connectionString: url });
await client.connect();
await saveGameLog(game('ROOM-2', true));
await saveGameLog(game('ROOM-2', false));
await saveGameLog(game('ROOM-2', true));
const { rows } = await client.query(`SELECT style_examples FROM player_consents WHERE game_id = 'ROOM-2' AND player_name = 'bob'`);
console.log('ROOM-2 bob consent after yes, no, yes:', rows.map((r) => r.style_examples));
assert.deepEqual(rows.map((r) => r.style_examples), [0], 'a refusal was overwritten');
const { rows: legacy } = await client.query(`SELECT count(*)::int AS n FROM messages WHERE game_id = 'ROOM-1'`);
console.log('ROOM-1 messages after two saves:', legacy[0].n);
await client.end();
console.log('PROBE PASS');
process.exit(0);
