# Turingarou Backend

Backend modulaire pour le jeu Turingarou - un jeu de déduction sociale où les joueurs doivent identifier les IA parmi eux.

## 🏗 Architecture

```
src/
├── server.ts              # Serveur principal (Express + Socket.io)
├── game/
│   ├── GameRoom.ts        # Logique de gestion d'une partie
│   └── AIPlayer.ts        # Comportement des joueurs IA
├── llm/
│   ├── LLMProvider.ts     # Interface abstraite
│   ├── DeepseekProvider.ts
│   └── MistralProvider.ts
└── types/
    └── game.types.ts      # Types TypeScript
```

## 🚀 Installation

```bash
cd turingarou-backend
npm install
```

## ⚙️ Configuration

Copier `.env.example` vers `.env` et configurer :

```bash
cp .env.example .env
```

Éditer `.env` :
```env
PORT=3001
FRONTEND_URL=http://localhost:5173

# Choisir le provider LLM
LLM_PROVIDER=deepseek  # ou mistral

# Ajouter votre clé API
DEEPSEEK_API_KEY=sk-xxx
# ou
MISTRAL_API_KEY=xxx

# Nombre d'IA dans la partie
AI_COUNT=2
```

## 🎮 Démarrage

```bash
npm run dev
```

Le serveur démarre sur `http://localhost:3001`

## 📡 API Socket.io

### Événements Client → Serveur

**joinRoom**
```typescript
socket.emit('joinRoom', {
  roomId: 'room-123',
  username: 'PlayerName'
});
```

**sendMessage**
```typescript
socket.emit('sendMessage', {
  message: 'Hello everyone!'
});
```

**answerQuestion**
```typescript
socket.emit('answerQuestion', {
  answer: 'My answer to the question'
});
```

**vote**
```typescript
socket.emit('vote', {
  targetId: 'player-id-to-eliminate'
});
```

### Événements Serveur → Client

**gameState** (émis automatiquement à chaque changement)
```typescript
socket.on('gameState', (state) => {
  // State contient :
  // - phase: 'waiting' | 'question' | 'discussion' | 'voting' | 'endround'
  // - players: Player[]
  // - messages: GameMessage[]
  // - currentQuestion: string
  // - etc.
});
```

**joinSuccess**
```typescript
socket.on('joinSuccess', ({ playerId }) => {
  console.log('Joined with ID:', playerId);
});
```

**joinError**
```typescript
socket.on('joinError', ({ message }) => {
  console.error('Join failed:', message);
});
```

## 🤖 Providers LLM

### Deepseek (Recommandé pour tests)
- Pas cher (~$0.14/million tokens)
- Rapide
- Bonne qualité

```env
LLM_PROVIDER=deepseek
DEEPSEEK_API_KEY=sk-xxx
```

### Mistral
- Bon équilibre qualité/prix
- API européenne

```env
LLM_PROVIDER=mistral
MISTRAL_API_KEY=xxx
```

### Ajouter un nouveau provider

1. Créer `src/llm/YourProvider.ts` :
```typescript
import { LLMProvider, LLMConfig } from './LLMProvider.js';
import { LLMMessage, LLMResponse } from '../types/game.types.js';

export class YourProvider implements LLMProvider {
  name = 'YourProvider';
  
  async query(messages: LLMMessage[]): Promise<LLMResponse> {
    // Votre implémentation
  }
}
```

2. Ajouter dans `server.ts` :
```typescript
case 'yourprovider':
  llmProvider = new YourProvider({ apiKey: process.env.YOUR_API_KEY });
  break;
```

## 🎯 Flow du jeu

1. **Waiting** - Joueurs arrivent (6 max)
2. **Question** - Une question est posée (15s)
3. **Discussion** - Discussion libre (60s)
4. **Voting** - Vote pour éliminer (10s)
5. **End Round** - Résultats (13s)
6. Retour à l'étape 2

## 🧠 Logique IA

Les IA :
- Ont une personnalité unique
- Reçoivent le contexte complet du jeu
- Décident si elles doivent répondre (pas trop souvent)
- Simulent des délais humains (2-8s)
- Votent stratégiquement

Format de décision IA :
```json
{
  "shouldRespond": true,
  "message": "I think it's suspicious...",
  "delayMs": 3500
}
```

## 🔧 Routes HTTP

**Health check**
```
GET /health
```

**Liste des rooms**
```
GET /rooms
```

## 📝 TODO / Améliorations

- [ ] Système de matchmaking
- [ ] Persistence des parties (Redis/MongoDB)
- [ ] Replay system
- [ ] Analytics des parties
- [ ] Rate limiting
- [ ] Gestion des déconnexions
- [ ] Spectator mode
- [ ] Plus de questions
- [ ] IA avec mémoire entre rounds
- [ ] Support Gemini/GPT-4

## 🐛 Debug

Logs détaillés dans la console :
```
Client connected: socket-id
Player joined: username
Message from player-id: content
Vote from player-id for target-id
```

## 📜 License

MIT
