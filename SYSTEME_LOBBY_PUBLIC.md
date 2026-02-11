# 🏛️ Système de Lobby Public - Documentation Technique

## 🎯 Objectif

Permettre aux joueurs de se connecter **sans avoir besoin de coordonner un room code**. Le système matche automatiquement les joueurs ensemble.

## ✅ Modifications Effectuées

### Backend (`turingarou-backend/src/server.ts`)

#### Fonction `getOrCreateRoom()` - MODIFIÉE

**Avant** :
```typescript
// Créait toujours une nouvelle room avec le roomId fourni
function getOrCreateRoom(roomId) {
  if (!gameRooms.has(roomId)) {
    gameRooms.set(roomId, new GameRoom(...));
  }
  return gameRooms.get(roomId);
}
```

**Après** :
```typescript
function getOrCreateRoom(roomId: string): GameRoom {
  // CAS SPÉCIAL : Public Lobby
  if (roomId === 'public-lobby') {
    // 1. Chercher une room publique disponible
    for (const [id, room] of gameRooms) {
      if (id.startsWith('public-') && room.phase === 'waiting') {
        const humanCount = room.players.filter(p => p.type === 'human').length;
        if (humanCount < 2) {
          // Room trouvée avec de la place !
          return room;
        }
      }
    }
    
    // 2. Aucune room dispo → créer une nouvelle
    const newRoomId = 'public-' + Date.now();
    const room = new GameRoom(newRoomId, io, llmProvider, 1);
    gameRooms.set(newRoomId, room);
    return room;
  }
  
  // CAS NORMAL : Room privée avec code
  if (!gameRooms.has(roomId)) {
    const room = new GameRoom(roomId, io, llmProvider, 1);
    gameRooms.set(roomId, room);
  }
  return gameRooms.get(roomId)!;
}
```

#### Événement `joinSuccess` - MODIFIÉ

**Avant** :
```typescript
socket.emit('joinSuccess', { playerId });
```

**Après** :
```typescript
socket.emit('joinSuccess', { 
  playerId, 
  roomId: actualRoomId  // ← Retourne le vrai roomId
});
```

---

### Frontend (`turingarou-online.html`)

#### Function `startGame()` - MODIFIÉE

```javascript
const customRoom = document.getElementById('room-input')?.value.trim();

// Si room code vide → lobby public
// Si room code saisi → room privée
roomId = customRoom || 'public-lobby';

socket.emit('joinRoom', { 
  roomId: roomId,  // 'public-lobby' OU 'custom-code'
  username: username 
});
```

#### Event `joinSuccess` - MODIFIÉ

```javascript
socket.on('joinSuccess', ({ playerId, roomId: actualRoomId }) => {
  playerId = id;
  roomId = actualRoomId;  // ← Sync avec le vrai ID
  
  if (customRoom) {
    // Room privée → afficher le code
  } else {
    // Public lobby → message d'attente
    console.log('⏳ Waiting for another player...');
  }
});
```

#### Function `renderWaitingRoom()` - AMÉLIORÉE

```javascript
// Affiche le statut :
// "⏳ Waiting for 1 more player(s)..."
// "✅ Ready to start!"
```

---

## 🔄 Flow Complet

### Scénario 1 : Deux Joueurs Arrivent Séquentiellement

```
1. Alice ouvre le jeu
   └─> Frontend: roomId = 'public-lobby'
   └─> Backend: getOrCreateRoom('public-lobby')
       └─> Aucune room publique dispo
       └─> Créer 'public-1234567890'
       └─> Alice rejoint public-1234567890
   └─> Frontend reçoit: roomId = 'public-1234567890'
   
   État: 1 joueur dans public-1234567890
   UI: "⏳ Waiting for 1 more player(s)..."

2. Bob ouvre le jeu (30s plus tard)
   └─> Frontend: roomId = 'public-lobby'
   └─> Backend: getOrCreateRoom('public-lobby')
       └─> Chercher room publique dispo...
       └─> Trouvé ! public-1234567890 (1/2 joueurs)
       └─> Bob rejoint public-1234567890
   └─> Frontend reçoit: roomId = 'public-1234567890'
   
   État: 2 joueurs dans public-1234567890
   
3. Backend détecte 2 joueurs
   └─> addAIPlayers() → Ajoute 1 IA (nom aléatoire)
   └─> startGame() → Phase Question
   └─> Broadcast gameState à tous
   
4. Les deux frontends reçoivent gameState
   └─> Phase: 'question'
   └─> 3 joueurs (2 humains + 1 IA)
   └─> Affichent l'écran question

🎮 JEU DÉMARRÉ !
```

---

### Scénario 2 : Avec Room Code Privé

```
1. Alice ouvre le jeu
   └─> Entre room code: "AMIS"
   └─> Frontend: roomId = 'AMIS'
   └─> Backend: getOrCreateRoom('AMIS')
       └─> Pas de 'public-' → Room privée
       └─> Créer 'AMIS'
   └─> Alice rejoint 'AMIS'

2. Bob ouvre le jeu
   └─> Entre room code: "AMIS"
   └─> Backend: getOrCreateRoom('AMIS')
       └─> Room 'AMIS' existe déjà
       └─> Bob rejoint 'AMIS'
   
3. Jeu démarre (identique)
```

