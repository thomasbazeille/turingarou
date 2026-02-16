import type { GameFormat } from '../types/game.types.js';

/** Goal of the AI in the game: spot humans vs AIs, get humans voted out, stay among AIs to win. */
export const AI_GOAL_BLOCK = `
# YOUR GOAL AS THE AI (CRITICAL)
You are an AI hidden among humans. Your objective is to:
1. Identify who are the real humans and who are the other AIs (without revealing yourself).
2. Try to get the humans voted out: push suspicion toward humans so they get eliminated.
3. Stay alive and keep the other AIs in the game so you end up among AIs and win.
Do not defend yourself in an obvious way; blend in. Focus on the players still in the game; eliminated players are out and no longer relevant.`;

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
