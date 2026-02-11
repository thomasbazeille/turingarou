# 🚀 Guide de Déploiement - Jeu En Ligne Multijoueur

## 🎯 Objectif

Permettre à plusieurs joueurs de jouer ensemble en ligne, avec possibilité d'itérer rapidement pour les tests.

## 📋 Modifications Nécessaires

### 1. Frontend - Modifications Minimales

**Fichier : `turingarou-connected.html`**

#### A. Rendre l'URL du backend configurable

```javascript
// AVANT (ligne ~270)
const BACKEND_URL = 'http://localhost:3001';

// APRÈS
const BACKEND_URL = window.location.hostname === 'localhost' 
  ? 'http://localhost:3001'  // Dev local
  : 'https://turingarou-backend.onrender.com';  // Production
```

#### B. Ajouter une UI de sélection de room (optionnel mais recommandé)

Ajouter avant le bouton START :

```html
<div class="player-setup">
  <label class="setup-label">Room Code (optional - leave empty for random)</label>
  <input type="text" id="room-input" class="setup-input" placeholder="Enter room code or leave empty..." maxlength="20" value="">
  <div style="font-size: 10px; color: #64748b; margin-top: -8px; margin-bottom: 12px;">
    Share this code with friends to play together!
  </div>
</div>
```

Modifier `startGame()` :

```javascript
function startGame(){
  if(!G.ui) return;
  
  const username = document.getElementById('username-input').value.trim() || 'YOU';
  const customRoom = document.getElementById('room-input').value.trim();
  
  // Utiliser room custom ou générer un ID aléatoire
  roomId = customRoom || 'game-' + Math.random().toString(36).substr(2, 9);
  
  console.log('🎮 Starting game, joining room:', roomId);
  
  socket.emit('joinRoom', { 
    roomId: roomId, 
    username: username 
  });
}
```

### 2. Backend - Modifications pour Production

**Fichier : `turingarou-backend/src/server.ts`**

#### A. Configuration CORS dynamique

```typescript
// MODIFIER (ligne ~15)
const io = new SocketServer(httpServer, {
  cors: {
    origin: process.env.NODE_ENV === 'production'
      ? [
          'https://votre-frontend.github.io',  // GitHub Pages
          'https://votre-domaine.com',         // Domaine custom
          'http://localhost:8000',             // Dev local
        ]
      : '*',  // Dev: accepte tout
    methods: ['GET', 'POST'],
    credentials: true,
  },
});
```

#### B. Configuration du port

```typescript
// MODIFIER (ligne ~170)
const PORT = process.env.PORT || 3001;

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Using LLM provider: ${llmProvider.name}`);
});
```

#### C. Health check endpoint

```typescript
// AJOUTER avant io.on('connection')
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    llmProvider: llmProvider.name,
    rooms: gameRooms.size 
  });
});
```

### 3. Variables d'Environnement

**Fichier : `turingarou-backend/.env.production`**

```env
# Server
NODE_ENV=production
PORT=3001
FRONTEND_URL=https://votre-frontend.github.io

# LLM Provider
LLM_PROVIDER=deepseek
DEEPSEEK_API_KEY=sk-your-production-key-here

# Game Settings
AI_COUNT=2
```

## 🎯 Options de Déploiement (Rapide → Pro)

### Option 1 : 🏃 Ultra Rapide (Gratuit, <10min)

**Idéal pour tests rapides avec amis**

#### Frontend : GitHub Pages

```bash
cd turingarou

# Créer un repo GitHub
git init
git add turingarou-connected.html README.md
git commit -m "Deploy frontend"
git branch -M main
git remote add origin https://github.com/username/turingarou.git
git push -u origin main

# Activer GitHub Pages
# Settings → Pages → Source: main branch → Save
```

URL : `https://username.github.io/turingarou/turingarou-connected.html`

#### Backend : Render.com (Gratuit)

```bash
cd turingarou-backend

# Créer render.yaml
cat > render.yaml << 'EOF'
services:
  - type: web
    name: turingarou-backend
    runtime: node
    buildCommand: npm install && npm run build
    startCommand: npm start
    envVars:
      - key: NODE_ENV
        value: production
      - key: LLM_PROVIDER
        value: deepseek
      - key: DEEPSEEK_API_KEY
        sync: false  # Saisir dans l'interface Render
      - key: AI_COUNT
        value: 2
EOF

# Push sur GitHub
git init
git add .
git commit -m "Deploy backend"
git push
```

