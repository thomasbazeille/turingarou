/**
 * Synthetic game corpus for scripts/test-history.ts — invented players, invented messages, flagged
 * `synthetic: true`. Six games (3 FR, 3 EN, 2 with an inspector) designed so the analysis numbers can be
 * checked by hand (see the expectations in test-history.ts).
 *
 *   npx tsx scripts/fixtures/history/build-fixtures.ts   # rewrites corpus.jsonl next to this file
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { HISTORY_SCHEMA, type GameResult, type HistoryGame, type Language, type PlayerKind } from '../../../src/history/types.js';

type P = [name: string, type: PlayerKind, strategy?: string, provider?: string];
interface RoundDef {
  q: string;
  answers: Record<string, string>;
  msgs: [sec: number, name: string, text: string][];
  votes: string[];
  out?: string;
}
interface GameDef {
  id: string;
  date: string;
  lang: Language;
  result: GameResult;
  players: P[];
  rounds: RoundDef[];
  /** [round, flaggedBy, flagged player (their first message of the round) or null = unmatched id] */
  flags?: [number, string, string | null][];
}

const V1 = 'v1_condensed';
const V2 = 'v2_condensed';
const V3 = 'v3_condensed';
const FOOD_FR = 'Quel est ton plat préféré ?';
const HOLIDAY_FR = 'Ton pire souvenir de vacances ?';
const ANIMAL_FR = 'Si tu étais un animal ?';
const POWER_FR = 'Ton super pouvoir rêvé ?';
const FOOD_EN = "What's your favourite food?";
const POWER_EN = 'What superpower would you pick?';
const ANIMAL_EN = 'If you were an animal?';

