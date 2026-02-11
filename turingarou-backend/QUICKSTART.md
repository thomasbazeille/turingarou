# 🚀 Turingarou Backend - Quick Start

## Architecture en 30 secondes

```
┌─────────────────┐
│   Frontend      │
│   (React)       │
└────────┬────────┘
         │ Socket.io
         │
┌────────▼────────┐
│   Server.ts     │  ← Express + Socket.io
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
┌───▼──┐  ┌──▼────┐
│ Game │  │  LLM  │
│ Room │  │ Prov. │
└──────┘  └───────┘
```

## Installation (2 minutes)

```bash
cd turingarou-backend
npm install
cp .env.example .env
```

Éditer `.env` et ajouter ta clé API :
```env
DEEPSEEK_API_KEY=sk-votre-clé-ici
```

## Démarrage

```bash
npm run dev
```

✅ Backend prêt sur `http://localhost:3001`

## Test avec le client de test

Terminal 2 :
```bash
node test-client.js
```

Type `hello` pour envoyer un message
Type `/help` pour voir les commandes

## Modules principaux

### 🎮 GameRoom.ts
- Gère une partie complète
- Flow du jeu (waiting → question → discussion → vote → endround)
- Gestion des joueurs (humains + IA)
- Broadcasting via Socket.io

### 🤖 AIPlayer.ts
- Comportement d'une IA
- Construit le contexte du jeu
- Décide quand répondre (pas trop souvent)
- Simule des délais humains

### 🧠 LLM Providers
- Interface abstraite `LLMProvider`
- Implémentations : Deepseek, Mistral
- Facilement extensible

## Flow du jeu

```
1. WAITING ROOM
   ↓ (6 joueurs)
   
2. QUESTION (15s)
   - Question posée
   - Tous répondent
   - IA répond aussi
   ↓
   
3. DISCUSSION (60s)
   - Chat libre
   - IA réagit naturellement
   - Countdown visible
   ↓
   
4. VOTING (10s)
   - Chacun vote
   - IA vote aussi
   ↓
   
5. END ROUND (13s)
   - Résultats
   - Joueur éliminé
   - Joueur protégé
   ↓
   
Retour à 2 (nouveau round)
```

## Événements Socket.io

**Client envoie :**
- `joinRoom` → rejoindre partie
- `sendMessage` → chat
- `answerQuestion` → répondre
- `vote` → voter

**Serveur envoie :**
- `gameState` → état complet (auto)
- `joinSuccess` → confirmation
- `joinError` → erreur

## Configuration

**Nombre d'IA :**
```env
AI_COUNT=2  # 2-4 recommandé
```

**Provider LLM :**
```env
LLM_PROVIDER=deepseek  # ou mistral
```

## Prix estimés

Avec Deepseek (~$0.14/M tokens) :
- 1 partie (5 rounds) = ~10K tokens = $0.0014
- 100 parties = ~$0.14
- 1000 parties = ~$1.40

Super cheap pour tester ! 🎉

## Personnalisation IA

Dans `GameRoom.ts → generateAIPersonalities()` :

```typescript
{
  name: 'VotreIA',
  traits: ['nerveux', 'analytique'],
  systemPrompt: `Vous êtes...`,
  responseStyle: 'quick', // ou 'thoughtful', 'random'
  suspicionLevel: 0.5, // 0-1
}
```

## Intégration Frontend

Voir `INTEGRATION.md` pour le guide complet.

En résumé :
1. Installer `socket.io-client`
2. Créer hook `useGameSocket`
3. Connecter aux composants
4. Profit! 🚀

## Debug

Logs dans la console :
```
✅ Connected: socket-id
📝 Joining: username
💬 Message from player-id
🗳️  Vote from player-id
```

## Problèmes courants

**Port déjà utilisé :**
```env
PORT=3002
```

**CORS error :**
```env
FRONTEND_URL=http://localhost:5173
```

**Pas de clé API :**
→ Éditer `.env` et ajouter `DEEPSEEK_API_KEY`

## Next Steps

1. ✅ Tester avec `test-client.js`
2. ✅ Intégrer au frontend (voir INTEGRATION.md)
3. ✅ Ajuster les personnalités IA
4. ✅ Modifier le timing si besoin
5. 🎮 Enjoy!

## Support

Questions ? Check :
- `README.md` - Docs complètes
- `INTEGRATION.md` - Guide frontend
- Code source - Bien commenté

Bon jeu ! 🎲
