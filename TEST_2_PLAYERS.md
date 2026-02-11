# 🧪 Guide de Test - 2 Joueurs

## Test Rapide en Local

### Méthode 1 : Deux Onglets (Recommandé)

1. **Ouvrir Chrome/Firefox**
2. **Onglet 1** :
   - Ouvrir : http://localhost:8000/turingarou-online.html
   - Entrer pseudo : "Alice"
   - Laisser le room code vide (sera généré automatiquement)
   - Cliquer "START SESSION"
   - **Noter le Room Code affiché** (ex: "game-abc123")

3. **Onglet 2** (Navigation Privée recommandée) :
   - ⌘+Shift+N (Chrome) ou ⌘+Shift+P (Firefox)
   - Ouvrir : http://localhost:8000/turingarou-online.html
   - Entrer pseudo : "Bob"
   - **Entrer le Room Code d'Alice**
   - Cliquer "START SESSION"

4. **Résultat Attendu** :
   ```
   ✅ Alice rejoint (Waiting Room)
   ✅ Bob rejoint (Waiting Room)
   ✅ 1 IA rejoint automatiquement (nom aléatoire)
   ✅ Jeu démarre → Phase Question
   ```

---

## Test en Production (GitHub Pages + Render)

### Configuration à Vérifier

**Backend Render** : https://turingarou.onrender.com

Variables d'environnement :
```
AI_COUNT=1          ✅
NODE_ENV=production ✅
DEEPSEEK_API_KEY=sk-xxx ✅
```

### Test Réel

1. **Joueur 1** :
   - Ouvrir : https://thomasbazeille.github.io/turingarou/turingarou-online.html
   - Pseudo : "Player1"
   - START SESSION
   - ⚠️ **Attendre 30s** (cold start Render la première fois)
   - **Noter le Room Code**

2. **Joueur 2** (autre personne ou autre appareil) :
   - Ouvrir le même lien
   - Pseudo : "Player2"
   - **Entrer le Room Code**
   - START SESSION

3. **Vérification** :
   ```
   Console navigateur (F12) :
   ✅ "Connected to server"
   ✅ "Joined as player: player-xxx"
   ✅ "Game state update: question"
   
   Interface :
   ✅ 3 joueurs affichés dans la Waiting Room
   ✅ 2 humains + 1 IA (nom aléatoire)
   ✅ Écran question s'affiche
   ```

---

## Vérifications Backend

### Health Check
```bash
curl https://turingarou.onrender.com/health
```

**Attendu** :
```json
{"status":"ok","rooms":1,"llmProvider":"Deepseek"}
```

### Stats
```bash
curl https://turingarou.onrender.com/stats
```

**Attendu** :
```json
{
  "activeRooms": 1,
  "totalPlayers": 3,
  "uptime": 1234
}
```

---

## Scénarios de Test

### ✅ Scénario 1 : Connexion Séquentielle

1. Alice se connecte → Waiting Room (1 joueur)
2. Bob se connecte → **Jeu démarre automatiquement**
3. 1 IA rejoint (Alex/Jordan/Sam/Taylor/Morgan/Riley/Casey)
4. Total : 3 joueurs

**Temps attendu** : ~2 secondes après Bob

---

### ✅ Scénario 2 : Vérifier le Nom de l'IA

Répéter le test 3 fois :
- **Test 1** : Noter le nom de l'IA (ex: "Jordan")
- **Test 2** : Noter le nom de l'IA (ex: "Sam")
- **Test 3** : Noter le nom de l'IA (ex: "Riley")

**Attendu** : Les noms varient (randomisés parmi 7 options)

---

### ✅ Scénario 3 : Phase de Vote

1. Arriver à la phase de vote
2. **Observer les votes** :
   - Alice vote immédiatement
   - Bob vote immédiatement
   - **L'IA vote après 2-6 secondes** ✅

**Vérification** :
- L'IA ne vote pas instantanément
- Le vote arrive avant la fin du timer (10s)

---

## Problèmes Courants

### ❌ "2 IA rejoignent au lieu de 1"

**Solution** :
```bash
# Vérifier la variable d'environnement Render
AI_COUNT=1  # Doit être 1, pas 2

# Redéployer le backend si changé
```

### ❌ "Le jeu ne démarre pas"

**Debug** :
1. Console navigateur (F12) :
   ```javascript
   // Vérifier les événements
   socket.on('gameState', console.log)
   ```

2. Vérifier `maxPlayers` et `aiCount` :
   ```javascript
   // Dans GameRoom.ts :
   maxPlayers: 3  ✅
   aiCount: 1     ✅
   ```

3. Logique de démarrage :
   ```javascript
   // Démarre quand :
   players.length === maxPlayers - aiCount
   // 2 === 3 - 1 ✅
   ```

### ❌ "IA s'appelle toujours 'Alex'"

**Cause** : Ancienne version du code

**Solution** :
```bash
# Vérifier que le commit est déployé
git log -1 --oneline
# Doit montrer : "Fix AI configuration and behavior"

# Redéployer si nécessaire
git push
```

---

## Tests Automatisés (Optionnel)

Si vous voulez automatiser :

```bash
# Installer les dépendances
npm install socket.io-client

# Lancer le test
node test-connection.js https://turingarou.onrender.com
```

**Output attendu** :
```
🧪 Test de connexion TURINGAROU
================================
Backend: https://turingarou.onrender.com
Room ID: test-room-1234567890

👤 Connexion Joueur 1...
✅ Joueur 1 connecté
✅ Joueur 1 rejoint la room

👤 Connexion Joueur 2...
✅ Joueur 2 connecté
✅ Joueur 2 rejoint la room

📊 Game State Update - Phase: question
   Joueurs: 3/3
   👤 TestPlayer1 (Red)
   👤 TestPlayer2 (Orange)
   🤖 Riley (Gold)

🎮 JEU DÉMARRÉ !
   Question: What color are your socks right now?

✅ TEST RÉUSSI - 2 joueurs humains + 1 IA
```

---

## Checklist Finale

- [ ] Backend déployé sur Render
- [ ] Frontend déployé sur GitHub Pages
- [ ] `AI_COUNT=1` dans Render
- [ ] Test avec 2 onglets : ✅ Jeu démarre
- [ ] Test avec 2 appareils : ✅ Jeu démarre
- [ ] Nom IA varie entre parties
- [ ] IA vote avec délai (2-6s)
- [ ] Health check OK
- [ ] Parties complètes fonctionnent

---

## Support

**Logs Backend** : https://dashboard.render.com → Logs

**Logs Frontend** : Console navigateur (F12)

**Configuration actuelle** :
- maxPlayers: 3
- minPlayers: 2
- aiCount: 1
- Total: 2 humains + 1 IA = 3 joueurs
