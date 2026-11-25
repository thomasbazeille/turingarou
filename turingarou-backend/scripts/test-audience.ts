/**
 * The audience: read-only spectators of a private room (watchRoom). They take no seat and never block the launch
 * nor the vacancy abort; their vote counts only during the voting phase, from a watcher, on a player still in,
 * one live pick each (the last replaces); the aggregate reaches every browser only once the round's vote closed;
 * mid-game a spectator's state is exactly a player's; the picks land in GameLogData.audienceVotes.
 *
 *   npx tsx scripts/test-audience.ts
 */
import assert from 'node:assert/strict';
import {
  DISCUSSION_PHASE_MS,
  ENDROUND_MS,
  QUESTION_PHASE_MS,
  RECONNECT_GRACE_MS,
  TableOptions,
  VOTE_PHASE_MS,
} from '../src/game/GameRoom.js';
import { makeSeededRng } from '../src/game/humanTiming.js';
import { finish, ManualClock, NAMES_10, targetEmits, test, testRoom } from './testkit.js';

const clock = new ManualClock();

type Emit = { target: string; payload: Record<string, any> };

// Seed 11, the 10-name pool, first-free picker, asserting joins, one ManualClock for the whole file: this file's flavour.
function makeRoom(roomId: string, table: TableOptions = {}) {
  const { io, emits } = targetEmits();
  const r = testRoom(roomId, io, { clock, rng: makeSeededRng(11), names: NAMES_10, table, assertJoin: true });
  return { ...r, emits };
}

const lastTo = (emits: Emit[], target: string) => [...emits].reverse().find((e) => e.target === target)?.payload;
const roomBroadcast = (emits: Emit[], roomId: string) => [...emits].reverse().find((e) => e.target === roomId)?.payload;
const seatKeys = ['color', 'colorName', 'id', 'isEliminated', 'isReady', 'username'].sort();

console.log('spectators take no seat');

await test('a spectator takes no seat and neither blocks the launch nor the vacancy abort', async () => {
  const { room, join, sockets, emits, vacant, saved } = makeRoom('A1', { hostLaunch: true });
  const host = await join('h0');
  await join('h1');
  await join('h2');
  room.addWatcher('w1');
  room.addWatcher('w2');
  assert.equal(room.watcherCount(), 2);
  assert.equal(room.getState().players.length, 3, 'a spectator took a seat');
  assert.ok(room.getState().players.every((p) => p.type !== 'human' || (p.socketId !== 'w1' && p.socketId !== 'w2')), 'a spectator socket holds a seat');
  assert.equal(emits.filter((e) => e.target === 'A1').length, 0, 'a spectator state was broadcast to the room');
  for (const w of ['w1', 'w2']) {
    const st = lastTo(emits, w)!;
    assert.equal(st.phase, 'waiting');
    assert.ok((st.players as { id: string }[]).every((p) => p.id === ''), `${w} was shown a seat`);
    assert.equal(st.lobby.host, false);
    assert.deepEqual(st.audience, { watching: 2, lastRound: null });
    assert.deepEqual(room.publicState(), st, 'publicState() without a socket differs from the watcher state');
  }
  // The launch and the vacancy ignore the spectators entirely.
  assert.equal(await room.launch(host), null);
  assert.equal(room.getState().phase, 'question');
  assert.equal(room.getState().players.length, 5, 'the table did not fill as if the spectators were seats');
  assert.deepEqual(roomBroadcast(emits, 'A1')!.audience, { watching: 2, lastRound: null });
  for (const s of sockets) room.disconnect(s);
  clock.advance(RECONNECT_GRACE_MS);
  assert.equal(vacant(), 1, 'the spectators kept the room alive');
  assert.equal(room.getState().phase, 'waiting', 'the game did not abort');
  assert.equal(saved.length, 1);
  assert.equal(saved[0].result, 'aborted');
  assert.ok(saved[0].players.every((p) => p.name !== 'w1' && p.name !== 'w2'), 'a spectator was logged as a player');
  assert.equal(room.watcherCount(), 2, 'the abort dropped a spectator');
});

