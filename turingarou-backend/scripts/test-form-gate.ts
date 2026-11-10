import * as assert from 'node:assert/strict';
import {
  checkMessage,
  sanitizeMessage,
  similarity,
  contentWords,
} from '../src/game/formGate.js';
import type { GateContext } from '../src/game/formGate.js';

function ctx(over: Partial<GateContext> = {}): GateContext {
  return {
    channel: 'discussion',
    caseProfile: 'raw',
    dropFinalPeriodProb: 0,
    ownRecent: [],
    otherAIRecent: [],
    ...over,
  };
}

type NamedCase = { name: string; run: () => void };
const cases: NamedCase[] = [];
function test(name: string, run: () => void): void {
  cases.push({ name, run });
}

// --- structure ---

test('reject:structure — fenced code block', () => {
  const v = checkMessage('voilà ce que je ferais :\n```\nvoter luc\n```', ctx());
  assert.equal(v.ok, false);
  if (!v.ok) assert.equal(v.reason, 'structure');
});

test('benign:structure — same message without fence or list', () => {
  const v = checkMessage('voilà ce que je ferais : voter luc et après on voit', ctx());
  assert.equal(v.ok, true);
});

test('reject:structure — bulleted list', () => {
  const v = checkMessage("on fait ça dans l'ordre :\n- on vote luc\n- ensuite marion", ctx());
  assert.equal(v.ok, false);
  if (!v.ok) assert.equal(v.reason, 'structure');
});

test('reject:structure — numbered list with . and )', () => {
  const v = checkMessage('deux options :\n1. voter luc\n2) attendre', ctx());
  assert.equal(v.ok, false);
  if (!v.ok) assert.equal(v.reason, 'structure');
});

test('benign:structure — single line starting with a dash', () => {
  const v = checkMessage('- non mais franchement', ctx());
  assert.equal(v.ok, true);
});

test('benign:structure — list-like pattern mid-sentence', () => {
  const v = checkMessage("j'ai mis 1. point à luc sur mon bloc", ctx());
  assert.equal(v.ok, true);
});

// --- json_leak ---

test('reject:json_leak — delayMs object', () => {
  const v = checkMessage('{"delayMs": 300, "text": "coucou"}', ctx());
  assert.equal(v.ok, false);
  if (!v.ok) assert.equal(v.reason, 'json_leak');
});

test('reject:json_leak — shouldRespond field', () => {
  const v = checkMessage('{"shouldRespond": false}', ctx());
  assert.equal(v.ok, false);
  if (!v.ok) assert.equal(v.reason, 'json_leak');
});

test('benign:json_leak — braces and quotes without a JSON object', () => {
  const v = checkMessage('il a dit "coucou" puis il est parti {du coup}', ctx());
  assert.equal(v.ok, true);
});

test('benign:json_leak — quoted word not after a brace', () => {
  const v = checkMessage('son "plan" c\'est de voter luc', ctx());
  assert.equal(v.ok, true);
});

// --- ai_admission ---

test('reject:ai_admission — English "as an ai"', () => {
  const v = checkMessage('honnêtement as an ai je ne peux pas défendre luc', ctx());
  assert.equal(v.ok, false);
  if (!v.ok) assert.equal(v.reason, 'ai_admission');
});

test('reject:ai_admission — French with typographic apostrophe', () => {
  const v = checkMessage('je suis désolé mais en tant qu’ia je dois rester neutre', ctx());
  assert.equal(v.ok, false);
  if (!v.ok) assert.equal(v.reason, 'ai_admission');
});

test('reject:ai_admission — "modèle de langage" accented and capitalized', () => {
  const v = checkMessage('franchement tu es un Modèle de langage déguisé', ctx());
  assert.equal(v.ok, false);
  if (!v.ok) assert.equal(v.reason, 'ai_admission');
});

test('accent: unaccented "modele de langage" does not trigger ai_admission', () => {
  const v = checkMessage('son modele de langage est trop propre pour un humain', ctx());
  assert.equal(v.ok, true);
});

test('accent: plural "modèles de langages" blocked by word boundary', () => {
  const v = checkMessage("il collectionne les modèles de langages pour s'entraîner", ctx());
  assert.equal(v.ok, true);
});

test('benign:ai_admission — talks about AI without admitting being one', () => {
  const v = checkMessage('luc se comporte comme une ia je trouve, il répond trop vite', ctx());
  assert.equal(v.ok, true);
});

// --- assistant_formula ---

test('reject:assistant_formula — "great question"', () => {
  const v = checkMessage("great question ! je pense que c'est marion", ctx());
  assert.equal(v.ok, false);
  if (!v.ok) assert.equal(v.reason, 'assistant_formula');
});

test('reject:assistant_formula — "n’hésitez pas" typographic apostrophe', () => {
  const v = checkMessage('n’hésitez pas à voter luc si vous doutez', ctx());
  assert.equal(v.ok, false);
  if (!v.ok) assert.equal(v.reason, 'assistant_formula');
});

test('benign:assistant_formula — "n’hésitez surtout pas" breaks the phrase', () => {
  const v = checkMessage('n’hésitez surtout pas à voter luc', ctx());
  assert.equal(v.ok, true);
});

