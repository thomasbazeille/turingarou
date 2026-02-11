# 📁 Guide des Fichiers - TURINGAROU

## 🎮 Fichiers de Jeu

### Versions Frontend

| Fichier | Usage | Description |
|---------|-------|-------------|
| **`turingarou-final (14).html`** | 🏠 Local solo | Version standalone originale, IA basiques, fonctionne hors ligne |
| **`turingarou-connected.html`** | 💻 Dev local | Version connectée au backend, pour développement local |
| **`turingarou-online.html`** | 🌐 Production | Version optimisée pour déploiement en ligne avec amis |

### Backend

| Dossier/Fichier | Description |
|-----------------|-------------|
| **`turingarou-backend/`** | Backend Node.js complet avec IA LLM |
| **`turingarou-backend/src/server.ts`** | Serveur Express + Socket.io |
| **`turingarou-backend/src/game/GameRoom.ts`** | Logique du jeu |
| **`turingarou-backend/src/game/AIPlayer.ts`** | Décisions IA via LLM |
| **`turingarou-backend/src/llm/`** | Providers LLM (Deepseek, Mistral) |

## 📖 Documentation

### Guides Principaux

| Fichier | Quand l'utiliser |
|---------|------------------|
| **`README.md`** | ⭐ Premier fichier à lire - Vue d'ensemble |
| **`QUICK_START_ONLINE.md`** | 🚀 Déployer en 10 min pour jouer en ligne |
| **`DEPLOYMENT.md`** | 📚 Guide complet de déploiement (toutes options) |
| **`INTEGRATION_COMPLETE.md`** | 🔧 Comprendre l'architecture connectée |
| **`CHANGEMENTS_APPLIQUES.md`** | 📋 Résumé des modifications backend/frontend |

### Documentation Technique

| Fichier | Contenu |
|---------|---------|
| **`ARCHITECTURE.md`** | Architecture globale du système |
| **`ANALYSE_HTML_STRUCTURE.md`** | Analyse détaillée du HTML original |
| **`HTML_PATCH_GUIDE.md`** | Guide de modification du HTML |
| **`FILES_GUIDE.md`** | Ce fichier - Guide des fichiers |

## 🛠️ Fichiers de Configuration

### Déploiement

| Fichier | Usage |
|---------|-------|
| **`turingarou-backend/render.yaml`** | Config Render.com (auto-deploy) |
| **`.github/workflows/deploy.yml`** | GitHub Actions (auto-deploy Pages) |
| **`deploy-quick.sh`** | Script de déploiement rapide |

### Environnement

| Fichier | Usage |
|---------|-------|
| **`turingarou-backend/.env.example`** | Template de configuration |
| **`turingarou-backend/.env`** | Config locale (NON versionné) |
| **`turingarou-backend/.gitignore`** | Fichiers à ignorer |

## 🎯 Quel Fichier Pour Quel Usage ?

### Je veux tester le jeu rapidement seul

→ Ouvrir **`turingarou-final (14).html`** dans le navigateur

**Avantages :**
- ✅ Aucune installation
- ✅ Fonctionne hors ligne
- ✅ Immédiat

**Limitations :**
- ⚠️ IA basiques (phrases aléatoires)
- ⚠️ Pas de multijoueur

---

### Je veux développer/tester en local avec backend

1. **Backend** : `cd turingarou-backend && npm run dev`
2. **Frontend** : Ouvrir **`turingarou-connected.html`**

**Avantages :**
- ✅ IA intelligentes (LLM)
- ✅ Hot reload backend
- ✅ Logs en temps réel

**Limitations :**
- ⚠️ Nécessite backend local
- ⚠️ Pas accessible en ligne

---

### Je veux jouer en ligne avec des amis

1. **Déployer** : Suivre **`QUICK_START_ONLINE.md`**
2. **Utiliser** : **`turingarou-online.html`** (déployé sur GitHub Pages)

**Avantages :**
- ✅ IA intelligentes (LLM)
- ✅ Multijoueur en ligne
- ✅ Room codes partageables
- ✅ Gratuit (avec Render Free)

**Limitations :**
- ⚠️ Premier démarrage peut prendre 30s (cold start)
- ⚠️ Nécessite déploiement initial

---

## 📊 Workflow de Développement

### 1. Développement Local

```
turingarou-connected.html ←→ localhost:3001 (backend)
                              ↓
                         LLM (Deepseek)
```

**Fichiers utilisés :**
- `turingarou-connected.html`
- `turingarou-backend/` (local)
- `.env` (local)

### 2. Tests avec Amis (Production)

```
turingarou-online.html ←→ turingarou-backend.onrender.com
(GitHub Pages)            ↓
                     LLM (Deepseek)
```

**Fichiers utilisés :**
- `turingarou-online.html` (GitHub Pages)
- `turingarou-backend/` (Render.com)
- Variables d'env (Render dashboard)

