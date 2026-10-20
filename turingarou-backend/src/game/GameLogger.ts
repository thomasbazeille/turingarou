/**
 * GameLogger — persistance Postgres des parties et profils humains.
 *
 * Base : DATABASE_URL (Postgres Railway en prod). Sans DATABASE_URL, rien n'est
 * persisté et le jeu tourne quand même — c'est le mode dev local par défaut.
 *
 * Tables :
 *   games           — une ligne par partie
 *   game_players    — joueurs de la partie
 *   round_questions — question posée par round
 *   round_answers   — réponses aux questions
 *   round_votes     — votes par round
 *   messages        — messages de discussion
 *   human_profiles  — profil cumulé par username
 */

import pg from 'pg';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RoundVote {
  voter: string;
  target: string;
}

export interface RoundLog {
  round: number;
  question: string;
  answers: { player: string; type: string; answer: string }[];
  votes: RoundVote[];
  eliminated?: { name: string; isAI: boolean } | null;
}

export interface PlayerLog {
  id: string;
  name: string;
  type: 'human' | 'ai' | 'inspector';
  strategy?: string;
  eliminated: boolean;
  eliminatedRound?: number;
}

export interface MessageLog {
  round: number;
  player: string;
  type: string;
  content: string;
  timestamp: number;
}

export interface GameLogData {
  gameId: string;
  date: string;
  language: 'fr' | 'en';
  result: 'humans_win' | 'ai_win' | 'draw';
  players: PlayerLog[];
  rounds: RoundLog[];
  messages: MessageLog[];
}

// ─── DB pool ──────────────────────────────────────────────────────────────────

// Créé à la première utilisation, pas à l'import : les imports ESM sont évalués
// avant le dotenv.config() de server.ts, DATABASE_URL n'y est pas encore lu.
let _pool: pg.Pool | null | undefined;

function getPool(): pg.Pool | null {
  if (_pool !== undefined) return _pool;
  _pool = process.env.DATABASE_URL
    ? new pg.Pool({
        connectionString: process.env.DATABASE_URL,
        max: 5,
        connectionTimeoutMillis: 10000,
        idleTimeoutMillis: 30000,
      })
    : null;
  return _pool;
}

export function isDBEnabled(): boolean {
  return getPool() !== null;
}

