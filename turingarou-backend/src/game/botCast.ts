import { AIStyleProfile, drawStyleProfile } from './aiSpeech.js';
import type { CaseProfile } from './formGate.js';
import type { ResponseStyle } from './humanTiming.js';

/** How a player takes part in the chat. Agents given distinct role styles matched humans (arXiv 2310.18940). */
export type ConversationRole = 'follower' | 'contributor' | 'accuser' | 'joker';

export interface CastMember {
  responseStyle: ResponseStyle;
  conversationRole: ConversationRole;
  profile: AIStyleProfile;
}

const STYLES: readonly ResponseStyle[] = ['quick', 'thoughtful', 'random'];
const ROLES: readonly ConversationRole[] = ['follower', 'contributor', 'accuser', 'joker'];
const CASES: readonly CaseProfile[] = ['lower', 'sentence', 'raw'];
const LENGTHS: readonly number[] = [10, 16, 25];

function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * The AIs of one game, drawn so that no two share a response style, a conversational role, a case habit, a length
 * habit or a spelling habit ("jsp" from two players reads as one author). A persona lifts GPT-4.5 from 36 % to 73 %
 * judged human (arXiv 2503.23674); limited diversity across AIs is cited as a tell (arXiv 2511.08592). Every game draws
 * anew; past three AIs the lists cycle.
 */
export function drawCast(count: number, rng: () => number = Math.random): CastMember[] {
  const styles = shuffle(STYLES, rng);
  const roles = shuffle(ROLES, rng);
  const cases = shuffle(CASES, rng);
  const lengths = shuffle(LENGTHS, rng);
  const taken = new Set<string>();
  const cast: CastMember[] = [];
  for (let i = 0; i < count; i++) {
    const profile = drawStyleProfile(rng, taken);
    for (const [, to] of profile.rewrites ?? []) taken.add(to);
    profile.caseProfile = cases[i % cases.length];
    profile.maxWords = lengths[i % lengths.length];
    cast.push({ responseStyle: styles[i % styles.length], conversationRole: roles[i % roles.length], profile });
  }
  return cast;
}

/** One personality template per cast member, of its response style, never the same template twice while any is left. */
export function templatesFor<T extends { responseStyle: ResponseStyle }>(templates: readonly T[], cast: readonly CastMember[], rng: () => number = Math.random): T[] {
  const left = shuffle(templates, rng);
  return cast.map((m) => {
    const idx = left.findIndex((t) => t.responseStyle === m.responseStyle);
    if (idx >= 0) return left.splice(idx, 1)[0];
    return left.length > 0 ? left.splice(0, 1)[0] : templates[Math.floor(rng() * templates.length)];
  });
}
