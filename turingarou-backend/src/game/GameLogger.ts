/**
 * GameLogger — persistance SQLite des parties et profils humains.
 *
 * Fichier DB : <cwd>/turingarou.db
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

import Database from 'better-sqlite3';
import path from 'path';

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

// ─── DB singleton ─────────────────────────────────────────────────────────────

let _db: Database.Database | null = null;

function getDB(): Database.Database {
  if (_db) return _db;

  const dbPath = path.join(process.cwd(), 'turingarou.db');
  _db = new Database(dbPath);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  initSchema(_db);
  console.log(`[GameLogger] SQLite DB ready at ${dbPath}`);
  return _db;
}

function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS games (
      game_id     TEXT PRIMARY KEY,
      date        TEXT NOT NULL,
      language    TEXT NOT NULL,
      result      TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS game_players (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id          TEXT NOT NULL REFERENCES games(game_id),
      player_name      TEXT NOT NULL,
      player_type      TEXT NOT NULL,
      strategy         TEXT,
      eliminated       INTEGER NOT NULL DEFAULT 0,
      eliminated_round INTEGER
    );

    CREATE TABLE IF NOT EXISTS round_questions (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id   TEXT NOT NULL REFERENCES games(game_id),
      round     INTEGER NOT NULL,
      question  TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS round_answers (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id     TEXT NOT NULL REFERENCES games(game_id),
      round       INTEGER NOT NULL,
      player_name TEXT NOT NULL,
      player_type TEXT NOT NULL,
      answer      TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS round_votes (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id   TEXT NOT NULL REFERENCES games(game_id),
      round     INTEGER NOT NULL,
      voter     TEXT NOT NULL,
      target    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS round_eliminations (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id     TEXT NOT NULL REFERENCES games(game_id),
      round       INTEGER NOT NULL,
      player_name TEXT NOT NULL,
      is_ai       INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id     TEXT NOT NULL REFERENCES games(game_id),
      round       INTEGER NOT NULL,
      player_name TEXT NOT NULL,
      player_type TEXT NOT NULL,
      content     TEXT NOT NULL,
      ts          INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS human_profiles (
      username     TEXT PRIMARY KEY,
      games_played INTEGER NOT NULL DEFAULT 0,
      wins         INTEGER NOT NULL DEFAULT 0,
      last_seen    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS human_messages (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      username  TEXT NOT NULL REFERENCES human_profiles(username),
      content   TEXT NOT NULL,
      UNIQUE(username, content)
    );

    CREATE TABLE IF NOT EXISTS human_answers (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      username  TEXT NOT NULL REFERENCES human_profiles(username),
      question  TEXT NOT NULL,
      answer    TEXT NOT NULL,
      UNIQUE(username, question, answer)
    );

    CREATE TABLE IF NOT EXISTS message_flags (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id     TEXT NOT NULL,
      message_id  TEXT NOT NULL,
      flagged_by  TEXT NOT NULL,
      round       INTEGER NOT NULL,
      ts          INTEGER NOT NULL,
      reason      TEXT,
      UNIQUE(game_id, message_id, flagged_by)
    );
  `);
}

// ─── Persona ──────────────────────────────────────────────────────────────────

export interface HumanPersona {
  username: string;
  sampleMessages: string[];
  sampleAnswers: { question: string; answer: string }[];
}

/**
 * Renvoie un profil humain aléatoire de la base (avec au moins 2 messages enregistrés).
 * Retourne null si la base est vide ou inexistante.
 */
export function getRandomHumanProfile(): HumanPersona | null {
  try {
    const db = getDB();

    const row = db
      .prepare(
        `SELECT hp.username
         FROM human_profiles hp
         JOIN human_messages hm ON hp.username = hm.username
         GROUP BY hp.username
         HAVING COUNT(hm.id) >= 2
         ORDER BY RANDOM()
         LIMIT 1`
      )
      .get() as { username: string } | undefined;

    if (!row) return null;

    const { username } = row;

    const messages = db
      .prepare(`SELECT content FROM human_messages WHERE username = ? ORDER BY RANDOM() LIMIT 10`)
      .all(username) as { content: string }[];

    const answers = db
      .prepare(
        `SELECT question, answer FROM human_answers WHERE username = ? ORDER BY RANDOM() LIMIT 5`
      )
      .all(username) as { question: string; answer: string }[];

    return {
      username,
      sampleMessages: messages.map((m) => m.content),
      sampleAnswers: answers,
    };
  } catch {
    // DB absente ou vide (première exécution) — silencieux
    return null;
  }
}

// ─── Flagging ─────────────────────────────────────────────────────────────────

