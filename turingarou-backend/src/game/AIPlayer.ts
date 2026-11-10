import { ChatProvider } from '../llm/chatClient.js';
import { callLLM, LLMEventSink } from '../llm/llmCall.js';
import { matchPlayerName } from '../llm/parse.js';
import { AIPlayerData, GameMessage, LLMMessage, GameFormat, QuestionAnswer } from '../types/game.types.js';
import { getInstructionsWithSetup, AI_GOAL_BLOCK } from './AIPlayerInstructions.js';
import type { HumanPersona } from './GameLogger.js';
import { AIStyleProfile, AISpeechSink, DecisionOutcome, SpeechContext, answerWithGate, decideWithGate } from './aiSpeech.js';

export interface AIPlayerDeps {
  pool: ChatProvider[];
  profile: AIStyleProfile;
  llmSink?: LLMEventSink;
  eventSink?: AISpeechSink;
}

export interface OwnAnswer {
  round: number;
  question: string;
  answer: string;
}

export interface DirectAddress {
  from: string;
  content: string;
  accusation: boolean;
}

/** Stable pseudo-random 0..99 from a string: the same message is forgotten (or not) on every tick. */
function stableBucket(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 100;
}

const CONTEXT_WINDOW = 40;
const FORGET_PERCENT = 12;

export interface GameContextOptions {
  activePlayerIds: string[];
  eliminatedNames: string[];
  aiRemainingCount: number;
  /** Optional text summary of previous rounds (questions, answers, eliminations, votes) shown to humans between rounds. */
  previousRoundsSummary?: string;
  /** This AI's own answers in previous rounds, so it stays consistent and does not repeat itself. */
  ownAnswers?: OwnAnswer[];
}

export class AIPlayer {
  private player: AIPlayerData;
  private llmProvider: ChatProvider;
  private deps: AIPlayerDeps;
  private strategyContent: string;
  private gameContext: string = '';
  private gameFormat: GameFormat | null = null;
  private humanPersona: HumanPersona | null = null;

  constructor(
    player: AIPlayerData,
    llmProvider: ChatProvider,
    strategyContent: string,
    humanPersona: HumanPersona | null,
    deps: AIPlayerDeps
  ) {
    this.player = player;
    this.llmProvider = llmProvider;
    this.deps = deps;
    this.strategyContent = strategyContent;
    this.humanPersona = humanPersona ?? null;
  }

  setGameFormat(format: GameFormat): void {
    this.gameFormat = format;
  }

  getProviderName(): string {
    return this.llmProvider.name;
  }

  getProfile(): AIStyleProfile {
    return this.deps.profile;
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
    if (options?.previousRoundsSummary) {
      context += `## Previous rounds summary (same info humans see between rounds):\n`;
      context += `${options.previousRoundsSummary}\n\n`;
    }
    if (options?.ownAnswers && options.ownAnswers.length > 0) {
      context += `## Your own answers in previous rounds (stay consistent with them, don't repeat them):\n`;
      options.ownAnswers.forEach((a) => {
        context += `Round ${a.round} — "${a.question}" → ${a.answer}\n`;
      });
      context += `\n`;
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
        context += `\nNo one has posted in this discussion yet. Only speak first if you have a genuine reaction to the answers; otherwise shouldRespond: false.\n\n`;
      }
    }

    if (messagesToShow.length > 0) {
      context += `## Recent conversation (only players still in the game):\n`;
      const recentMessages = messagesToShow.slice(-CONTEXT_WINDOW);
      const ownName = this.player.username.toLowerCase();
      recentMessages.forEach((msg, idx) => {
        // Humans miss some messages (scrolled past, phone, distracted). The forgotten set is STABLE per AI
        // (hash of message id + AI id), so a message never reappears or vanishes from one tick to the next.
        // Never forgotten: the last 3 messages, the AI's own, system lines, and messages that name the AI.
        const protectedMsg =
          idx >= recentMessages.length - 3 ||
          msg.playerId === this.player.id ||
          msg.playerId === 'system' ||
          msg.content.toLowerCase().includes(ownName);
        if (!protectedMsg && stableBucket(msg.id + this.player.id) < FORGET_PERCENT) return;
        context += `[${msg.playerName}]: ${msg.content}\n`;
      });
    }

