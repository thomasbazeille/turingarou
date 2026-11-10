/**
 * Read-only access to the game database. The prod database is never written by this module:
 * every unit of work runs inside `BEGIN READ ONLY`, and pools created here also set
 * `default_transaction_read_only` on each connection, so a stray write fails in Postgres itself.
 */

import pg from 'pg';

/** The slice of pg.PoolClient this module uses — small enough to fake in tests. */
export interface SqlClient {
  query<R extends Record<string, any> = Record<string, any>>(text: string, values?: unknown[]): Promise<{ rows: R[] }>;
  release(err?: Error | boolean): void;
}

export interface SqlPool {
  connect(): Promise<SqlClient>;
}

export const BEGIN_READ_ONLY = 'BEGIN READ ONLY';
const STATEMENT_TIMEOUT = "SET LOCAL statement_timeout = '15s'";

export async function withReadOnly<T>(pool: SqlPool, fn: (client: SqlClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  let broken: Error | undefined;
  try {
    await client.query(BEGIN_READ_ONLY);
    await client.query(STATEMENT_TIMEOUT);
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      broken = rollbackErr instanceof Error ? rollbackErr : new Error(String(rollbackErr));
    }
    throw err;
  } finally {
    client.release(broken);
  }
}

export function createReadOnlyPool(connectionString: string, max = 2): pg.Pool {
  return new pg.Pool({
    connectionString,
    max,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
    options: '-c default_transaction_read_only=on',
  });
}

// Lazy, like GameLogger: ESM imports run before server.ts calls dotenv.config().
let _pool: pg.Pool | null | undefined;

/** Small dedicated pool on DATABASE_URL so a history export never starves the game's own writes. */
export function getHistoryPool(): pg.Pool | null {
  if (_pool !== undefined) return _pool;
  _pool = process.env.DATABASE_URL ? createReadOnlyPool(process.env.DATABASE_URL) : null;
  return _pool;
}
