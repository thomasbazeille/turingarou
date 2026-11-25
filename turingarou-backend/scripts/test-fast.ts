/**
 * Partie rapide (a fast chosen table): the question capped at 15 s with the 8 s early-end floor kept, a 60 s
 * discussion, the next round 7 s after the vote closed, the rematch staying fast, the bot format and the lobby
 * field carrying it, and every other room (chosen without fast, public) keeping 20 s / 100 s / 10 s.
 *
 *   npx tsx scripts/test-fast.ts
 */
import assert from 'node:assert/strict';
import {
  DISCUSSION_PHASE_MS,
  ENDROUND_MS,
  FAST_DISCUSSION_PHASE_MS,
  FAST_ENDROUND_MS,
  FAST_QUESTION_PHASE_MS,
  QUESTION_MIN_MS,
  QUESTION_PHASE_MS,
  type TableOptions,
  parseTableChoice,
} from '../src/game/GameRoom.js';
import { answerTarget } from '../src/game/humanTiming.js';
import type { ChatProvider } from '../src/llm/chatClient.js';
import { rematchTable } from '../src/game/rematch.js';
import { finish, frozenClock, makeSeededRng, ManualClock, NAMES_18, payloadEmits, targetEmits, test, testRoom, testRoomWithHumans } from './testkit.js';

// Seed 11: this file's own flavour (the other builders differ, test-round keeps the same one).
async function started(roomId: string, table: TableOptions) {
  const clock = new ManualClock();
  const { io, emits } = payloadEmits();
  const r = await testRoomWithHumans(roomId, io, { clock, rng: makeSeededRng(11), humans: 2, table });
  assert.equal(r.room.getState().phase, 'question', 'the room did not start');
  const ids = () => r.room.getState().players.filter((p) => !p.isEliminated).map((p) => p.id);
  return { ...r, clock, ids, last: () => emits[emits.length - 1] };
}

const FAST_TABLE: TableOptions = { hostLaunch: true, chosen: { humans: 2, ais: 3, fast: true } };

console.log('fast table');

await test('a fast table caps the question at 15 s with an answer missing, then discusses exactly 60 s', async () => {
  const { room, clock, ids } = await started('F1', FAST_TABLE);
  assert.equal(room.getState().questionEndTime, clock.now() + FAST_QUESTION_PHASE_MS, 'the question does not run to 15 s');
  for (const id of ids().slice(1)) room.addAnswer(id, 'oui');
  clock.advance(FAST_QUESTION_PHASE_MS - 1);
  assert.equal(room.getState().phase, 'question', 'the question closed early with an answer missing');
  clock.advance(1);
  assert.equal(room.getState().phase, 'discussion');
  assert.equal(room.getState().discussionEndTime, clock.now() + FAST_DISCUSSION_PHASE_MS, 'the discussion does not run to 60 s');
  clock.advance(FAST_DISCUSSION_PHASE_MS - 1);
  assert.equal(room.getState().phase, 'discussion', 'the discussion outlived its fast length');
  clock.advance(1);
  assert.equal(room.getState().phase, 'voting');
});

await test('a fast table starts the next round 7 s after the vote closed, at a fast question again', async () => {
  const { room, clock, ids } = await started('F2', FAST_TABLE);
  clock.advance(FAST_QUESTION_PHASE_MS);
  clock.advance(FAST_DISCUSSION_PHASE_MS);
  assert.equal(room.getState().phase, 'voting');
  const seat = ids();
  for (const id of seat.slice(1)) room.addVote(id, seat[0]);
  room.addVote(seat[0], null);
  clock.advance(0);
  assert.equal(room.getState().phase, 'endround');
  assert.equal(room.getState().endRoundEndTime, clock.now() + FAST_ENDROUND_MS, 'the round end does not run to 7 s');
  clock.advance(FAST_ENDROUND_MS - 1);
  assert.equal(room.getState().phase, 'endround', 'the round end outlived its fast length');
  clock.advance(1);
  assert.equal(room.getState().phase, 'question');
  assert.equal(room.getState().currentRound, 2, 'the next round did not start');
  assert.equal(room.getState().questionEndTime, clock.now() + FAST_QUESTION_PHASE_MS, 'round 2 left the fast question');
});

await test('a fast table with everyone answering holds the 8 s floor: closed at the floor, never before', async () => {
  const { room, clock, ids } = await started('F3', FAST_TABLE);
  clock.advance(2000);
  for (const id of ids()) room.addAnswer(id, 'oui');
  clock.advance(QUESTION_MIN_MS - 2000 - 1);
  assert.equal(room.getState().phase, 'question', 'the question closed before the floor');
  clock.advance(1);
  assert.equal(room.getState().phase, 'discussion', 'the question did not close at the floor');
  assert.equal(room.getState().discussionEndTime, clock.now() + FAST_DISCUSSION_PHASE_MS);
});

await test('the rematch of a fast table stays fast, and its own rematch carries the flag again', async () => {
  const { room, clock } = await started('F4', rematchTable(['a'], { humans: 2, ais: 3, fast: true }));
  assert.deepEqual(room.tableChoice(), { humans: 2, ais: 3, fast: true });
  assert.equal(room.getGameFormat().discussionSec, 60, 'the rematch room did not keep the fast discussion');
  assert.equal(room.getState().questionEndTime, clock.now() + FAST_QUESTION_PHASE_MS, 'the rematch room did not keep the fast question');
});

