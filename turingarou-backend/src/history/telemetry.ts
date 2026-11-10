/**
 * The database does not hold each AI's LLM provider; GameRoom prints it at game end in a
 * `[game-telemetry] {"room":…,"providers":{name: provider}}` log line. These helpers join those lines back
 * onto raw (not yet pseudonymized) games, keyed by room id = game id.
 */

import type { HistoryGame } from './types.js';

const MARK = '[game-telemetry] ';

export function parseTelemetry(text: string): Map<string, Record<string, string>> {
  const byRoom = new Map<string, Record<string, string>>();
  for (const line of text.split('\n')) {
    const i = line.indexOf(MARK);
    if (i === -1) continue;
    try {
      const t = JSON.parse(line.slice(i + MARK.length));
      if (t?.room && t?.providers && typeof t.providers === 'object') byRoom.set(String(t.room), t.providers);
    } catch {
      // truncated log line
    }
  }
  return byRoom;
}

/** Same object back when the telemetry has nothing for this game. */
export function applyProviders(game: HistoryGame, byRoom: Map<string, Record<string, string>>): HistoryGame {
  const providers = byRoom.get(game.gameId);
  if (!providers) return game;
  return { ...game, players: game.players.map((p) => ({ ...p, provider: p.provider ?? providers[p.name] ?? null })) };
}
