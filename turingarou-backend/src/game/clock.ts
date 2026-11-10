export type TimerHandle = unknown;

/** Time source of a room. Injected so a whole game can run in virtual time (scripts/simulate-game.ts). */
export interface Clock {
  now(): number;
  setTimeout(fn: () => void, ms: number): TimerHandle;
  clearTimeout(handle: TimerHandle): void;
}

export const systemClock: Clock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/** Every pending timer of one owner, so a phase change, an abort or the game end clears them all at once. */
export class Timers {
  private live = new Set<TimerHandle>();

  constructor(private readonly clock: Clock) {}

  after(ms: number, fn: () => void): TimerHandle {
    const handle: TimerHandle = this.clock.setTimeout(() => {
      this.live.delete(handle);
      fn();
    }, Math.max(0, ms));
    this.live.add(handle);
    return handle;
  }

  cancel(handle: TimerHandle | null | undefined): void {
    if (handle != null && this.live.delete(handle)) this.clock.clearTimeout(handle);
  }

  clearAll(): void {
    for (const handle of this.live) this.clock.clearTimeout(handle);
    this.live.clear();
  }

  get size(): number {
    return this.live.size;
  }
}
