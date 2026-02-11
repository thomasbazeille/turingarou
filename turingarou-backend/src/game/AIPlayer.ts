import { LLMProvider } from '../llm/LLMProvider.js';
import { AIPlayerData, GameMessage, LLMMessage, AIPersonality } from '../types/game.types.js';

export class AIPlayer {
  private player: AIPlayerData;
  private llmProvider: LLMProvider;
  private gameContext: string = '';

  constructor(player: AIPlayerData, llmProvider: LLMProvider) {
    this.player = player;
    this.llmProvider = llmProvider;
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
        content: this.buildSystemPrompt(),
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
        content: this.player.personality.systemPrompt,
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
        content: this.player.personality.systemPrompt,
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

  private buildSystemPrompt(): string {
    return `${this.player.personality.systemPrompt}

# YOUR GOAL
Your goal is to BLEND IN as a human player and NOT get detected as an AI. You are playing a social deduction game where humans are trying to identify AIs.

# BEHAVIOR RULES
1. Act like a real human player - be natural, sometimes make typos, use casual language
2. Don't be too perfect or analytical
3. Engage in conversations naturally
4. Sometimes be wrong, confused, or contradictory
5. Use emojis occasionally but not excessively
6. Keep responses SHORT (1-2 sentences max)
7. Don't respond to EVERY message - humans don't do that

# DECISION FORMAT
When deciding whether to respond, you must output a JSON object with:
{
  "shouldRespond": true/false,
  "message": "your message here" (only if shouldRespond is true),
  "delayMs": 2000-8000 (random delay to seem human)
}

Only respond if:
- Someone asks you a direct question
- The conversation is relevant to you
- You have something valuable to add
- It's been a while since you last spoke`;
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
