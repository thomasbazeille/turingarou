/**
 * The game over review: the transcript of the whole game with every author revealed, sent with the game over
 * only and again to a player back with their session token; each human's own review (the lines they flagged and
 * who wrote them), sent to that human's socket only.
 *
 *   npx tsx scripts/test-review.ts
 */
import assert from 'node:assert/strict';
import { DISCUSSION_PHASE_MS, ENDROUND_MS, GameRoom, QUESTION_PHASE_MS, RoomEmitter } from '../src/game/GameRoom.js';
import { buildTranscript, flagResults } from '../src/game/gameReview.js';
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

interface Emit {
  target: string;
  event: string;
  payload: any;
}

/**
 * A full game of 5 humans and 3 AIs: each round every seat but one answers, two humans and an AI talk (each quoting
 * the line before), the first human flags lines in round 1, then everyone votes out an AI that is not protected (a
 * human when none is left to vote).
 */
async function finished(roomId: string) {
  const clock = new ManualClock();
  const emits: Emit[] = [];
  const io: RoomEmitter = { to: (target: string) => ({ emit: (event: string, payload: unknown) => emits.push({ target, event, payload: JSON.parse(JSON.stringify(payload)) }) }) };
  const pool = ['ana', 'ben', 'cleo', 'dan', 'eva', 'fred', 'gina', 'hugo', 'ivy', 'jo'];
  const used = new Set<string>();
  const room = new GameRoom(roomId, io, [quietModel], 3, {
    clock,
    rng: makeSeededRng(5),
    names: { add: (n) => used.add(n), pick: (ex) => pool.find((n) => !used.has(n) && !ex.includes(n)) ?? 'zed' },
    strategies: { aiPlayer: async () => ({ name: 'test', content: 'play' }), inspector: async () => 'inspect' },
    persistence: { saveGameLog: async () => {}, updateHumanProfiles: async () => {}, saveMessageFlag: async () => {}, getRandomHumanProfile: async () => null },
    log: () => {},
  });
  const sockets: string[] = [];
  for (let i = 0; i < 5; i++) {
    sockets.push(`${roomId}-sock-${i}`);
    await room.addHumanPlayer(sockets[i], `h${i}`, 'fr');
  }
  const st = () => room.getState();
  const humanIds = sockets.map((s) => room.playerIdBySocket(s)!);
  const aiIds = st().players.filter((p) => p.type === 'ai').map((p) => p.id);
  const posted: { round: number; playerId: string; text: string; replyToId?: string }[] = [];
  const answered: { round: number; playerId: string; text: string }[] = [];
  const votes: { round: number; voterId: string; targetId: string }[] = [];
  const flagged: string[] = [];
  let reviewBeforeEnd: unknown = undefined;
  while (st().phase === 'question') {
    const round = st().currentRound;
    const active = st().players.filter((p) => !p.isEliminated).map((p) => p.id);
    for (const id of active.slice(1)) {
      room.addAnswer(id, `r${round} answer of ${id}`);
      answered.push({ round, playerId: id, text: `r${round} answer of ${id}` });
    }
    clock.advance(QUESTION_PHASE_MS);
    const talkers = [...humanIds.filter((id) => active.includes(id)).slice(0, 2), ...aiIds.filter((id) => active.includes(id)).slice(0, 1)];
    for (const id of talkers) {
      const replyToId = posted.length && posted.at(-1)!.round === round ? st().messages.at(-1)!.id : undefined;
      assert.ok(room.addMessage(id, `r${round} line of ${id}`, replyToId), `line of ${id} refused`);
      posted.push({ round, playerId: id, text: `r${round} line of ${id}`, ...(replyToId ? { replyToId } : {}) });
    }
    if (round === 1) {
      const lineOf = (id: string) => st().messages.find((m) => m.round === 1 && m.playerId === id)!.id;
      const [first, second, ai] = talkers;
      room.flagMessage(first, lineOf(ai));
      room.flagMessage(first, lineOf(second));
      room.flagMessage(first, lineOf(ai));
      room.flagMessage(first, lineOf(first));
      flagged.push(lineOf(ai), lineOf(second));
      reviewBeforeEnd = room.reviewOf(first);
    }
    clock.advance(DISCUSSION_PHASE_MS);
    assert.equal(st().phase, 'voting');
    const targets = active.filter((id) => id !== st().protectedPlayerId);
    const target = targets.find((id) => aiIds.includes(id)) ?? targets[0];
    for (const id of active.filter((x) => x !== target)) {
      room.addVote(id, target);
      votes.push({ round, voterId: id, targetId: target });
    }
    room.addVote(target, null);
    clock.advance(0);
    assert.equal(st().phase, 'endround');
    clock.advance(ENDROUND_MS);
  }
  assert.equal(st().phase, 'gameover', `the game did not end (phase ${st().phase})`);
  const roomStates = emits.filter((e) => e.event === 'gameState' && e.target === roomId).map((e) => e.payload);
  return { room, clock, emits, roomStates, sockets, humanIds, aiIds, posted, answered, votes, flagged, reviewBeforeEnd, gameover: roomStates.at(-1) };
}

