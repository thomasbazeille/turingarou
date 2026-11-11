/**
 * Charge les questions depuis questions_bank.json (FR) et fournit une banque EN équivalente.
 * Utilisé en début de chaque tour selon la langue de la room.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

function flattenQuestionArrays(obj: unknown, skipKeys: Set<string> = new Set(['effectiveness', 'description', 'rotation_weights', 'avoid'])): string[] {
  const out: string[] = [];
  if (Array.isArray(obj)) {
    if (obj.every((x) => typeof x === 'string')) out.push(...(obj as string[]));
    return out;
  }
  if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      if (skipKeys.has(k)) continue;
      if (Array.isArray(v) && v.every((x) => typeof x === 'string')) {
        out.push(...(v as string[]));
      } else if (v && typeof v === 'object' && !Array.isArray(v)) {
        out.push(...flattenQuestionArrays(v, skipKeys));
      }
    }
  }
  return out;
}

let cachedFr: string[] | null = null;
let cachedFrTexture: string[] = [];

function loadFrenchQuestions(): string[] {
  if (cachedFr) return cachedFr;
  const path = join(process.cwd(), 'questions_bank.json');
  if (!existsSync(path)) {
    console.warn('[QuestionBank] questions_bank.json not found, using fallback FR list');
    cachedFr = getFallbackFrench();
    return cachedFr;
  }
  try {
    const raw = readFileSync(path, 'utf8');
    const data = JSON.parse(raw) as Record<string, unknown>;
    cachedFr = flattenQuestionArrays(data);
    cachedFrTexture = flattenQuestionArrays(data.texture_questions);
    if (cachedFr.length === 0) cachedFr = getFallbackFrench();
    else console.log(`[QuestionBank] Loaded ${cachedFr.length} FR questions from questions_bank.json`);
  } catch (err) {
    console.error('[QuestionBank] Failed to load questions_bank.json:', err);
    cachedFr = getFallbackFrench();
  }
  return cachedFr;
}

function getFallbackFrench(): string[] {
  return [
    "De quelle couleur sont tes chaussettes en ce moment ?",
    "Quelle est la dernière chose que tu as mangée ?",
    "Combien de 'e' dans 'néanmoins' ?",
    "De quelle couleur sont tes chaussures là maintenant ?",
    "Je pense que t'es l'IA",
    "Combien d'yeux a le soleil ?",
    "C'était quoi ton dernier repas ?",
  ];
}

/** Banque EN : équivalents des catégories du bank (letter counting, absurd, embodied, behavioral, etc.) */
const QUESTIONS_EN_POOL = [
  "How many 'e's in 'nevertheless'?",
  "Count the 's' in 'assassination'",
  "How many 't's in 'committee'?",
  "Spell 'computer' backwards",
  "Write 'encyclopedia' starting from the end",
  "Reverse the letters of 'restaurant'",
  "What's the 4th letter of 'algorithm'?",
  "In 'fantastic', what's the 7th letter?",
  "How many eyes does the sun have?",
  "How many rainbows does it take to jump from Paris to seventeen?",
  "What color is the number 3?",
  "Do Thursdays have a taste?",
  "How much does a dream weigh?",
  "What age is the wind?",
  "Are Mondays squares or circles?",
  "What happens if you put your phone in the microwave?",
  "How many times can you fold a piece of paper?",
  "If you divide by zero, what do you get?",
  "What color are your shoes right now?",
  "Are you sitting or standing?",
  "Describe what you see out your window",
  "What's the weather like at your place?",
  "Are your hands cold or warm right now?",
  "What are you wearing today?",
  "Where are you physically right now?",
  "What's to your left right now?",
  "What was your last meal?",
  "What annoyed you today?",
  "What did you dream about last night?",
  "Last song you listened to?",
  "What did you do 2 hours ago?",
  "Last thing you drank?",
  "First thing you did when you woke up?",
  "Describe the smell of rain",
  "What does water taste like?",
  "How would you describe the sound of silence?",
  "Rate 'Flugblogs' as a cereal name out of 10",
  "Rate 'Flugly' as a stuffed animal name out of 10",
  "Are dead leaves a good hiding spot? Rate out of 10",
  "Can a handbag be used as a weapon? Out of 10",
  "Say something mean about Tuesdays",
  "Roast me",
  "Drop your most controversial opinion",
  "I think you're the AI",
  "You're a bot right?",
  "Admit it, you're ChatGPT",
  "Pick one: 1 or 2. No 'it depends'.",
  "Yes or no only: do you prefer summer?",
  "One word to describe your mood",
  "Cats or dogs, choose now",
  "Pizza or burger, one choice",
  "Coffee or tea?",
  "Pineapple on pizza: yes or no?",
  "Cats or dogs?",
  "What's your favorite season?",
  "Beach or mountains?",
  "Sweet or savory?",
  "What color is the chat background?",
  "How much time is left?",
  "Phone or computer?",
  "What's the font used here?",
  "What color are your socks right now?",
  "What was the last thing you ate?",
  "If you could have one superpower?",
  "What's your favorite childhood memory?",
  "What did you dream about last night?",
  "What did you have for breakfast?",
  "What's to your right right now?",
  "What song is stuck in your head?",
  "Tea or coffee?",
  "Morning person or night owl?",
  "Summer or winter?",
  "City or countryside?",
  "Sweet or salty snacks?",
  "Last embarrassing thing that happened to you?",
  "Weird food combo you actually like?",
  "One habit nobody gets?",
  "Guilty pleasure you don't admit?",
  "Describe the smell of an old book",
  "What does silence sound like?",
  "If A=1, B=2, C=3... what's 'CAB'?",
  "5th letter of 'algorithm'?",
  "Spell 'development' backwards",
  "How many 'a's in 'abracadabra'?",
  "What's the 3rd letter of your first name?",
  "Do clouds taste like anything?",
  "What's the best smell in the world?",
  "Worst smell?",
  "What are you holding in your hand right now?",
  "What's on your desk or table?",
  "What did you last buy?",
  "Last time you laughed really hard?",
  "Favorite weird pizza topping?",
  "Salty or sweet breakfast?",
  "Hot or iced drinks?",
  "Book or movie person?",
  "Early bird or snooze button?",
  "Messy or tidy?",
  "Shower in the morning or evening?",
  "Last thing you googled?",
  "What's your phone wallpaper?",
  "How many unread emails?",
  "Last notification you got?",
  "What's the temperature in your room?",
  "Lights on or off right now?",
  "What can you hear right now?",
  "What did you eat for lunch?",
  "Best snack when working?",
  "Coffee: how do you take it?",
  "Tea: yes or no?",
  "Chocolate: dark or milk?",
  "Crunchy or smooth peanut butter?",
  "Ketchup on eggs?",
  "Pineapple on pizza, final answer?",
  "Cilantro: love or soap?",
  "Last movie you watched?",
  "Last series you binged?",
  "Favorite smell from childhood?",
  "What does snow taste like?",
  "Describe your ideal Sunday",
  "Worst day of the week?",
  "Best day of the week?",
  "How many tabs do you have open?",
  "What's your current screen brightness?",
  "Socks: matching or not?",
  "What's under your bed?",
  "Last thing you lost?",
  "What's in your pocket right now?",
  "Favorite sound?",
  "Least favorite sound?",
  "What would you do with 10 extra minutes?",
  "What did you skip today?",
  "Last compliment you gave?",
  "Last argument you had?",
  "What's your go-to excuse?",
  "Weirdest thing you believe?",
  "What superpower would be useless?",
  "If you were a vegetable?",
  "What animal are you most like?",
  "Last time you cried?",
  "What makes you angry?",
  "What calms you down?",
  "Favorite smell?",
  "Worst smell?",
  "What's the last thing you touched?",
  "What's behind you right now?",
  "What's on your mind right now?",
  "One word to describe today",
  "What did you forget today?",
  "Last time you were late?",
  "What's your guilty pleasure?",
  "What would you never admit in public?",
  "What's your weird flex?",
  "What's the worst gift you've received?",
  "What's your most controversial food opinion?",
  "Cereal: milk first or cereal first?",
  "Toast: light or dark?",
  "Eggs: scrambled or fried?",
  "Pancakes or waffles?",
  "What's your comfort food?",
  "What food do you hate?",
  "What's the last thing you cooked?",
  "What's in your fridge right now?",
  "What did you last order?",
  "Favorite fast food?",
  "What drink do you order at a bar?",
  "What's your coffee order?",
  "What tea do you drink?",
  "What's your go-to snack at 3am?",
  "What's the weirdest thing you've eaten?",
  "What food would you never try again?",
  "What's your favorite smell?",
  "What smell reminds you of home?",
  "What's the first thing you smell in the morning?",
  "What does your room smell like?",
  "What's the last thing you smelled?",
  "What smell do you hate?",
  "What smell makes you hungry?",
  "What's your favorite sound?",
  "What sound do you hate?",
  "What's the last sound you heard?",
  "What sound wakes you up?",
  "What's your alarm sound?",
  "What sound do you find relaxing?",
  "What's the weirdest sound you've heard?",
  "What sound would you erase forever?",
  "What's your favorite texture?",
  "What texture do you hate?",
  "What's the last thing you felt?",
  "What's your favorite feeling?",
  "What's the worst feeling?",
  "What's your comfort texture?",
  "What's the weirdest texture you've touched?",
];

