/**
 * analyze-history.ts — deterministic analysis of a pseudonymized JSONL corpus (export-history.ts or
 * GET /admin/history/export). No database, no LLM.
 *
 *   npx tsx scripts/analyze-history.ts [data/history/corpus.jsonl] [--out-dir data/history]
 *                                      [--briefing-dir strategies/learned | --no-briefing] [--include-suspect]
 *
 * Writes <out-dir>/report.md and <out-dir>/analysis.json (they quote pseudonymized messages: the out dir
 * must be git-ignored) and strategies/learned/briefing.{fr,en}.md (aggregates only, committed).
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { analyzeCorpus, parseCorpus } from '../src/history/analysis.js';
import { renderReport } from '../src/history/report.js';
import { LEARNED_DIR, renderBriefing } from '../src/history/briefing.js';
import type { Language } from '../src/history/types.js';

const args = process.argv.slice(2);
const arg = (flag: string): string | undefined => {
  const eq = args.find((a) => a.startsWith(`--${flag}=`));
  if (eq) return eq.slice(flag.length + 3);
  const i = args.indexOf(`--${flag}`);
  return i !== -1 ? args[i + 1] : undefined;
};
const valueFlags = new Set(['--out-dir', '--briefing-dir']);
const positional = args.filter((a, i) => !a.startsWith('--') && !valueFlags.has(args[i - 1]));

function isGitIgnored(file: string): boolean {
  try {
    execFileSync('git', ['check-ignore', '-q', file], { stdio: 'ignore' });
    return true;
  } catch (err: any) {
    return err?.status !== 1;
  }
}

const corpusPath = path.resolve(positional[0] ?? 'data/history/corpus.jsonl');
const outDir = path.resolve(arg('out-dir') ?? 'data/history');
const briefingDir = args.includes('--no-briefing') ? null : path.resolve(arg('briefing-dir') ?? LEARNED_DIR);

if (!fs.existsSync(corpusPath)) {
  console.error(`No corpus at ${corpusPath}. Export one first (scripts/export-history.ts or GET /admin/history/export).`);
  process.exit(1);
}
fs.mkdirSync(outDir, { recursive: true });
const probe = path.join(outDir, 'report.md');
if (!isGitIgnored(probe)) {
  console.error(`Refusing to write the report to ${outDir}: not git-ignored (it quotes player messages). Use data/history/.`);
  process.exit(1);
}

const games = parseCorpus(fs.readFileSync(corpusPath, 'utf8'));
const analysis = analyzeCorpus(games, { includeSuspect: args.includes('--include-suspect') });
fs.writeFileSync(path.join(outDir, 'analysis.json'), JSON.stringify(analysis, null, 1) + '\n');
fs.writeFileSync(probe, renderReport(analysis));
const rel = (p: string) => path.relative(process.cwd(), p);
console.log(
  `${analysis.corpus.games} games analysed (${analysis.corpus.excluded} excluded${analysis.corpus.synthetic ? `, ${analysis.corpus.synthetic} SYNTHETIC` : ''}) → ${rel(probe)}, ${rel(path.join(outDir, 'analysis.json'))}`
);
if (briefingDir) {
  fs.mkdirSync(briefingDir, { recursive: true });
  for (const lang of ['fr', 'en'] as Language[]) {
    const file = path.join(briefingDir, `briefing.${lang}.md`);
    fs.writeFileSync(file, renderBriefing(analysis, lang));
    console.log(`briefing ${lang} (${analysis.byLanguage[lang]?.games ?? 0} games) → ${rel(file)}`);
  }
}
for (const line of analysis.notMeasured) console.log(`not measured: ${line}`);
