# 🔧 Patch pour HTML - Modifications exactes

## Modifications à faire dans `turingarou-final__14_.html`

### 1️⃣ Ajouter Socket.io CDN

**Ligne 256** - AVANT `<script>`, ajouter :

```html
  <!-- Socket.io Client -->
  <script src="https://cdn.socket.io/4.7.2/socket.io.min.js"></script>
  
  <script>
```

### 2️⃣ Remplacer les variables globales

**Ligne 258-261** - REMPLACER :

```javascript
const AVATARS=['🕵️','🔍','📜','🗝️','🌙','⚡','🦉','👁️','🎭','🎩','🔮','🃏','🎲','⚔️','🛡️','👻','🦇','🕷️','🐺','🦊'];
const COLORS=[{n:'Red',h:'#ef4444'},{n:'Orange',h:'#f97316'},{n:'Gold',h:'#eab308'},{n:'Silver',h:'#94a3b8'},{n:'Purple',h:'#a855f7'},{n:'Turquoise',h:'#06b6d4'},{n:'Pink',h:'#ec4899'},{n:'Lime',h:'#84cc16'},{n:'Indigo',h:'#6366f1'}];
const T=9,A=3;
let G={s:'waiting',r:1,mr:T-1,t:100,qt:15,p:[],m:[],e:[],l:null,im:null,a:{},v:{},h:{},vh:{},sh:false,sa:null,ui:false};
```

**PAR :**

```javascript
const AVATARS=['🕵️','🔍','📜','🗝️','🌙','⚡','🦉','👁️','🎭','🎩','🔮','🃏','🎲','⚔️','🛡️','👻','🦇','🕷️','🐺','🦊'];
const COLORS=[{n:'Red',h:'#ef4444'},{n:'Orange',h:'#f97316'},{n:'Gold',h:'#eab308'},{n:'Silver',h:'#94a3b8'},{n:'Purple',h:'#a855f7'},{n:'Turquoise',h:'#06b6d4'},{n:'Pink',h:'#ec4899'},{n:'Lime',h:'#84cc16'},{n:'Indigo',h:'#6366f1'}];
const T=9,A=3;
let G={s:'waiting',r:1,mr:T-1,t:100,qt:15,p:[],m:[],e:[],l:null,im:null,a:{},v:{},h:{},vh:{},sh:false,sa:null,ui:false};

// === SOCKET.IO SETUP ===
const BACKEND_URL = 'http://localhost:3001';
const socket = io(BACKEND_URL);
let playerId = null;
let roomId = 'game-' + Math.random().toString(36).substr(2, 9);
let isConnected = false;

// Socket event listeners
socket.on('connect', () => {
  console.log('✅ Connected to server');
  isConnected = true;
});

socket.on('disconnect', () => {
  console.log('❌ Disconnected from server');
  isConnected = false;
});

socket.on('joinSuccess', ({ playerId: id }) => {
  playerId = id;
  console.log('✅ Joined as player:', playerId);
});

socket.on('joinError', ({ message }) => {
  console.error('❌ Join error:', message);
  alert('Could not join game: ' + message);
});

socket.on('gameState', (state) => {
  console.log('📊 Game state update:', state.phase);
  updateGameFromServer(state);
});

function updateGameFromServer(state) {
  // Synchroniser l'état global avec le serveur
  G.s = state.phase;
  G.r = state.currentRound;
  
  // Mettre à jour les joueurs
  G.p = state.players.map(p => ({
    id: p.id,
    username: p.username,
    color: p.color,
    colorName: p.colorName,
    avatar: null, // TODO: gérer les avatars
    isLocal: p.id === playerId,
    isAI: false, // On ne révèle pas qui est IA
    hasVoted: false, // TODO: sync depuis server
    votesAgainst: []
  }));
  
  // Mettre à jour les messages
  G.m = state.messages.map(msg => ({
    id: msg.id,
    playerId: msg.playerId,
    color: msg.color || state.players.find(p => p.id === msg.playerId)?.color || '#fff',
    text: msg.content,
    timestamp: msg.timestamp,
    round: state.currentRound
  }));
  
  // Mettre à jour les réponses à la question
  if (state.answers) {
    G.a = {};
    state.answers.forEach(ans => {
      G.a[ans.playerId] = ans.answer;
    });
  }
  
  // Mettre à jour les éliminés
  G.e = state.players
    .filter(p => p.isEliminated)
    .map(p => p.id);
  
  // Rafraîchir l'affichage selon la phase
  switch (state.phase) {
    case 'waiting':
      renderWaitingRoom();
      break;
    case 'question':
      showScreen('question');
      document.querySelector('.question-text').textContent = state.currentQuestion || '';
      break;
    case 'discussion':
      showScreen('game');
      renderGameScreen();
      if (state.discussionEndTime) {
        startTimerFromServer(state.discussionEndTime);
      }
      break;
    case 'voting':
      // Afficher UI de vote
      break;
    case 'endround':
      // Gérer fin de round
      break;
  }
}

function startTimerFromServer(endTime) {
  const updateTimer = () => {
    const remaining = Math.max(0, Math.floor((endTime - Date.now()) / 1000));
    const d = document.getElementById('timer-display');
    if (d) {
      d.textContent = remaining + 's';
      if (remaining <= 30) d.classList.add('warning');
    }
    
    if (remaining > 0) {
      setTimeout(updateTimer, 1000);
    }
  };
  updateTimer();
}
```

### 3️⃣ Modifier startGame()

**Ligne 326-355** - REMPLACER la fonction complète par :

