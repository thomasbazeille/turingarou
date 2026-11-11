/**
 * The round: abstention (a vote rendered that eliminates nobody), votes hidden until the round end, reply quotes
 * validated by the room (valid, unknown, another room's, malformed), early end of the question phase and its floor.
 *
 *   npx tsx scripts/test-round.ts
 */
import assert from 'node:assert/strict';
import { DISCUSSION_PHASE_MS, GameRoom, QUESTION_MIN_MS, QUESTION_PHASE_MS, RoomEmitter } from '../src/game/GameRoom.js';
import type { ChatProvider } from '../src/llm/chatClient.js';
import { makeSeededRng } from '../src/game/humanTiming.js';

let failures = 0;
const check = async (name: string, fn: () => void | Promise<void>) => {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
  } catch (e: any) {
    failures++;
    console.log(`  ✗ ${name} — ${e.message}`);
  }
};

class ManualClock {
  t = 1_800_000_000_000;
  private seq = 0;
  private timers = new Map<number, { at: number; fn: () => void }>();
  now = (): number => this.t;
  setTimeout = (fn: () => void, ms: number): number => {
    this.timers.set(++this.seq, { at: this.t + Math.max(0, ms), fn });
    return this.seq;
  };
  clearTimeout = (h: unknown): void => {
    this.timers.delete(h as number);
  };
  /** Fires every timer due within ms, in order, then lands exactly ms later. */
  advance(ms: number): void {
    const end = this.t + ms;
    for (;;) {
      let next: [number, { at: number; fn: () => void }] | null = null;
      for (const e of this.timers) if (e[1].at <= end && (!next || e[1].at < next[1].at || (e[1].at === next[1].at && e[0] < next[0]))) next = e;
      if (!next) break;
      this.timers.delete(next[0]);
      this.t = next[1].at;
      next[1].fn();
    }
    this.t = end;
  }
}

// Bots answer SKIP and their decisions fail to parse: every answer, line and vote below is placed by the test.
const quietModel: ChatProvider = {
  name: 'Fake/quiet',
  model: 'quiet',
  supportsJson: true,
  chat: async () => ({ text: 'SKIP', finishReason: 'stop', latencyMs: 1, provider: 'Fake/quiet', model: 'quiet' }),
};

async function started(roomId: string) {
  const clock = new ManualClock();
  const emits: Record<string, any>[] = [];
  const io: RoomEmitter = { to: () => ({ emit: (event: string, payload: unknown) => (event === 'gameState' ? emits.push(payload as Record<string, any>) : 0) }) };
  const pool = ['ana', 'ben', 'cleo', 'dan', 'eva', 'fred', 'gina', 'hugo', 'ivy', 'jo'];
  const used = new Set<string>();
  const room = new GameRoom(roomId, io, [quietModel], 3, {
    clock,
    rng: makeSeededRng(11),
    names: { add: (n) => used.add(n), pick: (ex) => pool.find((n) => !used.has(n) && !ex.includes(n)) ?? 'zed' },
    strategies: { aiPlayer: async () => ({ name: 'test', content: 'play' }), inspector: async () => 'inspect' },
    persistence: { saveGameLog: async () => {}, updateHumanProfiles: async () => {}, saveMessageFlag: async () => {}, saveGameFeedback: async () => {}, getRandomHumanProfile: async () => null },
    log: () => {},
  });
  for (let i = 0; i < 5; i++) await room.addHumanPlayer(`${roomId}-sock-${i}`, `h${i}`, 'fr');
  assert.equal(room.getState().phase, 'question', 'the room did not start');
  const ids = () => room.getState().players.filter((p) => !p.isEliminated).map((p) => p.id);
  return { room, clock, emits, ids, last: () => emits[emits.length - 1] };
}

async function atVote(roomId: string) {
  const r = await started(roomId);
  r.clock.advance(QUESTION_PHASE_MS);
  r.clock.advance(DISCUSSION_PHASE_MS);
  assert.equal(r.room.getState().phase, 'voting');
  // The protected player (drawn after round 1 only) does not exist yet: anyone is a target.
  assert.equal(r.room.getState().protectedPlayerId, null);
  return r;
}

// ====== ABSTENTION AND HIDDEN VOTES ======

await check('abstention counts as a vote rendered: the vote closes as soon as everyone voted or abstained', async () => {
  const { room, clock, ids } = await atVote('V1');
  const [a, b, ...rest] = ids();
  for (const id of rest) room.addVote(id, a);
  room.addVote(a, null);
  assert.equal(room.getState().phase, 'voting', 'closed before the last vote');
  room.addVote(b, null);
  clock.advance(0);
  assert.equal(room.getState().phase, 'endround', 'the vote did not close once everyone had voted or abstained');
  assert.equal(room.getState().eliminatedPlayerId, a);
});

