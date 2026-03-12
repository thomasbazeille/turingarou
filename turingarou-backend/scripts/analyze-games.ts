/**
 * analyze-games.ts — Analyse les dernières parties via Claude API.
 * Met à jour tells-knowledge.md avec les nouvelles observations.
 *
 * Usage:
 *   npm run analyze                        # 10 dernières parties
 *   npm run analyze -- --games 5           # 5 dernières parties
 *   npm run analyze -- --output report.md  # sauvegarde le rapport
 *
 * Requires: ANTHROPIC_API_KEY in .env
 */

import Database from 'better-sqlite3';
import Anthropic from '@anthropic-ai/sdk';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH        = path.join(__dirname, '..', 'turingarou.db');
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

// ── DB queries ────────────────────────────────────────────────────────────────

interface GameRow   { game_id: string; date: string; language: string; result: string }
interface PlayerRow { player_name: string; player_type: string; strategy: string | null; eliminated: number; eliminated_round: number | null }
interface MsgRow    { round: number; player_name: string; player_type: string; content: string; ts: number }
interface VoteRow   { round: number; voter: string; target: string }
interface ElimRow   { round: number; player_name: string; is_ai: number }
interface AnswerRow { round: number; player_name: string; player_type: string; answer: string }
interface FlagRow   { message_id: string; flagged_by: string; round: number; reason: string | null; player_name: string | null; player_type: string | null; content: string | null }

function loadGames(n: number) {
  if (!fs.existsSync(DB_PATH)) {
    console.error(`DB not found at ${DB_PATH}. Run the backend and play at least one game first.`);
    process.exit(1);
  }
  const db = new Database(DB_PATH, { readonly: true });

  const games = db.prepare(
    `SELECT game_id, date, language, result FROM games ORDER BY date DESC LIMIT ?`
  ).all(n) as GameRow[];

  if (games.length === 0) {
    console.error('No games found in DB.');
    process.exit(0);
  }

  const result = games.map(g => {
    const players  = db.prepare(`SELECT player_name, player_type, strategy, eliminated, eliminated_round FROM game_players WHERE game_id = ?`).all(g.game_id) as PlayerRow[];
    const messages = db.prepare(`SELECT round, player_name, player_type, content, ts FROM messages WHERE game_id = ? ORDER BY ts`).all(g.game_id) as MsgRow[];
    const votes    = db.prepare(`SELECT round, voter, target FROM round_votes WHERE game_id = ?`).all(g.game_id) as VoteRow[];
    const elims    = db.prepare(`SELECT round, player_name, is_ai FROM round_eliminations WHERE game_id = ?`).all(g.game_id) as ElimRow[];
    const answers  = db.prepare(`SELECT round, player_name, player_type, answer FROM round_answers WHERE game_id = ?`).all(g.game_id) as AnswerRow[];
    const flags    = db.prepare(`
      SELECT mf.message_id, mf.flagged_by, mf.round, mf.reason,
             m.player_name, m.player_type, m.content
      FROM message_flags mf
      LEFT JOIN messages m
        ON m.game_id = mf.game_id AND m.id = CAST(mf.message_id AS INTEGER)
      WHERE mf.game_id = ?
    `).all(g.game_id) as FlagRow[];

    return { ...g, players, messages, votes, elims, answers, flags };
  });

  db.close();
  return result;
}

// ── Format game logs ──────────────────────────────────────────────────────────

function formatGamesForPrompt(games: ReturnType<typeof loadGames>): string {
  let out = '';
  for (const g of games) {
    out += `\n${'='.repeat(60)}\n`;
    out += `GAME ${g.game_id} | ${g.date} | lang=${g.language} | result=${g.result}\n`;

    out += '\nPLAYERS:\n';
    for (const p of g.players) {
      const elim = p.eliminated ? ` [eliminated round ${p.eliminated_round}]` : ' [survived]';
      out += `  ${p.player_type.padEnd(9)} ${p.player_name}${elim}${p.strategy ? ` (strategy: ${p.strategy})` : ''}\n`;
    }

    const rounds = [...new Set([...g.answers.map(a => a.round), ...g.messages.map(m => m.round)])].sort((a, b) => a - b);
    for (const rd of rounds) {
      out += `\n  --- ROUND ${rd} ---\n`;

      const rdAnswers = g.answers.filter(a => a.round === rd);
      if (rdAnswers.length) {
        out += '  ANSWERS:\n';
        for (const a of rdAnswers) out += `    [${a.player_type}] ${a.player_name}: ${a.answer}\n`;
      }

      const rdMsgs = g.messages.filter(m => m.round === rd);
      if (rdMsgs.length) {
        out += '  MESSAGES:\n';
        for (const m of rdMsgs) out += `    [${m.player_type}] ${m.player_name}: ${m.content}\n`;
      }

      const rdVotes = g.votes.filter(v => v.round === rd);
      if (rdVotes.length) {
        out += '  VOTES:\n';
        for (const v of rdVotes) out += `    ${v.voter} → ${v.target}\n`;
      }

      const rdElim = g.elims.find(e => e.round === rd);
      if (rdElim) out += `  ELIMINATED: ${rdElim.player_name} (${rdElim.is_ai ? 'AI' : 'human'})\n`;
    }

    if (g.flags.length) {
      out += '\nHUMAN FLAGS:\n';
      for (const f of g.flags) {
        out += `  flagged by ${f.flagged_by} (round ${f.round}): [${f.player_type ?? '?'}] ${f.player_name ?? '?'}: "${f.content ?? '(message not found)'}"\n`;
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
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY not set. Add it to .env or environment.');
    process.exit(1);
  }

  console.log(`Loading last ${nGames} games from ${DB_PATH}...`);
  const games = loadGames(nGames);
  console.log(`Loaded ${games.length} games.`);

  const gamesText    = formatGamesForPrompt(games);
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