```javascript
function startGame(){
  if(!G.ui) return;
  
  const username = document.getElementById('username-input').value.trim() || 'YOU';
  
  console.log('🎮 Starting game, joining room:', roomId);
  
  // Rejoindre la room sur le serveur
  socket.emit('joinRoom', { 
    roomId: roomId, 
    username: username 
  });
  
  // L'état viendra via l'event 'gameState'
  showScreen('waiting');
}
```

### 4️⃣ Modifier sendMessage()

**Ligne 690-710** - REMPLACER par :

```javascript
function sendMessage(){
  const ta = document.getElementById('message-textarea');
  const tx = ta.value.trim();
  if (!tx) return;
  
  // Calculer la limite de caractères
  const ap = G.p.filter(p => !G.e.includes(p.id));
  const mc = Math.floor((1000 * ap.length) / T);
  
  if (tx.length > mc) {
    alert('Message too long! Max: ' + mc + ' chars');
    return;
  }
  
  // Envoyer au serveur
  console.log('💬 Sending message:', tx);
  socket.emit('sendMessage', { message: tx });
  
  // Vider le textarea
  ta.value = '';
  const cc = document.getElementById('char-counter');
  if (cc) cc.textContent = '0/' + mc;
}
```

### 5️⃣ Modifier la réponse à la question

**Ligne 375** environ - Dans `startGameRound()`, chercher où la question est répondue et REMPLACER par :

```javascript
// Dans startGameRound(), après avoir affiché l'écran question
// Ajouter un event listener sur le bouton submit

document.getElementById('submit-answer-btn').onclick = function() {
  const answerInput = document.getElementById('answer-input');
  const answer = answerInput.value.trim();
  
  if (!answer) return;
  
  console.log('📝 Submitting answer:', answer);
  socket.emit('answerQuestion', { answer: answer });
  
  // Désactiver l'input
  answerInput.disabled = true;
  this.disabled = true;
  this.textContent = '✓ ANSWER SUBMITTED';
};
```

### 6️⃣ Modifier le vote

**Ligne 712-726** - REMPLACER `confirmVote()` par :

```javascript
function confirmVote(){
  const s = document.getElementById('vote-select');
  const vid = s.value;
  if (!vid) return;
  
  console.log('🗳️  Voting for:', vid);
  socket.emit('vote', { targetId: vid });
  
  // Marquer comme voté localement
  const lp = G.p.find(p => p.isLocal);
  if (lp) lp.hasVoted = true;
  
  // Désactiver
  s.disabled = true;
  document.getElementById('vote-btn').textContent = '✓ CONFIRMED';
  document.getElementById('vote-btn').disabled = true;
  
  renderGameScreen();
}
```

### 7️⃣ SUPPRIMER simulateAIMessages()

**Lignes 752-783** - SUPPRIMER COMPLÈTEMENT la fonction :

```javascript
// ❌ SUPPRIMER CETTE FONCTION ❌
/*
function simulateAIMessages(){
  // ... tout le code ...
}
*/

// Le backend s'occupe des messages IA !
```

### 8️⃣ Modifier startGameRound()

**Ligne 357** - Dans `startGameRound()`, SUPPRIMER l'appel à `simulateAIMessages()` :

```javascript
function startGameRound(){
  showScreen('game');
  renderGameScreen();
  startTimer();
  
  // ❌ SUPPRIMER CETTE LIGNE ❌
  // simulateAIMessages();  
  
  // Le backend envoie les messages IA via Socket.io !
}
```

### 9️⃣ Gérer la déconnexion

**Avant la ligne 895** (`init();`), AJOUTER :

```javascript
// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  socket.disconnect();
});

// Reconnection handling
socket.on('reconnect', () => {
  console.log('🔄 Reconnected to server');
  // TODO: resync game state
});
```

## ✅ Résumé des changements

| Ligne | Action | Description |
|-------|--------|-------------|
| 256 | ➕ Ajouter | Script Socket.io CDN |
| 261 | ➕ Ajouter | Variables Socket.io + event listeners |
| 326 | 🔄 Remplacer | `startGame()` - rejoint serveur |
| 375 | 🔄 Modifier | Réponse question → emit au serveur |
| 690 | 🔄 Remplacer | `sendMessage()` - emit au serveur |
| 712 | 🔄 Remplacer | `confirmVote()` - emit au serveur |
| 752-783 | ❌ Supprimer | `simulateAIMessages()` |
| 357 | ❌ Supprimer | Appel à `simulateAIMessages()` |

## 🚀 Test

1. **Lancer le backend :**
```bash
cd turingarou-backend
npm run dev
```

2. **Ouvrir le HTML modifié :**
```bash
# Option 1: Double-clic sur le fichier
# Option 2: Serveur local
python -m http.server 8000
# Puis http://localhost:8000/turingarou-connected.html
```

3. **Vérifier la console du navigateur :**
```
✅ Connected to server
🎮 Starting game, joining room: game-abc123
✅ Joined as player: player-1234
📊 Game state update: waiting
```

## 🐛 Debug

**Socket ne se connecte pas :**
- Vérifier que le backend tourne sur port 3001
- Vérifier BACKEND_URL dans le code
- Vérifier la console : erreurs CORS ?

**Messages n'apparaissent pas :**
- Vérifier event 'gameState' dans console
- Vérifier que `updateGameFromServer()` est appelée
- Vérifier `renderMessages()` rafraîchit l'affichage

**IA ne parle pas :**
- Vérifier clé API dans `.env` backend
- Vérifier logs backend : erreurs LLM ?
- Vérifier `aiThinkingInterval` démarre

## 📝 Notes

- Le HTML ne gère plus la logique IA (c'est le backend)
- Toutes les actions passent par Socket.io
- L'état global G est synchronisé depuis le serveur
- On peut avoir plusieurs joueurs humains dans la même room !

Tu veux que je crée le fichier HTML complet modifié ?
