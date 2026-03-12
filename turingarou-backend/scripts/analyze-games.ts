/**
 * analyze-games.ts — Analyse les dernières parties via Claude API.
 *
 * Usage:
 *   npx tsx scripts/analyze-games.ts              # 10 dernières parties
 *   npx tsx scripts/analyze-games.ts --games 5    # 5 dernières parties
 *   npx tsx scripts/analyze-games.ts --output report.md
 *
 * Requires: ANTHROPIC_API_KEY in environment or .env
 */

import Database from 'better-sqlite3';
import Anthropic from '@anthropic-ai/sdk';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', 'turingarou.db');

// ── CLI args ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const nGames = parseInt(args.find(a => a.startsWith('--games='))?.split('=')[1]
  ?? args[args.indexOf('--games') + 1]
  ?? '10');
const outputFile = args.find(a => a.startsWith('--output='))?.split('=')[1]
  ?? args[args.indexOf('--output') + 1];

// ── DB queries ────────────────────────────────────────────────────────────────

interface GameRow   { game_id: string; date: string; language: string; result: string }
interface PlayerRow { player_name: string; player_type: string; strategy: string | null; eliminated: number; eliminated_round: number | null }
interface MsgRow    { round: number; player_name: string; player_type: string; content: string; ts: number }
interface VoteRow   { round: number; voter: string; target: string }
interface ElimRow   { round: number; player_name: string; is_ai: number }
interface AnswerRow { round: number; player_name: string; player_type: string; answer: string }
interface FlagRow   { message_id: string; flagged_by: string; round: number; reason: string | null; player_name: string; player_type: string; content: string }

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
      LEFT JOIN messages m ON m.game_id = mf.game_id
        AND m.player_name = (
          SELECT player_name FROM messages WHERE game_id = mf.game_id AND id = CAST(mf.message_id AS INTEGER) LIMIT 1
        )
        AND m.ts = (
          SELECT ts FROM messages WHERE game_id = mf.game_id AND id = CAST(mf.message_id AS INTEGER) LIMIT 1
        )
      WHERE mf.game_id = ?
    `).all(g.game_id) as FlagRow[];

    return { ...g, players, messages, votes, elims, answers, flags };
  });

  db.close();
  return result;
}

// ── Format prompt ─────────────────────────────────────────────────────────────

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

    // Group by round
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
      out += '\nHUMAN FLAGS (messages flagged as suspicious by human players):\n';
      for (const f of g.flags) {
        out += `  flagged by ${f.flagged_by} (round ${f.round}): [${f.player_type ?? '?'}] ${f.player_name ?? '?'}: "${f.content ?? '(message not found)'}"\n`;
        if (f.reason) out += `    reason: ${f.reason}\n`;
      }
    }
  }
  return out;
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
  console.log(`Loaded ${games.length} games. Sending to Claude for analysis...`);

  const gamesText = formatGamesForPrompt(games);

  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: `You are analyzing logs from "Turingarou", a social deduction game where human players try to identify hidden AI players. Each game has human players and AI players (type=ai or inspector). The goal: humans vote out AIs before being outnumbered.

Analyze the following game logs and produce a structured markdown report covering:

## 1. AI Behavioral Tells
Patterns in AI messages/answers that reveal their non-human nature:
- Repetitive phrasing or sentence structure across games
- Overly formal or structured language
- Answers that are too perfect/on-topic
- Voting patterns (do AIs vote coherently? Always vote for same player types?)
- Response timing patterns (always respond at similar intervals?)

## 2. Bugs & Data Anomalies
- Missing votes (players who never voted)
- Messages from eliminated players
- Games with no eliminations across multiple rounds
- Inconsistent player counts
- Any data that looks wrong

## 3. Human Flagging Analysis (if flags present)
- Which flagged messages were actually from AIs vs humans (false positives)?
- What patterns in AI messages triggered human suspicion?
- What AI messages were NOT flagged (successful deception)?

## 4. Balance Assessment
- Win rate: humans vs AIs
- Average rounds per game
- Are AIs winning too easily or too rarely?

## 5. Top 3 Prompt Improvements
Concrete suggestions to make AI behavior more human-like based on observed tells.

---

GAME LOGS:
${gamesText}`,
      },
    ],
  });

  const report = `# Turingarou — Game Analysis Report
Generated: ${new Date().toISOString()}
Games analyzed: ${games.length}

${(response.content[0] as { type: string; text: string }).text}
`;

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
