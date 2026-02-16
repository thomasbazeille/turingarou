import type { GameFormat } from '../types/game.types.js';

/**
 * Build the "Current Game Setup" block from backend format (players, timing, rounds).
 */
export function buildCurrentGameSetup(format: GameFormat): string {
  const lines: string[] = [
    `🎮 ${format.maxPlayers}-player game:`,
    ...Array.from({ length: format.humanCount }, (_, i) => `   👤 Human ${i + 1} (Player)`),
    ...Array.from({ length: format.aiCount }, () => `   🤖 AI (You - using random name)`),
    `⏱️  Timing:`,
    `   - Question phase: ${format.questionSec} seconds`,
    `   - Discussion phase: ${format.discussionSec} seconds`,
    `   - Vote phase: ${format.voteSec} seconds`,
    `   - Maximum rounds: ${format.maxRounds}`,
  ];
  return lines.join('\n');
}

/**
 * Injects the current game setup into a strategy prompt (replaces {{CURRENT_GAME_SETUP}}).
 * Strategy content comes from StrategyLoader; do not modify prompts inside strategy files.
 */
export function getInstructionsWithSetup(strategyContent: string, format: GameFormat): string {
  const setupBlock = buildCurrentGameSetup(format);
  return strategyContent.replace('{{CURRENT_GAME_SETUP}}', setupBlock);
}
