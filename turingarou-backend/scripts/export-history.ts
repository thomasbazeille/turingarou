/**
 * export-history.ts — pseudonymized JSONL export of finished games, read straight from Postgres (read-only).
 * The alternative to GET /admin/history/export when you hold the database URL yourself.
 *
 *   export DATABASE_URL=...            # see CLAUDE.md « Prod database — read-only »
 *   npx tsx scripts/export-history.ts [--since 2026-01-01] [--until ISO] [--limit N]
 *                                     [--out data/history/corpus.jsonl] [--telemetry railway.log]
 *
 * --telemetry: a file of `[game-telemetry] {...}` lines (railway logs | grep game-telemetry) — fills each
 * AI's provider, which the database does not hold.
 * Salt: HISTORY_PSEUDONYM_SALT, else derived from ADMIN_SECRET, else a random one kept in
 * data/history/.pseudonym-salt. The output must land in a git-ignored path: the script refuses otherwise.
 */

import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { createReadOnlyPool } from '../src/history/readonly.js';
import { streamGames } from '../src/history/reader.js';
import { makePseudonymizer, pseudonymizeGame, resolveSalt } from '../src/history/pseudonymize.js';
import { applyProviders, parseTelemetry } from '../src/history/telemetry.js';

dotenv.config();

const args = process.argv.slice(2);
const arg = (flag: string): string | undefined => {
  const eq = args.find((a) => a.startsWith(`--${flag}=`));
  if (eq) return eq.slice(flag.length + 3);
  const i = args.indexOf(`--${flag}`);
  return i !== -1 ? args[i + 1] : undefined;
};

const DATA_DIR = path.resolve('data/history');

function saltOrLocal(): string {
  const env = resolveSalt();
  if (env) return env;
  const file = path.join(DATA_DIR, '.pseudonym-salt');
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8').trim();
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const salt = randomBytes(32).toString('hex');
  fs.writeFileSync(file, salt + '\n', { mode: 0o600 });
  console.error(`No HISTORY_PSEUDONYM_SALT/ADMIN_SECRET: new local salt in ${path.relative(process.cwd(), file)}`);
  return salt;
}

/** true when the path is ignored by git, or outside any git work tree. */
function isGitIgnored(file: string): boolean {
  try {
    execFileSync('git', ['check-ignore', '-q', file], { stdio: 'ignore' });
    return true;
  } catch (err: any) {
    if (err?.status === 1) return false;
    return true;
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set. See CLAUDE.md « Prod database (Railway Postgres) — read-only ».');
    process.exit(1);
  }
  const out = path.resolve(arg('out') ?? path.join(DATA_DIR, 'corpus.jsonl'));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  if (!isGitIgnored(out)) {
    console.error(`Refusing to write player data to ${out}: not git-ignored. Use data/history/ (ignored).`);
    process.exit(1);
  }
  const since = arg('since');
  const until = arg('until');
  const limit = arg('limit') ? Number(arg('limit')) : undefined;
  const telemetryFile = arg('telemetry');
  const telemetry = telemetryFile ? parseTelemetry(fs.readFileSync(telemetryFile, 'utf8')) : null;

  const pz = makePseudonymizer(saltOrLocal());
  const pool = createReadOnlyPool(process.env.DATABASE_URL, 1);
  const tmp = `${out}.part`;
  const stream = fs.createWriteStream(tmp);
  let withProvider = 0;
  try {
    const n = await streamGames(pool, { since, until, limit }, async (game) => {
      const enriched = telemetry ? applyProviders(game, telemetry) : game;
      if (enriched !== game) withProvider++;
      if (!stream.write(JSON.stringify(pseudonymizeGame(enriched, pz)) + '\n')) {
        await new Promise<void>((r) => stream.once('drain', () => r()));
      }
    });
    await new Promise<void>((resolve, reject) => stream.end((err?: Error | null) => (err ? reject(err) : resolve())));
    fs.renameSync(tmp, out);
    console.log(`${n} games → ${path.relative(process.cwd(), out)}${telemetry ? ` (provider known for ${withProvider})` : ''}`);
  } catch (err) {
    stream.destroy();
    fs.rmSync(tmp, { force: true });
    throw err;
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('export failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
