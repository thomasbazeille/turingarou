import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkMessage, sanitizeMessage, similarity, contentWords, drawStyleHabits } from '../src/game/formGate.js';
import type { GateContext, GateReason, StyleHabits } from '../src/game/formGate.js';
import { drawStyleProfile } from '../src/game/aiSpeech.js';

// Thresholds of the corpus run (spec B-realisme-forme R13: a gate that cries wolf gets unplugged).
const HUMAN_MAX_REJECTED = 0;
const HUMAN_MAX_MODIFIED_RATIO = 0.1;
const BOT_MIN_CAUGHT_RATIO = 0.9;

function ctx(over: Partial<GateContext> = {}): GateContext {
  return { channel: 'discussion', caseProfile: 'raw', dropFinalPeriodProb: 0, ownRecent: [], otherAIRecent: [], ...over };
}
// Exactly what GameRoom.addMessage passes as its last net.
const NET_CTX: GateContext = { channel: 'discussion', caseProfile: 'raw', dropFinalPeriodProb: 0, ownRecent: [], otherAIRecent: [] };
const NET_DROPS: GateReason[] = ['structure', 'json_leak', 'ai_admission', 'empty'];

function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function ok(text: string, over: Partial<GateContext> = {}): string {
  const v = checkMessage(text, ctx(over));
  assert.equal(v.ok, true, `expected ok for ${JSON.stringify(text)}, got ${v.ok ? '' : `${v.reason}: ${v.detail}`}`);
  return v.text;
}
function rejects(text: string, reason: GateReason, over: Partial<GateContext> = {}): void {
  const v = checkMessage(text, ctx(over));
  assert.equal(v.ok ? 'ok' : v.reason, reason, `${JSON.stringify(text)} → ${v.ok ? `ok "${v.text}"` : v.detail}`);
}
function withStyle(text: string, style: StyleHabits): string {
  return ok(text, { style });
}

const cases: Array<{ name: string; run: () => void }> = [];
const test = (name: string, run: () => void) => cases.push({ name, run });

// --- R2 structure ---
test('structure: fenced code block rejected', () => rejects('voilà :\n```\nvoter luc\n```', 'structure'));
test('structure: bullet list rejected', () => rejects("dans l'ordre :\n- on vote luc\n- ensuite marion", 'structure'));
test('structure: three plain lines rejected', () => rejects('salut\nje pense que c luc\net vous', 'structure'));
test('structure: two plain lines joined', () => assert.equal(ok('salut\nça va ou quoi'), 'salut ça va ou quoi'));
test('structure: single line starting with a dash untouched', () => assert.equal(ok('- non mais franchement'), '- non mais franchement'));
test('structure: "1. oui 2. non" joke on one line untouched', () => assert.equal(ok('1. oui 2. non mdr'), '1. oui 2. non mdr'));

// --- R11 leaks and preambles ---
test('json_leak: braces and quotes without a JSON object pass', () => ok('il a dit "coucou" puis il est parti {du coup}'));
test('json_leak: delayMs object rejected', () => rejects('{"delayMs": 300, "text": "coucou"}', 'json_leak'));
test('preamble: nothing left after it is empty', () => rejects('Voici ma réponse :', 'empty'));
test('preamble: own name label stripped only for selfName', () => {
  assert.equal(ok('Lucas : non', { selfName: 'Lucas' }), 'non');
  assert.equal(ok('lucas : t’es où'), 'lucas : t’es où');
});
test('preamble: "la réponse de lucas : …" from a human is not a preamble', () => assert.equal(ok('réponse de lucas : trop bizarre'), 'réponse de lucas : trop bizarre'));

