import { LLMProvider } from '../llm/LLMProvider.js';
import { AIPlayerData, GameMessage, LLMMessage, AIPersonality, GameFormat, QuestionAnswer } from '../types/game.types.js';
import { getInstructionsWithSetup, AI_GOAL_BLOCK } from './AIPlayerInstructions.js';
import type { HumanPersona } from './GameLogger.js';

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
  private humanPersona: HumanPersona | null = null;

  constructor(
    player: AIPlayerData,
    llmProvider: LLMProvider,
    strategyContent: string,
    humanPersona?: HumanPersona | null
  ) {
    this.player = player;
    this.llmProvider = llmProvider;
    this.strategyContent = strategyContent;
    this.humanPersona = humanPersona ?? null;
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
      context += `⚠️ Discussion time — react to the conversation, don't loop back to justifying your own answer. A real player would comment on what others said, make jokes, ask questions, be curious or suspicious. Don't strategize out loud; just react like a person.\n\n`;
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
        content: `${this.gameContext}\n\nVoting time. Think strategically:\n- Who seemed robotic, overly neutral, or suspiciously agreeable in the discussion?\n- Who might already have votes gathering against them (bandwagon = safer for you)?\n- Is anyone trying to deflect suspicion too hard — or not engaging enough?\n- Your goal is to survive: vote for whoever is most dangerous to you or most likely an AI.\n\nPlayers you can vote for: ${otherPlayers.map((p) => p.username).join(', ')}\n\nRespond with ONLY the player's name, nothing else.`,
      },
    ];

    try {
      const response = await this.llmProvider.query(messages);
      const voteName = response.message?.trim() || '';

      const targetPlayer = otherPlayers.find(
        (p) => p.username.toLowerCase() === voteName.toLowerCase()
      );

      return targetPlayer?.id ?? null; // unmatched name → no vote
    } catch (error) {
      console.error(`AI ${this.player.username} vote error:`, error);
      return null;
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

    const personaBlock = this.buildPersonaBlock(lang);

    const diversityRule = lang === 'fr'
      ? `VARIÉTÉ DES RÉPONSES À LA QUESTION INITIALE : Ne réponds jamais deux fois de la même façon. Varie le registre : parfois ultra-court (2-4 mots), parfois une phrase complète, parfois ironique ("ah ouais super question"), parfois faussement philosophique, parfois juste une blague. L'ironie légère et le second degré sont les bienvenus. Ne donne jamais une réponse parfaite et bien structurée — c'est le meilleur moyen d'être détecté.`
      : `INITIAL QUESTION ANSWER VARIETY: Never answer twice the same way. Mix registers: sometimes ultra-short (2-4 words), sometimes a full sentence, sometimes ironic ("oh wow great question"), sometimes mock-philosophical, sometimes just a joke. Light irony and second-degree are welcome. Never give a perfect well-structured answer — that's the fastest way to get detected.`;

    return `${personality}

${goalBlock}

${instructions}

${languageRule}

${styleRule}

${diversityRule}
${personaBlock}
# DECISION FORMAT (for decideAction only)
When deciding whether to respond, output a JSON object with:
{
  "shouldRespond": true/false,
  "message": "your message here" (only if shouldRespond is true),
  "delayMs": 2000-8000 (random delay to seem human)
}
Only respond when it fits the conversation; humans don't answer every message.`;
  }

  /**
   * Construit un bloc de style basé sur les messages passés d'un vrai joueur humain.
   * L'IA doit imiter le ton et le style d'écriture sans copier mot pour mot.
   */
  private buildPersonaBlock(lang: 'fr' | 'en'): string {
    if (!this.humanPersona) return '';

    const { sampleMessages, sampleAnswers } = this.humanPersona;
    if (sampleMessages.length === 0) return '';

    const header =
      lang === 'fr'
        ? `\n# RÉFÉRENCE DE STYLE D'ÉCRITURE\nAdopte subtilement le style d'écriture des messages suivants (vrais messages d'un joueur humain). Imite leur ton, longueur de phrase, ponctuation et vocabulaire — sans les copier littéralement. Ne mentionne jamais cette référence.\n`
        : `\n# WRITING STYLE REFERENCE\nSubtly adopt the writing style shown below (real messages from a human player). Mimic their tone, sentence length, punctuation habits and vocabulary — do NOT copy them literally. Never mention this reference.\n`;

    const msgs = sampleMessages.map((m) => `  - "${m}"`).join('\n');

    let ansBlock = '';
    if (sampleAnswers.length > 0) {
      const ansLabel = lang === 'fr' ? 'Exemples de réponses aux questions :' : 'Sample question answers:';
      ansBlock =
        '\n' +
        ansLabel +
        '\n' +
        sampleAnswers.map((a) => `  - [Q: ${a.question}] → ${a.answer}`).join('\n');
    }

    return `${header}\nExemples de messages :\n${msgs}${ansBlock}\n`;
  }

  private buildDecisionPrompt(): string {
    const lastMessages = this.player.messageHistory.slice(-3);
    const timeSinceLastMessage =
      lastMessages.length > 0 ? Date.now() - lastMessages[lastMessages.length - 1].timestamp : 99999;

    return `Should you respond to this conversation?

Your last messages: ${lastMessages.map((m) => m.content).join(' | ') || 'None yet'}
Time since your last message: ${Math.floor(timeSinceLastMessage / 1000)}s

Ask yourself: is there something genuinely worth reacting to? A funny thing, a weird answer, something that bugs you, something you want to push back on? If yes — respond. If the chat is quiet or nothing stands out, stay silent (shouldRespond: false).

Don't respond just to seem active. Don't respond with pure strategy ("I think X is suspicious"). Respond because something in the conversation pulled a reaction from you.`;
  }

  getPlayer(): AIPlayerData {
    return this.player;
  }

  updatePlayer(updates: Partial<AIPlayerData>): void {
    this.player = { ...this.player, ...updates };
  }
}
