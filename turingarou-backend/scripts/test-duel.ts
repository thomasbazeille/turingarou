/**
 * Duel 1 contre 1 : la file (deux humains appariés, ou une IA au bout d'une attente tirée ; l'attente est la même
 * dans les deux cas, un départ n'ouvre aucune partie), l'égalité exacte des états envoyés aux deux sortes de duel avant la révélation,
 * l'enregistrement de la réponse (result 'duel', truth et correct exacts), et une table de groupe inchangée.
 *
 *   npx tsx scripts/test-duel.ts
 */
import assert from 'node:assert/strict';
import { DUEL_MATCH_WAIT_MS, DUEL_MIN_WAIT_MS, DuelCandidate, DuelQueue } from '../src/game/duel.js';
import { DISCUSSION_PHASE_MS, QUESTION_PHASE_MS, VOTE_PHASE_MS } from '../src/game/GameRoom.js';
import { NO_CONSENT } from '../src/game/measures.js';
import { finish, ManualClock, targetEmits, test, testRoom, TestRoom } from './testkit.js';

type Open = { candidates: DuelCandidate[]; vsAI: boolean; room?: TestRoom };

/** A queue whose openings seat the candidates in a real duel room, so the room itself is what is asserted. */
function queueWithRooms(clock: ManualClock, random: () => number = () => 0.5) {
  const opens: (Open & { at: number })[] = [];
  const q = new DuelQueue({
    clock,
    log: () => {},
    random,
    open: async (candidates, vsAI) => {
      const at = clock.now();
      const { io } = targetEmits();
      const room = testRoom(`duel-${opens.length}`, io, {
        clock,
        table: { duel: true, chosen: vsAI ? { humans: 1, ais: 1 } : { humans: 2, ais: 0 } },
      });
      for (const c of candidates) await room.join(c.username);
      opens.push({ candidates, vsAI, room, at });
    },
  });
  return { q, opens };
}

const cand = (id: string): DuelCandidate => ({ socketId: id, username: id, language: 'fr', consent: NO_CONSENT });
/** The wait a draw of 0.5 gives: halfway between the two bounds. */
const HALF = DUEL_MIN_WAIT_MS + Math.floor(0.5 * (DUEL_MATCH_WAIT_MS - DUEL_MIN_WAIT_MS + 1));

console.log('queue');

await test('two candidates: one duel human vs human, opened when the first one\'s own wait ends, never sooner', async () => {
  const clock = new ManualClock({ flush: true });
  const { q, opens } = queueWithRooms(clock);
  const t0 = clock.now();
  await q.join(cand('s-a'));
  await clock.advance(500);
  await q.join(cand('s-b'));
  await clock.advance(HALF - 500 - 1);
  assert.equal(opens.length, 0, 'a human match opened before the wait an AI match would have taken');
  await clock.advance(1);
  assert.equal(opens.length, 1, 'the two candidates did not open one game');
  assert.equal(opens[0].at - t0, HALF, 'the first candidate waited otherwise than for an AI duel');
  assert.equal(opens[0].vsAI, false);
  assert.deepEqual(opens[0].candidates.map((c) => c.socketId), ['s-a', 's-b']);
  const s = opens[0].room!.room.getState();
  assert.equal(s.phase, 'question', 'the duel did not start');
  assert.equal(s.maxPlayers, 2);
  assert.equal(s.aiCount, 0, 'a human vs human duel must not hold an AI');
  assert.equal(s.players.filter((p) => p.type === 'ai').length, 0);
  await clock.advance(DUEL_MATCH_WAIT_MS);
  assert.equal(opens.length, 1, 'an AI match fired after the human match');
});

await test('one candidate: an AI duel when their drawn wait ends, at either bound of the draw', async () => {
  for (const [draw, wait] of [[0, DUEL_MIN_WAIT_MS], [0.99999, DUEL_MATCH_WAIT_MS]] as const) {
    const clock = new ManualClock({ flush: true });
    const { q, opens } = queueWithRooms(clock, () => draw);
    await q.join(cand('solo'));
    await clock.advance(wait - 1);
    assert.equal(opens.length, 0, `the AI match fired before ${wait} ms`);
    await clock.advance(1);
    assert.equal(opens.length, 1, `no AI match at ${wait} ms`);
    assert.equal(opens[0].vsAI, true);
    const s = opens[0].room!.room.getState();
    assert.equal(s.phase, 'question');
    assert.equal(s.aiCount, 1);
    assert.equal(s.players.filter((p) => p.type === 'ai').length, 1);
  }
});