// --- R4 admissions ---
test('admission: typographic apostrophe', () => rejects('En tant qu’IA je ne mange pas', 'ai_admission'));
test('admission: unaccented, lowercase', () => rejects("en tant qu'ia jsp", 'ai_admission'));
test('admission: negations pass', () => {
  ok('je suis pas une ia');
  ok('je ne suis pas un robot');
  ok("I'm not an AI");
  ok('i am not a bot i swear');
});
test('admission: questions and reported speech pass', () => {
  ok('tu crois que je suis une ia ??');
  ok('il dit que je suis un bot');
  ok('so now im a bot because i type fast');
  ok("I'm not saying I'm an AI but i'm not saying I'm not either lmao");
});
test('admission: joke with a laugh marker passes, plain claim does not', () => {
  ok('ouais je suis une ia mdr');
  rejects('Bon ok, je suis une IA.', 'ai_admission');
  rejects('jsuis un bot, voilà', 'ai_admission');
});
test('admission: accusations naming models pass', () => {
  ok("t'écris comme un modèle de langage");
  ok('you sound like a language model ngl');
  ok('lucas t’es chatgpt ou quoi');
});

// --- R4 formulas, openers, lexicon ---
test('formula: human uses of "bonne question", "great question", "hésite pas" pass', () => {
  ok('bonne question mdr');
  ok('great question lol idk');
  ok('hésite pas à voter lucas');
  ok("n'hésitez surtout pas");
  ok('je comprends pas ce que tu veux dire');
});
test('opener: standalone or without punctuation is left alone', () => {
  assert.equal(ok('Absolument !'), 'Absolument !');
  assert.equal(ok('absolument pas'), 'absolument pas');
  assert.equal(ok('bien sûr que non'), 'bien sûr que non');
});
test('opener + preamble chained', () => assert.equal(ok('Bien sûr ! Voici ma réponse : « lucas ment »'), 'lucas ment'));
test('lexicon: a single AI word is a note, not a rejection', () => {
  const v = checkMessage('moreover he is quiet', ctx());
  assert.ok(v.ok && v.notes.includes('ai_word:moreover'));
});

// --- R1 typography ---
test('typography: winking smiley kept, semicolon replaced', () => {
  assert.equal(ok('tkt ;)'), 'tkt ;)');
  assert.equal(ok('ok ;-) et toi ; tu votes qui'), 'ok ;-) et toi, tu votes qui');
});
test('typography: leading dash removed, ASCII hyphen kept', () => {
  assert.equal(ok('— non'), 'non');
  assert.equal(ok("j'ai mis 3 min - pas mal"), "j'ai mis 3 min - pas mal");
});
test('typography: curly apostrophes untouched', () => assert.equal(ok('c’est pas moi'), 'c’est pas moi'));

// --- R9 stage directions ---
test('stage: correction asterisk and arithmetic kept', () => {
  assert.equal(ok('*elle'), '*elle');
  assert.equal(ok('5*3*2 ça fait 30'), '5*3*2 ça fait 30');
});
test('stage: non-stage parentheses kept', () => assert.equal(ok('mdr (je rigole)'), 'mdr (je rigole)'));
test('stage: emoticon parentheses are not stage directions', () => assert.equal(ok('bon :( lucas :)'), 'bon :( lucas :)'));

// --- R3 case and final period ---
test("case 'lower': lowercases words, keeps emoticons", () => assert.equal(ok('Je pense que Lucas ment xD', { caseProfile: 'lower' }), 'je pense que lucas ment xD'));
test("case 'sentence': capitalizes the first letter, keeps names and English I", () => {
  assert.equal(ok('i think Jake is lying and I know it', { caseProfile: 'sentence' }), 'I think Jake is lying and I know it');
  assert.equal(ok('je pense que Lucas ment. Et toi ?', { caseProfile: 'sentence' }), 'Je pense que Lucas ment. Et toi ?');
});
test("case 'raw': untouched", () => assert.equal(ok('Je pense que Lucas ment'), 'Je pense que Lucas ment'));
test('final period: dropped at rng 0, kept at 0.99, "..." never dropped', () => {
  assert.equal(ok('je vote luc.', { dropFinalPeriodProb: 0.5, rng: () => 0 }), 'je vote luc');
  assert.equal(ok('je vote luc.', { dropFinalPeriodProb: 0.5, rng: () => 0.99 }), 'je vote luc.');
  assert.equal(ok('bon...', { dropFinalPeriodProb: 1, rng: () => 0 }), 'bon...');
});
test('determinism: same seed, same output', () => {
  const run = () => ['un.', 'deux.', 'trois.', 'quatre.'].map((t) => ok(t, { dropFinalPeriodProb: 0.5, rng: seeded(7) })).join('|');
  assert.equal(run(), run());
});

