/**
 * In-memory store of all player names ever used in any game (humans + AIs).
 * Used to pick AI names from "real" past names so they feel natural.
 */

const DEFAULT_NAMES = [
  'Alex',
  'Jordan',
  'Sam',
  'Taylor',
  'Morgan',
  'Riley',
  'Casey',
];

const usedNames = new Set<string>(DEFAULT_NAMES);

export function addPlayerName(name: string): void {
  if (name && name.trim()) {
    usedNames.add(name.trim());
  }
}

export function getPool(): string[] {
  return Array.from(usedNames);
}

/**
 * Pick a name for an AI: from the pool, excluding names already used by humans in this room.
 */
export function pickAIName(excludeNames: string[]): string {
  const exclude = new Set(excludeNames.map((n) => n.trim().toLowerCase()));
  const available = getPool().filter((n) => !exclude.has(n.trim().toLowerCase()));
  if (available.length === 0) return DEFAULT_NAMES[0];
  return available[Math.floor(Math.random() * available.length)];
}
