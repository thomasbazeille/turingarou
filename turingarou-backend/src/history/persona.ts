/**
 * Picks a real human player whose messages serve as a writing-style reference for an AI
 * (GameLogger.getRandomHumanProfile → AIPlayer.buildPersonaBlock). Read side only.
 *
 * Reads the messages table (not human_messages) because only it knows each message's game, hence its
 * language and date. Candidates: same language as the game, enough distinct messages, seen recently;
 * the requirements relax in steps (all-time, then 2 messages) but never across languages.
 * Messages naming a player of their own game are dropped: pasted into another game's prompt, a
 * "lucas t'es un bot" would make the AI address someone who is not there.
 * Lines from a game where their author refused to serve as a style example (player_consents.style_examples = 0) are
 * never read. Games from before the home-screen notice have no consent row and stay in the pool: Thomas's call.
 */

import { addressedTo } from '../game/directAddress.js';
import type { SqlClient } from './readonly.js';
import type { Language } from './types.js';

export interface HumanPersona {
  username: string;
  sampleMessages: string[];
  sampleAnswers: { question: string; answer: string }[];
}

export interface PersonaQuery {
  /** Game language; omitted = any language (previous behaviour). */
  language?: Language;
  /** Distinct usable messages wanted (default 5). */
  minMessages?: number;
  /** "Recent" window in days (default 90). */
  recentDays?: number;
  /** Usernames already used in this game (case-insensitive). */
  exclude?: string[];
  sampleMessages?: number;
  sampleAnswers?: number;
  now?: number;
  rng?: () => number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const CANDIDATES_PER_STEP = 5;
const RECENT_MESSAGES = 200;

function shuffle<T>(xs: T[], rng: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Distinct messages that name nobody from their own game. */
export function usableMessages(rows: { content: string; game_id: string }[], namesByGame: Map<string, string[]>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of rows) {
    const content = r.content.trim();
    const key = content.toLowerCase();
    if (!content || seen.has(key)) continue;
    if ((namesByGame.get(r.game_id) ?? []).some((n) => addressedTo(content, n).direct)) continue;
    seen.add(key);
    out.push(content);
  }
  return out;
}

export async function selectHumanPersona(client: SqlClient, q: PersonaQuery = {}): Promise<HumanPersona | null> {
  const lang = q.language ?? null;
  const minMessages = q.minMessages ?? 5;
  const now = q.now ?? Date.now();
  const rng = q.rng ?? Math.random;
  const exclude = (q.exclude ?? []).map((n) => n.toLowerCase());
  const steps = [
    { since: now - (q.recentDays ?? 90) * DAY_MS, min: minMessages },
    { since: 0, min: minMessages },
    { since: 0, min: Math.min(2, minMessages) },
  ];
  const tried = new Set<string>();

  for (const step of steps) {
    const { rows: candidates } = await client.query<{ username: string }>(
      `SELECT m.player_name AS username
       FROM messages m JOIN games g ON g.game_id = m.game_id
       WHERE m.player_type = 'human'
         AND ($1::text IS NULL OR g.language = $1::text)
         AND m.ts >= $2::bigint
         AND length(trim(m.content)) > 0
         AND NOT EXISTS (SELECT 1 FROM player_consents c WHERE c.game_id = m.game_id AND c.player_name = m.player_name AND c.style_examples = 0)
         AND NOT (lower(m.player_name) = ANY($3::text[]))
       GROUP BY m.player_name
       HAVING COUNT(DISTINCT m.content) >= $4::int
       ORDER BY random()
       LIMIT $5`,
      [lang, step.since, exclude, step.min, CANDIDATES_PER_STEP]
    );
    for (const { username } of candidates) {
      if (tried.has(username)) continue;
      tried.add(username);
      const persona = await loadPersona(client, username, lang, rng, q);
      if (persona.sampleMessages.length >= step.min) return persona;
    }
  }
  return null;
}

async function loadPersona(client: SqlClient, username: string, lang: Language | null, rng: () => number, q: PersonaQuery): Promise<HumanPersona> {
  const { rows: msgs } = await client.query<{ content: string; game_id: string }>(
    `SELECT m.content, m.game_id
     FROM messages m JOIN games g ON g.game_id = m.game_id
     WHERE m.player_name = $1 AND m.player_type = 'human'
       AND ($2::text IS NULL OR g.language = $2::text)
       AND NOT EXISTS (SELECT 1 FROM player_consents c WHERE c.game_id = m.game_id AND c.player_name = m.player_name AND c.style_examples = 0)
     ORDER BY m.ts DESC
     LIMIT ${RECENT_MESSAGES}`,
    [username, lang]
  );
  const { rows: answers } = await client.query<{ question: string; answer: string; game_id: string }>(
    `SELECT q.question, a.answer, a.game_id
     FROM round_answers a
     JOIN round_questions q ON q.game_id = a.game_id AND q.round = a.round
     JOIN game_players gp ON gp.game_id = a.game_id AND gp.player_name = a.player_name AND gp.player_type = 'human'
     JOIN games g ON g.game_id = a.game_id
     WHERE a.player_name = $1
       AND ($2::text IS NULL OR g.language = $2::text)
       AND NOT EXISTS (SELECT 1 FROM player_consents c WHERE c.game_id = a.game_id AND c.player_name = a.player_name AND c.style_examples = 0)
       AND length(trim(a.answer)) > 0
     ORDER BY g.date DESC
     LIMIT 50`,
    [username, lang]
  );
  const gameIds = [...new Set([...msgs, ...answers].map((r) => r.game_id))];
  const namesByGame = new Map<string, string[]>();
  if (gameIds.length) {
    const { rows } = await client.query<{ game_id: string; player_name: string }>(
      `SELECT game_id, player_name FROM game_players WHERE game_id = ANY($1::text[])`,
      [gameIds]
    );
    for (const r of rows) namesByGame.set(r.game_id, [...(namesByGame.get(r.game_id) ?? []), r.player_name]);
  }
  const usableAnswers = answers.filter((a) => !(namesByGame.get(a.game_id) ?? []).some((n) => addressedTo(a.answer, n).direct));
  return {
    username,
    sampleMessages: shuffle(usableMessages(msgs, namesByGame), rng).slice(0, q.sampleMessages ?? 10),
    sampleAnswers: shuffle(usableAnswers, rng)
      .slice(0, q.sampleAnswers ?? 5)
      .map((a) => ({ question: a.question, answer: a.answer.trim() })),
  };
}
