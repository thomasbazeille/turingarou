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
 *   round_abstentions — qui n'a désigné personne : abstention choisie ou vote absent à la clôture
 *   messages        — messages de discussion
 *   human_profiles  — profil cumulé par username (seulement les humains qui ont donné leur accord)
 *   player_consents — accord de chaque humain pour que ses messages servent d'exemples de style aux IA
 *   player_voice    — voix active ou non dans la partie, et clips push-to-talk de chaque humain (A/B texte/voix)
 *   vote_reasons    — raison facultative qu'un humain donne à son vote, après l'avoir envoyé
 *   game_feedback   — note de 1 à 5 et indice libre d'un humain en fin de partie
 *   message_inputs  — comment chaque ligne humaine a été saisie : voix ou clavier, collage, temps de frappe
 */

import pg from 'pg';
import { selectHumanPersona, type HumanPersona, type PersonaQuery } from '../history/persona.js';
import { withReadOnly } from '../history/readonly.js';
import type { GameFeedback, StyleConsent, VoteReason } from './measures.js';

export type { HumanPersona, PersonaQuery };

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
  /** Who named nobody: explicit = chose to abstain, otherwise no vote by the end (every client sees an abstention). */
  abstentions?: { voter: string; explicit: boolean }[];
  /** Reasons humans gave to their vote naming someone (round_votes holds the target). */
  reasons?: { voter: string; reason: VoteReason }[];
  eliminated?: { name: string; isAI: boolean } | null;
}

export interface PlayerLog {
  id: string;
  name: string;
  type: 'human' | 'ai' | 'inspector';
  strategy?: string;
  eliminated: boolean;
  eliminatedRound?: number;
  /** Real humans only: what they answered on the home screen. */
  consent?: StyleConsent;
  /** Real humans only: push-to-talk lines posted. */
  pttClips?: number;
}

export interface MessageLog {
  round: number;
  player: string;
  type: string;
  content: string;
  timestamp: number;
}

/** How a human line was entered; joins messages on (game_id, round, player_name, ts). */
export interface LineInputLog {
  round: number;
  player: string;
  timestamp: number;
  via: 'typed' | 'voice';
  pasted: boolean;
  typingMs: number | null;
  chars: number;
  msPerChar: number | null;
}

export interface GameLogData {
  gameId: string;
  date: string;
  language: 'fr' | 'en';
  result: 'humans_win' | 'ai_win' | 'draw';
  players: PlayerLog[];
  rounds: RoundLog[];
  messages: MessageLog[];
  /** Voice of the game: every line spoken (tts), push-to-talk offered (stt). */
  voice?: { tts: boolean; stt: boolean };
  /** Every human line posted, in order. */
  lineInputs?: LineInputLog[];
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

    CREATE TABLE IF NOT EXISTS player_consents (
      id             SERIAL PRIMARY KEY,
      game_id        TEXT NOT NULL REFERENCES games(game_id),
      player_name    TEXT NOT NULL,
      style_examples INTEGER NOT NULL,
      notice_version TEXT
    );