// --- R8 length ---
test('length: clause-aware cut never leaves a dangling function word', () => {
  const out = ok('je pense que lucas ment parce que hier il a dit un truc complètement différent de ce qu il raconte maintenant à tout le monde ici');
  assert.ok(out.split(/\s+/).length <= 25, out);
  assert.ok(!/(?:\s|^)(?:de|que|qu|le|la|les|un|une|et|à|il|parce)$/.test(out), out);
});
test('length: answer channel caps at 12 words / 60 chars', () => {
  const out = ok('franchement je dirais les lasagnes de ma grand-mère avec beaucoup de fromage et une salade verte à côté', { channel: 'answer' });
  assert.ok(out.split(/\s+/).length <= 12 && out.length <= 60, out);
});
test('length: per-AI maxWords habit applies', () => {
  const out = withStyle('je sais pas trop moi mais lucas il a un comportement bizarre depuis le début de la partie', { maxWords: 10 });
  assert.ok(out.split(/\s+/).length <= 10, out);
});
test('length: 25-word human line with commas but no capital/period is not "polished"', () =>
  assert.equal(
    ok('moi je pense que c’est julien, il a répondu super vite, et sa phrase était trop parfaite pour un humain qui tape'),
    'moi je pense que c’est julien, il a répondu super vite, et sa phrase était trop parfaite pour un humain qui tape'
  ));

// --- R5/R6 similarity ---
test('similarity: identical 1, unrelated low, empty 0', () => {
  assert.equal(similarity('cette reponse est bizarre', 'Cette réponse est bizarre !'), 1);
  assert.ok(similarity('je vote luc', 'marion chante faux') < 0.2);
  assert.equal(similarity('', 'coucou'), 0);
});
test('contentWords: accents folded, stopwords and short tokens dropped', () => assert.deepEqual(contentWords('Très louche ça, les IA !'), ['louche']));
const NOT_DUPLICATES: Array<[string, string]> = [
  ["c'est pas moi", "c'est pas lui"],
  ['je vote lucas', 'je vote marie'],
  ['ouais carrément', 'ouais grave'],
  ["je pense que c'est lucas", "je pense que c'est marie"],
  ['je suis pas un bot', 'je suis pas une ia'],
  ['mdr', 'mdrr t nul'],
  ['lucas il a rien dit', 'marie elle parle trop'],
  ['who voted for jake', 'who voted for emma'],
  ['i think its mike', 'i think its sam'],
  ['qui a voté marie ?', 'qui a voté julien ?'],
];
test('similarity: different meanings with the same template are not duplicates', () => {
  for (const [a, b] of NOT_DUPLICATES) ok(a, { ownRecent: [b] });
});

