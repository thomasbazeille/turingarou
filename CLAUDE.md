# TURINGAROU

Social deduction game where players identify hidden AIs.

## Commands

### Backend
```bash
cd turingarou-backend
npm run dev        # tsx watch, port 3001
npm run build      # compile TypeScript
npm start          # run compiled build
npm run test:unit  # form gate, timing, direct address, bot core
npm run test:sim   # full games in virtual time with fake models and humans, invariants report
```

### Analyze game logs (requires ANTHROPIC_API_KEY + prod DB URL, see below)
```bash
cd turingarou-backend
npm run analyze                            # analyze last 10 games
npm run analyze -- --games 5              # analyze last 5 games
npm run analyze -- --output report.md     # save report to file
```

### Prod database (Railway Postgres) — read-only
Games are persisted in the Postgres of the Railway project `turingarou`. Read it, never write to it: no `INSERT`/`UPDATE`/`DELETE`, no schema change, no tool pointed at the prod URL that migrates. The schema is created by `GameLogger.initDB()` at server boot.
```bash
railway link --project turingarou          # once per machine (needs to be a member of the Railway project)
# Variable NAMES only — never print values into a transcript:
railway variables --service Postgres --json | jq 'keys[]'
# Load the public URL into the current shell only (never into a committed file):
export DATABASE_URL=$(railway variables --service Postgres --json | jq -r '.DATABASE_PUBLIC_URL // empty')
[ -n "$DATABASE_URL" ] || echo "❌ empty URL — not a member of the Railway project turingarou?"
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM games;"
```
`npm run analyze` opens its session read-only (`SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY`).

### Verify end state (run after every backend change)
```bash
# Terminal 1 — start backend
cd turingarou-backend && npm run dev

# Terminal 2 — run test client, confirm it prints "✅ Connected" and "✅ Joined successfully"
cd turingarou-backend && node test-client.js
# Expected output:
#   ✅ Connected to server
#   ✅ Joined successfully! Player ID: <id>
#   📊 Game State Update: Phase: waiting  Players: 1/9
# Press Ctrl+C when done
```

### Frontend
In prod the backend serves `turingarou-online.html` itself at `/` (same origin). Locally, serve it on localhost — opened as `file://`, the page connects to the PROD backend, not your local one:
```bash
python -m http.server 8000   # serve from project root, then open http://localhost:8000/turingarou-online.html
```

## Architecture

Three-layer architecture:

```
turingarou-online.html  (HTML + Socket.io client)
    ↕ socket events
src/server.ts           (Express + Socket.io, room management)
    ↕ game logic
src/game/GameRoom.ts    (phase state machine, sockets, persistence)
    ↕ phase hooks / posts, answers, votes
src/game/BotDirector.ts (every bot behaviour: answers, chat timing, direct replies, votes)
    ↕ LLM calls
src/llm/                (Deepseek / Mistral / Anthropic adapters)
```

### Game phases
`waiting → question → discussion → voting → endround → gameover`

### Key files
- `turingarou-backend/src/game/GameRoom.ts` — core game logic and phase state machine
- `turingarou-backend/src/game/BotDirector.ts` — bot orchestration on an injectable clock (ticks, silence watchdog, direct replies, posting gaps, votes)
- `turingarou-backend/src/game/Bot.ts` — one bot class for AIs and inspectors (prompts in `botPrompts.ts`, context in `botContext.ts`)
- `turingarou-backend/src/game/AIPlayerInstructions.ts` — system prompt scaffolding, AI_GOAL_BLOCK
- `turingarou-backend/src/game/GameLogger.ts` — Postgres persistence (schema created at boot) and human profiles
- `turingarou-backend/src/server.ts` — Socket.io server, room management, serves the frontend at `/`
- `turingarou-backend/src/llm/` — LLM provider adapters
- `turingarou-backend/strategies/` — AI personality prompts (v1/v2/v3 × condensed/full)
- `turingarou-backend/scripts/tells-knowledge.md` — auto-maintained AI detection knowledge base

### Configuration
- `DEEPSEEK_API_KEY`, `MISTRAL_API_KEY`, `ANTHROPIC_API_KEY` — LLM providers (all configured ones are used; each AI picks at random per game)
- `AI_COUNT` — number of AI players per game (default: 3)
- `DATABASE_URL` — Postgres connection string. Set by Railway in prod (`${{Postgres.DATABASE_URL}}`); optional locally — without it the game runs and nothing is persisted
- `VOICE_ENABLED=1` + `CARTESIA_API_KEY` + `DEEPGRAM_API_KEY` — optional voice mode (`src/voice/`): every chat line spoken in its author's assigned voice, push-to-talk transcribed into a normal chat line. Off when unset. Other vendors: `VOICE_TTS_PROVIDER` (`cartesia`|`elevenlabs`|`openai`), `VOICE_STT_PROVIDER` (`deepgram`|`openai`). Live check: `npx tsx scripts/probe-voice.ts`

### Deployment
Railway project `turingarou`, service `turingarou` + `Postgres`. Config in `railway.json` (repo root). Railway is NOT connected to GitHub: `.github/workflows/deploy-railway.yml` runs the checks (build + server boot + test client) then `railway up`. **CI red ⇒ nothing ships**, and `/health` keeps answering 200 on the previous version — check the Actions run, not just `/health`. GitHub Pages still serves a copy of the frontend that points at the Railway backend.

---

## Contributing

### For AI agents — mandatory workflow

**Before starting any work:**
```bash
cd /path/to/turingarou
git pull
```

**After completing any contribution:**
```bash
git add <changed files>
git commit -m "concise description of what changed and why"
git push
```

This keeps the remote and the local repo in sync — every push to main deploys to Railway once CI passes. Never leave changes uncommitted after a session.

### Principles

1. **Read before editing** — always read the file(s) you're about to change.
2. **Minimal changes** — modify only what is necessary. Don't refactor unrelated code.
3. **No invented comments** — don't add comments that just describe what the code does. Only comment non-obvious intent or constraints.
4. **Build check** — after any backend change, run `npm run build` in `turingarou-backend/` to catch TypeScript errors before committing.
5. **Verify end state** — after backend changes, run the test client (see Commands above).
6. **Update tells-knowledge.md** — after significant AI behavior changes, run `npm run analyze` (prod DB URL loaded, see above) and commit the updated knowledge base.
