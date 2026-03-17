# TURINGAROU

Social deduction game where players identify hidden AIs.

## Commands

### Backend
```bash
cd turingarou-backend
npm run dev        # tsx watch, port 3001
npm run build      # compile TypeScript
npm start          # run compiled build
```

### Analyze game logs (requires ANTHROPIC_API_KEY)
```bash
cd turingarou-backend
npm run pull-db                            # download DB from Render
npm run pull-and-analyze                   # download + analyze last 10 games
npm run analyze -- --games 5              # analyze last 5 games (local DB)
npm run analyze -- --output report.md     # save report to file
```

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
Open `turingarou-online.html` directly in a browser, or:
```bash
python -m http.server 8000   # serve from project root
```

## Architecture

Three-layer architecture:

```
turingarou-online.html  (HTML + Socket.io client)
    ↕ socket events
src/server.ts           (Express + Socket.io, room management)
    ↕ game logic
src/game/GameRoom.ts    (phase state machine, timers, AI orchestration)
    ↕ LLM calls
src/llm/                (Deepseek / Mistral / Anthropic adapters)
```

### Game phases
`waiting → question → discussion → voting → endround → gameover`

### Key files
- `turingarou-backend/src/game/GameRoom.ts` — core game logic and phase state machine
- `turingarou-backend/src/game/AIPlayer.ts` — AI player behavior, context building
- `turingarou-backend/src/game/AIPlayerInstructions.ts` — system prompt scaffolding, AI_GOAL_BLOCK
- `turingarou-backend/src/game/InspectorController.ts` — AI detective player
- `turingarou-backend/src/game/GameLogger.ts` — SQLite persistence and human profiles
- `turingarou-backend/src/server.ts` — Socket.io server, room management, /admin/db endpoint
- `turingarou-backend/src/llm/` — LLM provider adapters
- `turingarou-backend/strategies/` — AI personality prompts (v1/v2/v3 × condensed/full)
- `turingarou-backend/scripts/tells-knowledge.md` — auto-maintained AI detection knowledge base

### Configuration
- `DEEPSEEK_API_KEY`, `MISTRAL_API_KEY`, `ANTHROPIC_API_KEY` — LLM providers (all configured ones are used; each AI picks at random per game)
- `AI_COUNT` — number of AI players per game (default: 2)
- `ADMIN_SECRET` — protects the `/admin/db` download endpoint
- `RENDER_URL` — used by `npm run pull-db` to download the remote DB (local .env only)
- SQLite database at `<cwd>/turingarou.db` (created by GameLogger at runtime)

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

This keeps the remote (Render auto-deploys from main) and the local repo in sync. Never leave changes uncommitted after a session.

### Principles

1. **Read before editing** — always read the file(s) you're about to change.
2. **Minimal changes** — modify only what is necessary. Don't refactor unrelated code.
3. **No invented comments** — don't add comments that just describe what the code does. Only comment non-obvious intent or constraints.
4. **Build check** — after any backend change, run `npm run build` in `turingarou-backend/` to catch TypeScript errors before committing.
5. **Verify end state** — after backend changes, run the test client (see Commands above).
6. **Update tells-knowledge.md** — after significant AI behavior changes, run `npm run pull-and-analyze` and commit the updated knowledge base.