    CREATE TABLE IF NOT EXISTS player_voice (
      id            SERIAL PRIMARY KEY,
      game_id       TEXT NOT NULL REFERENCES games(game_id),
      player_name   TEXT NOT NULL,
      voice_enabled INTEGER NOT NULL,
      ptt_enabled   INTEGER NOT NULL,
      used_ptt      INTEGER NOT NULL,
      ptt_clips     INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS round_abstentions (
      id        SERIAL PRIMARY KEY,
      game_id   TEXT NOT NULL REFERENCES games(game_id),
      round     INTEGER NOT NULL,
      voter     TEXT NOT NULL,
      explicit  INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS vote_reasons (
      id        SERIAL PRIMARY KEY,
      game_id   TEXT NOT NULL REFERENCES games(game_id),
      round     INTEGER NOT NULL,
      voter     TEXT NOT NULL,
      reason    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS game_feedback (
      id          SERIAL PRIMARY KEY,
      game_id     TEXT NOT NULL,
      player_name TEXT NOT NULL,
      rating      INTEGER NOT NULL,
      clue        TEXT,
      ts          BIGINT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS message_inputs (
      id          SERIAL PRIMARY KEY,
      game_id     TEXT NOT NULL REFERENCES games(game_id),
      round       INTEGER NOT NULL,
      player_name TEXT NOT NULL,
      ts          BIGINT NOT NULL,
      via         TEXT NOT NULL,
      pasted      INTEGER NOT NULL,
      typing_ms   INTEGER,
      chars       INTEGER NOT NULL,
      ms_per_char REAL
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
    CREATE UNIQUE INDEX IF NOT EXISTS idx_player_consents_unique
      ON player_consents(game_id, player_name);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_player_voice_unique
      ON player_voice(game_id, player_name);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_round_abstentions_unique
      ON round_abstentions(game_id, round, voter);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_vote_reasons_unique
      ON vote_reasons(game_id, round, voter);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_game_feedback_unique
      ON game_feedback(game_id, player_name);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_message_inputs_unique
      ON message_inputs(game_id, round, player_name, ts);

    CREATE INDEX IF NOT EXISTS idx_messages_game_id      ON messages(game_id);
    CREATE INDEX IF NOT EXISTS idx_round_answers_game_id ON round_answers(game_id);
    CREATE INDEX IF NOT EXISTS idx_round_votes_game_id   ON round_votes(game_id);
    CREATE INDEX IF NOT EXISTS idx_game_players_game_id  ON game_players(game_id);
  `);
  console.log('[GameLogger] Postgres DB ready');
}

// ─── Persona ──────────────────────────────────────────────────────────────────

/**
 * A real human player's messages and answers, used as a writing-style reference for an AI.
 * Without options: any language (previous behaviour). Pass { language, exclude } to get a persona of
 * the game's language not already used in the room. Selection rules: src/history/persona.ts.
 * Read-only transaction; null when the base is empty, absent or unreachable.
 */
export async function getRandomHumanProfile(opts: PersonaQuery = {}): Promise<HumanPersona | null> {
  const pool = getPool();
  if (!pool) return null;
  try {
    return await withReadOnly(pool, (client) => selectHumanPersona(client, opts));
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

// ─── Game feedback ────────────────────────────────────────────────────────────

/**
 * A human's note on a finished game. Written at the game over, possibly before saveGameLog commits the game row:
 * no foreign key, like message_flags. A later note of the same player replaces the earlier one.
 */
export async function saveGameFeedback(gameId: string, playerName: string, feedback: GameFeedback): Promise<void> {
  const pool = getPool();
  if (!pool) return;
  try {
    await pool.query(
      `INSERT INTO game_feedback (game_id, player_name, rating, clue, ts)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (game_id, player_name) DO UPDATE SET
         rating = EXCLUDED.rating,
         clue   = EXCLUDED.clue,
         ts     = EXCLUDED.ts`,
      [gameId, playerName, feedback.rating, feedback.clue, Date.now()]
    );
  } catch (err) {
    console.error('[GameLogger] saveGameFeedback error:', err);
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

      for (const p of data.players) {
        if (!p.consent) continue;
        await db.query(
          `INSERT INTO player_consents (game_id, player_name, style_examples, notice_version) VALUES ($1, $2, $3, $4)
           ON CONFLICT (game_id, player_name) DO UPDATE SET style_examples = LEAST(player_consents.style_examples, EXCLUDED.style_examples)`,
          [data.gameId, p.name, p.consent.styleExamples ? 1 : 0, p.consent.notice]
        );
      }

      const voice = data.voice;
      for (const p of voice ? data.players.filter((pl) => pl.type === 'human') : []) {
        const clips = p.pttClips ?? 0;
        await db.query(
          `INSERT INTO player_voice (game_id, player_name, voice_enabled, ptt_enabled, used_ptt, ptt_clips) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING`,
          [data.gameId, p.name, voice?.tts ? 1 : 0, voice?.stt ? 1 : 0, clips > 0 ? 1 : 0, clips]
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
        for (const a of r.abstentions ?? []) {
          await db.query(
            `INSERT INTO round_abstentions (game_id, round, voter, explicit) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
            [data.gameId, r.round, a.voter, a.explicit ? 1 : 0]
          );
        }
        for (const v of r.reasons ?? []) {
          await db.query(
            `INSERT INTO vote_reasons (game_id, round, voter, reason) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
            [data.gameId, r.round, v.voter, v.reason]
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

      for (const i of data.lineInputs ?? []) {
        await db.query(
          `INSERT INTO message_inputs (game_id, round, player_name, ts, via, pasted, typing_ms, chars, ms_per_char)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT DO NOTHING`,
          [data.gameId, i.round, i.player, i.timestamp, i.via, i.pasted ? 1 : 0, i.typingMs, i.chars, i.msPerChar]
        );
      }
    });
    console.log(`[GameLogger] Game ${data.gameId} saved to DB`);
  } catch (err) {
    console.error('[GameLogger] saveGameLog error:', err);
  }
}

/** The slice of a pg client the profile writes use, small enough to fake in a test. */
export interface Queryable {
  query(text: string, values?: unknown[]): Promise<unknown>;
}

/** Humans whose lines may become style references for the AIs: those who ticked the box, nobody else. */
export function styleReferencePlayers(data: GameLogData): PlayerLog[] {
  return data.players.filter((p) => p.type === 'human' && p.consent?.styleExamples === true);
}

/** Cumulated profile, messages and answers of each consenting human; nothing at all for the others. */
export async function writeHumanProfiles(db: Queryable, data: GameLogData): Promise<void> {
  const humanWon = data.result === 'humans_win';
  for (const p of styleReferencePlayers(data)) {
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
}

/**
 * Met à jour les profils humains cumulés, pour les seuls humains qui ont accepté de servir d'exemple de style.
 */
export async function updateHumanProfiles(data: GameLogData): Promise<void> {
  const pool = getPool();
  if (!pool || styleReferencePlayers(data).length === 0) return;
  try {
    await inTransaction(pool, (db) => writeHumanProfiles(db, data));
    console.log(`[GameLogger] Human profiles updated`);
  } catch (err) {
    console.error('[GameLogger] updateHumanProfiles error:', err);
  }
}
