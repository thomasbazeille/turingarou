/**
 * analyze-games.ts — Analyse les dernières parties via Claude API.
 * Met à jour tells-knowledge.md avec les nouvelles observations.
 *
 * Usage:
 *   npm run analyze                                   # 10 dernières parties (DATABASE_URL, lecture seule)
 *   npm run analyze -- --games 5                      # 5 dernières parties
 *   npm run analyze -- --corpus data/history/corpus.jsonl   # depuis un export, sans base
 *   npm run analyze -- --output report.md             # sauvegarde le rapport
 *   npm run analyze -- --dry-run                      # montre le prompt, n'appelle pas l'API
 *
 * Requires: ANTHROPIC_API_KEY in .env, and either --corpus (export-history.ts or GET /admin/history/export)
 * or DATABASE_URL pointing at the prod Postgres (see CLAUDE.md « Prod database — read-only »).
 * Games go through src/history: read-only transactions, names pseudonymized before they reach the prompt.
 */

import Anthropic from '@anthropic-ai/sdk';
import { randomBytes } from 'crypto';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { createReadOnlyPool, withReadOnly } from '../src/history/readonly.js';
import { loadGames as loadGameRecords } from '../src/history/reader.js';
import { makePseudonymizer, pseudonymizeGame, resolveSalt } from '../src/history/pseudonymize.js';
import { parseCorpus } from '../src/history/analysis.js';
import type { HistoryGame } from '../src/history/types.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KNOWLEDGE_PATH = path.join(__dirname, 'tells-knowledge.md');

// ── CLI args ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

function argVal(flag: string): string | undefined {
  const eq = args.find(a => a.startsWith(`--${flag}=`))?.split('=')[1];
  const idx = args.indexOf(`--${flag}`);
  return eq ?? (idx !== -1 ? args[idx + 1] : undefined);
}

const nGames    = parseInt(argVal('games') ?? '10');
const outputFile = argVal('output');
const corpusFile = argVal('corpus');
const dryRun     = args.includes('--dry-run');

// ── Games ─────────────────────────────────────────────────────────────────────

async function loadGames(n: number): Promise<HistoryGame[]> {
  let games: HistoryGame[];
  if (corpusFile) {
    games = parseCorpus(fs.readFileSync(corpusFile, 'utf8'))
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, n);
  } else {
    if (!process.env.DATABASE_URL) {
      console.error('Neither --corpus nor DATABASE_URL. See CLAUDE.md « Prod database (Railway Postgres) — read-only ».');
      process.exit(1);
    }
    const pool = createReadOnlyPool(process.env.DATABASE_URL, 1);
    try {
      games = await withReadOnly(pool, async (client) => {
        const { rows } = await client.query<{ game_id: string; date: string; language: string; result: string }>(
          `SELECT game_id, date, language, result FROM games ORDER BY date DESC, game_id DESC LIMIT $1`,
          [n]
        );
        return loadGameRecords(client, rows);
      });
    } finally {
      await pool.end();
    }
  }
  if (games.length === 0) {
    console.error('No games found.');
    process.exit(0);
  }
  // Player names are personal data: the prompt only sees pseudonyms (already the case for an export).
  const pz = makePseudonymizer(resolveSalt() ?? randomBytes(32).toString('hex'));
  return corpusFile ? games : games.map((g) => pseudonymizeGame(g, pz));
}

// ── Format game logs ──────────────────────────────────────────────────────────

function formatGamesForPrompt(games: HistoryGame[]): string {
  let out = '';
  for (const g of games) {
    out += `\n${'='.repeat(60)}\n`;
    out += `GAME ${g.gameId} | ${g.date} | lang=${g.language} | result=${g.result}\n`;

    out += '\nPLAYERS:\n';
    for (const p of g.players) {
      const elim = p.eliminated ? ` [eliminated round ${p.eliminatedRound}]` : ' [survived]';
      const strategy = p.strategy ? ` (strategy: ${p.strategy}${p.provider ? `, provider: ${p.provider}` : ''})` : '';
      out += `  ${p.type.padEnd(9)} ${p.name}${elim}${strategy}\n`;
    }

    for (const r of g.rounds) {
      out += `\n  --- ROUND ${r.round} ---\n`;
      if (r.question) out += `  QUESTION: ${r.question}\n`;
      if (r.answers.length) {
        out += '  ANSWERS:\n';
        for (const a of r.answers) out += `    [${a.type}] ${a.player}: ${a.answer}\n`;
      }
      const rdMsgs = g.messages.filter((m) => m.round === r.round);
      if (rdMsgs.length) {
        out += '  MESSAGES:\n';
        for (const m of rdMsgs) out += `    [${m.type}] ${m.player}: ${m.content}\n`;
      }
      if (r.votes.length) {
        out += '  VOTES:\n';
        for (const v of r.votes) out += `    ${v.voter} → ${v.target}\n`;
      }
      if (r.eliminated) out += `  ELIMINATED: ${r.eliminated.name} (${r.eliminated.isAI ? 'AI' : 'human'})\n`;
    }

    if (g.flags.length) {
      out += '\nHUMAN FLAGS:\n';
      for (const f of g.flags) {
        const target = f.target ? g.messages.find((m) => m.player === f.target!.player && m.ts === f.target!.ts) : undefined;
        out += target
          ? `  flagged by ${f.flaggedBy} (round ${f.round}): [${target.type}] ${target.player}: "${target.content}"\n`
          : `  flagged by ${f.flaggedBy} (round ${f.round}): (message not found)\n`;
        if (f.reason) out += `    reason: ${f.reason}\n`;
      }
    }
  }
  return out;
}