await check('abstentions eliminate nobody: all abstain, or a tie among the votes, is nobody', async () => {
  const all = await atVote('V2');
  for (const id of all.ids()) all.room.addVote(id, null);
  all.clock.advance(0);
  assert.equal(all.room.getState().phase, 'endround');
  assert.equal(all.room.getState().eliminatedPlayerId, null, 'an all-abstention vote eliminated someone');

  const tie = await atVote('V3');
  const [a, b, c, d, ...rest] = tie.ids();
  tie.room.addVote(a, b);
  tie.room.addVote(b, a);
  tie.room.addVote(c, a);
  tie.room.addVote(d, b);
  for (const id of rest) tie.room.addVote(id, null);
  tie.clock.advance(0);
  assert.equal(tie.room.getState().eliminatedPlayerId, null, '2-2 with abstentions eliminated someone');

  const one = await atVote('V4');
  const ids = one.ids();
  one.room.addVote(ids[1], ids[0]);
  for (const id of ids.slice(2).concat(ids[0])) one.room.addVote(id, null);
  one.clock.advance(0);
  assert.equal(one.room.getState().eliminatedPlayerId, ids[0], 'one vote against six abstentions did not eliminate');
});

await check('one vote per player: an abstention is final, a second ballot of either kind is refused', async () => {
  const { room, ids } = await atVote('V5');
  const [a, b] = ids();
  room.addVote(a, null);
  room.addVote(a, b);
  assert.deepEqual(room.voteOf(a), { round: 1, targetId: null });
  room.addVote(b, a);
  room.addVote(b, null);
  assert.deepEqual(room.voteOf(b), { round: 1, targetId: a });
  assert.equal(room.getState().votes.length, 2);
});

await check('before the round end, nobody sees anyone\'s vote: an anonymous count, no voter id, no system line', async () => {
  const { room, clock, emits, ids, last } = await atVote('V6');
  const [a, b, c] = ids();
  const before = emits.length;
  room.addVote(a, b);
  room.addVote(c, null);
  assert.equal(emits.length, before + 2, 'each vote is one broadcast');
  for (const e of emits) {
    if (e.phase === 'endround') continue;
    assert.deepEqual(e.votes, [], `votes sent during ${e.phase}`);
    assert.ok(!JSON.stringify(e).includes('"voterId"'), `a voter id is in a ${e.phase} state`);
  }
  assert.equal(last().voteCount, 2);
  assert.ok(!room.getState().messages.some((m) => m.playerId === 'system'), 'a vote posted a system line');
  assert.deepEqual(room.voteOf(a), { round: 1, targetId: b });
  assert.deepEqual(room.voteOf(c), { round: 1, targetId: null });
  assert.equal(room.voteOf(b), null);
  clock.advance(30_000);
  assert.equal(last().phase, 'endround');
});

await check('the round end reveals one entry per player who could vote, in seat order, a missing vote as an abstention', async () => {
  const { room, clock, ids, last } = await atVote('V7');
  const seat = ids();
  // Cast in reverse seat order, two players never vote.
  const [x, y, ...voting] = seat;
  for (const id of [...voting].reverse()) room.addVote(id, x);
  clock.advance(30_000);
  const reveal = last();
  assert.equal(reveal.phase, 'endround');
  assert.deepEqual(
    reveal.votes.map((v: { voterId: string }) => v.voterId),
    seat,
    'not one entry per voter in seat order'
  );
  assert.deepEqual(
    reveal.votes.filter((v: { targetId: string | null }) => v.targetId === null).map((v: { voterId: string }) => v.voterId),
    [x, y],
    'missing votes not shown as abstentions'
  );
  assert.equal(reveal.voteCount, undefined, 'the vote count outlived the vote');
  assert.ok(typeof reveal.endRoundEndTime === 'number' && reveal.endRoundEndTime > clock.now(), 'no round-end deadline for the staged reveal');
});

// ====== REPLY QUOTES ======

await check('reply quote: an earlier line of the room is kept on the new line', async () => {
  const { room, clock, ids } = await started('R1');
  clock.advance(QUESTION_PHASE_MS);
  const [a, b] = ids();
  assert.ok(room.addMessage(a, 'qui a dit la mer ?'));
  const quoted = room.getState().messages.at(-1)!;
  assert.ok(room.addMessage(b, 'moi pourquoi', quoted.id));
  assert.equal(room.getState().messages.at(-1)!.replyToId, quoted.id);
});

