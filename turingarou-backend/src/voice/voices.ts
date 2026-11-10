import { createHash } from 'crypto';
import type { Lang } from './providers.js';

export interface VoiceDef {
  id: string;
  label: string;
  gender: 'f' | 'm' | 'n';
}

// Casual, young-adult voices, 6 f + 6 m per language: 8 players always get distinct voices.
// Assignment ignores the player's type and name, so a voice says nothing about who is an AI.
const CARTESIA: Record<Lang, VoiceDef[]> = {
  fr: [
    { id: '65b25c5d-ff07-4687-a04c-da2f43ef6fa9', label: 'Pauline', gender: 'f' },
    { id: '187d1cc5-a771-4ccd-9110-9df8c4e39499', label: 'Mika', gender: 'f' },
    { id: '735287ee-ce91-4b08-8de4-63315c5ba1fb', label: 'Emmanuelle', gender: 'f' },
    { id: 'c9115185-0086-4cf4-bfdd-0d36425db387', label: 'Juliette', gender: 'f' },
    { id: '2f8e82c4-cb94-4e6d-8b6a-29bf58ceb60a', label: 'Manon', gender: 'f' },
    { id: '3b7d569e-01fc-45ef-b74b-29460956c691', label: 'Josette', gender: 'f' },
    { id: 'ce74c4da-4aee-435d-bc6d-81d1a9367e12', label: 'Marc', gender: 'm' },
    { id: 'd9f4af15-c402-4f50-bbda-d8823d028d6a', label: 'Henri', gender: 'm' },
    { id: 'adff5dcb-249f-463f-aa89-d98d8ca05e88', label: 'Leo', gender: 'm' },
    { id: '80e11491-2d8a-4361-ac61-c4f3e0a4f7e7', label: 'Vincent', gender: 'm' },
    { id: 'ab636c8b-9960-4fb3-bb0c-b7b655fb9745', label: 'Erwan', gender: 'm' },
    { id: 'ab7c61f5-3daa-47dd-a23b-4ac0aac5f5c3', label: 'Friendly French Man', gender: 'm' },
  ],
  en: [
    { id: 'e8e5fffb-252c-436d-b842-8879b84445b6', label: 'Cathy', gender: 'f' },
    { id: '66c6b81c-ddb7-4892-bdd5-19b5a7be38e7', label: 'Dorothy', gender: 'f' },
    { id: '2a12b36c-7f9b-4c3a-9f7a-72731b15323a', label: 'Ella', gender: 'f' },
    { id: 'f786b574-daa5-4673-aa0c-cbe3e8534c02', label: 'Katie', gender: 'f' },
    { id: 'db6b0ed5-d5d3-463d-ae85-518a07d3c2b4', label: 'Skylar', gender: 'f' },
    { id: 'd79d2b77-9192-4e10-9407-5d43ca034803', label: 'Siobhan', gender: 'f' },
    { id: '30894953-bcce-41fe-892c-15ce19c843ff', label: 'Parker', gender: 'm' },
    { id: '630ed21c-2c5c-41cf-9d82-10a7fd668370', label: 'Corey', gender: 'm' },
    { id: 'ef191366-f52f-447a-a398-ed8c0f2943a1', label: 'Archie', gender: 'm' },
    { id: 'a5136bf9-224c-4d76-b823-52bd5efcffcc', label: 'Jameson', gender: 'm' },
    { id: '87286a8d-7ea7-4235-a41a-dd9fa6630feb', label: 'Henry', gender: 'm' },
    { id: '5ee9feff-1265-424a-9d7f-8e4d431a12c7', label: 'Ronald', gender: 'm' },
  ],
};