// --- R12 habits ---
test('habit drop_ne', () => {
  assert.equal(withStyle('je ne sais pas', { dropNe: true }), 'je sais pas');
  assert.equal(withStyle("je n'ai pas vu", { dropNe: true }), "j'ai pas vu");
  assert.equal(withStyle("ce n'est pas n'importe qui", { dropNe: true }), "c'est pas n'importe qui");
  assert.equal(withStyle('personne ne sait', { dropNe: true }), 'personne ne sait');
});
test('habit contractions', () => {
  assert.equal(withStyle('Tu es sûr ?', { contractions: true }), "T'es sûr ?");
  assert.equal(withStyle('il y a un truc', { contractions: true }), "y'a un truc");
  assert.equal(withStyle("I'm going to vote jake", { contractions: true }), "I'm gonna vote jake");
  assert.equal(withStyle("I'm going to the store", { contractions: true }), "I'm going to the store");
});
test('habit rewrites keep the initial capital and skip contractions', () => {
  assert.equal(withStyle('Je sais pas trop', { rewrites: [['je sais pas', 'jsp']] }), 'Jsp trop');
  assert.equal(withStyle('are you sure', { rewrites: [['you', 'u']] }), 'are u sure');
  assert.equal(withStyle("you're sure", { rewrites: [['you', 'u']] }), "you're sure");
});
test('habit accents and question marks', () => {
  assert.equal(withStyle("t'es sérieux ?", { dropAccents: true }), "t'es serieux ?");
  assert.equal(withStyle("t'es sérieux ?", { questionMarks: 'double' }), "t'es sérieux ??");
  assert.equal(withStyle("t'es sérieux ?", { questionMarks: 'drop' }), "t'es sérieux");
  assert.equal(withStyle("t'es sérieux ??", { questionMarks: 'drop' }), "t'es sérieux ??");
});
test('drawStyleHabits: deterministic and well-formed', () => {
  assert.deepEqual(drawStyleHabits(seeded(3)), drawStyleHabits(seeded(3)));
  for (let s = 0; s < 50; s++) {
    const h = drawStyleHabits(seeded(s));
    assert.ok(h.rewrites.length >= 4 && [10, 16, 25].includes(h.maxWords) && ['keep', 'double', 'drop'].includes(h.questionMarks));
  }
});
test('drawStyleProfile: the first three draws keep their v0 meaning', () => {
  const seq = [0.6, 0.0, 1.0];
  let i = 0;
  const p = drawStyleProfile(() => (i < seq.length ? seq[i++] : 0.5));
  assert.equal(p.caseProfile, 'sentence');
  assert.equal(p.dropFinalPeriodProb, 0.5);
  assert.equal(p.temperatureOffset, 0.15);
  assert.ok(Array.isArray(p.rewrites));
});
test('sanitizeMessage: repairs without rejecting', () => {
  const s = sanitizeMessage('Lucas — franchement', ctx());
  assert.equal(s.text, 'Lucas, franchement');
  assert.ok(s.notes.includes('dash'));
});

// --- runner: unit cases ---
let failures = 0;
for (const c of cases) {
  try {
    c.run();
  } catch (err) {
    failures += 1;
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`❌ ${c.name}\n   ${msg.split('\n').slice(0, 4).join('\n   ')}`);
  }
}
console.log(`unit: ${cases.length - failures}/${cases.length} passed`);

// --- corpus run ---
type HumanLine = { id: string; text: string };
type BotLine = { id: string; text: string; ctx?: Partial<GateContext>; expect: { reason?: GateReason; text?: string } };
const load = <T>(name: string): T => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')) as T;
const human = load<HumanLine[]>('form-gate-human.json');
const bot = load<BotLine[]>('form-gate-bot.json');

const humanRejected: string[] = [];
const humanModified: string[] = [];
const notIdempotent: string[] = [];
for (const h of human) {
  const v = checkMessage(h.text, ctx());
  if (!v.ok) {
    humanRejected.push(`${h.id} [${v.reason}] ${v.detail}`);
    continue;
  }
  if (v.text !== h.text.trim()) humanModified.push(`${h.id}: ${JSON.stringify(h.text)} → ${JSON.stringify(v.text)}`);
}
// Case profiles and drawn habits must never turn a human line into a rejection.
const profileRejected: string[] = [];
for (let s = 0; s < 12; s++) {
  const p = drawStyleProfile(seeded(100 + s));
  for (const h of human) {
    const v = checkMessage(h.text, ctx({ caseProfile: p.caseProfile, dropFinalPeriodProb: p.dropFinalPeriodProb, style: p, rng: seeded(s) }));
    if (!v.ok) profileRejected.push(`${h.id} (profile seed ${100 + s}) [${v.reason}] ${v.detail} → ${JSON.stringify(v.text)}`);
  }
}

const botMissed: string[] = [];
for (const b of bot) {
  const v = checkMessage(b.text, ctx(b.ctx));
  const got = v.ok ? `ok ${JSON.stringify(v.text)}` : `${v.reason} (${v.detail})`;
  const hit = b.expect.reason ? !v.ok && v.reason === b.expect.reason : v.ok && v.text === b.expect.text;
  if (!hit) botMissed.push(`${b.id}: expected ${b.expect.reason ?? JSON.stringify(b.expect.text)}, got ${got}`);
}