// ====== TRANSCRIPT ======

await check('transcript: answers in seat order without time, system lines out, reply quotes kept', () => {
  const players = [
    { id: 'p-b', name: 'ben', color: '#111', isAI: true, model: 'Mistral Small' },
    { id: 'p-a', name: 'ana', color: '#222', isAI: false },
  ];
  const t = buildTranscript({
    players,
    rounds: 2,
    question: (rd) => `q${rd}`,
    answers: (rd) => (rd === 1 ? [{ playerId: 'p-a', playerName: 'ana', answer: 'la mer', timestamp: 5 }, { playerId: 'p-b', playerName: 'ben', answer: 'un chat', timestamp: 9 }] : []),
    messages: [
      { id: 'm1', playerId: 'p-a', playerName: 'ana', content: 'salut', timestamp: 1, phase: 'discussion', round: 1 },
      { id: 's1', playerId: 'system', playerName: '', content: 'info', timestamp: 2, phase: 'discussion', round: 1 },
      { id: 'm2', playerId: 'p-b', playerName: 'ben', content: 'yo', timestamp: 3, phase: 'discussion', round: 2, replyToId: 'm1' },
    ],
    eliminatedId: (rd) => (rd === 1 ? 'p-a' : null),
  });
  assert.deepEqual(t.players, players);
  assert.deepEqual(t.rounds[0], { round: 1, question: 'q1', answers: [{ playerId: 'p-b', text: 'un chat' }, { playerId: 'p-a', text: 'la mer' }], messages: [{ id: 'm1', playerId: 'p-a', text: 'salut' }], eliminatedId: 'p-a' });
  assert.deepEqual(t.rounds[1], { round: 2, question: 'q2', answers: [], messages: [{ id: 'm2', playerId: 'p-b', text: 'yo', replyToId: 'm1' }], eliminatedId: null });
});

const game = await finished('T1');

await check('the game over carries the whole game: every round, question, answer and line, each author revealed', () => {
  const t = game.gameover.transcript;
  assert.ok(t, 'no transcript in the game over state');
  const state = game.room.getState();
  assert.equal(t.rounds.length, state.currentRound);
  for (const p of t.players) {
    const isAI = game.aiIds.includes(p.id);
    assert.equal(p.isAI, isAI, `${p.name} revealed as isAI=${p.isAI}`);
    assert.equal(typeof p.model === 'string' && p.model.length > 0, isAI, `${p.name} model "${p.model}"`);
  }
  assert.deepEqual(t.players.map((p: { id: string }) => p.id), state.players.map((p) => p.id), 'players not in seat order');
  const seat = state.players.map((p) => p.id);
  for (const r of t.rounds) {
    assert.ok(r.question.length > 0, `round ${r.round} without its question`);
    const expected = game.answered.filter((a) => a.round === r.round).sort((x, y) => seat.indexOf(x.playerId) - seat.indexOf(y.playerId));
    assert.deepEqual(r.answers, expected.map(({ playerId, text }) => ({ playerId, text })), `round ${r.round} answers`);
    const lines = r.messages.map(({ playerId, text, replyToId }: { playerId: string; text: string; replyToId?: string }) => ({ round: r.round, playerId, text, ...(replyToId ? { replyToId } : {}) }));
    assert.deepEqual(lines, game.posted.filter((m) => m.round === r.round), `round ${r.round} lines`);
  }
  assert.ok(game.posted.some((m) => m.replyToId), 'the scenario never quoted a line');
});