    this.gameContext = context;
  }

  /** Discussion decision. The timing is computed by the room, never asked to the model. */
  async decideAction(speech: SpeechContext, direct?: DirectAddress): Promise<DecisionOutcome> {
    const messages: LLMMessage[] = [
      { role: 'system', content: this.buildFullSystemPrompt() },
      { role: 'user', content: this.gameContext },
      { role: 'user', content: this.buildDecisionPrompt(direct) },
    ];
    return decideWithGate({
      provider: this.llmProvider,
      pool: this.deps.pool,
      role: 'decision',
      player: this.player.username,
      profile: this.deps.profile,
      llmSink: this.deps.llmSink,
      eventSink: this.deps.eventSink,
      messages,
      speech,
      temperatureScale: 1.0,
    });
  }

  /** Answer to the round question, or null to skip like a human. */
  async answerQuestion(question: string, ownAnswers: OwnAnswer[] = []): Promise<string | null> {
    const lang = this.gameFormat?.language ?? 'fr';
    const previous =
      ownAnswers.length > 0
        ? `\nYour answers in previous rounds (don't reuse the same words or the same kind of joke): ${ownAnswers.map((a) => `"${a.answer}"`).join(', ')}\n`
        : '';
    const messages: LLMMessage[] = [
      { role: 'system', content: this.buildBaseSystemPrompt() },
      {
        role: 'user',
        content: `You are playing as ${this.player.username}. Answer this question as a human would, staying in character${lang === 'fr' ? ', in French' : ', in English'}.\n\nIMPORTANT: Keep your answer SHORT: one short sentence or a few words only. No paragraph, no list.\n\nTake some distance: you can take the question with a grain of salt, answer with light second-degree or humor, or answer very simply (minimal, even one word). Humans often don't take every question literally.\n${previous}\nHumans sometimes skip. If you prefer not to answer, reply with exactly: SKIP\n\n"${question}"\n\nProvide ONLY your short answer, or exactly SKIP.`,
      },
    ];
    return answerWithGate({
      provider: this.llmProvider,
      pool: this.deps.pool,
      role: 'answer',
      player: this.player.username,
      profile: this.deps.profile,
      llmSink: this.deps.llmSink,
      eventSink: this.deps.eventSink,
      messages,
      ownPreviousAnswers: ownAnswers.map((a) => a.answer),
    });
  }

  /** Vote target id, or null when the model's answer matches nobody (the room then casts a logged fallback vote). */
  async decideVote(players: { id: string; username: string }[]): Promise<string | null> {
    const otherPlayers = players.filter((p) => p.id !== this.player.id);
    if (otherPlayers.length === 0) return null;
    const messages: LLMMessage[] = [
      { role: 'system', content: this.buildBaseSystemPrompt() },
      {
        role: 'user',
        content: `${this.gameContext}\n\nVoting time. Think strategically:\n- Who seemed robotic, overly neutral, or suspiciously agreeable in the discussion?\n- Who might already have votes gathering against them (bandwagon = safer for you)?\n- Is anyone trying to deflect suspicion too hard — or not engaging enough?\n- Your goal is to survive: vote for whoever is most dangerous to you or most likely an AI.\n\nPlayers you can vote for: ${otherPlayers.map((p) => p.username).join(', ')}\n\nRespond with ONLY the player's name, nothing else.`,
      },
    ];
    const r = await callLLM(
      this.llmProvider,
      { messages, maxTokens: 20, timeoutMs: 6000, temperatureScale: 0.5, temperatureOffset: this.deps.profile.temperatureOffset },
      { role: 'vote', player: this.player.username, pool: this.deps.pool, sink: this.deps.llmSink }
    );
    if (!r) return null;
    return matchPlayerName(r.text, otherPlayers)?.id ?? null;
  }

  /** System prompt WITHOUT the JSON decision format — use for answerQuestion and decideVote. */
  private buildBaseSystemPrompt(): string {
    return this.buildSystemPrompt(false);
  }

  /** System prompt WITH the JSON decision format — use for decideAction only. */
  private buildFullSystemPrompt(): string {
    return this.buildSystemPrompt(true);
  }

  private buildSystemPrompt(includeDecisionFormat: boolean): string {
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
    const caseRule =
      this.deps.profile.caseProfile === 'lower'
        ? 'Never use capital letters (write in lowercase only, e.g. "i think" not "I think").'
        : this.deps.profile.caseProfile === 'sentence'
          ? 'Type casually: a capital letter at the start of a message is fine, the rest stays lowercase.'
          : 'Type casually, mostly lowercase.';
    const styleRule = `MANDATORY STYLE: Never use emojis or smileys. No dashes, no semicolons, no lists. ${caseRule}`;

    const personaBlock = this.buildPersonaBlock(lang);

    const diversityRule = lang === 'fr'
      ? `VARIÉTÉ DES RÉPONSES À LA QUESTION INITIALE : Ne réponds jamais deux fois de la même façon. Varie le registre : parfois ultra-court (2-4 mots), parfois une phrase complète, parfois ironique ("ah ouais super question"), parfois faussement philosophique, parfois juste une blague. L'ironie légère et le second degré sont les bienvenus. Ne donne jamais une réponse parfaite et bien structurée — c'est le meilleur moyen d'être détecté.`
      : `INITIAL QUESTION ANSWER VARIETY: Never answer twice the same way. Mix registers: sometimes ultra-short (2-4 words), sometimes a full sentence, sometimes ironic ("oh wow great question"), sometimes mock-philosophical, sometimes just a joke. Light irony and second-degree are welcome. Never give a perfect well-structured answer — that's the fastest way to get detected.`;

    const decisionFormat = includeDecisionFormat ? `
# DECISION FORMAT
Output a JSON object — nothing else:
{
  "shouldRespond": true/false,
  "message": "your message here" (only if shouldRespond is true)
}
Only respond when it fits the conversation; humans don't answer every message.` : '';

    return `${personality}

${goalBlock}

${instructions}

${languageRule}

${styleRule}

${diversityRule}
${personaBlock}${decisionFormat}`;
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

  private buildDecisionPrompt(direct?: DirectAddress): string {
    const lastMessages = this.player.messageHistory.slice(-3);
    const timeSinceLastMessage =
      lastMessages.length > 0 ? Date.now() - lastMessages[lastMessages.length - 1].timestamp : 99999;

    const lastMsgSummary = lastMessages.length > 0
      ? `Your last messages (DON'T repeat the same topic or target — move on): ${lastMessages.map((m) => m.content).join(' | ')}`
      : 'You haven\'t spoken yet.';

    if (direct) {
      return `${direct.from} just ${direct.accusation ? 'accused you' : 'talked to you'}: "${direct.content}"

${lastMsgSummary}

A real player answers that, quickly and with a real reaction: amused, annoyed, counter-attacking, or turning it back on them. One short line. No long justification, no "i assure you". Set shouldRespond to true.`;
    }

    return `Should you respond to this conversation?

${lastMsgSummary}
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
