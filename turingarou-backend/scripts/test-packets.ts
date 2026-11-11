/**
 * Client packets read without trusting their shape (any socket can send anything): a null, a string or an object in
 * place of text is turned away instead of throwing, as one sendMessage(null) used to take the whole server down.
 *
 *   npx tsx scripts/test-packets.ts
 */
import assert from 'node:assert/strict';
import { ROOM_ID_MAX, fields, languageOf, roomIdOf, text } from '../src/packets.js';

let failures = 0;
const check = (name: string, fn: () => void) => {
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (e: any) {
    failures++;
    console.log(`  ✗ ${name} — ${e.message}`);
  }
};

console.log('client packets');

check('fields: a plain object only, anything else reads as no field', () => {
  assert.deepEqual(fields({ message: 'hi' }), { message: 'hi' });
  for (const p of [null, undefined, 'x', 42, ['message'], true]) assert.deepEqual(fields(p), {});
});

check('text: strings only', () => {
  assert.equal(text('hi'), 'hi');
  assert.equal(text(''), '');
  for (const v of [null, undefined, 42, { toString: () => 'x' }, ['x']]) assert.equal(text(v), null);
});

check(`room id: trimmed text of 1 to ${ROOM_ID_MAX} characters, no control characters`, () => {
  assert.equal(roomIdOf('  AMIS '), 'AMIS');
  assert.equal(roomIdOf('public-lobby'), 'public-lobby');
  assert.equal(roomIdOf('x'.repeat(ROOM_ID_MAX)), 'x'.repeat(ROOM_ID_MAX));
  for (const v of ['', '   ', 'x'.repeat(ROOM_ID_MAX + 1), 'a\nb', 'a\u0000', null, { id: 1 }, 7]) assert.equal(roomIdOf(v), null);
});

check('language: fr or en, else none', () => {
  assert.equal(languageOf('fr'), 'fr');
  assert.equal(languageOf('en'), 'en');
  for (const v of ['de', '', null, 1]) assert.equal(languageOf(v), undefined);
});

console.log(failures ? `\n${failures} échec(s)` : '\nTout est vert');
process.exit(failures ? 1 : 0);
