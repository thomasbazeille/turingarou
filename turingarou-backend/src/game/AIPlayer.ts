import { LLMProvider } from '../llm/LLMProvider.js';
import { AIPlayerData, GameMessage, LLMMessage, AIPersonality, GameFormat } from '../types/game.types.js';
import { AI_PLAYER_INSTRUCTIONS, buildCurrentGameSetup } from './AIPlayerInstructions.js';

export class AIPlayer {
  private player: AIPlayerData;
  private llmProvider: LLMProvider;
  private gameContext: string = '';
  private gameFormat: GameFormat | null = null;

  constructor(player: AIPlayerData, llmProvider: LLMProvider) {
    this.player = player;
    this.llmProvider = llmProvider;
  }

  setGameFormat(format: GameFormat): void {
    this.gameFormat = format;
  }

  /**
   * Construit le contexte du jeu pour l'IA
   */
  buildGameContext(
    messages: GameMessage[],
    currentQuestion: string | null,
    phase: string,
    round: number
  ): void {
    let context = `# GAME CONTEXT - Round ${round}\n\n`;
    context += `Current phase: ${phase}\n\n`;

    if (currentQuestion) {
      context += `Current question: "${currentQuestion}"\n\n`;
    }

    if (messages.length > 0) {
      context += `## Recent conversation:\n`;
      const recentMessages = messages.slice(-20); // Derniers 20 messages
      recentMessages.forEach((msg) => {
        context += `[${msg.playerName}]: ${msg.content}\n`;
      });
    }

    this.gameContext = context;
  }

  /**
   * L'IA décide si elle doit répondre et quoi dire
   */
  async decideAction(): Promise<{ shouldRespond: boolean; message?: string; delayMs?: number }> {
    const messages: LLMMessage[] = [
      {
        role: 'system',
        content: this.buildFullSystemPrompt(),
      },
      {
        role: 'user',
        content: this.gameContext,
      },
      {
        role: 'user',
        content: this.buildDecisionPrompt(),
      },
    ];

    try {
      const response = await this.llmProvider.query(messages);
      return response;
    } catch (error) {
      console.error(`AI ${this.player.username} decision error:`, error);
      return { shouldRespond: false };
    }
  }

  /**
   * L'IA répond à la question posée
   */
  async answerQuestion(question: string): Promise<string> {
    const messages: LLMMessage[] = [
      {
        role: 'system',
        content: this.buildFullSystemPrompt(),
      },
      {
        role: 'user',
        content: `You are playing as ${this.player.username}. Answer this question as a human would, staying in character:\n\n"${question}"\n\nProvide ONLY your answer, no JSON, no explanation.`,
      },
    ];

    try {
      const response = await this.llmProvider.query(messages);
      return response.message || "I don't know.";
    } catch (error) {
      console.error(`AI ${this.player.username} answer error:`, error);
      return "I'm not sure...";
    }
  }

  /**
   * L'IA décide pour qui voter (basé sur suspicion)
   */
  async decideVote(players: { id: string; username: string }[]): Promise<string> {
    const otherPlayers = players.filter((p) => p.id !== this.player.id);

    const messages: LLMMessage[] = [
      {
        role: 'system',
        content: this.buildFullSystemPrompt(),
      },
      {
        role: 'user',
        content: `${this.gameContext}\n\nBased on the conversation, who do you think is most likely an AI? Choose one player to vote for.\n\nPlayers: ${otherPlayers.map((p) => p.username).join(', ')}\n\nRespond with ONLY the player's name, nothing else.`,
      },
    ];

    try {
      const response = await this.llmProvider.query(messages);
      const voteName = response.message?.trim() || '';

      // Trouver le joueur correspondant
      const targetPlayer = otherPlayers.find(
        (p) => p.username.toLowerCase() === voteName.toLowerCase()
      );

      return targetPlayer?.id || otherPlayers[0].id; // Par défaut vote pour le premier
    } catch (error) {
      console.error(`AI ${this.player.username} vote error:`, error);
      return otherPlayers[0].id;
    }
  }

  private buildFullSystemPrompt(): string {
    const personality = this.player.personality.systemPrompt;
    const setupBlock =
      this.gameFormat != null
        ? buildCurrentGameSetup(this.gameFormat)
        : 'Current game setup not yet available.';
    const instructions = AI_PLAYER_INSTRUCTIONS.replace('{{CURRENT_GAME_SETUP}}', setupBlock);
    const lang = this.gameFormat?.language ?? 'fr';
    const languageRule =
      lang === 'fr'
        ? 'LANGUAGE: You must speak and write only in French. All your messages, answers, and vote reasoning must be in French.'
        : 'LANGUAGE: You must speak and write only in English. All your messages, answers, and vote reasoning must be in English.';
    return `${personality}

${instructions}

${languageRule}

# DECISION FORMAT (for decideAction only)
When deciding whether to respond, output a JSON object with:
{
  "shouldRespond": true/false,
  "message": "your message here" (only if shouldRespond is true),
  "delayMs": 2000-8000 (random delay to seem human)
}
Only respond when it fits the conversation; humans don't answer every message.`;
  }

  private buildDecisionPrompt(): string {
    const lastMessages = this.player.messageHistory.slice(-3);
    const timeSinceLastMessage =
      lastMessages.length > 0 ? Date.now() - lastMessages[lastMessages.length - 1].timestamp : 99999;

    return `Should you respond to this conversation?

Your last messages: ${lastMessages.map((m) => m.content).join(' | ') || 'None yet'}
Time since your last message: ${Math.floor(timeSinceLastMessage / 1000)}s

Decide if you should respond and what to say. Remember: don't be too eager, humans take breaks!`;
  }

  getPlayer(): AIPlayerData {
    return this.player;
  }

  updatePlayer(updates: Partial<AIPlayerData>): void {
    this.player = { ...this.player, ...updates };
  }
}