await test('the bot format says 15 s and 60 s in fast, 20 s and 100 s otherwise; the vote keeps 30 s', async () => {
  const fast = await started('F5', FAST_TABLE);
  const fmt = fast.room.getGameFormat();
  assert.equal(fmt.questionSec, 15);
  assert.equal(fmt.discussionSec, 60);
  assert.equal(fmt.voteSec, 30);
  const std = await started('F5s', { hostLaunch: true, chosen: { humans: 2, ais: 3 } });
  assert.equal(std.room.getGameFormat().questionSec, 20);
  assert.equal(std.room.getGameFormat().discussionSec, 100);
});

console.log('lobby field');

type Emit = { target: string; payload: Record<string, any> };
const lastTo = (emits: Emit[], target: string) => [...emits].reverse().find((e) => e.target === target)?.payload;

async function lobbyOf(roomId: string, table: TableOptions) {
  const { io, emits } = targetEmits();
  const r = testRoom(roomId, io, { clock: frozenClock(), rng: makeSeededRng(11), names: NAMES_18, pick: 'random', table, assertJoin: true });
  const host = await r.join('h0');
  return { lobby: lastTo(emits, host)?.lobby };
}

await test('the lobby of a fast room says table.fast; a chosen table without fast says nothing about it', async () => {
  const fast = await lobbyOf('F6', { hostLaunch: true, chosen: { humans: 5, ais: 1, fast: true } });
  assert.deepEqual(fast.lobby?.table, { humans: 5, ais: 1, fast: true });
  const std = await lobbyOf('F6s', { hostLaunch: true, chosen: { humans: 5, ais: 1 } });
  assert.deepEqual(std.lobby?.table, { humans: 5, ais: 1 });
});

console.log('every other room unchanged');

await test('a chosen table without fast keeps 20 s, 100 s, 10 s', async () => {
  const { room, clock, ids } = await started('F7', { hostLaunch: true, chosen: { humans: 2, ais: 3 } });
  assert.equal(room.getState().questionEndTime, clock.now() + QUESTION_PHASE_MS);
  for (const id of ids()) room.addAnswer(id, 'oui');
  clock.advance(QUESTION_MIN_MS);
  assert.equal(room.getState().phase, 'discussion');
  assert.equal(room.getState().discussionEndTime, clock.now() + DISCUSSION_PHASE_MS);
  clock.advance(DISCUSSION_PHASE_MS);
  assert.equal(room.getState().phase, 'voting');
  const seat = ids();
  for (const id of seat.slice(1)) room.addVote(id, seat[0]);
  room.addVote(seat[0], null);
  clock.advance(0);
  assert.equal(room.getState().phase, 'endround');
  assert.equal(room.getState().endRoundEndTime, clock.now() + ENDROUND_MS, 'the round end left the standard length');
});

await test('a public room keeps the standard question and discussion', async () => {
  const clock = new ManualClock();
  const { io } = payloadEmits();
  const r = await testRoomWithHumans('F8', io, { clock, rng: makeSeededRng(11), humans: 5 });
  assert.equal(r.room.getState().phase, 'question');
  assert.equal(r.room.getState().questionEndTime, clock.now() + QUESTION_PHASE_MS);
  assert.equal(r.room.getGameFormat().discussionSec, 100);
});

await test('a bot answers 3 s before a fast question ends at the latest, and as before in a 20 s one', () => {
  assert.equal(answerTarget(() => 0.99999, FAST_QUESTION_PHASE_MS) <= FAST_QUESTION_PHASE_MS - 3000, true, 'a bot answer lands too late for a fast question');
  assert.equal(Math.round(answerTarget(() => 0.99999, QUESTION_PHASE_MS)), 17000, 'the 20 s question lost its 17 s top');
  assert.equal(Math.round(answerTarget(() => 0, FAST_QUESTION_PHASE_MS)), 5000);
});

await test('in a fast room every bot answer lands before the 15 s cap (ten seeded rooms)', async () => {
  // A model that always answers: only the timing can make a bot miss the question.
  const talker: ChatProvider = {
    name: 'Fake/talker',
    model: 'talker',
    supportsJson: true,
    chat: async () => ({ text: 'des frites', finishReason: 'stop', latencyMs: 1, provider: 'Fake/talker', model: 'talker' }),
  };
  // Ten seeded rooms of 3 bots: unbounded (5-17 s), some of these 30 draws land past 15 s.
  for (let seed = 1; seed <= 10; seed++) {
    const clock = new ManualClock({ flush: true });
    const { io } = payloadEmits();
    const r = await testRoomWithHumans(`F9-${seed}`, io, { clock, rng: makeSeededRng(seed), humans: 2, table: FAST_TABLE, providers: [talker] });
    const s = r.room.getState();
    assert.equal(s.phase, 'question', 'the room did not start');
    for (const p of s.players.filter((x) => x.type === 'human')) r.room.addAnswer(p.id, 'oui');
    await clock.advance(FAST_QUESTION_PHASE_MS);
    const after = r.room.getState();
    assert.equal(after.phase, 'discussion');
    assert.equal(after.answers.length, after.players.length, `seed ${seed}: ${after.players.length - after.answers.length} bot answer(s) cut by the fast cap`);
  }
});

await test('parseTableChoice: only a boolean true is fast, any other value is the same as no checkbox', () => {
  assert.deepEqual(parseTableChoice({ humans: 2, ais: 3, fast: true }), { humans: 2, ais: 3, fast: true });
  for (const fast of [false, 'true', 1, 0, null, undefined, { on: true }, []]) {
    assert.deepEqual(parseTableChoice({ humans: 2, ais: 3, fast }), { humans: 2, ais: 3 }, `fast=${JSON.stringify(fast)} was kept`);
  }
  assert.deepEqual(parseTableChoice({ humans: 2, ais: 3 }), { humans: 2, ais: 3 });
  assert.equal(parseTableChoice({ humans: '2', ais: 3, fast: true }), null, 'a malformed table became fast');
});

finish();
