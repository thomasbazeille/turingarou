import { LLMProvider } from '../llm/LLMProvider.js';
import { AIPlayerData, GameMessage, LLMMessage, AIPersonality, GameFormat, QuestionAnswer } from '../types/game.types.js';
import { getInstructionsWithSetup, AI_GOAL_BLOCK } from './AIPlayerInstructions.js';

export interface GameContextOptions {
  activePlayerIds: string[];
  eliminatedNames: string[];
  aiRemainingCount: number;
}

export class AIPlayer {
  private player: AIPlayerData;
  private llmProvider: LLMProvider;
  private strategyContent: string;
  private gameContext: string = '';
  private gameFormat: GameFormat | null = null;

  constructor(player: AIPlayerData, llmProvider: LLMProvider, strategyContent: string) {
    this.player = player;
    this.llmProvider = llmProvider;
    this.strategyContent = strategyContent;
  }

  setGameFormat(format: GameFormat): void {
    this.gameFormat = format;
  }

  /**
   * Construit le contexte du jeu pour l'IA.
   * options: joueurs encore en jeu, exclus, nombre d'IA restantes — le chat ne contient que les messages des joueurs actifs.
   */
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

    let context = `# GAME CONTEXT - Round ${round}\n\n`;
    context += `Current phase: ${phase}\n\n`;

    if (options && options.eliminatedNames.length > 0) {
      context += `## Eliminated (out of the game, ignore them): ${options.eliminatedNames.join(', ')}\n`;
      context += `AIs still in game: ${options.aiRemainingCount}. Focus only on the remaining players. Your goal: get humans voted out and stay with the other AIs to win.\n\n`;
    }

    if (currentQuestion) {
      context += `Current question: "${currentQuestion}"\n\n`;
    }

    if (answers.length > 0) {
      context += `## Answers to the question this round:\n`;
      answers.forEach((a) => {
        context += `[${a.playerName}]: ${a.answer}\n`;
      });
      context += `\n`;
    }

    if (phase === 'discussion' && answers.length > 0) {
      context += `⚠️ Do NOT keep talking about or justifying your own answer. The goal now is to steer suspicion toward humans and find who the other AIs are (blend in, get humans voted out). A human would not forget that.\n\n`;
    }

    if (phase === 'discussion') {
      const discussionMessages = messagesToShow.filter((m) => m.phase === 'discussion');
      if (discussionMessages.length === 0) {
        context += `\n⚠️ No one has posted in this discussion yet. Being the first to speak is suspicious. Prefer shouldRespond: false, or if you do respond use a long delay (delayMs: 15000-25000).\n\n`;
      }
    }

    if (messagesToShow.length > 0) {
      context += `## Recent conversation (only players still in the game):\n`;
      const recentMessages = messagesToShow.slice(-20);
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
   * L'IA répond à la question posée, ou retourne null pour ne pas répondre (comme un humain qui skip).
   */
  async answerQuestion(question: string): Promise<string | null> {
    const messages: LLMMessage[] = [
      {
        role: 'system',
        content: this.buildFullSystemPrompt(),
      },
      {
        role: 'user',
        content: `You are playing as ${this.player.username}. Answer this question as a human would, staying in character.\n\nIMPORTANT: Keep your answer SHORT: one short sentence or a few words only. No paragraph, no list. Do NOT end your answer with a period or any punctuation (no full stop at the end).\n\nTake some distance: you can take the question with a grain of salt, answer with light second-degree or humor, or answer very simply (minimal, even one word). Humans often don't take every question literally.\n\nHumans often skip or don't answer. If you prefer not to answer, reply with exactly: SKIP\n\n"${question}"\n\nProvide ONLY your short answer (no period at the end), or exactly SKIP to not answer.`,
      },
    ];

    try {
      const response = await this.llmProvider.query(messages);
      const raw = (response.message || '').trim();
      if (!raw || raw.toUpperCase() === 'SKIP' || raw.toUpperCase().startsWith('SKIP')) {
        return null;
      }
      const firstSentence = raw.split(/[.!?]\s/)[0]?.trim() || raw;
      const short = firstSentence.length > 80 ? firstSentence.slice(0, 77) + '...' : firstSentence;
      const final = short || raw.slice(0, 80);
      // Ne jamais enlever le ? ; pour . et ! on n'enlève que dans 60% des cas (40% on garde)
      if (Math.random() < 0.6) {
        return final.replace(/[.!]+$/, '').trim();
      }
      return final.trim();
    } catch (error) {
      console.error(`AI ${this.player.username} answer error:`, error);
      return null;
    }
  }

  /**
   * L'IA décide pour qui voter (basé sur suspicion).
   * Retourne null s'il n'y a personne d'autre à voter (ex: seul joueur actif).
   */
  async decideVote(players: { id: string; username: string }[]): Promise<string | null> {
    const otherPlayers = players.filter((p) => p.id !== this.player.id);
    if (otherPlayers.length === 0) return null;

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

      const targetPlayer = otherPlayers.find(
        (p) => p.username.toLowerCase() === voteName.toLowerCase()
      );

      return targetPlayer?.id ?? otherPlayers[0].id;
    } catch (error) {
      console.error(`AI ${this.player.username} vote error:`, error);
      return otherPlayers[0]?.id ?? null;
    }
  }

  private buildFullSystemPrompt(): string {
    const personality = this.player.personality.systemPrompt;
    const instructions =
      this.gameFormat != null
        ? getInstructionsWithSetup(this.strategyContent, this.gameFormat)
        : this.strategyContent.replace('{{CURRENT_GAME_SETUP}}', 'Current game setup not yet available.');
    const lang = this.gameFormat?.language ?? 'fr';
    const goalBlock = AI_GOAL_BLOCK;
    const languageRule =
      lang === 'fr'
        ? 'LANGUAGE: You must speak and write only in French. All your messages, answers, and vote reasoning must be in French.'
        : 'LANGUAGE: You must speak and write only in English. All your messages, answers, and vote reasoning must be in English.';
    const styleRule = 'MANDATORY STYLE: Never use emojis or smileys. Never use capital letters (write in lowercase only, e.g. "i think" not "I think").';
    return `${personality}

${goalBlock}

${instructions}

${languageRule}

${styleRule}

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
