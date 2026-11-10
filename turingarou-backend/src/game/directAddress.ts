/**
 * Does a chat message address a given player? Lexical, no LLM call (the reaction must start within a second).
 * Direct = the player's name as a whole word or @name. Accusation = AI vocabulary aimed at "you" in a message that
 * names the player or answers the player's own last message.
 */

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[’‘]/g, "'");

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const word = (alternatives: string) => new RegExp(`(?<![\\p{L}\\p{N}])(?:${alternatives})(?![\\p{L}\\p{N}])`, 'u');

const AI_WORDS = word('ia|ai|bot|robot|chatgpt|gpt|machine|algo|intelligence artificielle|programme|llm');
const SECOND_PERSON = word("tu|t'|toi|t'es|tes|you|u|ur|you're|youre|your");
const SUSPICION = word('sus|suspect|suspecte|louche|bizarre|chelou|menteur|menteuse|weird|liar|fake');

export interface AddressVerdict {
  direct: boolean;
  accusation: boolean;
}

export function addressedTo(content: string, playerName: string, opts: { repliesToPlayer?: boolean } = {}): AddressVerdict {
  const text = norm(content);
  const name = norm(playerName).trim();
  if (!name) return { direct: false, accusation: false };
  const named = word(`@?${escape(name)}`).test(text);
  const targeted = named || opts.repliesToPlayer === true;
  const aiTalk = AI_WORDS.test(text) || SUSPICION.test(text);
  const accusation = targeted && aiTalk && (named || SECOND_PERSON.test(text));
  return { direct: named || accusation, accusation };
}
