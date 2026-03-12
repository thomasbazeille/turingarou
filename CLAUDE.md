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

### Verify end state (run after every change)
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
Open HTML files directly in browser, or:
```bash
python -m http.server 8000   # serve from project root
```

## Architecture

Three-layer architecture:

```
Frontend (HTML + Socket.io)
    ↓ socket events
GameRoom.ts (game logic + state machine)
    ↓ prompts
LLMProvider.ts (Deepseek / Mistral)
```

### Game phases
`waiting → question → discussion → voting → endround → gameover`

### Key files
- `turingarou-backend/src/GameRoom.ts` — core game logic and phase state machine
- `turingarou-backend/src/AIPlayer.ts` — AI player behavior
- `turingarou-backend/src/LLMProvider.ts` — pluggable LLM abstraction
- `turingarou-backend/src/server.ts` — Socket.io server, room management
- `turingarou-backend/src/GameLogger.ts` — SQLite analytics

### Configuration
- `LLM_PROVIDER` env var selects the LLM backend (deepseek / mistral)
- SQLite database used for game analytics via GameLogger
