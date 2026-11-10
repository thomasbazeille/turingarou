import type { TtsResult } from './providers.js';

/** LRU keyed by a (provider, voice, text) hash, bounded in total bytes. */
export class AudioCache {
  private readonly entries = new Map<string, TtsResult>();
  private bytes = 0;

  constructor(private readonly maxBytes: number) {}

  get(key: string): TtsResult | undefined {
    const hit = this.entries.get(key);
    if (hit) {
      this.entries.delete(key);
      this.entries.set(key, hit);
    }
    return hit;
  }

  set(key: string, value: TtsResult): void {
    if (value.audio.length > this.maxBytes) return;
    const previous = this.entries.get(key);
    if (previous) {
      this.bytes -= previous.audio.length;
      this.entries.delete(key);
    }
    this.entries.set(key, value);
    this.bytes += value.audio.length;
    for (const [oldKey, old] of this.entries) {
      if (this.bytes <= this.maxBytes) break;
      this.entries.delete(oldKey);
      this.bytes -= old.audio.length;
    }
  }

  get size(): number {
    return this.entries.size;
  }

  get totalBytes(): number {
    return this.bytes;
  }
}

/** Sliding-window budget per key: at most `limit` units (requests or characters) per `windowMs`. */
export class RateWindow {
  private readonly hits = new Map<string, { t: number; cost: number }[]>();
  private takes = 0;

  constructor(private readonly limit: number, private readonly windowMs: number, private readonly now: () => number = Date.now) {}

  take(key: string, cost = 1): boolean {
    const t = this.now();
    if (++this.takes % 500 === 0) this.sweep(t);
    const list = (this.hits.get(key) ?? []).filter((h) => t - h.t < this.windowMs);
    const used = list.reduce((sum, h) => sum + h.cost, 0);
    if (used + cost > this.limit) {
      this.hits.set(key, list);
      return false;
    }
    list.push({ t, cost });
    this.hits.set(key, list);
    return true;
  }

  private sweep(t: number): void {
    for (const [key, list] of this.hits) {
      if (list.every((h) => t - h.t >= this.windowMs)) this.hits.delete(key);
    }
  }
}
