/**
 * Store of all player names ever used in any game (humans + AIs).
 * Persisted to a JSON file so names survive server restarts.
 * AI names are drawn from this pool (excluding names used by humans in the current room).
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const DEFAULT_NAMES = [
  'Alex',
  'Jordan',
  'Sam',
  'Taylor',
  'Morgan',
  'Riley',
  'Casey',
  'tomy',
  'richie',
  'squirl',
  'jody',
  'matt',
  'ripley',
  'naima',
  'mouche',
  'thib',
  'mimi',
  'loky',
  'jordy',
];

const DATA_DIR = join(process.cwd(), 'data');
const FILE_PATH = join(DATA_DIR, 'used_names.json');

function loadNames(): Set<string> {
  try {
    if (existsSync(FILE_PATH)) {
      const raw = readFileSync(FILE_PATH, 'utf8');
      const arr = JSON.parse(raw);
      if (Array.isArray(arr) && arr.length > 0) {
        return new Set(arr.filter((n: unknown) => typeof n === 'string' && n.trim()));
      }
    }
  } catch {
    // ignore: use defaults
  }
  return new Set<string>(DEFAULT_NAMES);
}

function saveNames(names: Set<string>): void {
  try {
    if (!existsSync(DATA_DIR)) {
      mkdirSync(DATA_DIR, { recursive: true });
    }
    writeFileSync(FILE_PATH, JSON.stringify([...names], null, 0), 'utf8');
  } catch (err) {
    console.error('PlayerNamesStore: failed to save', err);
  }
}

const usedNames = loadNames();

export function addPlayerName(name: string): void {
  if (name && name.trim()) {
    const n = name.trim();
    if (!usedNames.has(n)) {
      usedNames.add(n);
      saveNames(usedNames);
    }
  }
}

export function getPool(): string[] {
  return Array.from(usedNames);
}

/**
 * Pick a name for an AI from the pool, excluding names already used by humans in this room.
 */
export function pickAIName(excludeNames: string[]): string {
  const exclude = new Set(excludeNames.map((n) => n.trim().toLowerCase()));
  const available = getPool().filter((n) => !exclude.has(n.trim().toLowerCase()));
  if (available.length === 0) return DEFAULT_NAMES[0];
  return available[Math.floor(Math.random() * available.length)];
}
