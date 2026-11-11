import assert from 'node:assert/strict';
import { drawQuestion, getQuestionsForLanguage, getTextureQuestions, isTextureQuestion } from '../src/game/QuestionBank.js';
import { makeSeededRng } from '../src/game/humanTiming.js';

/** The guaranteed share asked for, written here rather than imported: lowering the constant must turn this file red. */
const TEXTURE_MIN_SHARE = 0.4;
let passed = 0;
const failures: string[] = [];
function test(name: string, fn: () => void): void {
  try {
    fn();
    passed++;
    console.log(`✅ ${name}`);
  } catch (err) {
    failures.push(name);
    console.log(`❌ ${name}\n   ${err instanceof Error ? err.message : String(err)}`);
  }
}

const quiet = console.log;
console.log = () => {};
getQuestionsForLanguage('fr');
console.log = quiet;

for (const lang of ['fr', 'en'] as const) {
  test(`${lang}: at least 30 texture questions, distinct, all in the full bank`, () => {
    const texture = getTextureQuestions(lang);
    assert.ok(texture.length >= 30, `${texture.length} texture questions`);
    assert.equal(new Set(texture).size, texture.length);
    const all = new Set(getQuestionsForLanguage(lang));
    for (const q of texture) assert.ok(all.has(q), q);
  });

  test(`${lang}: texture questions ask about senses, feelings, people or memories, never trivia or arithmetic`, () => {
    for (const q of getTextureQuestions(lang)) {
      assert.ok(q.endsWith('?'), q);
      assert.ok(!/\d|combien|how many|calcul|lettre|letter|épelle|spell|capitale|capital of|qui a écrit|who wrote/i.test(q), q);
      assert.ok(!/[—–]/.test(q), q);
    }
  });

  test(`${lang}: every 7-round game asks at least round(${TEXTURE_MIN_SHARE} r) texture questions by round r, none twice (500 games)`, () => {
    let texture = 0;
    let total = 0;
    for (let seed = 0; seed < 500; seed++) {
      const rng = makeSeededRng(seed);
      const asked: string[] = [];
      for (let r = 1; r <= 7; r++) {
        asked.push(drawQuestion(lang, asked, rng));
        const t = asked.filter((q) => isTextureQuestion(q, lang)).length;
        assert.ok(t >= Math.round(r * TEXTURE_MIN_SHARE), `seed ${seed} round ${r}: ${t} texture`);
      }
      assert.equal(new Set(asked).size, asked.length, `seed ${seed} repeats a question`);
      texture += asked.filter((q) => isTextureQuestion(q, lang)).length;
      total += asked.length;
    }
    assert.ok(texture / total >= TEXTURE_MIN_SHARE, `${texture}/${total}`);
  });
}

test('a letter-counting trap is not a texture question', () => {
  assert.equal(isTextureQuestion("Combien de 'e' dans 'néanmoins' ?", 'fr'), false);
  assert.equal(isTextureQuestion("How many 'e's in 'nevertheless'?", 'en'), false);
});

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) process.exit(1);