console.log('audience votes');

await test('audienceVote is refused outside the voting phase, from a seat or a stranger, on an unknown or eliminated player', async () => {
  const { room, join, sockets } = makeRoom('A2');
  for (let i = 0; i < 5; i++) await join(`h${i}`);
  assert.equal(room.getState().phase, 'question');
  room.addWatcher('w1');
  const ids = () => room.getState().players.filter((p) => !p.isEliminated).map((p) => p.id);
  assert.equal(room.addAudienceVote('w1', ids()[0]), false, 'accepted during the question');
  clock.advance(QUESTION_PHASE_MS);
  clock.advance(DISCUSSION_PHASE_MS);
  assert.equal(room.getState().phase, 'voting');
  assert.equal(room.addAudienceVote(sockets[0], ids()[0]), false, 'accepted from a seated player');
  assert.equal(room.addAudienceVote('stranger', ids()[0]), false, 'accepted from a socket that never watched');
  assert.equal(room.addAudienceVote('w1', 'p-nowhere'), false, 'accepted on an unknown id');
  assert.equal(room.addAudienceVote('w1', ids()[0]), true);
  assert.equal(room.addAudienceVote('w1', ids()[1]), true, 'the first pick was final');
  // Round 1 eliminates a player: every human names ids()[0], ids()[0] abstains.
  const all = ids();
  for (const id of all.slice(1)) room.addVote(id, all[0]);
  room.addVote(all[0], null);
  clock.advance(0);
  assert.equal(room.getState().phase, 'endround');
  assert.equal(room.getState().eliminatedPlayerId, all[0]);
  clock.advance(ENDROUND_MS);
  assert.equal(room.getState().phase, 'question');
  assert.equal(room.addAudienceVote('w1', ids()[0]), false, 'accepted during the next question');
  clock.advance(QUESTION_PHASE_MS);
  clock.advance(DISCUSSION_PHASE_MS);
  assert.equal(room.getState().phase, 'voting');
  assert.equal(room.addAudienceVote('w1', all[0]), false, 'accepted on a player eliminated last round');
  assert.equal(room.addAudienceVote('w1', ids()[0]), true);
});

await test('the aggregate appears in the state only once the round vote closed, and never changes the game', async () => {
  const { room, join, emits } = makeRoom('A3');
  for (let i = 0; i < 5; i++) await join(`h${i}`);
  room.addWatcher('w1');
  room.addWatcher('w2');
  clock.advance(QUESTION_PHASE_MS);
  clock.advance(DISCUSSION_PHASE_MS);
  assert.equal(room.getState().phase, 'voting');
  const ids = room.getState().players.map((p) => p.id);
  assert.equal(room.addAudienceVote('w1', ids[1]), true);
  assert.equal(room.addAudienceVote('w1', ids[2]), true, 'the first pick was final');
  assert.equal(room.addAudienceVote('w2', ids[1]), true);
  let st = room.publicState() as Record<string, any>;
  assert.deepEqual(st.audience, { watching: 2, lastRound: null }, 'the aggregate was visible during the vote');
  assert.deepEqual(roomBroadcast(emits, 'A3')!.audience, st.audience, 'the broadcast carried another audience field');
  // Every seat names ids[3] (ids[3] abstains) and the vote closes at once, before any bot timer: only the players'
  // votes decide — the audience's picks (ids[1], ids[2]) change nothing.
  for (const id of ids) room.addVote(id, id === ids[3] ? null : ids[3]);
  clock.advance(0);
  assert.equal(room.getState().phase, 'endround');
  assert.equal(room.getState().eliminatedPlayerId, ids[3], 'the audience vote eliminated someone');
  st = room.publicState() as Record<string, any>;
  assert.deepEqual(st.audience, { watching: 2, lastRound: { round: 1, counts: { [ids[1]]: 1, [ids[2]]: 1 }, total: 2 } });
  clock.advance(ENDROUND_MS);
  assert.equal(room.getState().phase, 'question');
  st = room.publicState() as Record<string, any>;
  assert.equal(st.audience.lastRound.round, 1, 'the closed aggregate fell back to null');
  clock.advance(QUESTION_PHASE_MS);
  clock.advance(DISCUSSION_PHASE_MS);
  assert.equal(room.getState().phase, 'voting');
  st = room.publicState() as Record<string, any>;
  assert.equal(st.audience.lastRound.round, 1, 'round 1 closed aggregate is not round 2');
});

