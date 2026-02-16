/**
 * Loads AI player strategies from strategies/ and picks one at random.
 * Do not modify the prompt content inside the strategy files.
 * Uses dynamic import so strategy files can live outside src/.
 */

import path from 'path';
import { pathToFileURL } from 'url';

export interface StrategyEntry {
  name: string;
  content: string;
}

const STRATEGY_FILES: { name: string; file: string; exportName: string }[] = [
  { name: 'v1_condensed', file: 'ai_player_v1_condensed.js', exportName: 'AI_PLAYER_V1_CONDENSED' },
  { name: 'v1_improved_baseline', file: 'ai_player_v1_improved_baseline.js', exportName: 'AI_PLAYER_V1_IMPROVED_BASELINE' },
  { name: 'v2_condensed', file: 'ai_player_v2_condensed.js', exportName: 'AI_PLAYER_V2_CONDENSED' },
  { name: 'v2_ucsd_optimized', file: 'ai_player_v2_ucsd_optimized.js', exportName: 'AI_PLAYER_V2_UCSD_OPTIMIZED' },
  { name: 'v3_condensed', file: 'ai_player_v3_condensed.js', exportName: 'AI_PLAYER_V3_CONDENSED' },
  { name: 'v3_ultimate_combined', file: 'ai_player_v3_ultimate_combined.js', exportName: 'AI_PLAYER_V3_ULTIMATE_COMBINED' },
];

let cachedStrategies: StrategyEntry[] | null = null;

async function loadStrategies(): Promise<StrategyEntry[]> {
  if (cachedStrategies) return cachedStrategies;
  const base = path.join(process.cwd(), 'strategies');
  const loaded: StrategyEntry[] = [];
  for (const { name, file, exportName } of STRATEGY_FILES) {
    try {
      const url = pathToFileURL(path.join(base, file)).href;
      const mod = await import(url);
      const content = (mod as Record<string, string>)[exportName];
      if (typeof content !== 'string') throw new Error(`Missing or invalid export ${exportName} in ${file}`);
      loaded.push({ name, content });
    } catch (err) {
      console.error(`[StrategyLoader] Failed to load ${file}:`, err);
    }
  }
  cachedStrategies = loaded;
  return loaded;
}

export async function getRandomAIPlayerStrategy(playerName?: string): Promise<StrategyEntry> {
  const strategies = await loadStrategies();
  if (strategies.length === 0) throw new Error('No AI player strategies loaded');
  const idx = Math.floor(Math.random() * strategies.length);
  const chosen = strategies[idx];
  const namePart = playerName ? ` (joueur: ${playerName})` : '';
  console.log(`[StrategyLoader] AI player strategy: ${chosen.name}${namePart}`);
  return chosen;
}

export function getAllStrategyNames(): string[] {
  return STRATEGY_FILES.map((s) => s.name);
}

let cachedInspectorPrompt: string | null = null;

export async function getInspectorPromptContent(): Promise<string> {
  if (cachedInspectorPrompt) return cachedInspectorPrompt;
  const base = path.join(process.cwd(), 'strategies');
  const url = pathToFileURL(path.join(base, 'ai_inspector_humanlike.js')).href;
  const mod = await import(url);
  const content = (mod as Record<string, string>).AI_INSPECTOR_HUMANLIKE;
  if (typeof content !== 'string') throw new Error('Missing AI_INSPECTOR_HUMANLIKE in ai_inspector_humanlike.js');
  cachedInspectorPrompt = content;
  console.log('[StrategyLoader] Inspector prompt loaded (ai_inspector_humanlike)');
  return content;
}
