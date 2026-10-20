# Turingarou

Social deduction game where players identify hidden AIs. Inspired by the Turing test — each round players answer a question, discuss, and vote to eliminate whoever seems like a bot.

**Live:** one Railway service (`turingarou-backend/`, Node.js) that also serves `turingarou-online.html`, plus a Railway Postgres for game logs.

---

## Quick start — local dev

```bash
# 1. Backend
cd turingarou-backend
cp .env.example .env          # fill in at least one API key
npm install
npm run dev                   # port 3001, hot-reload

# 2. Frontend — serve on localhost (as file:// it connects to the PROD backend)
cd .. && python3 -m http.server 8000
# then open http://localhost:8000/turingarou-online.html
```

### Verify the backend works

```bash
# Terminal 2 — should print ✅ Connected and ✅ Joined successfully
cd turingarou-backend && node test-client.js
```

---

## Deploy to production (Railway)

Every push to `main` runs `.github/workflows/deploy-railway.yml`: build + server boot + test client, then `railway up --service turingarou`. CI red ⇒ nothing ships. Build and start commands live in `railway.json`. The workflow needs a `RAILWAY_TOKEN` repository secret (Railway project token, environment production).

### Env vars (Railway service `turingarou`)

| Variable | Description |
|---|---|
| `DEEPSEEK_API_KEY` | Deepseek API key |
| `MISTRAL_API_KEY` | Mistral API key |
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `AI_COUNT` | Number of AI players per game (default: 3) |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` — reference to the project's Postgres |
| `FRONTEND_URL` | Socket.io CORS origin for the GitHub Pages copy (`https://thomasbazeille.github.io`) |

At least one LLM key is required. All configured providers are used — each AI in a game picks one at random.

---

## Architecture

```
turingarou-online.html          — single-file frontend (HTML + JS + CSS)
    ↕ Socket.io
turingarou-backend/
    src/server.ts               — Express + Socket.io, room management
    src/game/GameRoom.ts        — game logic, phase state machine
    src/game/AIPlayer.ts        — AI behavior, context building, LLM calls
    src/game/InspectorController.ts  — AI acting as a human detective
    src/game/AIPlayerInstructions.ts — system prompt scaffolding
    src/game/GameLogger.ts      — Postgres persistence
    src/llm/                    — provider adapters (Deepseek, Mistral, Anthropic)
    strategies/                 — AI personality prompt files (v1/v2/v3)
    scripts/
        analyze-games.ts        — Claude-powered game log analysis (reads the prod Postgres)
        tells-knowledge.md      — auto-maintained AI detection knowledge base
```

### Game phases

```
waiting → question → discussion → voting → endround → gameover
```

### AI strategies

Six strategy files in `strategies/` are loaded at startup and assigned randomly per AI player. All share the same **engagement-first philosophy**: be fun and reactive; winning is secondary. v2 variants are recommended (73% pass rate in research).

---

## Analyze game logs

```bash
cd turingarou-backend

# Load the prod DB URL (read-only use — see CLAUDE.md « Prod database »)
export DATABASE_URL=$(railway variables --service Postgres --json | jq -r '.DATABASE_PUBLIC_URL // empty')

npm run analyze                             # last 10 games
npm run analyze -- --games 5               # last 5 games
npm run analyze -- --output report.md      # save report to file
```

The analysis updates `scripts/tells-knowledge.md` automatically.

---

## Contributing

See [CLAUDE.md](./CLAUDE.md) for the full development guide (commands, architecture details, AI agent workflow).