test('benign:assistant_formula — near-miss wording', () => {
  const v = checkMessage('belle question mais je pense plutôt à marion', ctx());
  assert.equal(v.ok, true);
});

// --- empty ---

test('reject:empty — emoji only', () => {
  const v = checkMessage('🔥👍', ctx());
  assert.equal(v.ok, false);
  if (!v.ok) assert.equal(v.reason, 'empty');
});

test('reject:empty — whitespace only', () => {
  const v = checkMessage('   \n  ', ctx());
  assert.equal(v.ok, false);
  if (!v.ok) assert.equal(v.reason, 'empty');
});

test('benign:empty — emoji plus words', () => {
  const v = checkMessage('coucou 🔥', ctx());
  assert.equal(v.ok, true);
  if (v.ok) assert.equal(v.text, 'coucou');
});

// --- duplicate_own ---

test('reject:duplicate_own — exact match after normalization', () => {
  const v = checkMessage('carrément oui', ctx({ ownRecent: ['Carrément, oui !'] }));
  assert.equal(v.ok, false);
  if (!v.ok) assert.equal(v.reason, 'duplicate_own');
});

test('reject:duplicate_own — near-duplicate with reordered words', () => {
  const v = checkMessage(
    'ouais elle est carrément bizarre sa réponse',
    ctx({ ownRecent: ['ouais carrément elle est bizarre sa réponse'] }),
  );
  assert.equal(v.ok, false);
  if (!v.ok) assert.equal(v.reason, 'duplicate_own');
});

test('reject:duplicate_own — check runs after sanitizing', () => {
  const v = checkMessage(
    'franchement luc — impressionne 👍',
    ctx({ ownRecent: ['franchement luc impressionne'] }),
  );
  assert.equal(v.ok, false);
  if (!v.ok) assert.equal(v.reason, 'duplicate_own');
});

test('benign:duplicate_own — shared words under the similarity threshold', () => {
  const v = checkMessage(
    'ouais carrément je la trouve louche aussi',
    ctx({ ownRecent: ['ouais carrément elle est bizarre sa réponse'] }),
  );
  assert.equal(v.ok, true);
});

// --- duplicate_other ---

test('reject:duplicate_other — echo of another AI', () => {
  const v = checkMessage(
    "franchement luc il m'impressionne vraiment",
    ctx({ otherAIRecent: ["franchement luc il m'impressionne"] }),
  );
  assert.equal(v.ok, false);
  if (!v.ok) assert.equal(v.reason, 'duplicate_other');
});

test('benign:duplicate_other — same topic, different words', () => {
  const v = checkMessage(
    'luc joue trop bien pour un humain normal',
    ctx({ otherAIRecent: ["franchement luc il m'impressionne"] }),
  );
  assert.equal(v.ok, true);
});

// --- same_opening ---

test('reject:same_opening — identical first two content words', () => {
  const v = checkMessage(
    "je pense que c'est marion ou thomas",
    ctx({ otherAIRecent: ['je pense que marion cache quelque chose'] }),
  );
  assert.equal(v.ok, false);
  if (!v.ok) assert.equal(v.reason, 'same_opening');
});

test('benign:same_opening — different opening', () => {
  const v = checkMessage(
    'je penche pour marion moi franchement',
    ctx({ otherAIRecent: ['je pense que marion cache quelque chose'] }),
  );
  assert.equal(v.ok, true);
});

test('benign:same_opening — skipped under 4 words', () => {
  const v = checkMessage(
    'je pense marion',
    ctx({ otherAIRecent: ['je pense que marion cache quelque chose'] }),
  );
  assert.equal(v.ok, true);
});

// --- sanitize: punctuation and symbols ---

test('em dash replaced by comma', () => {
  const r = sanitizeMessage('franchement oui — mais bon là', ctx());
  assert.equal(r.text, 'franchement oui, mais bon là');
  assert.ok(r.notes.includes('dash'));
});

test('en dash replaced by comma', () => {
  const r = sanitizeMessage('non – attends', ctx());
  assert.equal(r.text, 'non, attends');
  assert.ok(r.notes.includes('dash'));
});

test('emoji removed and spaces collapsed', () => {
  const r = sanitizeMessage('ok 👍🔥 je suis partant', ctx());
  assert.equal(r.text, 'ok je suis partant');
  assert.ok(r.notes.includes('emoji'));
});

test('semicolon turned into comma', () => {
  const r = sanitizeMessage('oui; enfin je crois', ctx());
  assert.equal(r.text, 'oui, enfin je crois');
  assert.ok(r.notes.includes('semicolon'));
});

test('surrounding guillemets stripped', () => {
  const r = sanitizeMessage('« carrément »', ctx());
  assert.equal(r.text, 'carrément');
  assert.ok(r.notes.includes('quotes'));
});

test('markdown markers removed', () => {
  const r = sanitizeMessage('**franchement** __non__ `peut-être`', ctx());
  assert.equal(r.text, 'franchement non peut-être');
  assert.ok(r.notes.includes('markdown'));
});

