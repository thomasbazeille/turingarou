export type ResponseStyle = 'quick' | 'thoughtful' | 'random';

export interface DiscussionDelayInput {
  triggerAt: number;
  now: number;
  newMsgCount: number;
  newChars: number;
  replyChars: number;
  style: ResponseStyle;
  direct?: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function uniform(min: number, max: number, rng: () => number): number {
  return min + rng() * (max - min);
}

export function typingMs(chars: number, rng: () => number = Math.random): number {
  return clamp((400 + 32 * chars) * (0.85 + 0.3 * rng()), 600, 7000);
}

export function readingMs(newMsgCount: number, newChars: number): number {
  return Math.min(2500, 180 * newMsgCount + 10 * newChars);
}

export function reflectionMs(style: ResponseStyle, rng: () => number = Math.random): number {
  if (style === 'quick') return uniform(300, 900, rng);
  if (style === 'thoughtful') return uniform(1000, 2400, rng);
  return uniform(600, 2000, rng);
}

// The LLM call already consumed now - triggerAt ms: that latency is absorbed
// into the target, never added on top. If we are more than 5s past the target,
// answer immediately, like a human catching up on the tab.
export function discussionDelay(input: DiscussionDelayInput, rng: () => number = Math.random): number {
  const read = readingMs(input.newMsgCount, input.newChars);
  const typing = typingMs(input.replyChars, rng);
  let target: number;
  if (input.direct) {
    target = input.triggerAt + Math.min(4000, read + 500 + 0.8 * typing);
  } else {
    target = input.triggerAt + read + reflectionMs(input.style, rng) + typing;
  }
  if (input.now > target + 5000) {
    return 250 + rng() * 650;
  }
  return clamp(target - input.now, 250, 8000);
}

export function firstMessageDelay(rng: () => number = Math.random): number {
  const u1 = Math.max(rng(), 1e-12);
  const u2 = rng();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return clamp(Math.exp(Math.log(9000) + 0.55 * z), 3000, 22000);
}

export function voteDelay(rng: () => number = Math.random): number {
  const branch = rng();
  if (branch < 0.15) return uniform(800, 2500, rng);
  if (branch < 0.75) return uniform(2500, 9000, rng);
  return uniform(9000, 20000, rng);
}

export function answerTarget(rng: () => number = Math.random): number {
  return uniform(5000, 17000, rng);
}

/**
 * A bot's share of the talk against its fair share 1/n (Time to Talk, arXiv 2506.05309: an agent held to 1/n was
 * spotted at chance; unregulated AIs post 60-95 % of a group chat). Measured on the last PACE_WINDOW_LINES lines of the
 * current discussion (all of it while shorter), n = players still in the game.
 */
export type Pace = 'under' | 'balanced' | 'over';
export const PACE_WINDOW_LINES = 20;
/** Below this many lines nobody is "under": an empty chat would push every bot to open at once. */
const PACE_MIN_LINES = 5;
const PACE_LOW = 0.8;
const PACE_HIGH = 1.15;

export function paceOf(own: number, total: number, players: number): Pace {
  if (total === 0 || players <= 0) return 'balanced';
  const ratio = (own * players) / total;
  if (own >= 1 && ratio > PACE_HIGH) return 'over';
  if (total >= PACE_MIN_LINES && ratio < PACE_LOW) return 'under';
  return 'balanced';
}

export function skipProbability(style: ResponseStyle, pace: Pace = 'balanced'): number {
  const base = style === 'quick' ? 0.10 : style === 'thoughtful' ? 0.35 : 0.25;
  if (pace === 'under') return base * 0.3;
  if (pace === 'over') return 0.85 + 0.1 * base;
  return base;
}

export function cooldownMs(style: ResponseStyle, lastWasShort: boolean, rng: () => number = Math.random, pace: Pace = 'balanced'): number {
  const scale = pace === 'under' ? 0.6 : pace === 'over' ? 2 : 1;
  if (lastWasShort) return scale * uniform(3000, 6000, rng);
  if (style === 'quick') return scale * uniform(6000, 10000, rng);
  if (style === 'thoughtful') return scale * uniform(12000, 20000, rng);
  return scale * uniform(8000, 15000, rng);
}

export function globalGapMs(rng: () => number = Math.random): number {
  return uniform(2500, 4000, rng);
}

export function makeSeededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
