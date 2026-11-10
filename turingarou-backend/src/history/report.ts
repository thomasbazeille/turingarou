/** Markdown rendering of a HistoryAnalysis (French, for Thomas). Every rate carries its k/n. */

import type { Dist, HistoryAnalysis, Rate, Section } from './analysis.js';
import type { PlayerKind } from './types.js';

export const pct = (r: Rate): string => (r.rate === null ? 'non mesuré (n=0)' : `${Math.round(r.rate * 100)} % (${r.k}/${r.n})`);
const num = (x: number | null, digits = 1): string => (x === null ? '—' : String(Math.round(x * 10 ** digits) / 10 ** digits));
const sec = (ms: number | null): string => (ms === null ? '—' : `${num(ms / 1000)} s`);
const distStr = (d: Dist, f: (x: number | null) => string = (x) => num(x)): string =>
  d.n === 0 ? '—' : `${f(d.p50)} (p10 ${f(d.p10)}, p90 ${f(d.p90)}, n=${d.n})`;
const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');

function table(head: string[], rows: string[][]): string {
  if (rows.length === 0) return '_aucune donnée_\n';
  return [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.map(cell).join(' | ')} |`)].join('\n') + '\n';
}

function styleTable(s: Section, kinds: PlayerKind[] = ['human', 'ai', 'inspector']): string {
  const m = s.style.messages;
  const a = s.style.answers;
  const row = (label: string, f: (k: PlayerKind) => string) => [label, ...kinds.map(f)];
  return table(
    ['', ...kinds.map((k) => ({ human: 'humains', ai: 'IA', inspector: 'inspecteur' })[k])],
    [
      row('messages', (k) => String(m[k].messages)),
      row('caractères, médiane', (k) => distStr(m[k].chars)),
      row('mots, médiane', (k) => distStr(m[k].words)),
      row('commence en minuscule', (k) => pct(m[k].startsLower)),
      row('tout en minuscules', (k) => pct(m[k].allLower)),
      row('finit par . ! ? …', (k) => pct(m[k].endsWithPunctuation)),
      row('contient « ? »', (k) => pct(m[k].question)),
      row('contient « ! »', (k) => pct(m[k].exclamation)),
      row('emoji', (k) => pct(m[k].emoji)),
      row('points de suspension', (k) => pct(m[k].ellipsis)),
      row('virgules / message', (k) => num(m[k].commasPerMessage, 2)),
      row('délai après le message précédent', (k) => distStr(s.style.latencyMs[k], sec)),
      row('réponse à la question, mots', (k) => distStr(a[k].words)),
      row('réponse : finit par ponctuation', (k) => pct(a[k].endsWithPunctuation)),
    ]
  );
}

const RESPONSE_LABEL: Record<string, string> = {
  silence: 'silence',
  counter_accusation: 'contre-accusation',
  denial: 'dénégation',
  humour: 'humour',
  question: 'question en retour',
  other: 'autre',
};

export function renderReport(a: HistoryAnalysis): string {
  const s = a.overall;
  const out: string[] = [];
  out.push(`# Turingarou — analyse de l'historique des parties\n`);
  out.push(
    `Généré le ${a.generatedAt.slice(0, 10)} · ${a.corpus.games} parties analysées` +
      (a.corpus.excluded ? ` (${a.corpus.excluded} écartées : vides ou fusion suspecte d'un code de salle réutilisé)` : '') +
      ` · ${Object.entries(a.corpus.languages).map(([l, n]) => `${l} ${n}`).join(', ') || 'aucune langue'}` +
      (a.corpus.dateRange ? ` · du ${a.corpus.dateRange.from.slice(0, 10)} au ${a.corpus.dateRange.to.slice(0, 10)}` : '') +
      '\n'
  );
  if (a.corpus.synthetic) out.push(`> ⚠️ ${a.corpus.synthetic} parties SYNTHÉTIQUES (fixtures inventées) : aucun chiffre ci-dessous ne décrit de vrais joueurs.\n`);
  out.push(`## Non mesuré\n\n${a.notMeasured.map((x) => `- ${x}`).join('\n')}\n`);

  out.push(`## 1. Résultats\n`);
  out.push(table(['victoire humains', 'victoire IA', 'nul', 'rounds / partie'], [[pct(s.outcomes.humansWin), pct(s.outcomes.aiWin), pct(s.outcomes.draw), num(s.outcomes.meanRounds)]]));

  const groupRows = (g: Section['byStrategy']) =>
    g.map((x) => [x.key, String(x.aiPlayers), pct(x.survived), pct(x.teamWins), num(x.meanEliminationRound), num(x.accusationsPerRound, 2)]);
  const groupHead = ['clé', 'IA', 'survie', 'victoire équipe IA', 'round moyen d’élimination', 'accusations / round vivant'];
  out.push(`## 2. Par stratégie\n\n${table(groupHead, groupRows(s.byStrategy))}`);
  out.push(`## 3. Par provider\n\n${table(groupHead, groupRows(s.byProvider))}`);

  out.push(`## 4. Éliminations : quand et pourquoi\n`);
  out.push(
    `- Éliminations qui touchent une IA : ${pct(s.eliminations.accuracy)}\n` +
      `- Votes humains sur une IA : ${pct(s.eliminations.humanVotesOnAI)}\n` +
      `- Votes IA sur un non-IA : ${pct(s.eliminations.aiVotesOnHumans)}\n`
  );
  out.push(table(['round', 'IA', 'humain', 'inspecteur', 'personne'], s.eliminations.byRound.map((r) => [String(r.round), String(r.ai), String(r.human), String(r.inspector), String(r.none)])));
  out.push(`\nIA éliminées au round vs IA qui l'ont passé (moyennes par IA et par round) :\n\n`);
  out.push(
    table(
      ['indicateur', 'éliminées', 'survivantes'],
      s.eliminations.predictors.map((p) => [p.feature, `${num(p.eliminated, 2)} (n=${p.nEliminated})`, `${num(p.survivors, 2)} (n=${p.nSurvivors})`])
    )
  );
  const cases = s.eliminations.cases.slice(0, 8);
  if (cases.length) {
    const lines = [`Cas (${cases.length} sur ${s.eliminations.cases.length}) — messages qui précèdent le vote :`, ''];
    for (const c of cases) {
      lines.push(
        `- **${c.player}** (${c.strategy ?? '?'}${c.provider ? `, ${c.provider}` : ''}) · round ${c.round} · ${c.votesReceived}/${c.totalVotes} votes · ${c.accusationsReceived} accusation(s) · ${c.ownMessages} message(s)` +
          (c.ownAnswer !== null ? ` · réponse à la question : « ${cell(c.ownAnswer)} »` : '')
      );
      for (const m of c.preceding) lines.push(`  - [${m.type}] ${m.player} : « ${cell(m.content)} »`);
    }
    out.push(`\n${lines.join('\n')}\n`);
  }

  out.push(`\n## 5. Stylométrie humains vs IA\n\n${styleTable(s)}`);
  out.push(`\nÉcart-type moyen de la longueur des réponses dans un round : IA ${num(s.style.answerSpread.ai, 2)} mot(s), humains ${num(s.style.answerSpread.human, 2)}.\n`);
  for (const [lang, sub] of Object.entries(a.byLanguage)) {
    if (sub) out.push(`\n### ${lang.toUpperCase()} (${sub.games} parties)\n\n${styleTable(sub, ['human', 'ai'])}`);
  }

  const lexRows = (xs: Section['lexical']['aiOverused']) =>
    xs.map((x) => [x.word, `${Math.round(x.aiShare * 100)} % (${x.aiMessages})`, `${Math.round(x.humanShare * 100)} % (${x.humanMessages})`, num(x.ratio, 2)]);
  out.push(`\n## 6. Tells lexicaux (part des messages contenant le mot)\n\nSur-employés par les IA :\n\n`);
  out.push(table(['mot', 'IA', 'humains', 'ratio'], lexRows(s.lexical.aiOverused)));
  out.push(`\nMarqueurs humains que les IA n'emploient pas :\n\n`);
  out.push(table(['mot', 'IA', 'humains', 'ratio'], lexRows(s.lexical.humanMarkers)));

  out.push(`\n## 7. Questions qui exposent le mieux les IA\n\n`);
  out.push(
    table(
      ['question', 'rounds', 'votes humains sur IA', 'IA éliminée', 'mots IA', 'mots humains'],
      s.questions.slice(0, 10).map((q) => [q.question, String(q.rounds), pct(q.humanVotesOnAI), pct(q.aiEliminated), num(q.answerWordsAI), num(q.answerWordsHuman)])
    )
  );

  out.push(`\n## 8. Accusé : quelle réplique survit au vote du round\n\n`);
  out.push(
    table(
      ['cible', 'réplique', 'n', 'survie au round', 'part des votes reçus', 'délai de réplique'],
      s.counterMoves.map((c) => [c.target === 'ai' ? 'IA' : 'humain', RESPONSE_LABEL[c.response], String(c.n), pct(c.survived), num(c.meanVoteShare, 2), distStr(c.replyLatencyMs, sec)])
    )
  );

  const i = s.inspector;
  out.push(`\n## 9. Effet de l'inspecteur\n\n`);
  out.push(
    table(
      ['', 'avec inspecteur', 'sans'],
      [
        ['parties', String(i.gamesWith), String(i.gamesWithout)],
        ['victoire humains', pct(i.humanWinWith), pct(i.humanWinWithout)],
        ['éliminations qui touchent une IA', pct(i.eliminationAccuracyWith), pct(i.eliminationAccuracyWithout)],
        ['votes humains sur une IA', pct(i.humanVotesOnAIWith), pct(i.humanVotesOnAIWithout)],
      ]
    )
  );
  out.push(`\nVotes de l'inspecteur sur une IA : ${pct(i.inspectorVotesOnAI)} · inspecteur éliminé : ${pct(i.inspectorEliminated)}\n`);

  out.push(`\n## 10. Signalements de messages\n\n${s.flags.total} signalement(s), ${s.flags.resolved} rattaché(s) à leur message · sur une IA : ${pct(s.flags.onAI)}\n`);
  return out.join('\n').replace(/\n{3,}/g, '\n\n');
}
