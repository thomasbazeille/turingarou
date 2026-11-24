import assert from 'node:assert/strict';
import { addressedTo } from '../src/game/directAddress.js';
import { finish, test } from './testkit.js';

test('nom en mot entier = direct', () => assert.equal(addressedTo('lucas tu en penses quoi', 'Lucas').direct, true));
test('nom avec accent, saisi sans accent', () => assert.equal(addressedTo('helene t ou', 'Hélène').direct, true));
test('@nom = direct', () => assert.equal(addressedTo('@Lucas ?', 'Lucas').direct, true));
test('nom inclus dans un autre mot = non', () => assert.equal(addressedTo('lucastor est nul', 'Lucas').direct, false));
test('accusation nommée', () => assert.deepEqual(addressedTo('lucas c est l ia', 'Lucas'), { direct: true, accusation: true }));
test('accusation en réponse à son message', () => assert.deepEqual(addressedTo("t'es un bot toi", 'Lucas', { repliesToPlayer: true }), { direct: true, accusation: true }));
test('accusation en anglais en réponse', () => assert.equal(addressedTo('ur def the ai', 'Sam', { repliesToPlayer: true }).accusation, true));
test('vocabulaire IA sans cible = non', () => assert.deepEqual(addressedTo("y a combien d'ia deja", 'Lucas'), { direct: false, accusation: false }));
test('réponse au joueur sans accusation = non', () => assert.equal(addressedTo('mdr trop bien', 'Lucas', { repliesToPlayer: true }).direct, false));
test('suspicion nommée = accusation', () => assert.equal(addressedTo('je trouve emma louche', 'Emma').accusation, true));

finish();