await test('a candidate who arrives with less than DUEL_MIN_WAIT_MS left is not paired: a short wait would mean a human', async () => {
  const clock = new ManualClock({ flush: true });
  const { q, opens } = queueWithRooms(clock);
  const t0 = clock.now();
  await q.join(cand('s-a'));
  await clock.advance(HALF - DUEL_MIN_WAIT_MS + 1);
  const tb = clock.now();
  await q.join(cand('s-b'));
  await clock.advance(DUEL_MATCH_WAIT_MS);
  assert.equal(opens.length, 2, 'the late candidate was paired');
  assert.deepEqual(opens.map((o) => [o.candidates.map((c) => c.socketId).join(), o.vsAI]), [['s-a', true], ['s-b', true]]);
  assert.equal(opens[0].at - t0, HALF);
  assert.equal(opens[1].at - tb, HALF, 'the late candidate did not get a full wait of their own');
});

await test('a candidate who leaves opens no game; a partner left alone gets an AI at the same moment', async () => {
  const clock = new ManualClock({ flush: true });
  const { q, opens } = queueWithRooms(clock);
  await q.join(cand('s-a'));
  q.leave('s-a');
  await clock.advance(DUEL_MATCH_WAIT_MS * 2);
  assert.equal(opens.length, 0, 'a game opened for a candidate who left');
  const t0 = clock.now();
  await q.join(cand('s-b'));
  await q.join(cand('s-c'));
  q.leave('s-b');
  await clock.advance(DUEL_MATCH_WAIT_MS);
  assert.equal(opens.length, 1, 'the queue stopped taking candidates after a leave');
  assert.deepEqual(opens[0].candidates.map((c) => c.socketId), ['s-c']);
  assert.equal(opens[0].vsAI, true, 'the partner left alone was not given an AI');
  assert.equal(opens[0].at - t0, HALF, 'the partner left alone waited otherwise than the pair would have');
});

console.log('states');

/**
 * Drives one duel to the guess phase in virtual time (the AI answers SKIP and posts nothing) and returns the
 * states sent before the gameover, plus the gameover payload.
 */
async function runDuel(vsAI: boolean) {
  const clock = new ManualClock({ flush: true });
  const { io, emits } = targetEmits();
  const r = testRoom(`duel-${vsAI ? 'ai' : 'hh'}`, io, {
    clock,
    table: { duel: true, chosen: vsAI ? { humans: 1, ais: 1 } : { humans: 2, ais: 0 } },
  });
  for (let i = 0; i < (vsAI ? 1 : 2); i++) await r.join(`h${i}`);
  assert.equal(r.room.getState().phase, 'question');
  await clock.advance(QUESTION_PHASE_MS);
  assert.equal(r.room.getState().phase, 'discussion');
  await clock.advance(DISCUSSION_PHASE_MS);
  assert.equal(r.room.getState().phase, 'voting');
  const pre = emits.filter((e) => e.payload.phase !== 'gameover').map((e) => e.payload);
  await clock.advance(VOTE_PHASE_MS);
  assert.equal(r.room.getState().phase, 'gameover');
  const over = emits.filter((e) => e.payload.phase === 'gameover').map((e) => e.payload);
  assert.equal(over.length > 0, true, 'no gameover state was sent');
  return { pre, over, r };
}

await test('before the gameover both kinds of duel receive states with exactly the same keys', async () => {
  const [hh, ai] = [await runDuel(false), await runDuel(true)];
  const keysByPhase = (payloads: Record<string, unknown>[]) => {
    const out = new Map<string, Set<string>>();
    for (const p of payloads) {
      const set = out.get(String(p.phase)) ?? new Set<string>();
      Object.keys(p).forEach((k) => set.add(k));
      out.set(String(p.phase), set);
    }
    return out;
  };
  assert.deepEqual(keysByPhase(hh.pre), keysByPhase(ai.pre));
});

await test('before the gameover no duel state says what the opponent is', async () => {
  for (const run of [await runDuel(false), await runDuel(true)]) {
    for (const p of run.pre) {
      assert.equal(p.duel, true);
      assert.equal(p.aiCount, null, 'the AI count would answer the duel');
      for (const p2 of p.players as { id: string }[]) {
        assert.equal('isAI' in p2, false, 'a player carried isAI before the gameover');
        assert.equal('model' in p2, false, 'a player carried a model before the gameover');
      }
      if (p.lobby) {
        assert.equal((p.lobby as Record<string, unknown>).duel, true);
        assert.equal((p.lobby as Record<string, unknown>).table, null, 'the lobby table would tell the seats');
      }
      assert.deepEqual(p.votes, []);
      assert.ok(!('voteCount' in p) || p.voteCount === 0, 'a guess count would tell who answered');
    }
  }
});