// The last net in GameRoom.addMessage re-checks the gated text: it must not drop or change it.
for (const t of [...human.map((h) => h.text), ...bot.map((b) => b.text)]) {
  const first = checkMessage(t, ctx());
  if (!first.ok) continue;
  const second = checkMessage(first.text, NET_CTX);
  if ((!second.ok && NET_DROPS.includes(second.reason)) || (second.ok && second.text !== first.text)) {
    notIdempotent.push(`${JSON.stringify(first.text)} → ${second.ok ? JSON.stringify(second.text) : second.reason}`);
  }
}

// Real model output (fixtures/form-gate-model-probe.json): measured, not asserted. Length is the tell the gate can only
// fix through the per-AI habits (maxWords, brevity), so the distribution is printed next to the human one.
const probe = load<{ source: string; lines: string[] }>('form-gate-model-probe.json').lines;
const words = (t: string) => t.split(/\s+/).filter(Boolean).length;
const median = (xs: number[]) => [...xs].sort((x, y) => x - y)[Math.floor(xs.length / 2)];
const share = (xs: number[], n: number) => xs.filter((x) => x > n).length / xs.length;
const probeBare = probe.map((t) => checkMessage(t, ctx()));
const probeProfiled: number[] = [];
for (let s = 0; s < 12; s++) {
  const p = drawStyleProfile(seeded(200 + s));
  for (const t of probe) {
    const v = checkMessage(t, ctx({ caseProfile: p.caseProfile, dropFinalPeriodProb: p.dropFinalPeriodProb, style: p, rng: seeded(s) }));
    if (v.ok) probeProfiled.push(words(v.text));
  }
}
const humanWords = human.map((h) => words(h.text));
const probeWords = probe.map(words);

const modifiedRatio = humanModified.length / human.length;
const caughtRatio = (bot.length - botMissed.length) / bot.length;
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
console.log(`human corpus: ${human.length} lines, rejected ${humanRejected.length} (max ${HUMAN_MAX_REJECTED}), modified ${humanModified.length} = ${pct(modifiedRatio)} (max ${pct(HUMAN_MAX_MODIFIED_RATIO)}, raw case)`);
console.log(`human corpus under 12 drawn profiles (case + habits): rejected ${profileRejected.length}`);
console.log(`bot corpus: ${bot.length} lines, caught ${bot.length - botMissed.length} = ${pct(caughtRatio)} (min ${pct(BOT_MIN_CAUGHT_RATIO)})`);
console.log(`idempotence under the GameRoom last net: ${notIdempotent.length} violation(s)`);
console.log(
  `model probe (${probe.length} real lines, measured only): bare rejected ${probeBare.filter((v) => !v.ok).length}, modified ${probeBare.filter((v, i) => v.ok && v.text !== probe[i]).length}; ` +
    `words median/share>12: human ${median(humanWords)}/${pct(share(humanWords, 12))}, model raw ${median(probeWords)}/${pct(share(probeWords, 12))}, model under drawn profiles ${median(probeProfiled)}/${pct(share(probeProfiled, 12))}`
);
const show = (title: string, items: string[]) => {
  if (items.length) console.log(`${title}:\n  ${items.slice(0, 30).join('\n  ')}`);
};
show('human rejected', humanRejected);
show('human modified', humanModified);
show('human rejected under a profile', profileRejected);
show('bot missed', botMissed);
show('not idempotent', notIdempotent);

const corpusFail =
  humanRejected.length > HUMAN_MAX_REJECTED ||
  profileRejected.length > 0 ||
  modifiedRatio > HUMAN_MAX_MODIFIED_RATIO ||
  caughtRatio < BOT_MIN_CAUGHT_RATIO ||
  notIdempotent.length > 0;
if (failures > 0 || corpusFail) {
  console.log('form gate: FAIL');
  process.exit(1);
}
console.log('form gate: all checks passed');
process.exit(0);
