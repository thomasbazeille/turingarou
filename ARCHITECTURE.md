# 🏗️ Architecture Turingarou - Vue d'ensemble

## 📊 Schéma de l'architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     FRONTEND LAYER                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Option A: HTML Standalone       Option B: React App       │
│  ┌────────────────────┐          ┌────────────────────┐    │
│  │ turingarou.html    │          │  React Components  │    │
│  │ ├── CSS inline     │          │  ├── WaitingRoom   │    │
│  │ ├── HTML screens   │          │  ├── QuestionScr.  │    │
│  │ └── JavaScript     │          │  ├── GameScreen    │    │
│  │     └── Socket.io  │          │  └── EndOfRound    │    │
│  └────────────────────┘          └────────────────────┘    │
│           │                               │                 │
│           └───────────────┬───────────────┘                 │
│                           │                                 │
│                  Socket.io Connection                       │
│                           │                                 │
└───────────────────────────┼─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    BACKEND LAYER                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  server.ts (Express + Socket.io)                           │
│  ┌────────────────────────────────────────────┐            │
│  │                                            │            │
│  │  Socket Events:                            │            │
│  │  • joinRoom → GameRoom.addHumanPlayer()    │            │
│  │  • sendMessage → GameRoom.addMessage()     │            │
│  │  • answerQuestion → GameRoom.addAnswer()   │            │
│  │  • vote → GameRoom.addVote()               │            │
│  │                                            │            │
│  │  Emit: gameState (auto broadcast)         │            │
│  │                                            │            │
│  └────────────┬───────────────────────────────┘            │
│               │                                             │
│               ▼                                             │
│  ┌────────────────────────────────────────────┐            │
│  │         GameRoom.ts                        │            │
│  │  ┌──────────────────────────────────┐     │            │
│  │  │ Game Logic & State Management    │     │            │
│  │  │ • Players (Human + AI)           │     │            │
│  │  │ • Phase transitions              │     │            │
│  │  │ • Messages aggregation           │     │            │
│  │  │ • Vote processing                │     │            │
│  │  │ • Round management               │     │            │
│  │  └──────────────────────────────────┘     │            │
│  │               │                            │            │
│  │               ▼                            │            │
│  │  ┌──────────────────────────────────┐     │            │
│  │  │   AI Players Management          │     │            │
│  │  │   Every 5 seconds:               │     │            │
│  │  │   for each AI:                   │     │            │
│  │  │     → buildGameContext()         │     │            │
│  │  │     → decideAction() ───────────┐│     │            │
│  │  └──────────────────────────────────┘│     │            │
│  └────────────────────────────────────┐ │     │            │
│                                       │ │     │            │
│                                       │ │     │            │
│                                       ▼ ▼     │            │
│  ┌────────────────────────────────────────────┐            │
│  │         AIPlayer.ts                        │            │
│  │  ┌──────────────────────────────────┐     │            │
│  │  │ AI Decision Engine               │     │            │
│  │  │                                  │     │            │
│  │  │ • buildGameContext()             │     │            │
│  │  │   └─ Aggregates:                 │     │            │
│  │  │      - Last 20 messages          │     │            │
│  │  │      - Current question          │     │            │
│  │  │      - Round number              │     │            │
│  │  │      - Phase                     │     │            │
│  │  │                                  │     │            │
│  │  │ • decideAction() ───────────────┐│     │            │
│  │  │ • answerQuestion() ─────────────┤│     │            │
│  │  │ • decideVote() ─────────────────┤│     │            │
│  │  └─────────────────────────────────┤│     │            │
│  └────────────────────────────────────┤│     │            │
│                                       ▼▼     │            │
└───────────────────────────────────────┼──────┴────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────┐
│                     LLM LAYER                               │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  LLMProvider (Interface)                                   │
│  ┌────────────────┐  ┌────────────────┐  ┌──────────────┐ │
│  │ DeepseekProv.  │  │ MistralProv.   │  │  Your LLM    │ │
│  │                │  │                │  │              │ │
│  │ query(msgs)    │  │ query(msgs)    │  │ query(msgs)  │ │
│  │   │            │  │   │            │  │   │          │ │
│  │   ▼            │  │   ▼            │  │   ▼          │ │
│  │ POST deepseek  │  │ POST mistral   │  │ POST api     │ │
│  │ /v1/chat/...   │  │ /v1/chat/...   │  │ /endpoint    │ │
│  └────────────────┘  └────────────────┘  └──────────────┘ │
│           │                  │                  │          │
│           └──────────────────┴──────────────────┘          │
│                              │                             │
│                              ▼                             │
│                  Returns LLMResponse                       │
│                  {                                         │
│                    shouldRespond: bool,                    │
│                    message: string,                        │
│                    delayMs: number                         │
│                  }                                         │
└─────────────────────────────────────────────────────────────┘
```

## 🔄 Flow détaillé d'un message IA

```
1. Timer déclenche (toutes les 5s)
   │
   ▼
2. GameRoom: Pour chaque AIPlayer
   │
   ▼