### 3. Itération Rapide

```bash
# Modifier le code
vim turingarou-online.html

# Déployer
./deploy-quick.sh

# Attendre 2 min
# → En ligne !
```

## 🗂️ Structure Complète du Projet

```
turingarou/
│
├── 🎮 FICHIERS DE JEU
│   ├── turingarou-final (14).html      # Standalone
│   ├── turingarou-connected.html       # Dev local
│   └── turingarou-online.html          # Production
│
├── 📖 DOCUMENTATION
│   ├── README.md                       # ⭐ Start here
│   ├── QUICK_START_ONLINE.md          # 🚀 Déploiement rapide
│   ├── DEPLOYMENT.md                   # 📚 Déploiement complet
│   ├── INTEGRATION_COMPLETE.md        # 🔧 Architecture
│   ├── CHANGEMENTS_APPLIQUES.md       # 📋 Changelog
│   ├── ARCHITECTURE.md                # 🏗️ Architecture globale
│   ├── ANALYSE_HTML_STRUCTURE.md      # 🔍 Analyse HTML
│   ├── HTML_PATCH_GUIDE.md            # 🛠️ Guide patch
│   └── FILES_GUIDE.md                 # 📁 Ce fichier
│
├── 🛠️ CONFIGURATION
│   ├── deploy-quick.sh                # Script déploiement
│   └── .github/
│       └── workflows/
│           └── deploy.yml             # GitHub Actions
│
└── 🔧 BACKEND
    └── turingarou-backend/
        ├── src/
        │   ├── server.ts              # Serveur principal
        │   ├── game/
        │   │   ├── GameRoom.ts        # Logique jeu
        │   │   └── AIPlayer.ts        # IA LLM
        │   ├── llm/
        │   │   ├── DeepseekProvider.ts
        │   │   └── MistralProvider.ts
        │   └── types/
        │       ├── game.types.ts
        │       └── shared.types.ts
        ├── render.yaml                # Config Render
        ├── package.json
        ├── tsconfig.json
        ├── .env.example
        └── .gitignore
```

## 🎯 Checklist selon Objectif

### Objectif : Tester rapidement seul

- [ ] Ouvrir `turingarou-final (14).html`
- [ ] Jouer !

**Temps : 10 secondes** ⚡

---

### Objectif : Développer/débugger

- [ ] Lancer backend : `cd turingarou-backend && npm run dev`
- [ ] Ouvrir `turingarou-connected.html`
- [ ] Modifier le code
- [ ] Recharger la page

**Temps setup : 2 minutes**

---

### Objectif : Jouer en ligne avec amis

- [ ] Lire `QUICK_START_ONLINE.md`
- [ ] Déployer backend sur Render
- [ ] Déployer frontend sur GitHub Pages
- [ ] Modifier URL backend dans `turingarou-online.html`
- [ ] Partager le lien + room code

**Temps setup initial : 10 minutes**  
**Temps itération : 3 minutes** (git push)

---

## 💡 Recommendations

### Pour Développement

Utilisez **`turingarou-connected.html`** + backend local :
- Logs immédiats
- Hot reload
- Debug facile

### Pour Production

Utilisez **`turingarou-online.html`** :
- Configuration automatique dev/prod
- Indicateurs visuels de connexion
- Gestion cold start
- Room codes

### Pour Tests Rapides

Utilisez **`turingarou-final (14).html`** :
- Aucune dépendance
- Fonctionne partout
- Parfait pour demo UI

## 🔄 Workflow Complet

```
1. Développer en local
   └─> turingarou-connected.html + backend local

2. Tester les changements
   └─> Plusieurs navigateurs / plusieurs users

3. Déployer
   └─> git push (auto-deploy)

4. Partager
   └─> Envoyer lien + room code aux amis

5. Itérer
   └─> Retour à étape 1
```

## 📝 Notes

- **Ne jamais commit** les fichiers `.env` (contiennent les clés API)
- **Toujours tester** en local avant de déployer
- **Documenter** les changements majeurs
- **Versionner** avec des tags git pour les releases

## ❓ Aide

Pour chaque cas d'usage, un fichier dédié :

| Question | Réponse |
|----------|---------|
| "Comment ça marche ?" | → `README.md` |
| "Comment déployer vite ?" | → `QUICK_START_ONLINE.md` |
| "Comment déployer (détaillé) ?" | → `DEPLOYMENT.md` |
| "Comment c'est architecturé ?" | → `ARCHITECTURE.md` ou `INTEGRATION_COMPLETE.md` |
| "Quels fichiers utiliser ?" | → `FILES_GUIDE.md` (ce fichier) |
| "Quels changements ont été faits ?" | → `CHANGEMENTS_APPLIQUES.md` |

Bon développement ! 🚀
