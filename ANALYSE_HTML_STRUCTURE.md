# 🔍 Analyse Structure HTML Turingarou + Intégration Backend

## 📊 Structure du fichier HTML

Ton fichier `turingarou-final__14_.html` est un **fichier monolithique** avec tout le code embarqué :

```
turingarou-final__14_.html (899 lignes)
│
├── <style> (lignes 1-200)    ← CSS inline
├── <body> (lignes 201-256)   ← HTML des écrans
└── <script> (lignes 257-899) ← JavaScript / Logique du jeu
```

### Structure JavaScript

```javascript
// LIGNE 258-261: CONSTANTES & ÉTAT GLOBAL
const AVATARS = [emojis...];
const COLORS = [{n:'Red', h:'#ef4444'}, ...];
const T = 9;  // Total joueurs
const A = 3;  // Nombre d'IA

let G = {    // État global du jeu
  s: 'waiting',      // screen actuel
  r: 1,              // round actuel
  mr: 8,             // max rounds
  t: 100,            // timer
  p: [],             // players
  m: [],             // messages
  e: [],             // éliminés
  a: {},             // answers
  v: {},             // votes
  h: {},             // hearts (protection)
  // ...
};

// LIGNES 263-899: FONCTIONS
function init()                    // Ligne 263 - Initialisation
function startGame()               // Ligne 326 - Démarrer partie
function startGameRound()          // Ligne 357 - Démarrer un round
function simulateAIMessages()      // Ligne 752 - ⚠️ IA BASIQUE À REMPLACER
function sendMessage()             // Ligne 690 - Envoi message joueur
function endRound()                // Ligne 785 - Fin de round
function nextRound()               // Ligne 858 - Round suivant
```

## 🎯 Points clés

### 1. L'IA actuelle est BASIQUE (ligne 752-783)

```javascript
function simulateAIMessages() {
  // Messages hardcodés aléatoires
  const ms = [
    'I think we should be careful',
    'Anyone suspicious?',
    'Let me share my thoughts',
    // ... etc
  ];
  
  const ap = G.p.filter(p => !G.e.includes(p.id) && !p.isLocal);
  let dl = 2000;
  
  ap.forEach((p, i) => {
    setTimeout(() => {
      const mt = ms[Math.floor(Math.random() * ms.length)]; // ⚠️ Random basique
      G.m.push({
        id: 'm' + Date.now() + '-' + i,
        playerId: p.id,
        color: p.color,
        text: mt,  // ⚠️ Pas intelligent
        timestamp: Date.now(),
        round: G.r
      });
      renderMessages();
      
      // Vote aléatoire aussi
      if (p.isAI && Math.random() > 0.25) {
        const pt = ap.filter(px => px.id !== p.id && px.id !== G.im);
        if (pt.length > 0) {
          const vt = pt[Math.floor(Math.random() * pt.length)];
          // ... vote aléatoire
        }
      }
    }, dl);
    dl += Math.floor(Math.random() * 1800) + 1800;
  });
}
```

**C'est ICI qu'il faut remplacer par des appels LLM ! 🎯**

### 2. Création des joueurs (ligne 326-355)

```javascript
function startGame() {
  // Choisir 3 positions aléatoires pour les IA
  const ai = [];
  while (ai.length < A) {
    const r = Math.floor(Math.random() * (T - 1)) + 1;
    if (!ai.includes(r)) ai.push(r);
  }
  
  // Créer 9 joueurs
  for (let i = 0; i < T; i++) {
    const l = i === 0; // Le premier est le joueur local
    G.p.push({
      id: 'p' + i,
      username: l ? (input.value || 'YOU') : 'Player' + (i + 1),
      color: COLORS[i].h,
      colorName: COLORS[i].n,
      avatar: l ? G.sa : null,
      isLocal: l,
      isAI: ai.includes(i),  // ⚠️ Marque qui est IA
      hasVoted: false,
      votesAgainst: []
    });
  }
  // ...
}
```

## 🔌 Stratégies d'intégration avec le backend

### Option 1: Mode Hybride (Recommandé pour débuter)

**Garder ce HTML comme client, connecter au backend Socket.io**

```javascript
// AJOUTER EN HAUT DU <script>
const socket = io('http://localhost:3001');
let playerId = null;

// MODIFIER init() pour se connecter
function init() {
  const username = prompt('Enter your username:');
  socket.emit('joinRoom', { 
    roomId: 'default-room', 
    username 
  });
  
  socket.on('joinSuccess', ({ playerId: id }) => {
    playerId = id;
  });
  
  socket.on('gameState', (state) => {
    // Mettre à jour G avec l'état du serveur
    updateGameState(state);
  });
  
  // ... reste du code
}

// MODIFIER sendMessage() pour envoyer au serveur
function sendMessage() {
  const ta = document.getElementById('message-textarea');
  const tx = ta.value.trim();
  if (!tx) return;
  
  // Envoyer au serveur au lieu d'ajouter directement à G.m
  socket.emit('sendMessage', { message: tx });
  
  ta.value = '';
}

// SUPPRIMER simulateAIMessages() complètement
// Le backend gère les messages IA via LLM

// AJOUTER updateGameState() pour synchroniser
function updateGameState(state) {
  G.p = state.players;
  G.m = state.messages;
  G.r = state.currentRound;
  G.e = state.players.filter(p => p.isEliminated).map(p => p.id);
  // ... etc
  
  renderMessages();
  renderGameScreen();
}
```

### Option 2: Mode Backend Total

**Utiliser le frontend React que tu as + le backend**

Voir `INTEGRATION.md` dans le backend.

## 📍 OÙ CODER QUOI

### Dans le HTML actuel (si Option 1)

