/**
 * What a room collects from its humans to study the games: consent to serve as a style example, how each line was
 * entered. Every value here comes from a client payload, so it is parsed, never trusted; none of it is ever part of a
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
}

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