3. AIPlayer.buildGameContext()
   ├─ Récupère derniers messages
   ├─ Ajoute question actuelle
   ├─ Ajoute phase et round
   └─ Construit contexte texte
   │
   ▼
4. AIPlayer.decideAction()
   │
   ├─ Construit prompt système:
   │  "You are [name] with personality [traits]
   │   Your goal is to blend in as human
   │   Don't respond to everything
   │   Keep messages short..."
   │
   ├─ Ajoute contexte du jeu
   │
   ├─ Ajoute prompt de décision:
   │  "Should you respond to this conversation?
   │   Last spoke [time] ago
   │   Decide: shouldRespond, message, delayMs"
   │
   ▼
5. LLMProvider.query([system, context, decision])
   │
   ▼
6. API Deepseek/Mistral
   │
   ├─ Analyse la conversation
   ├─ Décide s'il faut parler
   ├─ Génère un message naturel
   └─ Calcule délai aléatoire
   │
   ▼
7. Retour JSON:
   {
     "shouldRespond": true,
     "message": "I think Marcus is acting weird...",
     "delayMs": 4200
   }
   │
   ▼
8. Si shouldRespond = true:
   │
   ├─ setTimeout(delayMs)
   │  │
   │  ▼
   ├─ GameRoom.addMessage(aiId, message)
   │  │
   │  ▼
   ├─ Broadcast à tous les clients:
   │  socket.emit('gameState', state)
   │  │
   │  ▼
   └─ Frontend affiche le message
```

## 🎯 Points de personnalisation

### 1. Personnalités IA
📍 **Fichier:** `src/game/GameRoom.ts`  
📍 **Fonction:** `generateAIPersonalities()` (ligne ~115)

```typescript
{
  name: 'VotreIA',
  traits: ['trait1', 'trait2'],
  systemPrompt: `Tu es... [description complète]`,
  responseStyle: 'quick' | 'thoughtful' | 'random',
  suspicionLevel: 0.0 - 1.0
}
```

### 2. Questions posées
📍 **Fichier:** `src/game/GameRoom.ts`  
📍 **Constante:** `QUESTIONS` (ligne ~20)

```typescript
const QUESTIONS = [
  "What color are your socks?",
  "What was your last meal?",
  // Ajoute tes questions ici
];
```

### 3. Timing du jeu
📍 **Fichier:** `src/game/GameRoom.ts`  
📍 **Fonctions:** `startDiscussion()`, `startVoting()`, etc.

```typescript
// Discussion
this.state.discussionEndTime = Date.now() + 60000; // 60s
setTimeout(() => this.startVoting(), 60000);

// Vote
setTimeout(() => this.processVotes(), 10000); // 10s

// End Round
setTimeout(() => this.nextRound(), 13000); // 13s
```

### 4. Provider LLM
📍 **Fichier:** `.env`

```env
LLM_PROVIDER=deepseek  # ou mistral, ou autre
DEEPSEEK_API_KEY=sk-xxx
```

📍 **Ajouter nouveau provider:**
- Créer `src/llm/YourProvider.ts`
- Implémenter interface `LLMProvider`
- Ajouter dans `src/server.ts` switch case

### 5. Fréquence décision IA
📍 **Fichier:** `src/game/GameRoom.ts`  
📍 **Fonction:** `startAIThinking()` (ligne ~180)

```typescript
this.aiThinkingInterval = setInterval(async () => {
  // Chaque IA décide si elle parle
  // ...
}, 5000); // ← Change ici (5s par défaut)
```

## 📦 Déploiement

### Development
```bash
# Backend
cd turingarou-backend
npm run dev        # Port 3001

# Frontend (Option A: HTML)
python -m http.server 8000
# Ouvrir http://localhost:8000

# Frontend (Option B: React)
cd turingarou-v2
npm run dev        # Port 5173
```

### Production

**Backend:**
```bash
npm run build
node dist/server.js
```

**Frontend HTML:**
- Upload `turingarou-connected.html` sur serveur web
- Update URL backend dans le code

**Frontend React:**
```bash
npm run build
# Déployer /dist sur Vercel/Netlify
```

## 🔐 Sécurité

⚠️ **Ce code est pour prototype/test**

Pour production:
- ✅ Validation inputs
- ✅ Rate limiting
- ✅ Authentication
- ✅ HTTPS
- ✅ Env variables sécurisées
- ✅ CORS restrictif

## 💰 Coûts estimés

**Deepseek** ($0.14/M tokens input, $0.28/M tokens output)
- 1 partie (5 rounds, 3 IA) ≈ 15K tokens ≈ $0.003
- 100 parties ≈ $0.30
- 1000 parties ≈ $3.00

**Mistral** ($0.15/M tokens)
- 1 partie ≈ $0.002
- 100 parties ≈ $0.20
- 1000 parties ≈ $2.00

Super cheap pour tester ! 🎉

## 📚 Documentation complète

- `README.md` - Docs backend
- `QUICKSTART.md` - Démarrage rapide
- `INTEGRATION.md` - Intégration frontend
- `ANALYSE_HTML_STRUCTURE.md` - Structure HTML
- Ce fichier - Architecture globale
