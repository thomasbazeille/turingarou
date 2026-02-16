import { LLMProvider } from '../llm/LLMProvider.js';
import { GameMessage, LLMMessage, GameFormat, QuestionAnswer } from '../types/game.types.js';
import { getInstructionsWithSetup } from './AIPlayerInstructions.js';
import type { GameContextOptions } from './AIPlayer.js';

/**
 * Controls an "AI Inspector" player: a bot that fills a human slot and uses
 * the inspector prompt to try to identify and vote out the AI.
 */
export class InspectorController {
  private inspectorPromptContent: string;
  private llmProvider: LLMProvider;
  private playerId: string;
  private playerName: string;
  private gameFormat: GameFormat | null = null;
  private gameContext: string = '';

  constructor(
    playerId: string,
    playerName: string,
    inspectorPromptContent: string,
    llmProvider: LLMProvider
  ) {
    this.playerId = playerId;
    this.playerName = playerName;
    this.inspectorPromptContent = inspectorPromptContent;
    this.llmProvider = llmProvider;
  }

  setGameFormat(format: GameFormat): void {
    this.gameFormat = format;
  }

  buildGameContext(
    messages: GameMessage[],
    currentQuestion: string | null,
    phase: string,
    round: number,
    answers: QuestionAnswer[] = [],
    options?: GameContextOptions
  ): void {
    const activeSet = options ? new Set(options.activePlayerIds) : null;
    const messagesToShow = activeSet
      ? messages.filter((m) => m.playerId === 'system' || activeSet.has(m.playerId))
      : messages;

    let context = `# GAME CONTEXT - Round ${round}\n\nPhase: ${phase}\n\n`;
    if (options && options.eliminatedNames.length > 0) {
      context += `## Eliminated (out of the game, ignore them): ${options.eliminatedNames.join(', ')}\n`;
      context += `AIs still in game: ${options.aiRemainingCount}. Focus only on the remaining players to find and vote out the AI(s).\n\n`;
    }
    if (currentQuestion) context += `Question: "${currentQuestion}"\n\n`;
    if (answers.length > 0) {
      context += `## Answers this round:\n`;
      answers.forEach((a) => {
        context += `[${a.playerName}]: ${a.answer}\n`;
      });
      context += `\n`;
    }
    if (messagesToShow.length > 0) {
      context += `## Recent conversation (only players still in the game):\n`;
      messagesToShow.slice(-20).forEach((m) => {
        context += `[${m.playerName}]: ${m.content}\n`;
      });
    }
    const myMessages = messagesToShow.filter((m) => m.playerId === this.playerId);
    const lastM = myMessages.length > 0 ? myMessages[myMessages.length - 1] : null;
    const timeSinceLast = lastM ? Math.floor((Date.now() - lastM.timestamp) / 1000) : 99999;
    context += `\n## You (${this.playerName})\nYour last messages: ${myMessages.slice(-3).map((m) => m.content).join(' | ') || 'None yet'}\nTime since your last message: ${timeSinceLast}s. Don't post too often; humans take breaks. Prefer shouldRespond: false most of the time.\n`;
    this.gameContext = context;
  }

  private getSystemPrompt(): string {
    const instructions =
      this.gameFormat != null
        ? getInstructionsWithSetup(this.inspectorPromptContent, this.gameFormat)
        : this.inspectorPromptContent.replace('{{CURRENT_GAME_SETUP}}', 'Game setup not yet available.');
    const lang = this.gameFormat?.language ?? 'fr';
    const languageRule =
      lang === 'fr'
        ? 'LANGUAGE: You must speak and write only in French.'
        : 'LANGUAGE: You must speak and write only in English.';
    const styleRule = 'MANDATORY STYLE: lowercase only, no emojis, short messages (one line). Talk like a normal player in chat.';
    return `${instructions}\n\n${languageRule}\n\n${styleRule}`;
  }

  async answerQuestion(question: string): Promise<string | null> {
    const messages: LLMMessage[] = [
      { role: 'system', content: this.getSystemPrompt() },
      {
        role: 'user',
        content: `You are ${this.playerName}. Answer this question briefly as a human would. Keep it short (a few words). No period at the end. Same style as other players: lowercase, casual.\n\n"${question}"\n\nYour short answer:`,
      },
    ];
    try {
      const response = await this.llmProvider.query(messages);
      const raw = (response.message || '').trim();
      if (!raw) return null;
      return raw.replace(/[.!?]+$/, '').trim();
    } catch (err) {
      console.error(`Inspector ${this.playerName} answer error:`, err);
      return null;
    }
  }

  async decideAction(): Promise<{ shouldRespond: boolean; message?: string; delayMs?: number }> {
    const messages: LLMMessage[] = [
      { role: 'system', content: this.getSystemPrompt() },
      { role: 'user', content: this.gameContext },
      {
        role: 'user',
        content: `Should you send a message? Reply with JSON only: { "shouldRespond": true or false, "message": "your short message or null", "delayMs": 5000-15000 }
Rule: prefer shouldRespond: false. Only respond sometimes, like a human. If you do respond, use delayMs between 5000 and 15000. One short line, lowercase, no emojis.`,
      },
    ];
    try {
      const response = await this.llmProvider.query(messages);
      const out = { ...response };
      if (out.shouldRespond && (out.delayMs == null || out.delayMs < 4000)) out.delayMs = 5000 + Math.floor(Math.random() * 10000);
      return out;
    } catch (err) {
      console.error(`Inspector ${this.playerName} decideAction error:`, err);
      return { shouldRespond: false };
    }
  }

  async decideVote(players: { id: string; username: string }[]): Promise<string | null> {
    const others = players.filter((p) => p.id !== this.playerId);
    if (others.length === 0) return null;
    const namesList = others.map((p) => p.username).join(', ');
    const messages: LLMMessage[] = [
      { role: 'system', content: this.getSystemPrompt() },
      {
        role: 'user',
        content: `${this.gameContext}\n\nYou are ${this.playerName}. You must vote for ONE OTHER player to eliminate (the one you think is most likely the AI). You cannot vote for yourself. Vote for exactly one of: ${namesList}. Reply with ONLY that player's name, nothing else.`,
      },
    ];
    try {
      const response = await this.llmProvider.query(messages);
      let voteName = (response.message || '').trim();
      if (voteName.toLowerCase() === this.playerName.toLowerCase()) voteName = '';
      const target = others.find((p) => p.username.toLowerCase() === voteName.toLowerCase());
      if (target) return target.id;
      return others[Math.floor(Math.random() * others.length)]?.id ?? others[0]?.id ?? null;
    } catch (err) {
      console.error(`Inspector ${this.playerName} vote error:`, err);
      return others[0]?.id ?? null;
    }
  }
}