await check('reply quote: an unknown id is dropped, the line is still posted', async () => {
  const { room, clock, ids } = await started('R2');
  clock.advance(QUESTION_PHASE_MS);
  const [a] = ids();
  assert.ok(room.addMessage(a, 'salut', 'msg-does-not-exist'));
  const line = room.getState().messages.at(-1)!;
  assert.equal(line.content, 'salut');
  assert.ok(!('replyToId' in line), 'an unknown reply id was kept');
});

await check("reply quote: another room's message id is dropped", async () => {
  const one = await started('R3a');
  const two = await started('R3b');
  one.clock.advance(QUESTION_PHASE_MS);
  two.clock.advance(QUESTION_PHASE_MS);
  assert.ok(one.room.addMessage(one.ids()[0], 'ailleurs'));
  const foreign = one.room.getState().messages.at(-1)!.id;
  assert.ok(two.room.addMessage(two.ids()[0], 'ici', foreign));
  assert.ok(!('replyToId' in two.room.getState().messages.at(-1)!), "another room's message id was kept");
});

await check('reply quote: a non-string id (number, object, empty) is dropped', async () => {
  const { room, clock, ids } = await started('R4');
  clock.advance(QUESTION_PHASE_MS);
  const [a] = ids();
  room.addMessage(a, 'premier');
  for (const bad of [42, { id: 'x' }, '', null]) {
    assert.ok(room.addMessage(a, `ligne ${String(bad)}`, bad));
    assert.ok(!('replyToId' in room.getState().messages.at(-1)!), `kept ${JSON.stringify(bad)}`);
  }
});

// ====== EARLY END OF THE QUESTION PHASE ======

const answerAll = (room: GameRoom, ids: string[]) => ids.forEach((id) => room.addAnswer(id, 'oui'));

await check('everyone answered within 2 s: the discussion starts exactly at the floor, never before', async () => {
  const { room, clock, ids } = await started('Q1');
  clock.advance(2000);
  answerAll(room, ids());
  clock.advance(QUESTION_MIN_MS - 2000 - 1);
  assert.equal(room.getState().phase, 'question', 'the question ended before the floor');
  clock.advance(1);
  assert.equal(room.getState().phase, 'discussion', 'the question did not end at the floor');
});

await check('everyone answered after the floor: the discussion starts at the last answer', async () => {
  const { room, clock, ids } = await started('Q2');
  const [first, ...others] = ids();
  room.addAnswer(first, 'tot');
  clock.advance(12_000);
  answerAll(room, others);
  clock.advance(0);
  assert.equal(room.getState().phase, 'discussion', 'the question did not end at the last answer');
  assert.equal(room.getState().discussionEndTime, clock.now() + DISCUSSION_PHASE_MS);
});

await check('answers stay hidden until the question ends: no broadcast per answer, none in the state, then seat order without time', async () => {
  const { room, clock, emits, ids, last } = await started('Q4');
  const seat = ids();
  const before = emits.length;
  // Answered in reverse seat order, one player never answers.
  for (const [i, id] of [...seat].slice(1).reverse().entries()) {
    clock.advance(500 + i * 100);
    room.addAnswer(id, `rep ${id}`);
  }
  assert.equal(emits.length, before, 'an answer was broadcast during the question');
  assert.deepEqual(room.publicState().answers, [], 'answers in the state sent to a client joining mid-question');
  assert.deepEqual(room.answerOf(seat[1]), { round: 1, answer: `rep ${seat[1]}` });
  assert.equal(room.answerOf(seat[0]), null);
  clock.advance(QUESTION_PHASE_MS);
  const reveal = last();
  assert.equal(reveal.phase, 'discussion');
  assert.deepEqual(reveal.answers.map((a: { playerId: string }) => a.playerId), seat.slice(1), 'answers not in seat order');
  assert.ok(reveal.answers.every((a: Record<string, unknown>) => !('timestamp' in a)), 'answer times sent to the clients');
});

await check('one answer missing: no early end, the question runs its full time', async () => {
  const { room, clock, ids } = await started('Q3');
  answerAll(room, ids().slice(1));
  clock.advance(QUESTION_PHASE_MS - 1);
  assert.equal(room.getState().phase, 'question', 'the question ended early with an answer missing');
  clock.advance(1);
  assert.equal(room.getState().phase, 'discussion');
});

console.log(failures ? `\n${failures} échec(s)` : '\nTout est vert');
process.exit(failures ? 1 : 0);