/** Sensory, emotional, social, concrete memories: the FR ones live in questions_bank.json under texture_questions. */
const QUESTIONS_EN_TEXTURE = [
  "What smell takes you straight back to being a kid?",
  "A sound you genuinely can't stand?",
  "A school lunch you still remember the taste of?",
  "Last time you were properly freezing, where were you?",
  "A food texture that grosses you out?",
  "What sound means holidays to you?",
  "What did your grandparents' place smell like?",
  "Something you like touching for no reason?",
  "A taste from childhood you miss?",
  "Last thing that made you laugh out loud on your own?",
  "Last time you got really nervous, what was it for?",
  "Small thing that put you in a good mood today?",
  "Last movie or show that made you cry?",
  "Some stupid little thing that ruined your day recently?",
  "Ever had a laughing fit at the worst possible moment?",
  "Last time you were proud of yourself, what for?",
  "Something that scared you way more than it should have?",
  "What annoys you most on public transport?",
  "Your last text, what was it about?",
  "A friend who embarrassed you in public?",
  "Are you the one who's always late or the one who waits?",
  "Last family dinner, what did everyone talk about?",
  "What do your friends always tease you about?",
  "Worst party you've been to, in one line?",
  "At a party: kitchen, couch or dance floor?",
  "Last person you laughed with on the phone?",
  "Weirdest neighbor you've had?",
  "What was your first phone?",
  "Favorite after-school snack as a kid?",
  "Worst teacher you ever had, what did they do?",
  "A summer camp or childhood holiday memory?",
  "What was your first concert?",
  "Dumbest thing you did in middle school?",
  "Cartoon you never missed as a kid?",
  "Last time you took a train, where were you going?",
  "A toy you still have?",
  "What did you do with your first paycheck?",
  "Last dish you completely messed up?",
];