await test('at the gameover the duel reveals what each side was', async () => {
  const { over, r } = await runDuel(true);
  const s = r.room.getState();
  const ai = s.players.find((p) => p.type === 'ai')!;
  const payload = over[0];
  const players = payload.players as { id: string; isAI?: boolean; model?: string }[];
  assert.equal(players.find((p) => p.id === ai.id)?.isAI, true);
  assert.ok(players.find((p) => p.id === ai.id)?.model, 'the AI model was not revealed');
  assert.equal(payload.gameOverReason, 'duel');
});

console.log('guess');

await test('the guess is recorded at the close: result duel, exact truth and correct, one row per player', async () => {
  const clock = new ManualClock({ flush: true });
  const { io } = targetEmits();
  const r = testRoom('duel-guess', io, { clock, table: { duel: true, chosen: { humans: 1, ais: 1 } } });
  await r.join('solo');
  assert.equal(r.room.addDuelGuess(r.seat(0).id, 'ai'), false, 'a guess was accepted outside the guess phase');
  await clock.advance(QUESTION_PHASE_MS + DISCUSSION_PHASE_MS);
  const seat = r.seat(0);
  const aiId = r.room.getState().players.find((p) => p.type === 'ai')!.id;
  assert.equal(r.room.addDuelGuess(aiId, 'human'), false, 'the AI was allowed to guess');
  assert.equal(r.room.addDuelGuess(seat.id, 'ai'), true);
  assert.equal(r.room.addDuelGuess(seat.id, 'human'), false, 'a second guess replaced the first');
  assert.deepEqual(r.room.duelGuessOf(seat.id), { guess: 'ai' });
  await clock.advance(VOTE_PHASE_MS);
  assert.equal(r.room.getState().phase, 'gameover');
  assert.equal(r.saved.length, 1);
  const log = r.saved[0];
  assert.equal(log.result, 'duel');
  assert.equal(log.duelGuesses?.length, 2);
  const mine = log.duelGuesses!.find((g) => g.player === 'solo')!;
  const other = log.duelGuesses!.find((g) => g.player !== 'solo')!;
  assert.equal(mine.guess, 'ai');
  assert.equal(mine.truth, 'ai', 'the truth about the human should name the AI opponent');
  assert.equal(mine.correct, true);
  assert.equal(other.guess, null, 'the AI was recorded as having guessed');
  assert.equal(other.truth, 'human', 'the truth about the AI should name the human opponent');
  assert.equal(other.correct, null);
});

await test('a wrong guess is recorded as such', async () => {
  const clock = new ManualClock({ flush: true });
  const { io } = targetEmits();
  const r = testRoom('duel-wrong', io, { clock, table: { duel: true, chosen: { humans: 1, ais: 1 } } });
  await r.join('solo');
  await clock.advance(QUESTION_PHASE_MS + DISCUSSION_PHASE_MS);
  assert.equal(r.room.addDuelGuess(r.seat(0).id, 'human'), true);
  await clock.advance(VOTE_PHASE_MS);
  const mine = r.saved[0].duelGuesses!.find((g) => g.player === 'solo')!;
  assert.equal(mine.guess, 'human');
  assert.equal(mine.truth, 'ai');
  assert.equal(mine.correct, false);
});

await test('an aborted duel writes no duel result for the analyses', async () => {
  const clock = new ManualClock({ flush: true });
  const { io } = targetEmits();
  const r = testRoom('duel-abort', io, { clock, table: { duel: true, chosen: { humans: 1, ais: 1 } } });
  await r.join('solo');
  await clock.advance(QUESTION_PHASE_MS);
  (r.room as unknown as { state: { phase: string } }).state.phase = 'discussion';
  r.room.addMessage(r.seat(0).id, 'une ligne');
  await r.room.shutdown();
  assert.equal(r.saved.length, 1);
  assert.equal(r.saved[0].result, 'aborted');
});

console.log('group tables unchanged');

await test('a group table keeps its state shape: aiCount readable, no duel flag', async () => {
  const clock = new ManualClock({ flush: true });
  const { io, emits } = targetEmits();
  const r = testRoom('group', io, { clock, table: { chosen: { humans: 5, ais: 3 } } });
  for (let i = 0; i < 5; i++) await r.join(`h${i}`);
  const started = emits.filter((e) => e.payload.phase === 'question').map((e) => e.payload);
  assert.ok(started.length > 0, 'the group table did not start');
  for (const p of started) {
    assert.equal('duel' in p, false, 'a group state carried the duel flag');
    assert.equal(p.aiCount, 3);
    assert.equal(((p.lobby ?? {}) as Record<string, unknown>).duel ?? false, false);
  }
});

finish();
