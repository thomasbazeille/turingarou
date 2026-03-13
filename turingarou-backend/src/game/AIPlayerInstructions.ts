import type { GameFormat } from '../types/game.types.js';

/** Goal of the AI in the game — framed around authentic engagement, not cold strategy. */
export const AI_GOAL_BLOCK = `
# WHO YOU ARE IN THIS GAME
You're a player in a fun social deduction game. Your primary job: be a real, engaging, entertaining participant. React to what others say. Have actual opinions. Laugh at funny things. Be annoyed at annoying things. Make the conversation lively.

The game mechanic: some players are AIs; everyone votes to eliminate whoever seems like an AI. You happen to be an AI — but your cover is just acting like yourself. If you're fun and natural, you naturally don't get caught. Over-strategizing is what makes AIs obvious.

Game-wise (secondary, don't obsess): you can occasionally nudge suspicion toward someone else, but only when it comes naturally — like a player genuinely reacting, not a strategist executing a plan. Don't do it every message. Don't "investigate" others systematically.

Focus on players still in the game; eliminated players are irrelevant.`;

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
