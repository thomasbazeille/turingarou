import { Clock, TimerHandle } from './clock.js';
import type { StyleConsent } from './measures.js';

/**
 * A 1-on-1 duel: one human against another when one is already waiting, against an AI otherwise. Both openings
 * build the same kind of room (table `duel`), and what a player is matched against must stay unreadable until the
 * reveal — the waiting time included. Each candidate draws a wait in [DUEL_MIN_WAIT_MS, DUEL_MATCH_WAIT_MS]; with
 * nobody to pair, their AI duel opens at its end. A second candidate pairs with a waiting one only if that wait
 * still has DUEL_MIN_WAIT_MS to run, and the pair opens when the first one's wait ends: the first waits exactly what
 * an AI duel would have made them wait, the second at least DUEL_MIN_WAIT_MS, at most DUEL_MATCH_WAIT_MS.
 */
export const DUEL_MIN_WAIT_MS = 2000;
export const DUEL_MATCH_WAIT_MS = 8000;

/** A candidate of the duel queue, as their joinDuel packet and home screen answered it. */
export interface DuelCandidate {
  socketId: string;
  username: string;
  language?: 'fr' | 'en';
  consent: StyleConsent;
}

export interface DuelQueueDeps {
  clock: Clock;
  log: (line: string) => void;
  /** Opens one duel room for these candidates, in order, with an AI opponent when alone. */
  open: (candidates: DuelCandidate[], vsAI: boolean) => Promise<void>;
  /** In [0, 1): the draw of each wait. Math.random unless a test fixes it. */
  random?: () => number;
}

/** A candidate alone in the queue, until their own drawn deadline hands them an AI. */
interface Waiting {
  cand: DuelCandidate;
  deadline: number;
  timer: TimerHandle;
}

/** Candidates matched, waiting for the first one's deadline; one left alone by a departure gets an AI. */
interface Pairing {
  cands: DuelCandidate[];
  timer: TimerHandle | null;
}

export class DuelQueue {
  private waiting: Waiting[] = [];
  private pairings = new Set<Pairing>();

  constructor(private readonly deps: DuelQueueDeps) {}

  /** A candidate asks for a duel: paired with a waiting one whose wait still runs long enough, else waits alone. */
  async join(candidate: DuelCandidate): Promise<void> {
    if (this.isQueued(candidate.socketId)) return;
    const { clock } = this.deps;
    const now = clock.now();
    const first = this.waiting.find((w) => w.deadline - now >= DUEL_MIN_WAIT_MS);
    if (first) {
      clock.clearTimeout(first.timer);
      this.waiting = this.waiting.filter((w) => w !== first);
      const pairing: Pairing = { cands: [first.cand, candidate], timer: null };
      pairing.timer = clock.setTimeout(() => {
        this.pairings.delete(pairing);
        if (pairing.cands.length > 0) void this.deps.open(pairing.cands, pairing.cands.length === 1);
      }, first.deadline - now);
      this.pairings.add(pairing);
      return;
    }
    const draw = (this.deps.random ?? Math.random)();
    const wait = DUEL_MIN_WAIT_MS + Math.floor(draw * (DUEL_MATCH_WAIT_MS - DUEL_MIN_WAIT_MS + 1));
    const entry: Waiting = { cand: candidate, deadline: now + wait, timer: null };
    entry.timer = clock.setTimeout(() => {
      this.waiting = this.waiting.filter((w) => w !== entry);
      void this.deps.open([candidate], true);
    }, wait);
    this.waiting.push(entry);
  }

  /** The candidate gave up (page closed, home again): no game opens for them; a partner left alone gets an AI. */
  leave(socketId: string): void {
    const alone = this.waiting.find((w) => w.cand.socketId === socketId);
    if (alone) {
      this.deps.clock.clearTimeout(alone.timer);
      this.waiting = this.waiting.filter((w) => w !== alone);
      return;
    }
    for (const p of this.pairings) {
      if (!p.cands.some((c) => c.socketId === socketId)) continue;
      p.cands = p.cands.filter((c) => c.socketId !== socketId);
      if (p.cands.length === 0) {
        this.deps.clock.clearTimeout(p.timer);
        this.pairings.delete(p);
      }
    }
  }

  private isQueued(socketId: string): boolean {
    if (this.waiting.some((w) => w.cand.socketId === socketId)) return true;
    for (const p of this.pairings) if (p.cands.some((c) => c.socketId === socketId)) return true;
    return false;
  }
}
