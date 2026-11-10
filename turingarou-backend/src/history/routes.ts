/**
 * GET /admin/history/export — pseudonymized JSONL of finished games, read-only.
 *
 *   curl -sf -H "Authorization: Bearer $ADMIN_SECRET" \
 *     "https://<host>/admin/history/export?since=2026-01-01" -o data/history/corpus.jsonl
 *
 * Query: since (ISO, inclusive), until (ISO, exclusive), limit (≤ 10000). Disabled (503) while
 * ADMIN_SECRET is unset. A transfer cut mid-stream means the export failed: the socket is destroyed,
 * curl exits non-zero, nothing silently truncated.
 */

import { createHash, timingSafeEqual } from 'node:crypto';
import type { Express, NextFunction, Request, Response } from 'express';
import { getHistoryPool, type SqlPool } from './readonly.js';
import { streamGames, type GameQuery } from './reader.js';
import { makePseudonymizer, pseudonymizeGame, resolveSalt } from './pseudonymize.js';

export interface HistoryRouteOptions {
  /** Defaults to process.env.ADMIN_SECRET. */
  secret?: string | null;
  /** Defaults to resolveSalt(process.env). */
  salt?: string | null;
  /** Defaults to the read-only pool on DATABASE_URL. */
  pool?: SqlPool | null;
  rateLimit?: { max: number; windowMs: number };
  now?: () => number;
}

const MAX_LIMIT = 10000;

/** Compares SHA-256 digests with timingSafeEqual: neither the content nor the length of the secret leaks. */
export function tokenMatches(given: string | undefined, secret: string): boolean {
  if (!given || !secret) return false;
  const a = createHash('sha256').update(given).digest();
  const b = createHash('sha256').update(secret).digest();
  return timingSafeEqual(a, b);
}

function bearer(req: Request): string | undefined {
  const h = req.headers.authorization;
  if (!h || !h.startsWith('Bearer ')) return undefined;
  return h.slice('Bearer '.length).trim();
}

/** Fixed window per client address, failed and successful requests alike. */
function rateLimiter(max: number, windowMs: number, now: () => number) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return (req: Request, res: Response, next: NextFunction) => {
    const t = now();
    if (hits.size > 1000) for (const [k, v] of hits) if (v.resetAt <= t) hits.delete(k);
    const key = req.socket.remoteAddress ?? 'unknown';
    const entry = hits.get(key);
    if (!entry || entry.resetAt <= t) {
      hits.set(key, { count: 1, resetAt: t + windowMs });
      return next();
    }
    entry.count++;
    if (entry.count > max) {
      res.setHeader('Retry-After', String(Math.ceil((entry.resetAt - t) / 1000)));
      return res.status(429).json({ error: 'too many requests' });
    }
    next();
  };
}

function isoParam(v: unknown): string | undefined | null {
  if (v === undefined) return undefined;
  if (typeof v !== 'string' || Number.isNaN(Date.parse(v))) return null;
  return new Date(v).toISOString();
}

export function registerHistoryRoutes(app: Express, opts: HistoryRouteOptions = {}): void {
  const now = opts.now ?? Date.now;
  const { max, windowMs } = opts.rateLimit ?? { max: 10, windowMs: 10 * 60 * 1000 };

  app.get('/admin/history/export', rateLimiter(max, windowMs, now), async (req: Request, res: Response) => {
    const secret = opts.secret !== undefined ? opts.secret : process.env.ADMIN_SECRET ?? null;
    if (!secret) return res.status(503).json({ error: 'history export disabled: ADMIN_SECRET is not set' });
    if (!tokenMatches(bearer(req), secret)) return res.status(401).json({ error: 'unauthorized' });

    const pool = opts.pool !== undefined ? opts.pool : getHistoryPool();
    if (!pool) return res.status(503).json({ error: 'no database: DATABASE_URL is not set' });
    const salt = opts.salt !== undefined ? opts.salt : resolveSalt();
    if (!salt) return res.status(503).json({ error: 'no pseudonymization salt' });

    const since = isoParam(req.query.since);
    const until = isoParam(req.query.until);
    const limit = req.query.limit === undefined ? undefined : Number(req.query.limit);
    if (since === null || until === null || (limit !== undefined && !(Number.isInteger(limit) && limit > 0 && limit <= MAX_LIMIT))) {
      return res.status(400).json({ error: `bad query: since/until must be ISO dates, limit an integer in 1..${MAX_LIMIT}` });
    }
    const query: GameQuery = { since, until, limit: limit ?? MAX_LIMIT };

    const pz = makePseudonymizer(salt);
    let closed = false;
    res.on('close', () => {
      closed = true;
    });

    // Headers are only flushed by the first write: a failure before it still answers a clean 500.
    res.status(200);
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    let count = 0;
    try {
      count = await streamGames(pool, query, async (game) => {
        if (closed) return false;
        if (!res.write(JSON.stringify(pseudonymizeGame(game, pz)) + '\n')) {
          await new Promise<void>((resolve) => {
            res.once('drain', resolve);
            res.once('close', resolve);
          });
        }
        return !closed;
      });
    } catch (err) {
      console.error('[history-export] failed:', err instanceof Error ? err.message : err);
      if (!res.headersSent) {
        res.removeHeader('Content-Type');
        return res.status(500).json({ error: 'export failed' });
      }
      res.destroy(err instanceof Error ? err : new Error(String(err)));
      return;
    }
    console.log(`[history-export] games=${count}${closed ? ' (client closed)' : ''}`);
    res.end();
  });
}