// Premade voices exist on every ElevenLabs account; all twelve are verified in French (standard accent) by ElevenLabs.
const ELEVENLABS_PREMADE: VoiceDef[] = [
  { id: 'cgSgspJ2msm6clMCkdW9', label: 'Jessica', gender: 'f' },
  { id: 'FGY2WhTYpPnrIDTdsKH5', label: 'Laura', gender: 'f' },
  { id: 'EXAVITQu4vr4xnSDxMaL', label: 'Sarah', gender: 'f' },
  { id: 'XrExE9yKIg1WjnnlVkGX', label: 'Matilda', gender: 'f' },
  { id: 'Xb7hH8MSUJpSbSDYk0k2', label: 'Alice', gender: 'f' },
  { id: 'SAz9YHcvj6GT2YYXdXww', label: 'River', gender: 'n' },
  { id: 'CwhRBWXzGAHq8TQ4Fs17', label: 'Roger', gender: 'm' },
  { id: 'bIHbv24MWmeRgasZH58o', label: 'Will', gender: 'm' },
  { id: 'iP95p4xoKVk53GoZ742B', label: 'Chris', gender: 'm' },
  { id: 'cjVigY5qzO86Huf0OWal', label: 'Eric', gender: 'm' },
  { id: 'N2lVS1w4EtoT3dr4eOWO', label: 'Callum', gender: 'm' },
  { id: 'JBFqnCBsd6RMkjVDRZzb', label: 'George', gender: 'm' },
];

const OPENAI: VoiceDef[] = [
  { id: 'coral', label: 'coral', gender: 'f' },
  { id: 'nova', label: 'nova', gender: 'f' },
  { id: 'shimmer', label: 'shimmer', gender: 'f' },
  { id: 'sage', label: 'sage', gender: 'f' },
  { id: 'alloy', label: 'alloy', gender: 'n' },
  { id: 'ash', label: 'ash', gender: 'm' },
  { id: 'ballad', label: 'ballad', gender: 'm' },
  { id: 'echo', label: 'echo', gender: 'm' },
  { id: 'fable', label: 'fable', gender: 'm' },
  { id: 'onyx', label: 'onyx', gender: 'm' },
  { id: 'verse', label: 'verse', gender: 'm' },
];

const POOLS: Record<string, Record<Lang, VoiceDef[]>> = {
  cartesia: CARTESIA,
  elevenlabs: { fr: ELEVENLABS_PREMADE, en: ELEVENLABS_PREMADE },
  openai: { fr: OPENAI, en: OPENAI },
};

export function voicePool(provider: string, lang: Lang): readonly VoiceDef[] {
  return POOLS[provider]?.[lang] ?? [];
}

function rank(seed: string, kind: string, id: string): string {
  return createHash('sha256').update(`${seed}|${kind}|${id}`).digest('hex');
}

/**
 * Deterministic per (seed, player set): players and voices are both ordered by a seeded hash, then zipped.
 * Distinct as long as the pool is at least as large as the player set.
 */
export function assignVoices(seed: string, playerIds: readonly string[], pool: readonly VoiceDef[]): Map<string, VoiceDef> {
  const out = new Map<string, VoiceDef>();
  if (pool.length === 0) return out;
  const players = [...new Set(playerIds)].sort((a, b) => (rank(seed, 'p', a) < rank(seed, 'p', b) ? -1 : 1));
  const voices = [...pool].sort((a, b) => (rank(seed, 'v', a.id) < rank(seed, 'v', b.id) ? -1 : 1));
  players.forEach((id, i) => out.set(id, voices[i % voices.length]));
  return out;
}

/**
 * Freezes the assignment of a room at its first use (the game has started, all 8 players are present), so a player
 * leaving later never shifts the others' voices.
 */
export class VoiceBook {
  private readonly byRoom = new WeakMap<object, Map<string, VoiceDef>>();

  voiceFor(room: object, seed: string, playerIds: readonly string[], pool: readonly VoiceDef[], playerId: string): VoiceDef | null {
    let map = this.byRoom.get(room);
    if (!map) {
      map = assignVoices(seed, playerIds, pool);
      this.byRoom.set(room, map);
    }
    const known = map.get(playerId);
    if (known) return known;
    if (!playerIds.includes(playerId) || pool.length === 0) return null;
    const used = new Set([...map.values()].map((v) => v.id));
    const free = assignVoices(seed, [playerId], pool.filter((v) => !used.has(v.id))).get(playerId);
    const voice = free ?? assignVoices(seed, [playerId], pool).get(playerId)!;
    map.set(playerId, voice);
    return voice;
  }
}