---

## 🏗️ Architecture du Système de Lobby

```
┌─────────────────────────────────────────┐
│  Frontend (Navigateurs)                 │
│                                         │
│  Alice:  roomId='public-lobby' ────┐   │
│  Bob:    roomId='public-lobby' ────┤   │
│  Charlie: roomId='public-lobby' ───┤   │
└─────────────────────────────────────┼───┘
                                      │
                                      ▼
┌─────────────────────────────────────────┐
│  Backend: getOrCreateRoom()             │
│                                         │
│  if (roomId === 'public-lobby') {       │
│    Chercher room publique dispo...      │
│  }                                      │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│  Rooms Map                              │
│                                         │
│  'public-1234567890' → [Alice, Bob]     │
│  'public-1234567891' → [Charlie] ⏳     │
│  'AMIS'             → [Full Game]       │
└─────────────────────────────────────────┘
```

---

## 🎮 Comportement selon le Nombre de Joueurs

### Room Vide (0 joueurs)
```
Joueur 1 rejoint
→ Room créée
→ État : Waiting (1/2)
→ UI: "⏳ Waiting for 1 more player(s)..."
```

### Room Partielle (1 joueur)
```
Joueur 2 rejoint
→ 2 joueurs humains
→ Backend ajoute 1 IA automatiquement
→ Backend: startGame()
→ État : Question (3/3)
→ UI: Écran Question affiché
```

### Room Pleine (3 joueurs, jeu en cours)
```
Joueur 3 essaie de rejoindre
→ Backend: room.phase !== 'waiting'
→ Cherche autre room publique
→ Crée nouvelle room publique si aucune dispo
```

---

## 📊 Types de Rooms

| Type | ID Format | Comportement |
|------|-----------|--------------|
| **Public** | `public-1234567890` | Matching automatique, créé via lobby |
| **Privée** | `CUSTOM-CODE` | Créée/rejointe par code spécifique |

---

## 🔍 Debugging

### Vérifier les Rooms Actives

```bash
curl https://turingarou.onrender.com/stats
```

**Output** :
```json
{
  "activeRooms": 2,
  "totalPlayers": 4
}
```

### Logs Backend (Render Dashboard)

```
Created new public room: public-1707123456 with 1 AIs
Alice joining room public-lobby
Alice joined successfully in public-1707123456
⏳ Waiting for 1 more player...

Bob joining room public-lobby
Joining existing public room: public-1707123456 (1/2 players)
Bob joined successfully in public-1707123456
✅ Starting game with 2 humans + 1 AI
```

### Console Frontend

```javascript
// Voir les événements
✅ Connected to server
✅ Joined as player: player-xxx in room: public-1707123456
⏳ Waiting for another player...
📊 Game state update: waiting
📊 Game state update: question  ← Jeu démarré
```

---

## 💡 Avantages du Système

### Pour les Joueurs
- ✅ Pas besoin de coordonner un code
- ✅ "Join and play" immédiat
- ✅ Matching automatique
- ✅ Option room privée disponible

### Pour le Développement
- ✅ Facilite les tests (pas besoin de 2 personnes avec le même code)
- ✅ Meilleure expérience utilisateur
- ✅ Scalable (plusieurs lobbies simultanés)

---

## 🧪 Tests

### Test Automatique
```bash
# Simuler 2 connexions au lobby public
node test-connection.js https://turingarou.onrender.com
```

### Test Manuel (2 Onglets)
1. Onglet 1 : Ouvrir, pseudo "Alice", room code VIDE, START
2. Onglet 2 : Ouvrir, pseudo "Bob", room code VIDE, START
3. → Doivent être matché dans la même room automatiquement

### Test Room Privée
1. Onglet 1 : pseudo "Alice", room code "TEST123", START
2. Onglet 2 : pseudo "Bob", room code "TEST123", START
3. → Doivent jouer ensemble dans "TEST123"

---

## 📝 Configuration Requise

### Backend (Render)
- ✅ `AI_COUNT=1`
- ✅ `maxPlayers=3`
- ✅ `minPlayers=2`
- ✅ Code déployé (derniers commits)

### Frontend (GitHub Pages)
- ✅ `turingarou-online.html` déployé
- ✅ URL backend: `https://turingarou.onrender.com`
- ✅ Room code optionnel

---

## ✅ Résultat

**Sans room code** :
- Joueur rejoint `public-lobby`
- Backend trouve/crée une room publique disponible
- Matché avec le prochain joueur
- Jeu démarre à 2

**Avec room code** :
- Joueur rejoint `custom-code`
- Backend crée/rejoint cette room spécifique
- Jeu privé entre amis

**UI du room code conservée mais optionnelle !** ✨