/**
 * Enregistre le flag d'un message par un joueur humain.
 * Appelé en cours de partie — game_id peut ne pas encore exister dans games.
 * UNIQUE(game_id, message_id, flagged_by) : un joueur ne peut flaguer qu'une fois le même message.
 */
export function saveMessageFlag(
  gameId: string,
  messageId: string,
  flaggedBy: string,
  round: number,
  reason?: string
): void {
  try {
    const db = getDB();
    db.prepare(
      `INSERT OR IGNORE INTO message_flags (game_id, message_id, flagged_by, round, ts, reason)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(gameId, messageId, flaggedBy, round, Date.now(), reason ?? null);
  } catch (err) {
    console.error('[GameLogger] saveMessageFlag error:', err);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Sauvegarde le log complet d'une partie en SQLite.
 */
export function saveGameLog(data: GameLogData): void {
  try {
    const db = getDB();

    const insertAll = db.transaction(() => {
      // games
      db.prepare(
        `INSERT OR REPLACE INTO games (game_id, date, language, result)
         VALUES (?, ?, ?, ?)`
      ).run(data.gameId, data.date, data.language, data.result);

      // players
      const insPlayer = db.prepare(
        `INSERT INTO game_players (game_id, player_name, player_type, strategy, eliminated, eliminated_round)
         VALUES (?, ?, ?, ?, ?, ?)`
      );
      for (const p of data.players) {
        insPlayer.run(
          data.gameId, p.name, p.type, p.strategy ?? null,
          p.eliminated ? 1 : 0, p.eliminatedRound ?? null
        );
      }

      // rounds
      const insQ = db.prepare(
        `INSERT INTO round_questions (game_id, round, question) VALUES (?, ?, ?)`
      );
      const insA = db.prepare(
        `INSERT INTO round_answers (game_id, round, player_name, player_type, answer) VALUES (?, ?, ?, ?, ?)`
      );
      const insV = db.prepare(
        `INSERT INTO round_votes (game_id, round, voter, target) VALUES (?, ?, ?, ?)`
      );
      const insE = db.prepare(
        `INSERT INTO round_eliminations (game_id, round, player_name, is_ai) VALUES (?, ?, ?, ?)`
      );

      for (const r of data.rounds) {
        if (r.question) insQ.run(data.gameId, r.round, r.question);
        for (const a of r.answers) insA.run(data.gameId, r.round, a.player, a.type, a.answer);
        for (const v of r.votes) insV.run(data.gameId, r.round, v.voter, v.target);
        if (r.eliminated) insE.run(data.gameId, r.round, r.eliminated.name, r.eliminated.isAI ? 1 : 0);
      }

      // messages
      const insM = db.prepare(
        `INSERT INTO messages (game_id, round, player_name, player_type, content, ts)
         VALUES (?, ?, ?, ?, ?, ?)`
      );
      for (const m of data.messages) {
        insM.run(data.gameId, m.round, m.player, m.type, m.content, m.timestamp);
      }
    });

    insertAll();
    console.log(`[GameLogger] Game ${data.gameId} saved to DB`);
  } catch (err) {
    console.error('[GameLogger] saveGameLog error:', err);
  }
}

/**
 * Met à jour les profils humains cumulés.
 */
export function updateHumanProfiles(data: GameLogData): void {
  try {
    const db = getDB();
    const humanWon = data.result === 'humans_win';

    const upsertProfile = db.prepare(`
      INSERT INTO human_profiles (username, games_played, wins, last_seen)
      VALUES (?, 1, ?, ?)
      ON CONFLICT(username) DO UPDATE SET
        games_played = games_played + 1,
        wins         = wins + excluded.wins,
        last_seen    = excluded.last_seen
    `);

    const insMsg = db.prepare(`
      INSERT OR IGNORE INTO human_messages (username, content) VALUES (?, ?)
    `);

    const insAns = db.prepare(`
      INSERT OR IGNORE INTO human_answers (username, question, answer) VALUES (?, ?, ?)
    `);

    const updateProfiles = db.transaction(() => {
      for (const p of data.players.filter((pl) => pl.type === 'human')) {
        upsertProfile.run(p.name, humanWon ? 1 : 0, data.date);

        for (const m of data.messages.filter((msg) => msg.player === p.name)) {
          const trimmed = m.content.trim();
          if (trimmed) insMsg.run(p.name, trimmed);
        }

        for (const r of data.rounds) {
          const ans = r.answers.find((a) => a.player === p.name);
          if (ans?.answer.trim()) insAns.run(p.name, r.question, ans.answer.trim());
        }
      }
    });

    updateProfiles();
    console.log(`[GameLogger] Human profiles updated`);
  } catch (err) {
    console.error('[GameLogger] updateHumanProfiles error:', err);
  }
}
