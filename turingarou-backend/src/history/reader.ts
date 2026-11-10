/**
 * Typed reader for finished games. Every function takes a client already inside a read-only
 * transaction (see withReadOnly); streamGames opens one short transaction per page.
 */

import { withReadOnly, type SqlClient, type SqlPool } from './readonly.js';
import {
  HISTORY_SCHEMA,
  type GameResult,
  type HistoryFlag,
  type HistoryGame,
  type HistoryMessage,
  type HistoryPlayer,
  type HistoryRound,
  type Language,
  type PlayerKind,
} from './types.js';

export interface GameQuery {
  /** ISO date, inclusive. */
  since?: string;
  /** ISO date, exclusive. */
  until?: string;
  /** Maximum number of games overall. */
  limit?: number;
}

interface Cursor {
  date: string;
  gameId: string;
}

const PAGE_SIZE = 50;
const MAX_PLAYERS = 8;
const MAX_SPAN_MS = 3 * 60 * 60 * 1000;
const FLAG_TS_TOLERANCE_MS = 5;

interface GameRow { game_id: string; date: string; language: string; result: string }
interface PlayerRow { game_id: string; player_name: string; player_type: string; strategy: string | null; eliminated: number; eliminated_round: number | null }
interface QuestionRow { game_id: string; round: number; question: string }
interface AnswerRow { game_id: string; round: number; player_name: string; player_type: string; answer: string }
interface VoteRow { game_id: string; round: number; voter: string; target: string }
interface ElimRow { game_id: string; round: number; player_name: string; is_ai: number }
interface MessageRow { game_id: string; round: number; player_name: string; player_type: string; content: string; ts: string | number }
interface FlagRow { game_id: string; message_id: string; flagged_by: string; round: number; ts: string | number; reason: string | null }

export async function readGameRows(client: SqlClient, query: GameQuery, after: Cursor | null, pageSize: number): Promise<GameRow[]> {
  const { rows } = await client.query<GameRow>(
    `SELECT game_id, date, language, result FROM games
     WHERE ($1::text IS NULL OR date >= $1::text)
       AND ($2::text IS NULL OR date < $2::text)
       AND ($3::text IS NULL OR (date, game_id) > ($3::text, $4::text))
     ORDER BY date, game_id
     LIMIT $5`,
    [query.since ?? null, query.until ?? null, after?.date ?? null, after?.gameId ?? null, pageSize]
  );
  return rows;
}

/** Loads the full records of the given games, in the order of `games`. */
export async function loadGames(client: SqlClient, games: GameRow[]): Promise<HistoryGame[]> {
  if (games.length === 0) return [];
  const ids = games.map((g) => g.game_id);
  const byGame = <R extends { game_id: string }>(rows: R[]) => {
    const map = new Map<string, R[]>();
    for (const r of rows) {
      const list = map.get(r.game_id) ?? [];
      list.push(r);
      map.set(r.game_id, list);
    }
    return (id: string) => map.get(id) ?? [];
  };
  const q = async <R extends { game_id: string }>(sql: string) => byGame((await client.query<R>(sql, [ids])).rows);

  const players = await q<PlayerRow>(
    `SELECT game_id, player_name, player_type, strategy, eliminated, eliminated_round
     FROM game_players WHERE game_id = ANY($1::text[]) ORDER BY game_id, id`
  );
  const questions = await q<QuestionRow>(`SELECT game_id, round, question FROM round_questions WHERE game_id = ANY($1::text[])`);
  const answers = await q<AnswerRow>(
    `SELECT game_id, round, player_name, player_type, answer FROM round_answers WHERE game_id = ANY($1::text[]) ORDER BY game_id, round, id`
  );
  const votes = await q<VoteRow>(`SELECT game_id, round, voter, target FROM round_votes WHERE game_id = ANY($1::text[]) ORDER BY game_id, round, id`);
  const elims = await q<ElimRow>(`SELECT game_id, round, player_name, is_ai FROM round_eliminations WHERE game_id = ANY($1::text[])`);
  const messages = await q<MessageRow>(
    `SELECT game_id, round, player_name, player_type, content, ts FROM messages WHERE game_id = ANY($1::text[]) ORDER BY game_id, ts, id`
  );
  const flags = await q<FlagRow>(
    `SELECT game_id, message_id, flagged_by, round, ts, reason FROM message_flags WHERE game_id = ANY($1::text[]) ORDER BY game_id, ts, id`
  );

  return games.map((g) =>
    assembleGame(g, players(g.game_id), questions(g.game_id), answers(g.game_id), votes(g.game_id), elims(g.game_id), messages(g.game_id), flags(g.game_id))
  );
}

/** Strategy column, optionally "name@Provider" — the way to persist the provider without a schema change. */
export function readStrategy(raw: string | null): { strategy: string | null; provider: string | null } {
  if (!raw) return { strategy: null, provider: null };
  const at = raw.lastIndexOf('@');
  if (at <= 0 || at === raw.length - 1) return { strategy: raw, provider: null };
  return { strategy: raw.slice(0, at), provider: raw.slice(at + 1) };
}