await check('no transcript in any state before the game over', () => {
  const early = game.roomStates.filter((s) => s.phase !== 'gameover' && 'transcript' in s);
  assert.equal(early.length, 0, `transcript sent in ${early.map((s) => s.phase).join(', ')}`);
});

// ====== FLAGS ======

await check('flags: in the order flagged, each with its author and whether it was an AI; unknown and system ids out', () => {
  const messages = [
    { id: 'm1', playerId: 'p-a', playerName: 'ana', content: 'salut', timestamp: 1, phase: 'discussion' as const, round: 1 },
    { id: 's1', playerId: 'system', playerName: '', content: 'info', timestamp: 2, phase: 'discussion' as const, round: 1 },
    { id: 'm2', playerId: 'p-b', playerName: 'ben', content: 'yo', timestamp: 3, phase: 'discussion' as const, round: 2 },
  ];
  assert.deepEqual(flagResults(['m2', 'nope', 's1', 'm1'], messages, (id) => id === 'p-b'), [
    { messageId: 'm2', round: 2, authorId: 'p-b', authorName: 'ben', text: 'yo', isAI: true },
    { messageId: 'm1', round: 1, authorId: 'p-a', authorName: 'ana', text: 'salut', isAI: false },
  ]);
});

await check("each human gets their own review on their own socket at the game over, nobody else's, never the room", () => {
  const reviews = game.emits.filter((e) => e.event === 'myReview');
  assert.equal(reviews.filter((e) => e.target === 'T1').length, 0, 'a review was broadcast to the room');
  assert.deepEqual(reviews.map((e) => e.target).sort(), [...game.sockets].sort(), 'not one review per human socket');
  for (const e of reviews) {
    const seat = game.room.playerIdBySocket(e.target)!;
    assert.deepEqual(e.payload, game.room.reviewOf(seat), `socket ${e.target} got another review than its seat's`);
  }
  const gameoverAt = game.emits.findIndex((e) => e.event === 'gameState' && e.payload.phase === 'gameover');
  assert.ok(game.emits.findIndex((e) => e.event === 'myReview') > gameoverAt, 'a review went out before the game over');
  assert.equal(game.reviewBeforeEnd, null, 'reviewOf answered before the game over');
  assert.equal(game.room.reviewOf(game.aiIds[0]), null, 'an AI seat has a review');
});

await check("the flagger sees their flags with the truth (an AI's line, a human's), duplicates and their own line out; the others none", () => {
  const first = game.room.reviewOf(game.humanIds[0])!;
  assert.deepEqual(first.flags.map((f) => f.messageId), game.flagged);
  assert.deepEqual(first.flags.map((f) => f.isAI), [true, false]);
  assert.deepEqual(first.flags.map((f) => f.authorId), [game.aiIds[0], game.humanIds[1]]);
  for (const id of game.humanIds.slice(1)) assert.deepEqual(game.room.reviewOf(id)!.flags, [], `${id} sees flags that are not theirs`);
  assert.ok(!game.roomStates.some((s) => JSON.stringify(s).includes('"flags"')), 'flags in a state sent to the room');
});

await check('a player back with their token after the game over gets the same transcript', () => {
  const token = game.room.sessionToken(game.humanIds[2])!;
  game.room.disconnect(game.sockets[2]);
  const seat = game.room.resume('T1-back', token);
  assert.equal(seat?.playerId, game.humanIds[2]);
  assert.deepEqual(game.room.publicState('T1-back').transcript, game.gameover.transcript);
  const sent = game.emits.find((e) => e.event === 'myReview' && e.target === game.sockets[2])!.payload;
  assert.deepEqual(game.room.reviewOf(game.humanIds[2]), sent, 'the review sent on resume differs from the one sent at the game over');
});

console.log(failures ? `\n${failures} échec(s)` : '\nTout est vert');
process.exit(failures ? 1 : 0);
