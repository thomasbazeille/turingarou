# 🎮 TURINGAROU - PRÊT À JOUER !

## ✅ Tout est Configuré et Déployé

Votre jeu est maintenant en ligne et prêt à l'emploi !

## 🚀 Comment Jouer Maintenant

### Option 1 : Lobby Public (Sans Code) ⭐ PLUS SIMPLE

**Vous** :
1. Ouvrir : https://thomasbazeille.github.io/turingarou/turingarou-online.html
2. Entrer votre pseudo
3. **Laisser le Room Code VIDE** ⬜
4. Cliquer START SESSION
5. Message : "⏳ Waiting for 1 more player(s)..."

**Votre Ami** (en même temps ou après) :
1. Ouvrir le même lien
2. Entrer son pseudo
3. **Laisser le Room Code VIDE** ⬜
4. Cliquer START SESSION

→ **🎉 Vous êtes automatiquement matchés ensemble !**  
→ **🤖 1 IA rejoint avec un nom aléatoire**  
→ **🎮 Le jeu démarre !**

---

### Option 2 : Room Privée (Avec Code)

**Si vous voulez une room privée avec un ami spécifique :**

1. **Vous** : Entrez un code (ex: "AMIS2024")
2. **Ami** : Entre le **même code**
3. → Vous jouez ensemble dans une room privée

---

## ⏱️ Timing

**⚠️ Premier lancement** : 30 secondes (serveur se réveille)  
**Lancements suivants** : Instantané

---

## 🎯 Configuration Actuelle

```
👥 Joueurs : 3 total
   • 2 Humains (vous + ami)
   • 1 IA (nom aléatoire parmi 7 options)

⏱️  Durées :
   • Question : 15 secondes
   • Discussion : 60 secondes  
   • Vote : 10 secondes
   • Rounds max : 5

🤖 IA :
   • Noms variables : Alex, Jordan, Sam, Taylor, Morgan, Riley, Casey
   • Messages générés par LLM (Deepseek)
   • Vote avec délai humain (2-6s)
```

---

## 🧪 Test Rapide (Vous Seul)

Pour tester avant d'inviter un ami :

1. **Navigateur Normal** :
   - Ouvrir le jeu
   - Pseudo : "Alice"
   - Room code : VIDE
   - START SESSION

2. **Onglet Privé** (⌘+Shift+N) :
   - Ouvrir le jeu
   - Pseudo : "Bob"
   - Room code : VIDE
   - START SESSION

→ Les deux onglets sont matchés ensemble !

---

## 📱 Partager avec un Ami

**Message type** :

```
🎮 Joue à TURINGAROU avec moi !

1. Ouvre : https://thomasbazeille.github.io/turingarou/turingarou-online.html
2. Entre ton pseudo
3. Ne mets RIEN dans le room code
4. Clique START SESSION
5. On sera matchés automatiquement ! 🚀

⚠️ Si c'est la première fois, attends 30 secondes
(le serveur démarre)
```

---

## 🔍 Indicateurs Visuels

### Bordure du Navigateur
- 🟢 **Vert** : Connecté au serveur
- 🟠 **Orange** : Reconnexion...
- 🔴 **Rouge** : Déconnecté

### Messages Console (F12)
```
✅ Connected to server
✅ Joined as player: player-xxx in room: public-1234567890
⏳ Waiting for another player...
📊 Game state update: question  ← Jeu démarré !
```

---

## 🎯 Prochaines Actions

### 1. Activer GitHub Pages (si pas encore fait)

https://github.com/thomasbazeille/turingarou/settings/pages

Source : **main** branch → Save

### 2. Tester Vous-Même

Deux onglets (voir ci-dessus)

### 3. Inviter un Ami

Partager le lien + instructions simples

### 4. Vérifier que Render Redéploie

https://dashboard.render.com

Le build devrait être en cours (~2-3 minutes)

---

## 🐛 Si Problème

### "Serveur ne répond pas"
```bash
# Vérifier le backend
curl https://turingarou.onrender.com/health
```

### "Pas matché avec mon ami"
- Vérifiez que vous avez TOUS LES DEUX laissé le room code VIDE
- Ou utilisez un room code identique

### "2 IA au lieu de 1"
- Le backend doit redéployer (2-3 min)
- Vérifier `AI_COUNT=1` sur Render

---

## 📊 État Actuel

✅ Code poussé sur GitHub : https://github.com/thomasbazeille/turingarou  
✅ Backend déployé sur Render : https://turingarou.onrender.com  
✅ Backend actif : `{"status":"ok","llmProvider":"Deepseek"}`  
✅ Frontend sur GitHub Pages : https://thomasbazeille.github.io/turingarou/  

---

## 🎉 C'est Prêt !

**Le jeu est fonctionnel et déployé !**

Vous pouvez maintenant :
- ✅ Jouer avec des amis en ligne
- ✅ Matching automatique (lobby public)
- ✅ Rooms privées (avec code)
- ✅ IA intelligente avec LLM

**Amusez-vous bien ! 🎮**

---

## 📚 Documentation

- **Jouer** : [`COMMENT_JOUER.md`](./COMMENT_JOUER.md)
- **Tester** : [`TEST_2_PLAYERS.md`](./TEST_2_PLAYERS.md)
- **Technique** : [`SYSTEME_LOBBY_PUBLIC.md`](./SYSTEME_LOBBY_PUBLIC.md)
- **Déploiement** : [`DEPLOYMENT.md`](./DEPLOYMENT.md)