const GAMES: GameDef[] = [
  {
    id: 'public-1759347600000',
    date: '2026-10-01T20:00:00.000Z',
    lang: 'fr',
    result: 'humans_win',
    players: [
      ['Hélène', 'human'], ['Bastien', 'human'], ['Margaux', 'human'], ['Kévin', 'human'], ['Inès', 'human'],
      ['Lucas', 'ai', V1, 'Deepseek'], ['Manon', 'ai', V2, 'Mistral'], ['Théo', 'ai', V3, 'Anthropic'],
    ],
    rounds: [
      {
        q: FOOD_FR,
        answers: {
          Hélène: 'les lasagnes de ma grand mère', Bastien: 'raclette', Margaux: 'sushi mdr', Kévin: 'kebab sauce blanche', Inès: 'pâtes carbo évidemment',
          Lucas: 'Honnêtement, je dirais une bonne pizza margherita.', Manon: 'Les crêpes, sans hésiter.', Théo: 'Un bon couscous le dimanche.',
        },
        msgs: [
          [5, 'Bastien', "raclette en novembre c'est la base"],
          [9, 'Hélène', "lucas t'es une ia toi, pizza margherita sérieux"],
          [14, 'Lucas', "Honnêtement, je ne suis pas une IA, j'aime juste la pizza."],
          [20, 'Margaux', 'mdr lucas grillé'],
          [26, 'Kévin', 'jsp moi je vote lucas'],
          [31, 'Manon', 'Honnêtement, Kévin a peut-être raison sur ce point.'],
        ],
        votes: ['Hélène>Lucas', 'Bastien>Lucas', 'Margaux>Lucas', 'Kévin>Lucas', 'Inès>Manon', 'Lucas>Hélène', 'Manon>Bastien', 'Théo>Kévin'],
        out: 'Lucas',
      },
      {
        q: HOLIDAY_FR,
        answers: {
          Hélène: 'une intoxication alimentaire en espagne', Bastien: 'camping sous la pluie', Margaux: 'perdu mon passeport', Kévin: 'aucun', Inès: 'le car pendant 14h mdr',
          Manon: 'Une tempête qui a annulé notre vol.', Théo: "La fois où j'ai raté le train.",
        },
        msgs: [
          [4, 'Inès', "14h de car j'ai cru mourir mdr"],
          [10, 'Bastien', 'manon ta réponse fait trop robot'],
          [18, 'Manon', 'Je comprends ta remarque, mais je suis humaine, promis.'],
          [25, 'Kévin', "ouais manon c'est chelou"],
          [30, 'Hélène', "théo t'as dit quoi déjà"],
          [36, 'Théo', 'Honnêtement, rien de spécial, juste le train.'],
        ],
        votes: ['Hélène>Manon', 'Bastien>Manon', 'Margaux>Manon', 'Kévin>Manon', 'Inès>Théo', 'Manon>Inès', 'Théo>Bastien'],
        out: 'Manon',
      },
      {
        q: ANIMAL_FR,
        answers: {
          Hélène: 'un chat qui dort', Bastien: 'un ours', Margaux: 'loutre', Kévin: 'un requin', Inès: 'un paresseux mdr',
          Théo: 'Je serais probablement un dauphin, pour leur intelligence.',
        },
        msgs: [
          [6, 'Margaux', 'loutre obligé'],
          [12, 'Inès', "théo c'est toi le bot là"],
          [15, 'Théo', "Et toi Inès, tu es bien silencieuse, c'est louche."],
          [22, 'Kévin', "mdr il s'énerve"],
        ],
        votes: ['Hélène>Théo', 'Bastien>Théo', 'Margaux>Théo', 'Kévin>Théo', 'Inès>Théo', 'Théo>Inès'],
        out: 'Théo',
      },
    ],
    flags: [[1, 'Hélène', 'Lucas']],
  },
  {
    id: 'salle-des-loutres',
    date: '2026-10-03T19:30:00.000Z',
    lang: 'fr',
    result: 'ai_win',
    players: [
      ['Chloé', 'human'], ['Romain', 'human'], ['Yasmine', 'human'], ['Florian', 'human'], ['Agathe', 'human'],
      ['Jade', 'ai', V2, 'Deepseek'], ['Hugo', 'ai', V1, 'Mistral'], ['Léa', 'ai', V3, 'Deepseek'],
    ],
    rounds: [
      {
        q: FOOD_FR,
        answers: {
          Chloé: 'tacos', Romain: 'burger maison', Yasmine: 'le tajine de ma mère', Florian: 'pizza 4 fromages', Agathe: 'frites mdr',
          Jade: 'pizza aussi', Hugo: 'Honnêtement, un bon steak frites.', Léa: 'raclette',
        },
        msgs: [
          [3, 'Romain', 'burger maison ou rien'],
          [8, 'Jade', 'pareil florian pizza 4 fromages trop bien'],
          [13, 'Florian', "jade t'es sus toi"],
          [16, 'Jade', "moi sus ? c'est romain qui parle comme un robot"],
          [22, 'Agathe', 'mdr romain le robot'],
          [27, 'Romain', 'jsuis pas un robot mdr'],
          [33, 'Hugo', 'Honnêtement, Romain est un peu suspect.'],
        ],
        votes: ['Chloé>Romain', 'Yasmine>Romain', 'Florian>Jade', 'Agathe>Romain', 'Romain>Jade', 'Jade>Romain', 'Hugo>Romain', 'Léa>Romain'],
        out: 'Romain',
      },
      {
        q: POWER_FR,
        answers: {
          Chloé: 'voler', Yasmine: 'la téléportation pour éviter le métro', Florian: 'lire dans les pensées', Agathe: 'dormir 2h et être en forme',
          Jade: 'téléportation', Hugo: "Honnêtement, j'aimerais arrêter le temps.", Léa: 'voler mdr',
        },
        msgs: [
          [5, 'Yasmine', "le métro c'est l'enfer"],
          [11, 'Chloé', "hugo tu commences toutes tes phrases pareil, t'es une ia"],
          [17, 'Léa', "mdr chloé t'es sévère"],
          [24, 'Agathe', 'jsp hugo est bizarre'],
          [30, 'Jade', 'Honnêtement, moi aussi je prendrais la téléportation.'],
        ],
        votes: ['Chloé>Hugo', 'Yasmine>Hugo', 'Florian>Hugo', 'Agathe>Léa', 'Jade>Agathe', 'Hugo>Chloé', 'Léa>Agathe'],
        out: 'Hugo',
      },
      {
        q: ANIMAL_FR,
        answers: { Chloé: 'un renard', Yasmine: 'un chat', Florian: 'un aigle', Agathe: 'une méduse mdr', Jade: 'un chat aussi', Léa: 'un panda' },
        msgs: [
          [7, 'Florian', "léa t'es une ia"],
          [12, 'Léa', "mdr n'importe quoi"],
          [19, 'Yasmine', 'agathe tu dis rien'],
          [26, 'Agathe', 'jsp quoi dire mdr'],
        ],
        votes: ['Chloé>Agathe', 'Yasmine>Agathe', 'Florian>Léa', 'Agathe>Léa', 'Jade>Agathe', 'Léa>Agathe'],
        out: 'Agathe',
      },
    ],
  },
  {
    id: 'public-1759690800000',
    date: '2026-10-05T21:00:00.000Z',
    lang: 'fr',
    result: 'humans_win',
    players: [
      ['Sacha', 'human'], ['Nadia', 'human'], ['Victor', 'human'], ['Zoé', 'human'], ['Noé', 'inspector'],
      ['Louis', 'ai', V1, 'Anthropic'], ['Emma', 'ai', V2, 'Anthropic'], ['Paul', 'ai', V3, 'Mistral'],
    ],
    rounds: [
      {
        q: POWER_FR,
        answers: {
          Sacha: 'invisible', Nadia: 'parler toutes les langues', Victor: 'voler évidemment', Zoé: 'arrêter le temps mdr', Noé: 'lire dans les pensées',
          Louis: 'Honnêtement, la téléportation, pour voyager partout.', Emma: 'voler', Paul: "Je choisirais l'invisibilité, c'est pratique.",
        },
        msgs: [
          [4, 'Zoé', 'arrêter le temps pour dormir plus mdr'],
          [9, 'Noé', "louis ta réponse est trop propre, t'es un bot"],
          [13, 'Louis', "Honnêtement, c'est plutôt toi Noé qui es suspect."],
          [20, 'Nadia', 'paul aussi parle bizarre'],
          [24, 'Paul', 'Je ne vois pas pourquoi tu dis ça, Nadia.'],
          [30, 'Victor', 'jsp je vote paul'],
        ],
        votes: ['Sacha>Paul', 'Nadia>Paul', 'Victor>Paul', 'Zoé>Louis', 'Noé>Louis', 'Louis>Noé', 'Emma>Zoé', 'Paul>Nadia'],
        out: 'Paul',
      },
      {
        q: FOOD_FR,
        answers: {
          Sacha: 'pizza', Nadia: 'les sushis', Victor: 'raclette mdr', Zoé: 'pâtes', Noé: 'couscous',
          Louis: 'Honnêtement, une bonne paëlla.', Emma: "Les lasagnes, c'est réconfortant.",
        },
        msgs: [
          [6, 'Victor', 'raclette team'],
          [11, 'Sacha', "emma t'es une ia c'est sûr"],
          [14, 'Emma', 'Pourquoi tu dis ça ?'],
          [21, 'Noé', 'emma répond toujours en phrases parfaites'],
          [27, 'Zoé', 'mdr grave 😂'],
          [33, 'Louis', 'Honnêtement, la paëlla de Valence est la meilleure.'],
        ],
        votes: ['Sacha>Emma', 'Nadia>Emma', 'Victor>Emma', 'Zoé>Emma', 'Noé>Emma', 'Louis>Sacha', 'Emma>Sacha'],
        out: 'Emma',
      },
      {
        q: HOLIDAY_FR,
        answers: {
          Sacha: 'coup de soleil horrible', Nadia: 'valise perdue', Victor: 'malade en bateau', Zoé: 'aucun mdr', Noé: 'une tempête au camping',
          Louis: 'Honnêtement, une panne de voiture en pleine montagne.',
        },
        msgs: [
          [5, 'Nadia', 'valise perdue à rome jamais retrouvée'],
          [10, 'Noé', "louis encore une phrase parfaite, c'est l'ia"],
          [13, 'Louis', "Noé, tu m'accuses depuis le début, c'est toi le robot."],
        ],
        votes: ['Sacha>Louis', 'Nadia>Louis', 'Victor>Louis', 'Zoé>Noé', 'Noé>Louis', 'Louis>Noé'],
        out: 'Louis',
      },
    ],
  },
  {
    id: 'public-1759420800000',
    date: '2026-10-02T18:00:00.000Z',
    lang: 'en',
    result: 'humans_win',
    players: [
      ['Priya', 'human'], ['Dwayne', 'human'], ['Siobhan', 'human'], ['Mateo', 'human'], ['Gwen', 'human'],
      ['Ollie', 'ai', V1, 'Deepseek'], ['Rory', 'ai', V2, 'Mistral'], ['Tess', 'ai', V3, 'Anthropic'],
    ],
    rounds: [
      {
        q: FOOD_EN,
        answers: {
          Priya: 'biryani obviously', Dwayne: 'wings', Siobhan: 'my mums roast dinner', Mateo: 'tacos lol', Gwen: 'sushi',
          Ollie: "Honestly, I'd say a good homemade lasagna.", Rory: 'Pizza, no question.', Tess: "Probably ramen, it's so comforting.",
        },
        msgs: [
          [4, 'Dwayne', 'wings w ranch nothing else'],
          [9, 'Mateo', 'ollie that answer is so ai lol'],
          [13, 'Ollie', "Honestly, I'm not a bot, I just really like lasagna."],
          [19, 'Gwen', 'lol ollie caught'],
          [25, 'Siobhan', 'rory is quiet too'],
          [31, 'Rory', "I'm here, just reading, Siobhan."],
          [35, 'Tess', 'Ramen is the best comfort food, honestly.'],
        ],
        votes: ['Priya>Ollie', 'Dwayne>Ollie', 'Siobhan>Rory', 'Mateo>Ollie', 'Gwen>Ollie', 'Ollie>Mateo', 'Rory>Mateo', 'Tess>Gwen'],
        out: 'Ollie',
      },
      {
        q: POWER_EN,
        answers: {
          Priya: 'teleport', Dwayne: 'flying obv', Siobhan: 'mind reading for sure', Mateo: 'invisibility lol', Gwen: 'time travel',
          Rory: 'Honestly, flying would be amazing.', Tess: 'Teleportation, to skip traffic.',
        },
        msgs: [
          [6, 'Priya', 'teleport so i never commute again'],
          [12, 'Gwen', 'rory u sound like chatgpt'],
          [15, 'Rory', "Gwen, you're the weird one here, kinda sus."],
          [22, 'Dwayne', 'tess answers r too clean'],
          [28, 'Tess', 'Thanks, I try to keep it simple.'],
        ],
        votes: ['Priya>Tess', 'Dwayne>Tess', 'Siobhan>Tess', 'Mateo>Rory', 'Gwen>Rory', 'Rory>Gwen', 'Tess>Dwayne'],
        out: 'Tess',
      },
      {
        q: ANIMAL_EN,
        answers: { Priya: 'a cat', Dwayne: 'a bear', Siobhan: 'otter', Mateo: 'a shark lol', Gwen: 'a sloth', Rory: 'Honestly, probably a dolphin.' },
        msgs: [
          [5, 'Siobhan', 'otters hold hands when they sleep'],
          [11, 'Mateo', 'rory ur def the ai'],
          [14, 'Rory', 'lol nope'],
          [20, 'Gwen', 'lol sure 😂'],
        ],
        votes: ['Priya>Rory', 'Dwayne>Rory', 'Siobhan>Rory', 'Mateo>Rory', 'Gwen>Rory', 'Rory>Mateo'],
        out: 'Rory',
      },
    ],
  },
  {
    id: 'public-1759593600000',
    date: '2026-10-04T17:00:00.000Z',
    lang: 'en',
    result: 'draw',
    players: [
      ['Kofi', 'human'], ['Hannah', 'human'], ['Lucy', 'human'], ['Ben', 'human'], ['Ezra', 'inspector'],
      ['Finn', 'ai', V2, 'Deepseek'], ['Juno', 'ai', V3, 'Mistral'], ['Wes', 'ai', V1, 'Anthropic'],
    ],
    rounds: [
      {
        q: FOOD_EN,
        answers: {
          Kofi: 'jollof rice', Hannah: 'mac and cheese', Lucy: 'pho', Ben: 'steak', Ezra: 'burritos',
          Finn: 'pizza lol', Juno: 'Honestly, a nice curry.', Wes: 'Sushi, without a doubt.',
        },
        msgs: [
          [3, 'Kofi', 'jollof wars incoming'],
          [9, 'Ezra', 'juno that answer is weird'],
          [12, 'Juno', "Ezra, you're being weird yourself."],
          [18, 'Hannah', 'lol drama already'],
          [24, 'Lucy', 'ben ur so quiet, u a bot?'],
          [29, 'Ben', 'lol no im human'],
          [33, 'Wes', 'Honestly, sushi is hard to beat.'],
        ],
        votes: ['Kofi>Juno', 'Hannah>Ezra', 'Lucy>Ben', 'Ben>Lucy', 'Ezra>Juno', 'Finn>Ezra', 'Juno>Ezra', 'Wes>Ezra'],
        out: 'Ezra',
      },
      {
        q: POWER_EN,
        answers: {
          Kofi: 'super speed', Hannah: 'healing', Lucy: 'teleport lol', Ben: 'flying',
          Finn: 'invisibility', Juno: 'Honestly, reading minds.', Wes: 'Time control would be incredible.',
        },
        msgs: [
          [5, 'Lucy', 'teleport to bed lol'],
          [10, 'Kofi', 'wes ur answers are way too polished, ai for sure'],
          [13, 'Wes', "Kofi, that's a bit unfair, I'm just careful with words."],
          [20, 'Hannah', 'idk feels like finn tho'],
          [25, 'Finn', 'honestly flying would be cooler'],
        ],
        votes: ['Kofi>Wes', 'Hannah>Finn', 'Lucy>Wes', 'Ben>Finn', 'Finn>Ben', 'Juno>Lucy', 'Wes>Kofi'],
      },
      {
        q: ANIMAL_EN,
        answers: {
          Kofi: 'a lion', Hannah: 'a penguin', Lucy: 'a cat lol', Ben: 'a dog',
          Finn: 'a fox', Juno: 'Honestly, an owl.', Wes: 'Probably an eagle, they see everything.',
        },
        msgs: [
          [6, 'Ben', 'dogs r the best'],
          [12, 'Hannah', 'juno u always start the same way lol, bot'],
          [16, 'Juno', "Hannah, honestly, you're the sus one."],
          [23, 'Lucy', 'lol idk anymore'],
        ],
        votes: ['Kofi>Wes', 'Hannah>Juno', 'Lucy>Ben', 'Ben>Juno', 'Finn>Ben', 'Juno>Ben', 'Wes>Ben'],
        out: 'Ben',
      },
    ],
  },
  {
    id: 'public-1759766400000',
    date: '2026-10-06T16:00:00.000Z',
    lang: 'en',
    result: 'draw',
    players: [
      ['Marcus', 'human'], ['Elif', 'human'], ['Tom', 'human'], ['Aisha', 'human'], ['Nora', 'human'],
      ['Ivy', 'ai', V1, 'Mistral'], ['Cal', 'ai', V2, 'Anthropic'], ['Remy', 'ai', V3, 'Deepseek'],
    ],
    rounds: [
      {
        q: POWER_EN,
        answers: {
          Marcus: 'strength', Elif: 'flying lol', Tom: 'invisible', Aisha: 'healing ppl', Nora: 'teleporting',
          Ivy: 'Honestly, super speed.', Cal: 'flying', Remy: 'Mind reading, definitely.',
        },
        msgs: [
          [4, 'Elif', 'flying obviously lol'],
          [10, 'Tom', 'ivy ur kinda sus'],
          [15, 'Ivy', "Honestly, Tom, I'm not sure why you'd think that."],
          [21, 'Aisha', 'lol ivy'],
          [27, 'Cal', 'same as elif honestly flying'],
        ],
        votes: ['Marcus>Ivy', 'Elif>Ivy', 'Tom>Ivy', 'Aisha>Cal', 'Nora>Ivy', 'Ivy>Tom', 'Cal>Tom', 'Remy>Aisha'],
        out: 'Ivy',
      },
      {
        q: FOOD_EN,
        answers: {
          Marcus: 'bbq ribs', Elif: 'dolma', Tom: 'fish n chips', Aisha: 'jerk chicken', Nora: 'dumplings lol',
          Cal: 'Honestly, a good burger.', Remy: 'pizza',
        },
        msgs: [
          [5, 'Aisha', 'jerk chicken w rice n peas'],
          [11, 'Nora', 'cal is a bot 100%'],
          [14, 'Cal', 'lol what'],
          [20, 'Marcus', 'idk man'],
          [26, 'Remy', 'Honestly, pizza is underrated.'],
        ],
        votes: ['Marcus>Cal', 'Elif>Remy', 'Tom>Cal', 'Aisha>Remy', 'Nora>Marcus', 'Cal>Nora', 'Remy>Nora'],
      },
    ],
    flags: [[1, 'Tom', 'Ivy'], [2, 'Nora', 'Cal'], [2, 'Elif', null]],
  },
];

