import assert from 'node:assert/strict';
import { addressedTo } from '../src/game/directAddress.js';

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

check('nom en mot entier = direct', () => assert.equal(addressedTo('lucas tu en penses quoi', 'Lucas').direct, true));
check('nom avec accent, saisi sans accent', () => assert.equal(addressedTo('helene t ou', 'Hélène').direct, true));
check('@nom = direct', () => assert.equal(addressedTo('@Lucas ?', 'Lucas').direct, true));
check('nom inclus dans un autre mot = non', () => assert.equal(addressedTo('lucastor est nul', 'Lucas').direct, false));
check('accusation nommée', () => assert.deepEqual(addressedTo('lucas c est l ia', 'Lucas'), { direct: true, accusation: true }));
check('accusation en réponse à son message', () => assert.deepEqual(addressedTo("t'es un bot toi", 'Lucas', { repliesToPlayer: true }), { direct: true, accusation: true }));
check('accusation en anglais en réponse', () => assert.equal(addressedTo('ur def the ai', 'Sam', { repliesToPlayer: true }).accusation, true));
check('vocabulaire IA sans cible = non', () => assert.deepEqual(addressedTo("y a combien d'ia deja", 'Lucas'), { direct: false, accusation: false }));
check('réponse au joueur sans accusation = non', () => assert.equal(addressedTo('mdr trop bien', 'Lucas', { repliesToPlayer: true }).direct, false));
check('suspicion nommée = accusation', () => assert.equal(addressedTo('je trouve emma louche', 'Emma').accusation, true));

console.log(failures ? `\n${failures} échec(s)` : '\nTout est vert');
process.exit(failures ? 1 : 0);
