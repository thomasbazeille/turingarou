/**
 * What a room collects from its humans to study the games: consent to serve as a style example, how each line was
 * entered, why they voted, their note on the game. Every value here comes from a client payload, so it is parsed, never trusted; none of it is ever part of a
 * state sent to clients.
 */

export interface StyleConsent {
  /** The player ticked the box: their lines may also serve the AIs as style examples. */
  styleExamples: boolean;
  /** Version of the home notice the player saw, as their client reports it. */
  notice: string | null;
}

/** How a human line reached the room: typed in the chat, or spoken in push-to-talk and transcribed. */
export interface LineInput {
  via: 'typed' | 'voice';
  /** Typed lines: something was pasted (or dropped) into the chat field for this line. */
  pasted?: boolean;
  /** Typed lines: from the first keystroke or paste to the send, as the client measured it; null when unknown. */
  typingMs?: number | null;
}

/** Longest typing time kept: past 10 minutes the field sat idle and the duration says nothing about typing. */
export const TYPING_MS_MAX = 10 * 60_000;

/** Why a human voted for someone, picked after the vote is sent. Optional, seen by nobody. */
export const VOTE_REASONS = ['too_fast', 'too_perfect', 'dodges', 'odd_tone', 'gut'] as const;
export type VoteReason = (typeof VOTE_REASONS)[number];

/** End-of-game note from 1 to 5, and what put the player on the trail. */
export interface GameFeedback {
  rating: number;
  clue: string | null;
}

export const CLUE_MAX_CHARS = 500;

export const NO_CONSENT: StyleConsent = { styleExamples: false, notice: null };

const NOTICE_RE = /^[\w.-]{1,32}$/;

/** Only an explicit `true` is an agreement: a missing, malformed or truthy-but-not-true value is a refusal. */
export function parseConsent(payload: unknown): StyleConsent {
  const p = (payload && typeof payload === 'object' ? payload : {}) as { styleConsent?: unknown; notice?: unknown };
  return {
    styleExamples: p.styleConsent === true,
    notice: typeof p.notice === 'string' && NOTICE_RE.test(p.notice) ? p.notice : null,
  };
}

export function parseVoteReason(value: unknown): VoteReason | null {
  return typeof value === 'string' && (VOTE_REASONS as readonly string[]).includes(value) ? (value as VoteReason) : null;
}

/** An integer note from 1 to 5; the clue is optional, trimmed, and refused past CLUE_MAX_CHARS (the field's own limit). */
export function parseFeedback(payload: unknown): GameFeedback | null {
  const p = (payload && typeof payload === 'object' ? payload : {}) as { rating?: unknown; clue?: unknown };
  const rating = p.rating;
  if (typeof rating !== 'number' || !Number.isInteger(rating) || rating < 1 || rating > 5) return null;
  if (p.clue !== undefined && p.clue !== null && typeof p.clue !== 'string') return null;
  const clue = typeof p.clue === 'string' ? p.clue.trim() : '';
  if (clue.length > CLUE_MAX_CHARS) return null;
  return { rating, clue: clue || null };
}

/** A typed line's signals as its client reported them: pasted only if exactly true, a duration within 0..TYPING_MS_MAX. */
export function parseTyping(payload: unknown): LineInput {
  const p = (payload && typeof payload === 'object' ? payload : {}) as { pasted?: unknown; typingMs?: unknown };
  const ms = p.typingMs;
  return {
    via: 'typed',
    pasted: p.pasted === true,
    typingMs: typeof ms === 'number' && Number.isFinite(ms) && ms >= 0 && ms <= TYPING_MS_MAX ? Math.round(ms) : null,
  };
}

/** Characters of a posted line, by code point: an emoji counts once, not as two UTF-16 halves. */
export function charCount(content: string): number {
  return [...String(content)].length;
}

/** Typing time per character of the line posted, in ms to one decimal; null when the time is unknown or the line empty. */
export function msPerChar(typingMs: number | null | undefined, content: string): number | null {
  const chars = charCount(content);
  if (typingMs == null || chars === 0) return null;
  return Math.round((typingMs / chars) * 10) / 10;
}