// ── Parse Claude response ─────────────────────────────────────────────────────

function parseResponse(raw: string): { knowledge: string; report: string } {
  const knowledgeMatch = raw.match(/<<<KNOWLEDGE_START>>>([\s\S]*?)<<<KNOWLEDGE_END>>>/);
  const reportMatch    = raw.match(/<<<REPORT_START>>>([\s\S]*?)<<<REPORT_END>>>/);

  if (!knowledgeMatch || !reportMatch) {
    // Fallback: if delimiters are missing, treat the whole response as the report
    console.warn('Warning: response delimiters not found — knowledge file not updated.');
    return { knowledge: '', report: raw };
  }

  return {
    knowledge: knowledgeMatch[1].trim(),
    report:    reportMatch[1].trim(),
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey && !dryRun) {
    console.error('ANTHROPIC_API_KEY not set. Add it to .env or environment.');
    process.exit(1);
  }

  console.log(`Loading last ${nGames} games from ${corpusFile ?? 'Postgres (read-only)'}...`);
  const games = await loadGames(nGames);
  console.log(`Loaded ${games.length} games.`);

  const gamesText    = formatGamesForPrompt(games);
  if (dryRun) {
    console.log(gamesText);
    return;
  }
  const knowledgeRaw = fs.existsSync(KNOWLEDGE_PATH)
    ? fs.readFileSync(KNOWLEDGE_PATH, 'utf8')
    : '(no knowledge base yet)';
  const today = new Date().toISOString().slice(0, 10);

  console.log('Sending to Claude for analysis...');
  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 6000,
    messages: [
      {
        role: 'user',
        content: `You are the quality analyst for "Turingarou", a social deduction game where humans try to identify hidden AI players. Player types in logs: human, ai, inspector (an AI playing as a human detective).

You have two tasks:

---

## TASK 1 — Update the knowledge base

Here is the current tells-knowledge.md:

\`\`\`markdown
${knowledgeRaw}
\`\`\`

Cross-reference this with the new game logs below. For each existing tell:
- If still present → update "Last seen" and increment frequency evidence
- If absent for several games → consider moving to "En observation" or "✅ Corrigés"
- If a fix was applied and it worked → mark as fixed with date and description

For new patterns spotted → add them (🔴 if seen multiple times, 🟡 if seen once).

Update "Last updated" to ${today} and increment "Analyses run" counter.

Use this tell ID format: T001, T002, etc. (continue from existing IDs, never reuse).

---

## TASK 2 — Analysis report

Produce a concise report for this batch:

### Nouveaux tells détectés
List any new patterns not already in the knowledge base.

### Tells actifs confirmés
Which known tells appeared again in this batch?

### Tells potentiellement corrigés
Which known tells were absent? Since when?

### Bugs & anomalies de données
Missing votes, impossible states, data inconsistencies.

### Analyse des flags humains
(Only if flags present) Accuracy, false positives, successful AI deceptions.

### Bilan équilibre
Win rates, average game length, balance issues.

---

## OUTPUT FORMAT

Your response MUST follow this exact structure — no text outside the delimiters:

<<<KNOWLEDGE_START>>>
[full updated tells-knowledge.md content]
<<<KNOWLEDGE_END>>>

<<<REPORT_START>>>
# Rapport d'analyse — ${today}
Games analysés : ${games.length}

[report content]
<<<REPORT_END>>>

---

GAME LOGS:
${gamesText}`,
      },
    ],
  });

  const raw = (response.content[0] as { type: string; text: string }).text;
  const { knowledge, report } = parseResponse(raw);

  // Save updated knowledge base
  if (knowledge) {
    fs.writeFileSync(KNOWLEDGE_PATH, knowledge, 'utf8');
    console.log(`Knowledge base updated: ${KNOWLEDGE_PATH}`);
  }

  // Output report
  if (outputFile) {
    fs.writeFileSync(outputFile, report, 'utf8');
    console.log(`Report written to ${outputFile}`);
  } else {
    console.log('\n' + report);
  }
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
