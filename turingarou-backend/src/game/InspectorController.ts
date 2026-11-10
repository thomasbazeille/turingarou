import { ChatProvider } from '../llm/chatClient.js';
import { callLLM } from '../llm/llmCall.js';
import { matchPlayerName } from '../llm/parse.js';
import { GameMessage, LLMMessage, GameFormat, QuestionAnswer } from '../types/game.types.js';
import { getInstructionsWithSetup } from './AIPlayerInstructions.js';
import type { AIPlayerDeps, GameContextOptions } from './AIPlayer.js';
import { DecisionOutcome, SpeechContext, answerWithGate, decideWithGate } from './aiSpeech.js';

/**
 * Controls an "AI Inspector" player: a bot that fills a human slot and uses
 * the inspector prompt to try to identify and vote out the AI.
 */
export class InspectorController {
  private inspectorPromptContent: string;
  private llmProvider: ChatProvider;
  private deps: AIPlayerDeps;
  private playerId: string;
  private playerName: string;
  private gameFormat: GameFormat | null = null;
  private gameContext: string = '';

  constructor(
    playerId: string,
    playerName: string,
    inspectorPromptContent: string,
    llmProvider: ChatProvider,
    deps: AIPlayerDeps
  ) {
    this.playerId = playerId;
    this.playerName = playerName;
    this.inspectorPromptContent = inspectorPromptContent;
    this.llmProvider = llmProvider;
    this.deps = deps;
  }

  getProviderName(): string {
    return this.llmProvider.name;
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
    if (options?.previousRoundsSummary) {
      context += `## Previous rounds summary (same info humans see between rounds):\n`;
      context += `${options.previousRoundsSummary}\n\n`;
    }
    if (answers.length > 0) {
      context += `## Answers this round:\n`;
      answers.forEach((a) => {
        context += `[${a.playerName}]: ${a.answer}\n`;
      });
      context += `\n`;
    }
    if (messagesToShow.length > 0) {
      context += `## Recent conversation (only players still in the game):\n`;
      messagesToShow.slice(-40).forEach((m) => {
        context += `[${m.playerName}]: ${m.content}\n`;
      });
    }
    const myMessages = messagesToShow.filter((m) => m.playerId === this.playerId);
    const lastM = myMessages.length > 0 ? myMessages[myMessages.length - 1] : null;
    const timeSinceLast = lastM ? Math.floor((Date.now() - lastM.timestamp) / 1000) : 99999;
    context += `\n## You (${this.playerName})\nYour last messages: ${myMessages.slice(-3).map((m) => m.content).join(' | ') || 'None yet'}\nTime since your last message: ${timeSinceLast}s. Respond when you have something genuine to say — a reaction, a question, something funny. Don't post just to seem active, but don't be silent for too long either.\n`;
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
        content: `You are ${this.playerName}. Answer this question briefly as a human would. Keep it short (a few words). Same style as other players: casual.\n\n"${question}"\n\nYour short answer:`,
      },
    ];
    return answerWithGate({
      provider: this.llmProvider,
      pool: this.deps.pool,
      role: 'inspector_answer',
      player: this.playerName,
      profile: this.deps.profile,
      llmSink: this.deps.llmSink,
      eventSink: this.deps.eventSink,
      messages,
      ownPreviousAnswers: [],
    });
  }

  async decideAction(speech: SpeechContext): Promise<DecisionOutcome> {
    const messages: LLMMessage[] = [
      { role: 'system', content: this.getSystemPrompt() },
      { role: 'user', content: this.gameContext },
      {
        role: 'user',
        content: `Should you send a message? Reply with JSON only: { "shouldRespond": true or false, "message": "your short message or null" }
Only respond if something in the conversation genuinely calls for it — a reaction, a question, something worth saying. One short line, no emojis. If nothing stands out, shouldRespond: false.`,
      },
    ];
    return decideWithGate({
      provider: this.llmProvider,
      pool: this.deps.pool,
      role: 'inspector_decision',
      player: this.playerName,
      profile: this.deps.profile,
      llmSink: this.deps.llmSink,
      eventSink: this.deps.eventSink,
      messages,
      speech,
      temperatureScale: 1.0,
    });
  }

  /** Vote target id, or null when the model's answer matches nobody (the room casts a logged fallback vote). */
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
    const r = await callLLM(
      this.llmProvider,
      { messages, maxTokens: 20, timeoutMs: 6000, temperatureScale: 0.5, temperatureOffset: this.deps.profile.temperatureOffset },
      { role: 'inspector_vote', player: this.playerName, pool: this.deps.pool, sink: this.deps.llmSink }
    );
    if (!r) return null;
    return matchPlayerName(r.text, others)?.id ?? null;
  }
}