| Ligne(s) | Action | Quoi faire |
|----------|--------|------------|
| **258** | ➕ Ajouter | `<script src="https://cdn.socket.io/4.5.4/socket.io.min.js"></script>` |
| **261** | ➕ Ajouter | Connexion Socket.io (voir code ci-dessus) |
| **326** | 🔄 Modifier | `startGame()` - connecter au serveur au lieu de créer local |
| **690** | 🔄 Modifier | `sendMessage()` - émettre au serveur |
| **752-783** | ❌ Supprimer | `simulateAIMessages()` - remplacé par backend |
| **785** | 🔄 Modifier | `endRound()` - synchro serveur |

### Dans le Backend

**Les appels LLM sont DÉJÀ codés !** Dans le backend que je t'ai créé :

```
src/game/AIPlayer.ts
├── decideAction()        ← L'IA décide si elle répond
│   └── llmProvider.query(messages)  ← APPEL LLM ICI
│
├── answerQuestion()      ← L'IA répond à la question
│   └── llmProvider.query(messages)  ← APPEL LLM ICI
│
└── decideVote()          ← L'IA décide pour qui voter
    └── llmProvider.query(messages)  ← APPEL LLM ICI
```

**Les providers LLM sont dans :**
```
src/llm/
├── DeepseekProvider.ts   ← Implémentation Deepseek
└── MistralProvider.ts    ← Implémentation Mistral
```

## 🎮 Flow complet avec backend

```
1. WAITING ROOM
   Frontend: init() → socket.emit('joinRoom')
   Backend: GameRoom.addHumanPlayer() → ajoute joueur + IA
   
2. QUESTION
   Frontend: socket.on('gameState') → affiche question
   User: répond → socket.emit('answerQuestion')
   Backend: GameRoom.addAnswer() → collecte réponses
   Backend: AIPlayer.answerQuestion() → LLM répond ✨
   
3. DISCUSSION
   Frontend: affiche timer + chat
   User: tape message → socket.emit('sendMessage')
   Backend: GameRoom.addMessage() → broadcast
   Backend: AIPlayer.decideAction() toutes les 5s → LLM décide ✨
      → Si shouldRespond: true → envoie message
   
4. VOTE
   Frontend: affiche liste joueurs
   User: vote → socket.emit('vote')
   Backend: AIPlayer.decideVote() → LLM vote ✨
   
5. END ROUND
   Backend: processVotes() → calcule éliminé
   Frontend: affiche résultats
```

## 🚀 Quick Start (Option 1 - Hybride)

### Étape 1: Préparer le HTML

```bash
# Copier le HTML
cp turingarou-final__14_.html turingarou-connected.html
```

### Étape 2: Ajouter Socket.io

Ajouter AVANT la ligne 257 (`<script>`) :

```html
<script src="https://cdn.socket.io/4.5.4/socket.io.min.js"></script>
```

### Étape 3: Modifier le JavaScript

Ajouter juste après la ligne 261 (après `let G = {...}`) :

```javascript
// === SOCKET.IO CONNECTION ===
const socket = io('http://localhost:3001');
let playerId = null;
let roomId = 'game-' + Date.now();

socket.on('connect', () => {
  console.log('Connected to server');
});

socket.on('gameState', (state) => {
  console.log('Game state update:', state);
  
  // Synchroniser l'état
  G.p = state.players.map(p => ({
    ...p,
    isLocal: p.id === playerId
  }));
  G.m = state.messages;
  G.r = state.currentRound;
  G.s = state.phase;
  G.e = state.players.filter(p => p.isEliminated).map(p => p.id);
  
  // Rafraîchir l'affichage
  if (G.s === 'waiting') renderWaitingRoom();
  if (G.s === 'discussion') renderGameScreen();
});

socket.on('joinSuccess', ({ playerId: id }) => {
  playerId = id;
  console.log('Joined as:', playerId);
});
```

### Étape 4: Modifier startGame()

Remplacer la fonction `startGame()` (ligne 326) par :

```javascript
function startGame() {
  if (!G.ui) return;
  
  const username = document.getElementById('username-input').value.trim() || 'YOU';
  
  // Rejoindre le serveur
  socket.emit('joinRoom', { roomId, username });
}
```

### Étape 5: Modifier sendMessage()

Remplacer la fonction `sendMessage()` (ligne 690) par :

```javascript
function sendMessage() {
  const ta = document.getElementById('message-textarea');
  const tx = ta.value.trim();
  if (!tx) return;
  
  // Envoyer au serveur
  socket.emit('sendMessage', { message: tx });
  
  ta.value = '';
}
```

### Étape 6: Supprimer simulateAIMessages()

Supprimer complètement la fonction `simulateAIMessages()` (lignes 752-783).
Le backend s'en occupe avec les LLM ! ✨

### Étape 7: Lancer

```bash
# Terminal 1: Backend
cd turingarou-backend
npm run dev

# Terminal 2: Frontend
# Ouvrir turingarou-connected.html dans le navigateur
# Ou utiliser un serveur local:
python -m http.server 8000
# Puis aller sur http://localhost:8000/turingarou-connected.html
```

## 📝 Résumé

**Structure actuelle :**
- Tout dans un fichier HTML
- IA = messages random hardcodés
- Pas de vrai multiplayer

**Avec backend :**
- Frontend HTML (modifié) OU React (fourni)
- Backend Node.js + Socket.io
- IA = LLM (Deepseek/Mistral) qui réfléchit vraiment
- Vrai multiplayer possible

**Les appels LLM sont déjà codés dans le backend** - tu n'as pas à les coder toi-même !

Tu veux que je crée le fichier `turingarou-connected.html` modifié pour toi avec toutes ces modifications ?
