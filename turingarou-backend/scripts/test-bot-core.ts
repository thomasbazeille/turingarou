import assert from 'node:assert/strict';
import { Bot } from '../src/game/Bot.js';
import { BotDirector, DirectorRoom } from '../src/game/BotDirector.js';
import { buildGameContext, stableBucket, visibleMessages, BotView } from '../src/game/botContext.js';
import { Clock } from '../src/game/clock.js';
import { ChatProvider, ChatRequest, ChatResult } from '../src/llm/chatClient.js';
import type { GameFormat, GameMessage, GameRoomState } from '../src/types/game.types.js';

let passed = 0;
const failures: string[] = [];
async function test(name: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
    passed++;
    console.log(`✅ ${name}`);
  } catch (err) {
    failures.push(name);
    console.log(`❌ ${name}\n   ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ---- manual clock: timers fire only when the test advances time ----
class ManualClock implements Clock {
  t = 1_000_000;
  private seq = 0;
  private timers = new Map<number, { at: number; fn: () => void }>();
  now = () => this.t;
  setTimeout = (fn: () => void, ms: number) => {
    const id = ++this.seq;
    this.timers.set(id, { at: this.t + Math.max(0, ms), fn });
    return id;
  };
  clearTimeout = (id: unknown) => {
    this.timers.delete(id as number);
  };
  async advance(ms: number): Promise<void> {
    const end = this.t + ms;
    for (;;) {
      await new Promise<void>((r) => setImmediate(r));
      let next: [number, { at: number; fn: () => void }] | null = null;
      for (const e of this.timers) if (e[1].at <= end && (!next || e[1].at < next[1].at || (e[1].at === next[1].at && e[0] < next[0]))) next = e;
      if (!next) break;
      this.timers.delete(next[0]);
      this.t = next[1].at;
      next[1].fn();
    }
    this.t = end;
    await new Promise<void>((r) => setImmediate(r));
  }
}

// ---- provider whose calls resolve only when the test says so ----
class DeferredProvider implements ChatProvider {
  name = 'Deferred/x';
  model = 'x';
  supportsJson = true;
  pending: { req: ChatRequest; resolve: (r: ChatResult) => void }[] = [];
  chat(req: ChatRequest): Promise<ChatResult> {
    return new Promise((resolve) => this.pending.push({ req, resolve }));
  }
  answer(index: number, text: string): void {
    this.pending[index].resolve({ text, finishReason: 'stop', latencyMs: 1, provider: this.name, model: this.model });
  }
}

const format: GameFormat = { maxPlayers: 8, humanCount: 5, aiCount: 3, questionSec: 20, discussionSec: 100, voteSec: 30, maxRounds: 7, language: 'fr' };

function setup() {
  const clock = new ManualClock();
  const provider = new DeferredProvider();
  const state: GameRoomState = {
    roomId: 'r',
    phase: 'question',
    currentRound: 1,
    players: [
      { type: 'ai', id: 'b1', username: 'lucas', color: '', colorName: '', isReady: true, isEliminated: false, personality: { name: 'lucas', traits: [], systemPrompt: 'You are lucas, a person.', responseStyle: 'quick', suspicionLevel: 0.5 } },
      { type: 'human', id: 'h1', socketId: 's1', username: 'emma', color: '', colorName: '', isReady: true, isEliminated: false },
      { type: 'human', id: 'h2', socketId: 's2', username: 'hugo', color: '', colorName: '', isReady: true, isEliminated: false },
    ],
    messages: [],
    currentQuestion: 'q1',
    answers: [],
    votes: [],
    protectedPlayerId: null,
    discussionEndTime: null,
    questionEndTime: null,
    voteEndTime: null,
    maxPlayers: 8,
    minPlayers: 5,
    aiCount: 3,
    language: 'fr',
  };
  const posted: string[] = [];
  const answers: string[] = [];
  const votes: { voter: string; target: string }[] = [];
  const logs: string[] = [];
  const room: DirectorRoom = {
    state: () => state,
    history: () => [],
    postMessage: (id, text) => {
      posted.push(text);
      state.messages.push({ id: `m${state.messages.length}`, playerId: id, playerName: 'lucas', content: text, timestamp: clock.now(), phase: state.phase, round: state.currentRound });
      return true;
    },
    submitAnswer: (_id, text) => answers.push(`r${state.currentRound}:${state.phase}:${text}`),
    castVote: (voter, target) => votes.push({ voter, target }),
  };
  const rng = () => 0.5;
  const director = new BotDirector(room, { clock, rng, log: (l) => logs.push(l) });
  director.addBot(
    new Bot(
      { id: 'b1', name: 'lucas', role: 'ai', provider, pool: [provider], profile: { caseProfile: 'raw', dropFinalPeriodProb: 0, temperatureOffset: 0 }, responseStyle: 'quick', strategy: '{{CURRENT_GAME_SETUP}}', personality: 'You are lucas, a person.' },
      { llm: director.llmSink, speech: director.speechSink, rng }
    )
  );
  const enter = (phase: GameRoomState['phase']) => {
    state.phase = phase;
    if (phase === 'discussion') state.discussionEndTime = clock.now() + 100000;
  };
  return { clock, provider, state, director, posted, answers, votes, logs, enter };
}

const say = (message: string) => JSON.stringify({ shouldRespond: true, message });

await test('an answer from round 1 that returns during round 2 is never submitted', async () => {
  const { clock, provider, state, director, answers, enter } = setup();
  director.startQuestion(format);
  enter('discussion');
  director.startDiscussion();
  enter('voting');
  director.startVoting();
  enter('endround');
  director.stop();
  state.currentRound = 2;
  state.currentQuestion = 'q2';
  enter('question');
  director.startQuestion(format);
  const r2 = provider.pending.length - 1;
  provider.answer(0, 'vieille reponse');
  provider.answer(r2, 'nouvelle reponse');
  await clock.advance(20000);
  assert.deepEqual(answers, ['r2:question:nouvelle reponse']);
});

await test('a decision that returns after the vote opened is never posted', async () => {
  const { clock, provider, director, posted, enter } = setup();
  enter('discussion');
  director.startQuestion(format);
  director.startDiscussion();
  await clock.advance(5000);
  const idx = provider.pending.findIndex((p) => p.req.json);
  assert.ok(idx >= 0, 'a decision call was started by the tick');
  enter('voting');
  director.startVoting();
  provider.answer(idx, say('trop tard'));
  await clock.advance(30000);
  assert.deepEqual(posted, []);
});

await test('an accusation supersedes a pending decision; only the reply is posted', async () => {
  const { clock, provider, state, director, posted, enter } = setup();
  director.startQuestion(format);
  enter('discussion');
  director.startDiscussion();
  await clock.advance(5000);
  const first = provider.pending.findIndex((p) => p.req.json);
  const msg: GameMessage = { id: 'h-acc', playerId: 'h1', playerName: 'emma', content: "lucas t'es un bot ?", timestamp: clock.now(), phase: 'discussion', round: 1 };
  state.messages.push(msg);
  director.onPlayerMessage(msg, true);
  await clock.advance(800);
  const reply = provider.pending.findIndex((p, i) => i !== first && p.req.json && p.req.messages.some((m) => m.content.includes('just accused you')));
  assert.ok(reply >= 0, 'a direct decision was started within a second');
  provider.answer(first, say('ligne ordinaire'));
  provider.answer(reply, say('mdr non pourquoi moi'));
  await clock.advance(8000);
  assert.deepEqual(posted, ['mdr non pourquoi moi']);
});

await test('an accusation with no model answer gets a canned reply within the 6.5 s budget', async () => {
  const { clock, state, director, posted, logs, enter } = setup();
  director.startQuestion(format);
  enter('discussion');
  director.startDiscussion();
  const msg: GameMessage = { id: 'h-acc', playerId: 'h1', playerName: 'emma', content: "lucas t'es un bot ?", timestamp: clock.now(), phase: 'discussion', round: 1 };
  state.messages.push(msg);
  director.onPlayerMessage(msg, true);
  await clock.advance(7500);
  assert.equal(posted.length, 1);
  assert.ok(logs.some((l) => l.includes('"kind":"direct_fallback"') && l.includes('"reason":"budget"')));
});

await test('a provider that hangs past its timeout still yields a vote at the 25 s deadline, logged', async () => {
  const { clock, director, votes, logs, enter } = setup();
  director.startQuestion(format);
  enter('voting');
  director.startVoting();
  await clock.advance(24000);
  assert.equal(votes.length, 0);
  await clock.advance(2000);
  assert.equal(votes.length, 1);
  assert.ok(['h1', 'h2'].includes(votes[0].target));
  assert.ok(logs.some((l) => l.includes('"kind":"vote_fallback"') && l.includes('"reason":"deadline"')));
});

await test('dispose clears every timer and late results post nothing', async () => {
  const { clock, provider, director, posted, enter } = setup();
  director.startQuestion(format);
  enter('discussion');
  director.startDiscussion();
  await clock.advance(5000);
  director.dispose();
  assert.equal(director.pendingTimers(), 0);
  provider.pending.forEach((_, i) => provider.answer(i, say('apres la fin')));
  await clock.advance(60000);
  assert.deepEqual(posted, []);
  assert.equal(director.pendingTimers(), 0);
});

// ---- context: deterministic forgetting ----
const msgs: GameMessage[] = Array.from({ length: 60 }, (_, i) => ({
  id: `msg-${i}`,
  playerId: i % 7 === 0 ? 'b1' : i === 30 ? 'system' : `h${i % 3}`,
  playerName: i % 7 === 0 ? 'lucas' : `p${i % 3}`,
  content: i === 25 ? 'lucas tu dis quoi' : `ligne ${i}`,
  timestamp: i,
  phase: 'discussion',
  round: 1,
}));
const active = new Set(['b1', 'h0', 'h1', 'h2']);

await test('forgetting is stable from one call to the next', () => {
  const a = visibleMessages(msgs, { id: 'b1', name: 'lucas' }, active).map((m) => m.id);
  const b = visibleMessages([...msgs], { id: 'b1', name: 'lucas' }, active).map((m) => m.id);
  assert.deepEqual(a, b);
});

await test('never forgotten: last 3 lines, own lines, system lines, lines naming the bot', () => {
  const seen = new Set(visibleMessages(msgs, { id: 'b1', name: 'lucas' }, active).map((m) => m.id));
  const window = msgs.slice(-40);
  for (const m of window.slice(-3)) assert.ok(seen.has(m.id), `${m.id} (last 3)`);
  for (const m of window.filter((x) => x.playerId === 'b1' || x.playerId === 'system' || x.content.includes('lucas'))) assert.ok(seen.has(m.id), m.id);
  const forgettable = window.slice(0, -3).filter((x) => x.playerId !== 'b1' && x.playerId !== 'system' && !x.content.includes('lucas'));
  const forgotten = forgettable.filter((x) => !seen.has(x.id));
  assert.deepEqual(forgotten.map((x) => x.id), forgettable.filter((x) => stableBucket(x.id + 'b1') < 12).map((x) => x.id));
});

await test('context carries own previous answers and the previous-round summary', () => {
  const view: BotView = {
    now: 0,
    format,
    round: 2,
    phase: 'discussion',
    question: 'q2',
    answers: [],
    messages: [],
    activePlayerIds: active,
    botIds: new Set(['b1']),
    eliminatedNames: [],
    aiRemaining: 3,
    history: [{ round: 1, question: 'q1', answers: [{ playerId: 'b1', playerName: 'lucas', answer: 'la mer', timestamp: 0 }], votes: [{ voter: 'emma', target: 'hugo' }], eliminated: { name: 'hugo', isAI: false } }],
  };
  const ctx = buildGameContext(view, { id: 'b1', name: 'lucas', role: 'ai' });
  assert.ok(ctx.includes('Round 1 — "q1" → la mer'));
  assert.ok(ctx.includes('Eliminated: hugo (human)'));
  assert.ok(ctx.includes('emma → hugo'));
});

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) process.exit(1);