await test('mid-game a spectator receives exactly a player state: same keys, nothing naming an AI', async () => {
  const { room, join, sockets, emits } = makeRoom('A4');
  for (let i = 0; i < 5; i++) await join(`h${i}`);
  room.addWatcher('w1');
  clock.advance(QUESTION_PHASE_MS);
  clock.advance(DISCUSSION_PHASE_MS);
  assert.equal(room.getState().phase, 'voting');
  const mine = room.publicState(sockets[0]) as Record<string, any>;
  const broadcast = roomBroadcast(emits, 'A4')!;
  assert.deepEqual(Object.keys(mine).sort(), Object.keys(broadcast).sort(), 'the spectator state has other keys than a player one');
  assert.deepEqual(mine, broadcast);
  assert.deepEqual((mine as any).audience, { watching: 1, lastRound: null });
  for (const p of mine.players) assert.deepEqual(Object.keys(p).sort(), seatKeys, 'a seat carried a revealing field');
  const json = JSON.stringify(mine);
  for (const leak of ['"isAI"', '"model"', '"type"', '"personality"', '"socketId"', '"strategy"', '"transcript"', '"voteHistory"'])
    assert.ok(!json.includes(leak), `${leak} reached the state`);
});

await test('the audience votes of every round land in GameLogData.audienceVotes, last pick per spectator', async () => {
  const { room, join, saved } = makeRoom('A5');
  for (let i = 0; i < 5; i++) await join(`h${i}`);
  room.addWatcher('w1');
  room.addWatcher('w2');
  const nameOf = (id: string) => room.getState().players.find((p) => p.id === id)!.username;
  const picks: { w1: string; w2: string }[] = [];
  for (let round = 1; round <= 7; round++) {
    assert.equal(room.getState().phase, 'question', `round ${round} did not open`);
    clock.advance(QUESTION_PHASE_MS);
    clock.advance(DISCUSSION_PHASE_MS);
    assert.equal(room.getState().phase, 'voting', `round ${round} vote did not open`);
    const actives = room.getState().players.filter((p) => !p.isEliminated).map((p) => p.id);
    assert.equal(room.addAudienceVote('w1', actives[0]), true);
    if (round === 3) assert.equal(room.addAudienceVote('w1', actives[1]), true, 'the first pick was final');
    assert.equal(room.addAudienceVote('w2', actives[0]), true);
    picks.push({ w1: nameOf(round === 3 ? actives[1] : actives[0]), w2: nameOf(actives[0]) });
    clock.advance(VOTE_PHASE_MS);
    assert.equal(room.getState().phase, 'endround', `round ${round} vote did not close`);
    clock.advance(ENDROUND_MS);
  }
  assert.equal(room.getState().phase, 'gameover');
  assert.equal(saved.length, 1);
  assert.equal(saved[0].result, 'draw');
  const av = saved[0].audienceVotes!;
  assert.equal(av.length, 14, 'a replaced vote was logged twice');
  assert.deepEqual([...new Set(av.map((v) => v.round))], [1, 2, 3, 4, 5, 6, 7]);
  for (let round = 1; round <= 7; round++) {
    const rows = av.filter((v) => v.round === round);
    assert.deepEqual(rows.map((v) => v.spectator), ['w1', 'w2']);
    assert.deepEqual(rows.map((v) => v.target), [picks[round - 1].w1, picks[round - 1].w2]);
    assert.ok(rows.every((v) => typeof v.timestamp === 'number' && Number.isFinite(v.timestamp)), 'a vote came without its time');
  }
});

finish();
