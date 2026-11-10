/**
 * Pseudonymization of exported games. Player messages are personal data: an exported record keeps no
 * username, no room code, no id. Names become `p_<hmac>` (stable for a given salt, so one player keeps
 * the same pseudonym across games) and every mention of a player's name inside the game's free text
 * (messages, answers, flag reasons) is replaced by the same pseudonym, accents and case ignored.
 */

import { createHmac } from 'node:crypto';
import type { HistoryGame } from './types.js';

export interface Pseudonymizer {
  name(raw: string): string;
  game(raw: string): string;
}

const hmac = (salt: string, value: string) => createHmac('sha256', salt).update(value).digest('hex');

const canonical = (s: string) =>
  s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();

export function makePseudonymizer(salt: string): Pseudonymizer {
  if (!salt) throw new Error('pseudonymization salt is empty');
  return {
    name: (raw) => `p_${hmac(salt, `name:${canonical(raw)}`).slice(0, 10)}`,
    game: (raw) => `g_${hmac(salt, `game:${raw}`).slice(0, 12)}`,
  };
}

/**
 * Salt order: HISTORY_PSEUDONYM_SALT, else derived from ADMIN_SECRET (so the endpoint and the
 * DATABASE_URL script agree when both see the same ADMIN_SECRET). Rotating either changes every pseudonym.
 */
export function resolveSalt(env: NodeJS.ProcessEnv = process.env): string | null {
  if (env.HISTORY_PSEUDONYM_SALT) return env.HISTORY_PSEUDONYM_SALT;
  if (env.ADMIN_SECRET) return hmac(env.ADMIN_SECRET, 'turingarou-history-pseudonym-v1');
  return null;
}

const ACCENTS: Record<string, string> = {
  a: 'aàâäáãå',
  c: 'cç',
  e: 'eéèêë',
  i: 'iîïíì',
  n: 'nñ',
  o: 'oôöóòõ',
  u: 'uùûüú',
  y: 'yÿý',
};
const escapeChar = (ch: string) => ch.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

/** Regex source matching the name with or without accents ("Hélène", "helene", "HELENE"). */
function namePattern(name: string): string {
  return [...canonical(name)]
    .map((ch) => (ACCENTS[ch] ? `[${ACCENTS[ch]}]` : escapeChar(ch)))
    .join('');
}

/** Same word boundaries as directAddress.ts, so accusation detection reads identically before and after. */
export function makeNameReplacer(mapping: Map<string, string>): (text: string) => string {
  const names = [...mapping.keys()].filter((n) => canonical(n).length > 0).sort((a, b) => canonical(b).length - canonical(a).length);
  if (names.length === 0) return (text) => text;
  const re = new RegExp(`(?<![\\p{L}\\p{N}])(?:${names.map((n) => `(${namePattern(n)})`).join('|')})(?![\\p{L}\\p{N}])`, 'giu');
  return (text) =>
    text.replace(re, (...args) => {
      const groups = args.slice(1, names.length + 1);
      const idx = groups.findIndex((g) => g !== undefined);
      return idx >= 0 ? mapping.get(names[idx])! : args[0];
    });
}

/** Returns a new record; the input is left untouched. */
export function pseudonymizeGame(game: HistoryGame, pz: Pseudonymizer): HistoryGame {
  const rawNames = new Set<string>();
  for (const p of game.players) rawNames.add(p.name);
  for (const m of game.messages) rawNames.add(m.player);
  for (const r of game.rounds) {
    for (const a of r.answers) rawNames.add(a.player);
    for (const v of r.votes) {
      rawNames.add(v.voter);
      rawNames.add(v.target);
    }
    if (r.eliminated) rawNames.add(r.eliminated.name);
  }
  for (const f of game.flags) {
    rawNames.add(f.flaggedBy);
    if (f.target) rawNames.add(f.target.player);
  }
  const mapping = new Map([...rawNames].map((n) => [n, pz.name(n)]));
  const name = (n: string) => mapping.get(n) ?? pz.name(n);
  const text = makeNameReplacer(mapping);

  const out: HistoryGame = {
    schema: game.schema,
    gameId: pz.game(game.gameId),
    date: game.date,
    language: game.language,
    result: game.result,
    players: game.players.map((p) => ({ ...p, name: name(p.name) })),
    rounds: game.rounds.map((r) => ({
      round: r.round,
      question: r.question,
      answers: r.answers.map((a) => ({ player: name(a.player), type: a.type, answer: text(a.answer) })),
      votes: r.votes.map((v) => ({ voter: name(v.voter), target: name(v.target) })),
      eliminated: r.eliminated ? { name: name(r.eliminated.name), isAI: r.eliminated.isAI } : null,
    })),
    messages: game.messages.map((m) => ({ ...m, player: name(m.player), content: text(m.content) })),
    flags: game.flags.map((f) => ({
      round: f.round,
      flaggedBy: name(f.flaggedBy),
      ts: f.ts,
      reason: f.reason === null ? null : text(f.reason),
      target: f.target ? { player: name(f.target.player), ts: f.target.ts } : null,
    })),
    quality: { ...game.quality },
  };
  if (game.synthetic) out.synthetic = true;
  return out;
}
