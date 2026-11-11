import { strict as assert } from 'node:assert/strict';
import {
  answerTarget,
  botFloorWaitMs,
  cooldownMs,
  discussionDelay,
  firstMessageDelay,
  globalGapMs,
  groupPaceOf,
  makeSeededRng,
  paceOf,
  readingMs,
  reflectionMs,
  skipProbability,
  typingMs,
  voteDelay,
  type ResponseStyle,
} from '../src/game/humanTiming.js';

const failures: string[] = [];
let passed = 0;

function test(name: string, fn: () => void): void {
  try {
    fn();
    passed++;
    console.log(`✅ ${name}`);
  } catch (err) {
    failures.push(name);
    console.log(`❌ ${name}\n   ${err instanceof Error ? err.message : String(err)}`);
  }
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function draws(n: number, rng: () => number, f: () => number): number[] {
  return Array.from({ length: n }, () => f());
}

const STYLES: ResponseStyle[] = ['quick', 'thoughtful', 'random'];

// --- makeSeededRng ---

test('makeSeededRng: same seed → identical sequence', () => {
  const a = makeSeededRng(1234);
  const b = makeSeededRng(1234);
  const seqA = Array.from({ length: 10 }, () => a());
  const seqB = Array.from({ length: 10 }, () => b());
  assert.deepEqual(seqA, seqB);
});

test('makeSeededRng: different seeds → different sequence', () => {
  const a = makeSeededRng(1);
  const b = makeSeededRng(2);
  const seqA = Array.from({ length: 5 }, () => a());
  const seqB = Array.from({ length: 5 }, () => b());
  assert.notDeepEqual(seqA, seqB);
});

// --- typingMs ---

test('typingMs bounds [600, 7000] over 2000 draws', () => {
  const rng = makeSeededRng(10);
  const values = draws(2000, rng, () => typingMs((Math.random() * 300) | 0, rng));
  assert.ok(Math.min(...values) >= 600, `min ${Math.min(...values)} < 600`);
  assert.ok(Math.max(...values) <= 7000, `max ${Math.max(...values)} > 7000`);
});

test('typingMs grows with chars: median(10 chars) < median(150 chars)', () => {
  const rngA = makeSeededRng(11);
  const rngB = makeSeededRng(11);
  const medShort = median(draws(2000, rngA, () => typingMs(10, rngA)));
  const medLong = median(draws(2000, rngB, () => typingMs(150, rngB)));
  assert.ok(medShort < medLong, `median(10 chars)=${medShort} not < median(150 chars)=${medLong}`);
});

test('typingMs deterministic at fixed rng (chars=100, rng=0.5 → 3600)', () => {
  assert.equal(typingMs(100, () => 0.5), 3600);
});

// --- readingMs ---

test('readingMs exact formula (5 msgs, 100 chars → 1900)', () => {
  assert.equal(readingMs(5, 100), 1900);
});

test('readingMs caps at 2500', () => {
  assert.equal(readingMs(100, 5000), 2500);
  assert.equal(readingMs(20, 200), 2500);
  assert.ok(readingMs(2, 100) < 2500, `readingMs(2, 100)=${readingMs(2, 100)} should be uncapped`);
});

test('readingMs bounds [0, 2500] over varied inputs', () => {
  const rng = makeSeededRng(12);
  const values = draws(2000, rng, () => readingMs((rng() * 30) | 0, (rng() * 4000) | 0));
  assert.ok(Math.min(...values) >= 0, `min ${Math.min(...values)} < 0`);
  assert.ok(Math.max(...values) <= 2500, `max ${Math.max(...values)} > 2500`);
});

// --- reflectionMs ---

test('reflectionMs quick bounds [300, 900] over 2000 draws', () => {
  const rng = makeSeededRng(20);
  const values = draws(2000, rng, () => reflectionMs('quick', rng));
  assert.ok(Math.min(...values) >= 300 && Math.max(...values) < 900, `[${Math.min(...values)}, ${Math.max(...values)}]`);
});

test('reflectionMs thoughtful bounds [1000, 2400] over 2000 draws', () => {
  const rng = makeSeededRng(21);
  const values = draws(2000, rng, () => reflectionMs('thoughtful', rng));
  assert.ok(Math.min(...values) >= 1000 && Math.max(...values) < 2400, `[${Math.min(...values)}, ${Math.max(...values)}]`);
});

test('reflectionMs random bounds [600, 2000] over 2000 draws', () => {
  const rng = makeSeededRng(22);
  const values = draws(2000, rng, () => reflectionMs('random', rng));
  assert.ok(Math.min(...values) >= 600 && Math.max(...values) < 2000, `[${Math.min(...values)}, ${Math.max(...values)}]`);
});

// --- discussionDelay ---

test('discussionDelay normal path exact (rng=0.5 → 3960)', () => {
  const d = discussionDelay(
    { triggerAt: 1000, now: 1000, newMsgCount: 2, newChars: 100, replyChars: 50, style: 'quick' },
    () => 0.5,
  );
  assert.equal(d, 3960);
});

test('discussionDelay direct path exact (rng=0.5 → 3460)', () => {
  const d = discussionDelay(
    { triggerAt: 1000, now: 1000, newMsgCount: 2, newChars: 100, replyChars: 50, style: 'quick', direct: true },
    () => 0.5,
  );
  assert.equal(d, 3460);
});

test('discussionDelay catch-up exact (now past target+5000, rng=0.5 → 575)', () => {
  const d = discussionDelay(
    { triggerAt: 1000, now: 10000, newMsgCount: 2, newChars: 100, replyChars: 50, style: 'quick' },
    () => 0.5,
  );
  assert.equal(d, 575);
});

test('discussionDelay absorbs LLM latency: later now → smaller or equal delay (200 draws)', () => {
  let worse = 0;
  for (let i = 0; i < 200; i++) {
    const base = { triggerAt: 0, newMsgCount: 5, newChars: 800, replyChars: 120, style: 'thoughtful' as ResponseStyle };
    const early = discussionDelay({ ...base, now: 200 }, makeSeededRng(1000 + i));
    const late = discussionDelay({ ...base, now: 2500 }, makeSeededRng(1000 + i));
    if (late > early) worse++;
  }
  assert.equal(worse, 0, `${worse}/200 cases where a later now gave a larger delay`);
});

test('discussionDelay never below 250 over 2000 varied draws', () => {
  const rng = makeSeededRng(30);
  let min = Infinity;
  for (let i = 0; i < 2000; i++) {
    const triggerAt = i * 1000;
    const d = discussionDelay(
      {
        triggerAt,
        now: triggerAt + (i % 7) * 1500,
        newMsgCount: i % 6,
        newChars: (i * 37) % 900,
        replyChars: (i * 53) % 220,
        style: STYLES[i % 3],
        direct: i % 5 === 0,
      },
      rng,
    );
    min = Math.min(min, d);
  }
  assert.ok(min >= 250, `min delay ${min} < 250`);
});

test('discussionDelay never above 8000 over 2000 varied draws', () => {
  const rng = makeSeededRng(31);
  let max = -Infinity;
  for (let i = 0; i < 2000; i++) {
    const triggerAt = i * 500;
    const d = discussionDelay(
      {
        triggerAt,
        now: triggerAt + (i % 3) * 200,
        newMsgCount: i % 8,
        newChars: (i * 91) % 2000,
        replyChars: (i * 29) % 250,
        style: STYLES[i % 3],
      },
      rng,
    );
    max = Math.max(max, d);
  }
  assert.ok(max <= 8000, `max delay ${max} > 8000`);
});

test('discussionDelay catch-up branch in [250, 900) when now > target+5000 (200 draws)', () => {
  const rng = makeSeededRng(32);
  for (let i = 0; i < 200; i++) {
    const d = discussionDelay(
      {
        triggerAt: 0,
        now: 20000,
        newMsgCount: i % 10,
        newChars: (i * 101) % 3000,
        replyChars: (i * 17) % 200,
        style: STYLES[i % 3],
      },
      rng,
    );
    assert.ok(d >= 250 && d < 900, `catch-up delay ${d} outside [250, 900)`);
  }
});

test('discussionDelay direct median < normal median for same input (1000 draws each)', () => {
  const input = { triggerAt: 0, now: 0, newMsgCount: 5, newChars: 800, replyChars: 150, style: 'thoughtful' as ResponseStyle };
  const normal: number[] = [];
  const direct: number[] = [];
  for (let i = 0; i < 1000; i++) {
    normal.push(discussionDelay(input, makeSeededRng(5000 + i)));
    direct.push(discussionDelay({ ...input, direct: true }, makeSeededRng(5000 + i)));
  }
  const medNormal = median(normal);
  const medDirect = median(direct);
  assert.ok(medDirect < medNormal, `direct median ${medDirect} not < normal median ${medNormal}`);
});

// --- firstMessageDelay ---

test('firstMessageDelay bounds [3000, 22000] over 2000 draws', () => {
  const rng = makeSeededRng(40);
  const values = draws(2000, rng, () => firstMessageDelay(rng));
  assert.ok(Math.min(...values) >= 3000, `min ${Math.min(...values)} < 3000`);
  assert.ok(Math.max(...values) <= 22000, `max ${Math.max(...values)} > 22000`);
});

test('firstMessageDelay median in [7000, 11000] over 2000 draws', () => {
  const rng = makeSeededRng(41);
  const med = median(draws(2000, rng, () => firstMessageDelay(rng)));
  assert.ok(med >= 7000 && med <= 11000, `median ${med.toFixed(0)} outside [7000, 11000]`);
});

// --- voteDelay ---

test('voteDelay bounds [800, 20000] over 2000 draws', () => {
  const rng = makeSeededRng(50);
  const values = draws(2000, rng, () => voteDelay(rng));
  assert.ok(Math.min(...values) >= 800, `min ${Math.min(...values)} < 800`);
  assert.ok(Math.max(...values) <= 20000, `max ${Math.max(...values)} > 20000`);
});

test('voteDelay share below 2500 in [0.10, 0.20]', () => {
  const rng = makeSeededRng(51);
  const values = draws(2000, rng, () => voteDelay(rng));
  const share = values.filter((v) => v < 2500).length / values.length;
  assert.ok(share >= 0.10 && share <= 0.20, `share ${share.toFixed(3)} outside [0.10, 0.20]`);
});

test('voteDelay share above 9000 in [0.20, 0.30]', () => {
  const rng = makeSeededRng(52);
  const values = draws(2000, rng, () => voteDelay(rng));
  const share = values.filter((v) => v > 9000).length / values.length;
  assert.ok(share >= 0.20 && share <= 0.30, `share ${share.toFixed(3)} outside [0.20, 0.30]`);
});

// --- answerTarget ---

test('answerTarget bounds [5000, 17000] over 2000 draws', () => {
  const rng = makeSeededRng(60);
  const values = draws(2000, rng, () => answerTarget(rng));
  assert.ok(Math.min(...values) >= 5000, `min ${Math.min(...values)} < 5000`);
  assert.ok(Math.max(...values) < 17000, `max ${Math.max(...values)} >= 17000`);
});

// --- skipProbability ---

test('skipProbability exact values (quick 0.10, thoughtful 0.35, random 0.25)', () => {
  assert.equal(skipProbability('quick'), 0.10);
  assert.equal(skipProbability('thoughtful'), 0.35);
  assert.equal(skipProbability('random'), 0.25);
});

// --- cooldownMs ---

test('cooldownMs lastWasShort bounds [3000, 6000] over 2000 draws (all styles)', () => {
  const rng = makeSeededRng(70);
  const values = draws(2000, rng, () => cooldownMs(STYLES[(rng() * 3) | 0], true, rng));
  assert.ok(Math.min(...values) >= 3000, `min ${Math.min(...values)} < 3000`);
  assert.ok(Math.max(...values) < 6000, `max ${Math.max(...values)} >= 6000`);
});

test('cooldownMs quick bounds [6000, 10000] over 2000 draws', () => {
  const rng = makeSeededRng(71);
  const values = draws(2000, rng, () => cooldownMs('quick', false, rng));
  assert.ok(Math.min(...values) >= 6000 && Math.max(...values) < 10000, `[${Math.min(...values)}, ${Math.max(...values)}]`);
});

test('cooldownMs thoughtful bounds [12000, 20000] over 2000 draws', () => {
  const rng = makeSeededRng(72);
  const values = draws(2000, rng, () => cooldownMs('thoughtful', false, rng));
  assert.ok(Math.min(...values) >= 12000 && Math.max(...values) < 20000, `[${Math.min(...values)}, ${Math.max(...values)}]`);
});

test('cooldownMs random bounds [8000, 15000] over 2000 draws', () => {
  const rng = makeSeededRng(73);
  const values = draws(2000, rng, () => cooldownMs('random', false, rng));
  assert.ok(Math.min(...values) >= 8000 && Math.max(...values) < 15000, `[${Math.min(...values)}, ${Math.max(...values)}]`);
});

// --- pace regulator (share of the talk vs 1/n) ---

test('paceOf: under 1/n → under, above → over, at 1/n → balanced (8 players, 20 lines)', () => {
  assert.equal(paceOf(0, 20, 8), 'under');
  assert.equal(paceOf(1, 20, 8), 'under');
  assert.equal(paceOf(2, 20, 8), 'balanced');
  assert.equal(paceOf(3, 20, 8), 'over');
  assert.equal(paceOf(6, 20, 8), 'over');
});

test('paceOf: an empty or near-empty chat pushes nobody to talk, one line of four is already over', () => {
  assert.equal(paceOf(0, 0, 8), 'balanced');
  assert.equal(paceOf(0, 4, 8), 'balanced');
  assert.equal(paceOf(1, 4, 8), 'over');
});

test('paceOf: the fair share grows when players are eliminated (3 lines of 20: over at 8 players, balanced at 6)', () => {
  assert.equal(paceOf(3, 20, 8), 'over');
  assert.equal(paceOf(3, 20, 6), 'balanced');
});

test('skipProbability and cooldownMs: under < balanced < over for every style', () => {
  for (const style of ['quick', 'thoughtful', 'random'] as ResponseStyle[]) {
    assert.ok(skipProbability(style, 'under') < skipProbability(style, 'balanced'), `${style} skip under`);
    assert.ok(skipProbability(style, 'balanced') < skipProbability(style, 'over'), `${style} skip over`);
    assert.ok(skipProbability(style, 'over') >= 0.85, `${style} over skips most ticks`);
    for (const short of [true, false]) {
      const at = (pace: 'under' | 'balanced' | 'over') => cooldownMs(style, short, () => 0.5, pace);
      assert.ok(at('under') < at('balanced') && at('balanced') < at('over'), `${style} cooldown short=${short}`);
    }
  }
});

test('groupPaceOf: 3 bots of 8 players own 3/8 of the lines when balanced', () => {
  assert.equal(groupPaceOf(7, 20, 8, 3), 'balanced');
  assert.equal(groupPaceOf(4, 20, 8, 3), 'under');
  assert.equal(groupPaceOf(10, 20, 8, 3), 'over');
});

test('botFloorWaitMs: 2 bot lines in 10 s hold a third, unless the bots as a group are under their share', () => {
  const r = () => 0.5;
  assert.equal(botFloorWaitMs(10000, 6000, [4000, 6000], 'under', r), 0);
  assert.equal(botFloorWaitMs(10000, 6000, [4000, 6000], 'balanced', r), 4000 + 300);
});

test('botFloorWaitMs: the gap after any bot line is 1.5x longer while the bots are over their share', () => {
  const r = () => 0.5;
  assert.equal(botFloorWaitMs(10000, 6000, [6000], 'balanced', r), 0);
  assert.equal(botFloorWaitMs(10000, 6000, [6000], 'over', r), 3250 * 1.5 - 4000 + 300);
});

// --- globalGapMs ---

test('globalGapMs bounds [2500, 4000] over 2000 draws', () => {
  const rng = makeSeededRng(80);
  const values = draws(2000, rng, () => globalGapMs(rng));
  assert.ok(Math.min(...values) >= 2500, `min ${Math.min(...values)} < 2500`);
  assert.ok(Math.max(...values) < 4000, `max ${Math.max(...values)} >= 4000`);
});

console.log(`\n${passed} passed, ${failures.length} failed, ${passed + failures.length} total`);
if (failures.length > 0) {
  console.error(`Failed cases: ${failures.join(' | ')}`);
  process.exit(1);
}
