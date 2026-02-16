import { LLMProvider } from '../llm/LLMProvider.js';
import { GameMessage, LLMMessage, GameFormat, QuestionAnswer } from '../types/game.types.js';
import { getInstructionsWithSetup } from './AIPlayerInstructions.js';

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
    answers: QuestionAnswer[] = []
  ): void {
    let context = `# GAME CONTEXT - Round ${round}\n\nPhase: ${phase}\n\n`;
    if (currentQuestion) context += `Question: "${currentQuestion}"\n\n`;
    if (answers.length > 0) {
      context += `## Answers this round:\n`;
      answers.forEach((a) => {
        context += `[${a.playerName}]: ${a.answer}\n`;
      });
      context += `\n`;
    }
    if (messages.length > 0) {
      context += `## Recent conversation:\n`;
      messages.slice(-20).forEach((m) => {
        context += `[${m.playerName}]: ${m.content}\n`;
      });
    }
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
    return `${instructions}\n\n${languageRule}`;
  }

  async answerQuestion(question: string): Promise<string | null> {
    const messages: LLMMessage[] = [
      { role: 'system', content: this.getSystemPrompt() },
      {
        role: 'user',
        content: `You are ${this.playerName} (Inspector). Answer this question briefly as a human would. Keep it short (a few words). No period at the end.\n\n"${question}"\n\nYour short answer:`,
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
        content: `As the inspector, do you want to send a message to probe or accuse? Reply with JSON: { "shouldRespond": true/false, "message": "your message or null", "delayMs": 2000-6000 }`,
      },
    ];
    try {
      const response = await this.llmProvider.query(messages);
      return response;
    } catch (err) {
      console.error(`Inspector ${this.playerName} decideAction error:`, err);
      return { shouldRespond: false };
    }
  }

  async decideVote(players: { id: string; username: string }[]): Promise<string | null> {
    const others = players.filter((p) => p.id !== this.playerId);
    if (others.length === 0) return null;
    const messages: LLMMessage[] = [
      { role: 'system', content: this.getSystemPrompt() },
      {
        role: 'user',
        content: `${this.gameContext}\n\nWho do you vote to eliminate (most likely AI)? Players: ${others.map((p) => p.username).join(', ')}. Reply with ONLY the player's name.`,
      },
    ];
    try {
      const response = await this.llmProvider.query(messages);
      const voteName = (response.message || '').trim();
      const target = others.find((p) => p.username.toLowerCase() === voteName.toLowerCase());
      return target?.id ?? others[0]?.id ?? null;
    } catch (err) {
      console.error(`Inspector ${this.playerName} vote error:`, err);
      return others[0]?.id ?? null;
    }
  }
}