const asKind = (t: string): PlayerKind => (t === 'ai' || t === 'inspector' ? t : 'human');

function assembleGame(
  g: GameRow,
  playerRows: PlayerRow[],
  questionRows: QuestionRow[],
  answerRows: AnswerRow[],
  voteRows: VoteRow[],
  elimRows: ElimRow[],
  messageRows: MessageRow[],
  flagRows: FlagRow[]
): HistoryGame {
  const players: HistoryPlayer[] = playerRows.map((p) => ({
    name: p.player_name,
    type: asKind(p.player_type),
    ...readStrategy(p.strategy),
    eliminated: Number(p.eliminated) === 1,
    eliminatedRound: p.eliminated_round ?? null,
  }));
  // game_players is authoritative: round_answers labels the inspector 'human'.
  const kindOf = new Map(players.map((p) => [p.name, p.type]));
  const kind = (name: string, rowType: string) => kindOf.get(name) ?? asKind(rowType);

  const messages: HistoryMessage[] = messageRows.map((m) => ({
    round: m.round,
    player: m.player_name,
    type: kind(m.player_name, m.player_type),
    content: m.content,
    ts: Number(m.ts),
  }));

  const roundNumbers = new Set<number>();
  for (const r of [...questionRows, ...answerRows, ...voteRows, ...elimRows, ...messageRows]) roundNumbers.add(r.round);
  const rounds: HistoryRound[] = [...roundNumbers]
    .sort((a, b) => a - b)
    .map((round) => {
      const elim = elimRows.find((e) => e.round === round);
      return {
        round,
        question: questionRows.find((q) => q.round === round)?.question ?? null,
        answers: answerRows
          .filter((a) => a.round === round)
          .map((a) => ({ player: a.player_name, type: kind(a.player_name, a.player_type), answer: a.answer })),
        votes: voteRows.filter((v) => v.round === round).map((v) => ({ voter: v.voter, target: v.target })),
        eliminated: elim ? { name: elim.player_name, isAI: Number(elim.is_ai) === 1 } : null,
      };
    });

  const flags: HistoryFlag[] = flagRows.map((f) => ({
    round: f.round,
    flaggedBy: f.flagged_by,
    ts: Number(f.ts),
    reason: f.reason,
    target: flagTarget(f, messages),
  }));

  const span = messages.length > 1 ? messages[messages.length - 1].ts - messages[0].ts : 0;
  return {
    schema: HISTORY_SCHEMA,
    gameId: g.game_id,
    date: g.date,
    language: (g.language === 'en' ? 'en' : 'fr') as Language,
    result: (['humans_win', 'ai_win', 'draw'].includes(g.result) ? g.result : 'draw') as GameResult,
    players,
    rounds,
    messages,
    flags,
    quality: { suspectMerged: players.length > MAX_PLAYERS || span > MAX_SPAN_MS },
  };
}

/** In-game message ids are `msg-<Date.now()>-<random>`, taken within a millisecond of the stored ts. */
function flagTarget(f: FlagRow, messages: HistoryMessage[]): HistoryFlag['target'] {
  const m = /^msg-(\d+)-/.exec(f.message_id);
  if (!m) return null;
  const idTs = Number(m[1]);
  let best: HistoryMessage | null = null;
  for (const msg of messages) {
    if (msg.round !== f.round) continue;
    const d = Math.abs(msg.ts - idTs);
    if (d <= FLAG_TS_TOLERANCE_MS && (!best || d < Math.abs(best.ts - idTs))) best = msg;
  }
  return best ? { player: best.player, ts: best.ts } : null;
}

export async function loadGameById(client: SqlClient, gameId: string): Promise<HistoryGame | null> {
  const { rows } = await client.query<GameRow>(`SELECT game_id, date, language, result FROM games WHERE game_id = $1`, [gameId]);
  if (rows.length === 0) return null;
  return (await loadGames(client, rows))[0];
}

/**
 * Calls onGame for every game matching the query, oldest first. One short read-only transaction per
 * page: no snapshot is held while onGame writes to a slow consumer. onGame returning false stops.
 */
export async function streamGames(
  pool: SqlPool,
  query: GameQuery,
  onGame: (game: HistoryGame) => Promise<boolean | void> | boolean | void,
  pageSize = PAGE_SIZE
): Promise<number> {
  let after: Cursor | null = null;
  let count = 0;
  const limit = query.limit ?? Infinity;
  while (count < limit) {
    const size = Math.min(pageSize, limit - count);
    const { rows, games } = await withReadOnly(pool, async (client) => {
      const rows = await readGameRows(client, query, after, size);
      return { rows, games: await loadGames(client, rows) };
    });
    for (const game of games) {
      count++;
      if ((await onGame(game)) === false) return count;
    }
    if (rows.length < size) break;
    const last = rows[rows.length - 1];
    after = { date: last.date, gameId: last.game_id };
  }
  return count;
}
