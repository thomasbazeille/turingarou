# Turingarou

Social deduction game where players identify hidden AIs. Inspired by the Turing test — each round players answer a question, discuss, and vote to eliminate whoever seems like a bot.

**Live:** deploy `turingarou-online.html` (static) + `turingarou-backend/` (Node.js on Render).

---

## Quick start — local dev

```bash
# 1. Backend
cd turingarou-backend
cp .env.example .env          # fill in at least one API key
npm install
npm run dev                   # port 3001, hot-reload

# 2. Frontend — open in browser
open ../turingarou-online.html
# or serve the root: python -m http.server 8000
```

### Verify the backend works

```bash
# Terminal 2 — should print ✅ Connected and ✅ Joined successfully
cd turingarou-backend && node test-client.js
```

---

## Deploy to production (Render + GitHub Pages)

1. **Backend on Render** — connect this repo, set:
   - Build: `cd turingarou-backend && npm install && npm run build`
   - Start: `cd turingarou-backend && npm start`
   - Env vars (see below)

2. **Frontend** — `turingarou-online.html` references the backend URL hardcoded near the top of the `<script>`. Update it to your Render URL, then host the file anywhere (GitHub Pages, Netlify, etc.).

### Required env vars (Render)

| Variable | Description |
|---|---|
| `DEEPSEEK_API_KEY` | Deepseek API key |
| `MISTRAL_API_KEY` | Mistral API key |
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `AI_COUNT` | Number of AI players per game (default: 2) |
| `ADMIN_SECRET` | Secret for `/admin/db` download endpoint |

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
    src/game/GameLogger.ts      — SQLite persistence
    src/llm/                    — provider adapters (Deepseek, Mistral, Anthropic)
    strategies/                 — AI personality prompt files (v1/v2/v3)
    scripts/
        analyze-games.ts        — Claude-powered game log analysis
        download-db.sh          — download turingarou.db from Render
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

# Download DB from Render (requires RENDER_URL + ADMIN_SECRET in .env)
npm run pull-db

# Download then analyze
npm run pull-and-analyze                    # last 10 games
npm run pull-and-analyze -- --games 5      # last 5 games
npm run analyze -- --output report.md      # save report to file
```

The analysis updates `scripts/tells-knowledge.md` automatically.

---

## Contributing

See [CLAUDE.md](./CLAUDE.md) for the full development guide (commands, architecture details, AI agent workflow).
