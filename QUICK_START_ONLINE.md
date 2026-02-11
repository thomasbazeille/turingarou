# ⚡ Quick Start - Déployer en 10 Minutes

## 🎯 Objectif

Avoir une version en ligne jouable avec des amis le plus rapidement possible.

## 📋 Prérequis (2 min)

1. **Compte GitHub** → [github.com](https://github.com)
2. **Compte Render** → [render.com](https://render.com) (gratuit)
3. **Clé API Deepseek** → [platform.deepseek.com](https://platform.deepseek.com) ($5 de crédit gratuit)

## 🚀 Déploiement Express

### Étape 1 : Backend (5 min)

```bash
cd turingarou-backend

# 1. Créer repo GitHub
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/VOTRE-USERNAME/turingarou-backend.git
git push -u origin main
```

**Sur Render.com :**
1. Cliquer "New +" → "Web Service"
2. Connecter GitHub → Sélectionner `turingarou-backend`
3. Settings:
   - **Name**: `turingarou-backend`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
4. Environment Variables → Add:
   - `DEEPSEEK_API_KEY` = `sk-votre-cle-ici`
   - `NODE_ENV` = `production`
   - `LLM_PROVIDER` = `deepseek`
   - `AI_COUNT` = `2`
5. Cliquer "Create Web Service"
6. **Copier l'URL** : `https://turingarou-backend-xxxx.onrender.com`

### Étape 2 : Frontend (3 min)

```bash
cd turingarou

# 1. Modifier l'URL backend dans turingarou-online.html
# Ligne ~270, remplacer par votre URL Render :
# return 'https://turingarou-backend-xxxx.onrender.com';
```

Ouvrir `turingarou-online.html` et modifier :

```javascript
// Production - METTRE VOTRE URL RENDER/RAILWAY ICI
return 'https://turingarou-backend-xxxx.onrender.com';  // ← Votre URL ici
```

```bash
# 2. Créer repo GitHub
git init
git add turingarou-online.html README.md
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/VOTRE-USERNAME/turingarou.git
git push -u origin main
```

**Activer GitHub Pages :**
1. Sur GitHub, aller dans Settings
2. Pages → Source: `main` → Save
3. Attendre ~1 minute
4. **URL finale** : `https://VOTRE-USERNAME.github.io/turingarou/turingarou-online.html`

### Étape 3 : Tester (2 min)

1. Ouvrir l'URL dans votre navigateur
2. Entrer un pseudo
3. Cliquer "START SESSION"
4. Attendre ~30s (premier démarrage Render)
5. **Partager le Room Code avec un ami !**

## ✅ C'est Prêt !

Vous pouvez maintenant :
- Jouer à plusieurs en ligne
- Partager le lien : `https://VOTRE-USERNAME.github.io/turingarou/turingarou-online.html`
- Partager le room code pour jouer ensemble

## 🔄 Itération Rapide

Pour mettre à jour :

```bash
# Frontend
cd turingarou
git add turingarou-online.html
git commit -m "Update game"
git push

# Backend
cd turingarou-backend
git add .
git commit -m "Update backend"
git push

# Attendre 2 minutes → C'est en ligne !
```

## ⚠️ Limitations Version Gratuite

- **Premier démarrage lent** : ~30 secondes (backend se réveille)
- **Mise en veille** : Après 15 min d'inactivité
- **Solution** : Garder un onglet ouvert ou passer à Render Starter ($7/mois)

## 🐛 Problèmes Courants

### "Server waking up..." pendant 30s
✅ **Normal** - Render gratuit se met en veille. Attendez 30s.

### "Failed to connect"
1. Vérifier que le backend est déployé : `https://votre-url.onrender.com/health`
2. Vérifier l'URL dans `turingarou-online.html` (ligne ~270)
3. Vérifier CORS dans `server.ts` (doit inclure votre URL GitHub Pages)

### IA ne répond pas
1. Vérifier les logs Render : Dashboard → Logs
2. Vérifier la clé API Deepseek est valide
3. Vérifier les crédits API restants

## 💡 Tips

### Partager avec des Amis

Envoyez ce message :
```
🎮 Jouons à TURINGAROU !

1. Ouvre : https://VOTRE-USERNAME.github.io/turingarou/turingarou-online.html
2. Entre ton pseudo
3. Entre ce code : ROOM-CODE-ICI
4. On joue ! 🚀

(Premier lancement peut prendre 30s)
```

### Room Privée vs Publique

- **Sans code** : Room aléatoire (parfait pour tester seul)
- **Avec code** : Room partagée (parfait pour jouer avec amis)

### Monitorer

- **Backend logs** : `https://dashboard.render.com/` → Logs
- **Stats** : `https://votre-url.onrender.com/stats`
- **Health** : `https://votre-url.onrender.com/health`

## 📊 Coûts

**Version Gratuite** (suffisant pour débuter) :
- Frontend : GitHub Pages **$0**
- Backend : Render Free **$0**
- LLM : Deepseek **~$0.003/partie**
- **Total : Essentiellement gratuit** ✨

**Parties d'exemple** :
- 10 parties avec amis : **$0.03**
- 100 parties : **$0.30**
- 1000 parties : **$3.00**

## 🎉 Prochaines Étapes

Une fois que ça marche :
1. ✅ Jouer avec 2-3 amis pour tester
2. ✅ Itérer sur le gameplay
3. ✅ Améliorer l'UI
4. ✅ Ajouter des fonctionnalités
5. ✅ (Optionnel) Passer à Render Starter pour éviter le cold start

**Bon jeu ! 🎮**

---

**Besoin d'aide ?**
- Documentation complète : [`DEPLOYMENT.md`](./DEPLOYMENT.md)
- Architecture : [`ARCHITECTURE.md`](./ARCHITECTURE.md)
- Intégration : [`INTEGRATION_COMPLETE.md`](./INTEGRATION_COMPLETE.md)