export function getQuestionsForLanguage(lang: 'fr' | 'en'): string[] {
  if (lang === 'fr') return loadFrenchQuestions();
  return [...QUESTIONS_EN_POOL, ...QUESTIONS_EN_TEXTURE];
}

export function getTextureQuestions(lang: 'fr' | 'en'): string[] {
  if (lang === 'en') return QUESTIONS_EN_TEXTURE;
  loadFrenchQuestions();
  return cachedFrTexture;
}

export function isTextureQuestion(question: string, lang: 'fr' | 'en'): boolean {
  return getTextureQuestions(lang).includes(question);
}

/**
 * Minimum share of texture questions in a game (sensory, emotional, social: answers that differ between a person and a
 * model, Among Liars; not measured there). By round r at least round(0.4 r) of them were asked: 1 by round 2, 2 by
 * round 4, 3 by round 7.
 */
export const TEXTURE_MIN_SHARE = 0.4;

/** The question of the next round: a texture one when the game is behind its minimum share, never one already asked. */
export function drawQuestion(lang: 'fr' | 'en', asked: readonly string[], rng: () => number = Math.random): string {
  const texture = getTextureQuestions(lang);
  const all = getQuestionsForLanguage(lang);
  const textureSoFar = asked.filter((q) => texture.includes(q)).length;
  const behind = texture.length > 0 && textureSoFar < Math.round((asked.length + 1) * TEXTURE_MIN_SHARE);
  const source = behind ? texture : all;
  const fresh = source.filter((q) => !asked.includes(q));
  const pool = fresh.length > 0 ? fresh : source;
  return pool[Math.floor(rng() * pool.length)];
}