test('multi-line non-list text joined', () => {
  const v = checkMessage('franchement\nlà je dis bravo\nà luc', ctx());
  assert.equal(v.ok, true);
  if (v.ok) {
    assert.equal(v.text, 'franchement là je dis bravo à luc');
    assert.ok(v.notes.includes('multiline'));
  }
});

test('leading heading removed on multi-line message', () => {
  const r = sanitizeMessage('# Mon avis\nluc est louche', ctx());
  assert.equal(r.text, 'Mon avis luc est louche');
  assert.ok(r.notes.includes('markdown'));
  assert.ok(r.notes.includes('multiline'));
});

// --- sanitize: case profile ---

test("profile 'sentence' lowercases then capitalizes", () => {
  const r = sanitizeMessage('OUAIS CARRéMENT ELLE EST BIZARRE', ctx({ caseProfile: 'sentence' }));
  assert.equal(r.text, 'Ouais carrément elle est bizarre');
  assert.ok(r.notes.includes('case'));
});

test("profile 'lower' lowercases everything", () => {
  const r = sanitizeMessage('OUAIS CARRéMENT', ctx({ caseProfile: 'lower' }));
  assert.equal(r.text, 'ouais carrément');
  assert.ok(r.notes.includes('case'));
});

test("profile 'raw' leaves casing untouched", () => {
  const r = sanitizeMessage('OUAIS', ctx({ caseProfile: 'raw' }));
  assert.equal(r.text, 'OUAIS');
  assert.ok(!r.notes.includes('case'));
});

// --- sanitize: final period ---

test('final period dropped when rng returns 0', () => {
  const r = sanitizeMessage('je sais pas.', ctx({ dropFinalPeriodProb: 0.5, rng: () => 0 }));
  assert.equal(r.text, 'je sais pas');
  assert.ok(r.notes.includes('final_period'));
});

test('final period kept when rng returns 0.99', () => {
  const r = sanitizeMessage('je sais pas.', ctx({ dropFinalPeriodProb: 0.5, rng: () => 0.99 }));
  assert.equal(r.text, 'je sais pas.');
  assert.ok(!r.notes.includes('final_period'));
});

test("'...' is never dropped", () => {
  const r = sanitizeMessage('attends...', ctx({ dropFinalPeriodProb: 1, rng: () => 0 }));
  assert.equal(r.text, 'attends...');
  assert.ok(!r.notes.includes('final_period'));
});

// --- sanitize: truncation ---

test('truncation: 40-word discussion message fits both caps', () => {
  const raw = Array.from({ length: 40 }, (_, i) => `motnumero${i + 1}trestreslong`).join(' ');
  const r = sanitizeMessage(raw, ctx({ channel: 'discussion' }));
  const words = r.text.split(' ');
  assert.ok(r.notes.includes('truncated'));
  assert.ok(words.length <= 25, `expected <= 25 words, got ${words.length}`);
  assert.ok(r.text.length <= 140, `expected <= 140 chars, got ${r.text.length}`);
  assert.ok(words.length < 40);
});

test('truncation: answer channel caps at 14 words and 80 chars', () => {
  const raw = Array.from({ length: 30 }, (_, i) => `louche${i + 1}`).join(' ');
  const r = sanitizeMessage(raw, ctx({ channel: 'answer' }));
  const words = r.text.split(' ');
  assert.ok(r.notes.includes('truncated'));
  assert.ok(words.length <= 14, `expected <= 14 words, got ${words.length}`);
  assert.ok(r.text.length <= 80, `expected <= 80 chars, got ${r.text.length}`);
});

// --- medium-severity AI words ---

test("ai_word:moreover noted without rejection", () => {
  const v = checkMessage('moreover luc plays too well', ctx());
  assert.equal(v.ok, true);
  if (v.ok) assert.ok(v.notes.includes('ai_word:moreover'));
});

test("ai_word:par ailleurs noted without rejection", () => {
  const v = checkMessage("par ailleurs marion m'étonne", ctx());
  assert.equal(v.ok, true);
  if (v.ok) assert.ok(v.notes.includes('ai_word:par ailleurs'));
});

// --- direct unit checks ---

test('similarity: identical, disjoint, and empty sets', () => {
  assert.equal(similarity('cette reponse est bizarre', 'cette reponse est bizarre'), 1);
  assert.equal(similarity('je vote luc', 'marion chante faux'), 0);
  assert.equal(similarity('', 'coucou'), 0);
});

test('contentWords: accents folded, stopwords and short tokens dropped', () => {
  assert.deepEqual(contentWords('Très louche ça, les IA !'), ['louche']);
});

// --- runner ---

let failures = 0;
for (const c of cases) {
  try {
    c.run();
    console.log(`✅ ${c.name}`);
  } catch (err) {
    failures += 1;
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`❌ ${c.name}`);
    console.log(`   ${msg.split('\n').join('\n   ')}`);
  }
}

if (failures > 0) {
  console.log(`\n${failures}/${cases.length} case(s) failed`);
  process.exit(1);
}
console.log(`\nAll ${cases.length} cases passed`);
process.exit(0);