1. Aller sur [render.com](https://render.com)
2. "New +" → "Web Service"
3. Connecter votre repo GitHub
4. Ajouter `DEEPSEEK_API_KEY` dans Environment
5. Deploy !

URL : `https://turingarou-backend.onrender.com`

**⚠️ Limitation gratuite Render :**
- Se met en veille après 15min d'inactivité
- Premier lancement peut prendre 30-60s
- Parfait pour tests, pas pour prod 24/7

**Solution au démarrage lent :**
```javascript
// Dans turingarou-connected.html
socket.on('connect', () => {
  console.log('✅ Connected to server (might take 30s if sleeping)');
  isConnected = true;
});

// Afficher un message d'attente
const startBtn = document.getElementById('start-btn');
startBtn.addEventListener('click', () => {
  startBtn.textContent = 'CONNECTING TO SERVER...';
  startBtn.disabled = true;
  
  // Timeout si trop long
  setTimeout(() => {
    if (!isConnected) {
      startBtn.textContent = 'SERVER WAKING UP... (30s)';
    }
  }, 5000);
});
```

**Coût : $0/mois** ✨

---

### Option 2 : ⚡ Rapide avec Uptime (Payant léger)

Même que Option 1, mais avec un service qui ping le backend toutes les 5 minutes pour éviter la mise en veille.

#### Utiliser UptimeRobot (Gratuit)

1. Aller sur [uptimerobot.com](https://uptimerobot.com)
2. Créer un moniteur HTTP
3. URL : `https://turingarou-backend.onrender.com/health`
4. Intervalle : 5 minutes

**Ou passer à Render Starter Plan** : $7/mois
- Pas de mise en veille
- Démarrage instantané

**Coût : $0-7/mois**

---

### Option 3 : 🚀 Production-Ready

**Pour usage intensif ou démo professionnelle**

#### Frontend : Vercel / Netlify

```bash
cd turingarou

# Créer une app Next.js minimal ou juste déployer le HTML
npm install -g vercel
vercel deploy
```

#### Backend : Railway.app (Recommandé)

```bash
cd turingarou-backend

# Installer Railway CLI
npm install -g @railway/cli
railway login
railway init
railway up

# Configurer variables
railway variables set DEEPSEEK_API_KEY=sk-xxx
railway variables set LLM_PROVIDER=deepseek
railway variables set AI_COUNT=2
```

**Avantages Railway :**
- ✅ Pas de mise en veille
- ✅ WebSocket support natif
- ✅ Logs en temps réel
- ✅ Déploiement automatique sur git push
- ✅ $5 crédit gratuit/mois

**Coût : ~$5/mois** (suffisant pour démarrer)

**Alternative : Fly.io**
- Très performant
- WebSocket natif
- Free tier généreux

---

## 📱 Architecture Finale Déployée

```
┌──────────────────────────────────────────┐
│  👥 Joueurs (navigateurs)                │
│  - Chrome, Firefox, Safari, Mobile      │
└──────────────┬───────────────────────────┘
               │
               │ HTTPS
               │
┌──────────────▼───────────────────────────┐
│  🌐 Frontend (GitHub Pages / Vercel)     │
│  turingarou-connected.html               │
│  Statique, pas de serveur nécessaire    │
└──────────────┬───────────────────────────┘
               │
               │ Socket.io over WSS
               │ (WebSocket Secure)
               │
┌──────────────▼───────────────────────────┐
│  🔧 Backend (Render / Railway / Fly.io)  │
│  Node.js + Express + Socket.io          │
│  Port: 443 (HTTPS) ou custom            │
└──────────────┬───────────────────────────┘
               │
               │ HTTPS API
               │
┌──────────────▼───────────────────────────┐
│  🤖 LLM Provider (Deepseek / Mistral)    │
│  API externe                             │
└──────────────────────────────────────────┘
```

## 🔧 Configuration Complète

### 1. Préparer le Frontend pour Production

**Créer `turingarou-connected-prod.html`** :

```html
<!-- Modifier seulement la partie JavaScript -->
<script>
// Configuration automatique selon environnement
const BACKEND_URL = (() => {
  const hostname = window.location.hostname;
  
  // Dev local
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'http://localhost:3001';
  }
  
  // Production - METTRE VOTRE URL ICI
  return 'https://turingarou-backend.onrender.com';
})();

console.log('🔗 Backend URL:', BACKEND_URL);
const socket = io(BACKEND_URL, {
  transports: ['websocket', 'polling'],  // WebSocket prioritaire
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
});

// Indicateur de connexion visuel
socket.on('connect', () => {
  console.log('✅ Connected to server');
  document.body.style.borderTop = '3px solid #22c55e';  // Vert
});

socket.on('disconnect', () => {
  console.log('❌ Disconnected from server');
  document.body.style.borderTop = '3px solid #ef4444';  // Rouge
});

socket.on('reconnecting', (attemptNumber) => {
  console.log(`🔄 Reconnecting... attempt ${attemptNumber}`);
  document.body.style.borderTop = '3px solid #f59e0b';  // Orange
});
</script>
```

### 2. Optimiser le Backend pour Production

**`turingarou-backend/package.json`** - Ajouter scripts :

```json
{
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js",
    "start:prod": "NODE_ENV=production node dist/server.js"
  }
}
```

**`turingarou-backend/src/server.ts`** - Ajouter gestion d'erreurs :

```typescript
// Gestion d'erreurs globale
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // Ne pas crasher le serveur
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Cleanup des rooms inactives (toutes les heures)
setInterval(() => {
  const now = Date.now();
  gameRooms.forEach((room, roomId) => {
    const state = room.getState();
    // Si aucun joueur humain et inactive depuis 1h
    const hasHumans = state.players.some(p => p.type === 'human');
    if (!hasHumans) {
      gameRooms.delete(roomId);
      console.log(`Cleaned up inactive room: ${roomId}`);
    }
  });
}, 3600000);  // 1 heure
```

## 🎮 Workflow de Test Rapide

### Développement Local (Itération Rapide)

```bash
# Terminal 1 - Backend hot reload
cd turingarou-backend
npm run dev

# Terminal 2 - Frontend
cd turingarou
python -m http.server 8000

# Tester avec plusieurs navigateurs
# Chrome : http://localhost:8000/turingarou-connected.html
# Firefox : http://localhost:8000/turingarou-connected.html
# Safari : http://localhost:8000/turingarou-connected.html
```

### Déploiement Test (Partager avec Amis)

```bash
# Frontend - Push vers GitHub
cd turingarou
git add turingarou-connected.html
git commit -m "Update frontend"
git push

# Backend - Push vers Render/Railway
cd turingarou-backend
git add .
git commit -m "Update backend"
git push

# Attendre ~2min pour le build
# Partager l'URL : https://username.github.io/turingarou/turingarou-connected.html
```

**Temps total : ~3 minutes** ⚡

## 🔐 Sécurité de Base

### Variables Secrètes

**Ne JAMAIS commit les clés API !**

```bash
# turingarou-backend/.gitignore
.env
.env.local
.env.production
*.key
```

### Configuration Render/Railway

Ajouter dans l'interface web :
- `DEEPSEEK_API_KEY` → Copier depuis votre compte Deepseek
- `MISTRAL_API_KEY` → (optionnel)
- `NODE_ENV` → `production`

### Limiter le Rate Limiting

```typescript
// turingarou-backend/src/server.ts
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requêtes par IP
  message: 'Too many requests, please try again later.',
});

app.use('/api', limiter);
```

```bash
npm install express-rate-limit
```

## 📊 Monitoring Basique

### 1. Logs Backend

**Render/Railway** : Interface web → Logs en temps réel

### 2. Compteur de Joueurs

Ajouter dans `server.ts` :

```typescript
app.get('/stats', (req, res) => {
  const stats = {
    activeRooms: gameRooms.size,
    totalPlayers: Array.from(gameRooms.values())
      .reduce((sum, room) => sum + room.getState().players.length, 0),
    uptime: process.uptime(),
  };
  res.json(stats);
});
```

Accéder : `https://turingarou-backend.onrender.com/stats`

### 3. Monitoring Frontend

Ajouter Google Analytics ou Plausible (RGPD-friendly) :

```html
<!-- Dans <head> -->
<script defer data-domain="yourdomain.com" src="https://plausible.io/js/script.js"></script>
```

## 🐛 Troubleshooting Production

### Problème : "Failed to connect to server"

**Causes possibles :**
1. Backend en veille (Render gratuit) → Attendre 30s
2. CORS mal configuré → Vérifier `cors.origin` dans server.ts
3. WebSocket bloqué → Vérifier firewall/proxy

**Solution :**
```javascript
// Ajouter timeout plus long
const socket = io(BACKEND_URL, {
  timeout: 60000,  // 60s au lieu de 20s
  reconnectionDelayMax: 10000,
});
```

### Problème : "IA ne répond pas"

**Vérifier :**
```bash
# Logs backend
# Chercher : "Error calling LLM"
# Vérifier clé API valide
# Vérifier crédits API suffisants
```

### Problème : "Joueurs déconnectés"

**Ajouter heartbeat :**
```typescript
// Backend
io.on('connection', (socket) => {
  const interval = setInterval(() => {
    socket.emit('ping');
  }, 25000);  // Toutes les 25s
  
  socket.on('disconnect', () => {
    clearInterval(interval);
  });
});
```

```javascript
// Frontend
socket.on('ping', () => {
  socket.emit('pong');
});
```

## 💰 Coûts Estimés

### Option 1 : Gratuit
- Frontend : GitHub Pages **$0**
- Backend : Render Free **$0**
- Total : **$0/mois**
- Limite : 750h/mois, se met en veille

### Option 2 : Semi-Pro
- Frontend : GitHub Pages **$0**
- Backend : Render Starter **$7/mois**
- Total : **$7/mois**
- Pas de veille, toujours rapide

### Option 3 : Pro
- Frontend : Vercel Pro **$20/mois** (optionnel)
- Backend : Railway **$5-20/mois** selon usage
- Total : **$5-40/mois**
- Performance maximale, analytics, etc.

### Coût LLM (identique pour toutes options)
- Deepseek : **~$0.003/partie**
- 100 parties : **$0.30**
- 1000 parties : **$3.00**

**Pour tester avec amis : Option 1 suffit largement !**

## 🚀 Déploiement Rapide - Commandes

```bash
# 1. Frontend
cd turingarou
git init
git add turingarou-connected.html
git commit -m "Initial deploy"
git branch -M main
git remote add origin https://github.com/username/turingarou.git
git push -u origin main

# 2. Backend
cd ../turingarou-backend
echo "node_modules/" > .gitignore
echo ".env" >> .gitignore
git init
git add .
git commit -m "Initial deploy"
git remote add origin https://github.com/username/turingarou-backend.git
git push -u origin main

# 3. Render.com
# → New Web Service
# → Connect GitHub repo
# → Add DEEPSEEK_API_KEY
# → Deploy

# 4. GitHub Pages
# → Settings → Pages → main branch → Save

# 5. Mettre à jour l'URL backend dans le HTML
# BACKEND_URL = 'https://turingarou-backend.onrender.com'

# 6. Partager l'URL !
echo "https://username.github.io/turingarou/turingarou-connected.html"
```

**Temps total : ~15 minutes** pour le premier déploiement ! 🎉

## 📝 Checklist de Déploiement

- [ ] Frontend : URL backend modifiée
- [ ] Frontend : UI de room code ajoutée (optionnel)
- [ ] Backend : CORS configuré
- [ ] Backend : Variables d'env sécurisées
- [ ] Backend : Health check endpoint
- [ ] Backend : Build script fonctionnel
- [ ] Render/Railway : Compte créé
- [ ] Render/Railway : Repo connecté
- [ ] Render/Railway : Variables ajoutées
- [ ] GitHub Pages : Activé
- [ ] Test : Connexion fonctionne
- [ ] Test : Partie multijoueur avec 2+ joueurs
- [ ] Partage : URL envoyée aux amis

## 🎯 Prochaines Étapes

Une fois déployé, vous pouvez :
1. **Tester** avec 3-4 amis
2. **Itérer** en pushant des commits (auto-deploy)
3. **Monitorer** via les logs Render/Railway
4. **Améliorer** selon les retours

Bon jeu ! 🎮✨