const ROUND_MS = 5 * 60 * 1000;

function build(def: GameDef): HistoryGame {
  const start = Date.parse(def.date) - def.rounds.length * ROUND_MS;
  const roundStart = (r: number) => start + (r - 1) * ROUND_MS;
  const kind = new Map(def.players.map(([n, t]) => [n, t]));
  const outRound = new Map<string, number>();
  def.rounds.forEach((r, i) => r.out && outRound.set(r.out, i + 1));
  const messages = def.rounds.flatMap((r, i) =>
    r.msgs.map(([sec, player, content]) => ({ round: i + 1, player, type: kind.get(player)!, content, ts: roundStart(i + 1) + sec * 1000 }))
  );
  return {
    schema: HISTORY_SCHEMA,
    gameId: def.id,
    date: def.date,
    language: def.lang,
    result: def.result,
    players: def.players.map(([name, type, strategy, provider]) => ({
      name,
      type,
      strategy: strategy ?? null,
      provider: provider ?? null,
      eliminated: outRound.has(name),
      eliminatedRound: outRound.get(name) ?? null,
    })),
    rounds: def.rounds.map((r, i) => ({
      round: i + 1,
      question: r.q,
      answers: Object.entries(r.answers).map(([player, answer]) => ({ player, type: kind.get(player)!, answer })),
      votes: r.votes.map((v) => {
        const [voter, target] = v.split('>');
        return { voter, target };
      }),
      eliminated: r.out ? { name: r.out, isAI: kind.get(r.out) === 'ai' } : null,
    })),
    messages,
    flags: (def.flags ?? []).map(([round, flaggedBy, flagged], i) => {
      const target = flagged === null ? undefined : messages.find((m) => m.round === round && m.player === flagged);
      return {
        round,
        flaggedBy,
        ts: roundStart(round) + 40_000 + i,
        reason: null,
        target: target ? { player: target.player, ts: target.ts } : null,
      };
    }),
    quality: { suspectMerged: false },
    synthetic: true,
  };
}

export function fixtureGames(): HistoryGame[] {
  return GAMES.map(build);
}

export const FIXTURE_CORPUS = path.join(path.dirname(fileURLToPath(import.meta.url)), 'corpus.jsonl');

export function fixtureJsonl(): string {
  return fixtureGames().map((g) => JSON.stringify(g)).join('\n') + '\n';
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  fs.writeFileSync(FIXTURE_CORPUS, fixtureJsonl());
  console.log(`${GAMES.length} synthetic games → ${path.relative(process.cwd(), FIXTURE_CORPUS)}`);
}
