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

async function loadStrategy(file: string, exportName: string): Promise<string> {
  const url = pathToFileURL(path.join(process.cwd(), 'strategies', file)).href;
  const content = (await import(url) as Record<string, string>)[exportName];
  if (typeof content !== 'string') throw new Error(`Missing or invalid export ${exportName} in ${file}`);
  return content;
}

async function loadStrategies(): Promise<StrategyEntry[]> {
  if (cachedStrategies) return cachedStrategies;
  const loaded: StrategyEntry[] = [];
  for (const { name, file, exportName } of STRATEGY_FILES) {
    try {
      loaded.push({ name, content: await loadStrategy(file, exportName) });
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

let cachedInspectorPrompt: string | null = null;

export async function getInspectorPromptContent(): Promise<string> {
  if (cachedInspectorPrompt) return cachedInspectorPrompt;
  const content = await loadStrategy('ai_inspector_humanlike.js', 'AI_INSPECTOR_HUMANLIKE');
  cachedInspectorPrompt = content;
  console.log('[StrategyLoader] Inspector prompt loaded (ai_inspector_humanlike)');
  return content;
}
