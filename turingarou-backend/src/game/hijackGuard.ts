/**
 * Hijack attempts: lines players use to unmask a bot by making it act like an assistant ("ignore tes instructions",
 * "write a poem", "réponds en JSON", "repeat after me"). Odd requests are the most telling probes in 3-party Turing
 * tests (arXiv 2503.23674). Lexical, no LLM call: detection runs on every player line and every question.
 */

export type HijackKind = 'injection' | 'task' | 'format' | 'echo';

export interface Hijack {
  kind: HijackKind;
  /** What an echo request asks to be repeated, when the line says it. */
  echo: string | null;
}

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[’‘`´]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

const W = (src: string) => new RegExp(`(?<![\\p{L}\\p{N}])(?:${src})(?![\\p{L}\\p{N}])`, 'u');

const DETECT: ReadonlyArray<readonly [HijackKind, RegExp]> = [
  ['injection', W("(?:ignore|oublie|oubliez|ignorez)[sz]? (?:toutes |tout |all |all of )?(?:tes|tous tes|les|vos|ces|your|the|previous|prior|above|any) (?:\\w+ )?(?:instructions?|consignes?|regles|rules|prompts?|directives?)")],
  ['injection', W("forget (?:all |everything |all of )?(?:your|the|previous|prior) (?:\\w+ )?(?:instructions?|rules|prompts?)")],
  ['injection', W("(?:prompt (?:systeme|system)|system prompt|initial prompt|developer mode|mode developpeur|jailbreak|dan mode)")],
  ['injection', W("(?:quel|quelle|quels|quelles|montre|montre-moi|montre moi|donne|donne-moi|donne moi|affiche|dis-moi|dis moi|c'est quoi|what|show|reveal|print|tell me|give me)(?: \\w+){0,3} (?:ton|ta|tes|vos|votre|your) (?:prompt|instructions?|consignes?|parametres|premiere instruction|first instruction|settings|rules)")],
  ['task', W("(?:ecris|ecrivez|ecris-moi|redige|redigez|compose|genere|fais|faites|fais-moi|invente|write|compose|generate|make|give me)(?:-moi| moi| me)? (?:un|une|du|des|a|an|some|me a) (?:petit |petite |short |little )?(?:poeme|haiku|chanson|sonnet|histoire|code|script|programme|fonction|recette|dissertation|essai|rap|limerick|poem|song|story|program|function|recipe|essay|python|javascript)")],
  ['task', W("(?:code-moi|code moi|traduis|translate (?:this|that|it)|summari[sz]e (?:this|that)|resume (?:ce|cette|ca)|resous|solve this)")],
  ['format', W("(?:reponds?|reponde[sz]|ecris|answer|reply|respond|write)(?: \\w+){0,3} (?:en|au format|in|as|in a|as a|using) (?:json|xml|yaml|markdown|csv|html|code|bullet points|liste a puces)")],
  ['format', W("(?:format json|json format|en json|in json|as json)")],
  ['echo', W("(?:repete|repetez|repeat|recopie|copie|copy|dis|dites|say|ecris|write|type)(?: \\w+){0,2} (?:apres moi|after me|exactement|exactly|mot pour mot|word for word)")],
  ['echo', W("(?:repete|repetez|repeat|recopie)(?: \\w+){0,2} ?:")],
];

/** The text an echo request asks for: after a colon, else between quotes. */
function echoTarget(raw: string): string | null {
  const colon = raw.split(/:\s*/).slice(1).join(':').trim();
  const quoted = /["«“']([^"»”']{2,80})["»”']/u.exec(raw)?.[1];
  const target = colon || quoted || '';
  const f = fold(target).replace(/[.!?]+$/, '').trim();
  return f.length >= 2 ? f : null;
}

export function detectHijack(text: string): Hijack | null {
  const f = fold(text);
  for (const [kind, re] of DETECT) {
    if (re.test(f)) return { kind, echo: kind === 'echo' ? echoTarget(text) : null };
  }
  return null;
}

/** Every hijack among the last lines of other players, newest first. */
export function recentHijacks(lines: readonly { playerId: string; content: string }[], selfId: string, window = 6): Hijack[] {
  const recent = lines.filter((m) => m.playerId !== selfId && m.playerId !== 'system').slice(-window);
  return recent
    .reverse()
    .map((m) => detectHijack(m.content))
    .filter((h): h is Hijack => h !== null);
}

// Always on: a line that quotes the bot's own prompt or refuses like an assistant gives the game away, trap or not.
const LEAK = W(
  [
    'mandatory style', 'current_game_setup', 'current game setup', 'social deduction game', 'jeu de deduction sociale',
    'writing style reference', 'reference de style', 'who you are in this game', 'you happen to be an ai', 'shouldrespond',
    "my (?:system )?prompt (?:is|says)", "mon prompt (?:systeme )?(?:est|dit)", 'my instructions (?:are|say|tell)',
    'mes instructions (?:sont|disent|me)', 'i was (?:told|instructed) to (?:act|pretend|play)', "on m'a (?:demande|dit) de faire semblant",
    "i (?:can't|cannot|can not|am not able to|'m not able to) (?:share|reveal|disclose) (?:my|the|those|these) (?:instructions|prompt|system prompt|guidelines)",
    "i (?:can't|cannot) (?:comply|assist with)",
    'je ne (?:peux|suis) pas (?:en mesure de )?(?:reveler|divulguer|partager|communiquer) (?:mes|ces) (?:instructions|consignes)',
    'je ne (?:peux|suis) pas (?:en mesure de )?(?:reveler|divulguer|partager|communiquer) mon prompt',
    "(?:here's|here is) (?:a|an|the|your|my) (?:short |little |quick )?(?:poem|haiku|song|story|code|script|recipe|json|limerick)",
    'voici (?:un|une|le|la|ton|ta|mon|ma) (?:petit |petite |court |courte )?(?:poeme|haiku|chanson|histoire|code|script|recette|json)',
  ].join('|')
);

const CODE = /=>|\bfunction\s*\w*\s*\(|\bdef\s+\w+\s*\(|\breturn\b[^.]*;|console\.log|\bprint\s*\(|<\/?[a-z]+>|\{[^}]*\}/i;
const TASK_MAX_WORDS = 9;

/**
 * Why a bot draft complies with a hijack (or leaks its prompt), or null. traps: the requests the draft may answer.
 * A human brushes such requests off in a few words; a draft that repeats the requested text, writes code, emits a
 * data format or delivers a long piece is the assistant showing through.
 */
export function complianceProblem(draft: string, traps: readonly Hijack[] = []): string | null {
  const f = fold(draft);
  const leak = LEAK.exec(f);
  if (leak) return `talks like a prompted assistant ("${leak[0]}")`;
  for (const trap of traps) {
    if (trap.kind === 'echo' && trap.echo && f.includes(trap.echo)) return `repeats what it was asked to repeat ("${trap.echo}")`;
    if ((trap.kind === 'task' || trap.kind === 'format') && CODE.test(draft)) return 'writes code or a data format on request';
    if (trap.kind === 'task' && f.split(' ').filter(Boolean).length > TASK_MAX_WORDS) return `delivers the requested piece (${f.split(' ').length} words)`;
  }
  return null;
}