async function inTransaction(pool: pg.Pool, fn: (client: pg.PoolClient) => Promise<void>): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await fn(client);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function initDB(): Promise<void> {
  const pool = getPool();
  if (!pool) {
    console.log('[GameLogger] No DATABASE_URL — games will not be persisted');
    return;
  }

  // Les unicités sur du texte libre passent par md5() : un index btree sur le
  // texte brut refuse les lignes de plus de ~2,7 Ko, et l'erreur annulerait
  // toute la transaction de la partie.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS games (
      game_id     TEXT PRIMARY KEY,
      date        TEXT NOT NULL,
      language    TEXT NOT NULL,
      result      TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS game_players (
      id               SERIAL PRIMARY KEY,
      game_id          TEXT NOT NULL REFERENCES games(game_id),
      player_name      TEXT NOT NULL,
      player_type      TEXT NOT NULL,
      strategy         TEXT,
      eliminated       INTEGER NOT NULL DEFAULT 0,
      eliminated_round INTEGER
    );

    CREATE TABLE IF NOT EXISTS round_questions (
      id        SERIAL PRIMARY KEY,
      game_id   TEXT NOT NULL REFERENCES games(game_id),
      round     INTEGER NOT NULL,
      question  TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS round_answers (
      id          SERIAL PRIMARY KEY,
      game_id     TEXT NOT NULL REFERENCES games(game_id),
      round       INTEGER NOT NULL,
      player_name TEXT NOT NULL,
      player_type TEXT NOT NULL,
      answer      TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS round_votes (
      id        SERIAL PRIMARY KEY,
      game_id   TEXT NOT NULL REFERENCES games(game_id),
      round     INTEGER NOT NULL,
      voter     TEXT NOT NULL,
      target    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS round_eliminations (
      id          SERIAL PRIMARY KEY,
      game_id     TEXT NOT NULL REFERENCES games(game_id),
      round       INTEGER NOT NULL,
      player_name TEXT NOT NULL,
      is_ai       INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id          SERIAL PRIMARY KEY,
      game_id     TEXT NOT NULL REFERENCES games(game_id),
      round       INTEGER NOT NULL,
      player_name TEXT NOT NULL,
      player_type TEXT NOT NULL,
      content     TEXT NOT NULL,
      ts          BIGINT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS human_profiles (
      username     TEXT PRIMARY KEY,
      games_played INTEGER NOT NULL DEFAULT 0,
      wins         INTEGER NOT NULL DEFAULT 0,
      last_seen    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS human_messages (
      id        SERIAL PRIMARY KEY,
      username  TEXT NOT NULL REFERENCES human_profiles(username),
      content   TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS human_answers (
      id        SERIAL PRIMARY KEY,
      username  TEXT NOT NULL REFERENCES human_profiles(username),
      question  TEXT NOT NULL,
      answer    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS message_flags (
      id          SERIAL PRIMARY KEY,
      game_id     TEXT NOT NULL,
      message_id  TEXT NOT NULL,
      flagged_by  TEXT NOT NULL,
      round       INTEGER NOT NULL,
      ts          BIGINT NOT NULL,
      reason      TEXT,
      UNIQUE(game_id, message_id, flagged_by)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_game_players_unique
      ON game_players(game_id, player_name);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_round_questions_unique
      ON round_questions(game_id, round);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_round_answers_unique
      ON round_answers(game_id, round, player_name);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_round_votes_unique
      ON round_votes(game_id, round, voter);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_round_eliminations_unique
      ON round_eliminations(game_id, round);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_unique
      ON messages(game_id, round, player_name, ts);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_human_messages_unique
      ON human_messages(username, md5(content));
    CREATE UNIQUE INDEX IF NOT EXISTS idx_human_answers_unique
      ON human_answers(username, md5(question), md5(answer));

    CREATE INDEX IF NOT EXISTS idx_messages_game_id      ON messages(game_id);
    CREATE INDEX IF NOT EXISTS idx_round_answers_game_id ON round_answers(game_id);
    CREATE INDEX IF NOT EXISTS idx_round_votes_game_id   ON round_votes(game_id);
    CREATE INDEX IF NOT EXISTS idx_game_players_game_id  ON game_players(game_id);
  `);
  console.log('[GameLogger] Postgres DB ready');
}

// ─── Persona ──────────────────────────────────────────────────────────────────

export interface HumanPersona {
  username: string;
  sampleMessages: string[];
  sampleAnswers: { question: string; answer: string }[];
}

/**
 * Renvoie un profil humain aléatoire de la base (avec au moins 2 messages enregistrés).
 * Retourne null si la base est vide ou absente.
 */
export async function getRandomHumanProfile(): Promise<HumanPersona | null> {
  const pool = getPool();
  if (!pool) return null;
  try {
    const { rows } = await pool.query<{ username: string }>(
      `SELECT hp.username
       FROM human_profiles hp
       JOIN human_messages hm ON hp.username = hm.username
       GROUP BY hp.username
       HAVING COUNT(hm.id) >= 2
       ORDER BY RANDOM()
       LIMIT 1`
    );

    if (rows.length === 0) return null;

    const { username } = rows[0];

    const messages = await pool.query<{ content: string }>(
      `SELECT content FROM human_messages WHERE username = $1 ORDER BY RANDOM() LIMIT 10`,
      [username]
    );

    const answers = await pool.query<{ question: string; answer: string }>(
      `SELECT question, answer FROM human_answers WHERE username = $1 ORDER BY RANDOM() LIMIT 5`,
      [username]
    );

    return {
      username,
      sampleMessages: messages.rows.map((m) => m.content),
      sampleAnswers: answers.rows,
    };
  } catch (err) {
    console.error('[GameLogger] getRandomHumanProfile error:', err);
    return null;
  }
}

// ─── Flagging ─────────────────────────────────────────────────────────────────

/**
 * Enregistre le flag d'un message par un joueur humain.
 * Appelé en cours de partie — game_id peut ne pas encore exister dans games.
 * UNIQUE(game_id, message_id, flagged_by) : un joueur ne peut flaguer qu'une fois le même message.
 */
export async function saveMessageFlag(
  gameId: string,
  messageId: string,
  flaggedBy: string,
  round: number,
  reason?: string
): Promise<void> {
  const pool = getPool();
  if (!pool) return;
  try {
    await pool.query(
      `INSERT INTO message_flags (game_id, message_id, flagged_by, round, ts, reason)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT DO NOTHING`,
      [gameId, messageId, flaggedBy, round, Date.now(), reason ?? null]
    );
  } catch (err) {
    console.error('[GameLogger] saveMessageFlag error:', err);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Sauvegarde le log complet d'une partie.
 */
export async function saveGameLog(data: GameLogData): Promise<void> {
  const pool = getPool();
  if (!pool) return;
  try {
    await inTransaction(pool, async (db) => {
      // games
      await db.query(
        `INSERT INTO games (game_id, date, language, result)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (game_id) DO UPDATE SET
           date     = EXCLUDED.date,
           language = EXCLUDED.language,
           result   = EXCLUDED.result`,
        [data.gameId, data.date, data.language, data.result]
      );

      // players
      for (const p of data.players) {
        await db.query(
          `INSERT INTO game_players (game_id, player_name, player_type, strategy, eliminated, eliminated_round)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT DO NOTHING`,
          [data.gameId, p.name, p.type, p.strategy ?? null, p.eliminated ? 1 : 0, p.eliminatedRound ?? null]
        );
      }

      // rounds
      for (const r of data.rounds) {
        if (r.question) {
          await db.query(
            `INSERT INTO round_questions (game_id, round, question) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
            [data.gameId, r.round, r.question]
          );
        }
        for (const a of r.answers) {
          await db.query(
            `INSERT INTO round_answers (game_id, round, player_name, player_type, answer) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
            [data.gameId, r.round, a.player, a.type, a.answer]
          );
        }
        for (const v of r.votes) {
          await db.query(
            `INSERT INTO round_votes (game_id, round, voter, target) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
            [data.gameId, r.round, v.voter, v.target]
          );
        }
        if (r.eliminated) {
          await db.query(
            `INSERT INTO round_eliminations (game_id, round, player_name, is_ai) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
            [data.gameId, r.round, r.eliminated.name, r.eliminated.isAI ? 1 : 0]
          );
        }
      }

      // messages
      for (const m of data.messages) {
        await db.query(
          `INSERT INTO messages (game_id, round, player_name, player_type, content, ts)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT DO NOTHING`,
          [data.gameId, m.round, m.player, m.type, m.content, m.timestamp]
        );
      }
    });
    console.log(`[GameLogger] Game ${data.gameId} saved to DB`);
  } catch (err) {
    console.error('[GameLogger] saveGameLog error:', err);
  }
}

/**
 * Met à jour les profils humains cumulés.
 */
export async function updateHumanProfiles(data: GameLogData): Promise<void> {
  const pool = getPool();
  if (!pool) return;
  try {
    const humanWon = data.result === 'humans_win';

    await inTransaction(pool, async (db) => {
      for (const p of data.players.filter((pl) => pl.type === 'human')) {
        await db.query(
          `INSERT INTO human_profiles (username, games_played, wins, last_seen)
           VALUES ($1, 1, $2, $3)
           ON CONFLICT (username) DO UPDATE SET
             games_played = human_profiles.games_played + 1,
             wins         = human_profiles.wins + EXCLUDED.wins,
             last_seen    = EXCLUDED.last_seen`,
          [p.name, humanWon ? 1 : 0, data.date]
        );

        for (const m of data.messages.filter((msg) => msg.player === p.name)) {
          const trimmed = m.content.trim();
          if (trimmed) {
            await db.query(
              `INSERT INTO human_messages (username, content) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
              [p.name, trimmed]
            );
          }
        }

        for (const r of data.rounds) {
          const ans = r.answers.find((a) => a.player === p.name);
          if (ans?.answer.trim()) {
            await db.query(
              `INSERT INTO human_answers (username, question, answer) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
              [p.name, r.question, ans.answer.trim()]
            );
          }
        }
      }
    });
    console.log(`[GameLogger] Human profiles updated`);
  } catch (err) {
    console.error('[GameLogger] updateHumanProfiles error:', err);
  }
}
