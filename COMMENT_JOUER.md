# 🎮 Comment Jouer à TURINGAROU - Guide Rapide

## 🌐 URL du Jeu

**En ligne** : https://thomasbazeille.github.io/turingarou/turingarou-online.html

## 🎯 Deux Façons de Jouer

### Mode 1 : Lobby Public (Automatique) ⭐ RECOMMANDÉ

**Pour jouer rapidement avec le prochain joueur disponible**

1. **Ouvrir le jeu** : https://thomasbazeille.github.io/turingarou/turingarou-online.html
2. **Entrer votre pseudo** : "Alice"
3. **Laisser le Room Code VIDE** ⬜
4. **Cliquer "START SESSION"**

```
Vous êtes dans le lobby public
⏳ Waiting for 1 more player(s)...
```

5. **Partager le lien** avec un ami (sans room code)
6. **Quand 2 joueurs rejoignent** → 🎮 **Jeu démarre automatiquement !**

**+ 1 IA avec nom aléatoire** (Alex, Jordan, Sam, Taylor, Morgan, Riley ou Casey)

---

### Mode 2 : Room Privée (Avec Code)

**Pour jouer avec des amis spécifiques**

**Joueur 1 (Créateur)** :
1. Ouvrir le jeu
2. Entrer pseudo : "Alice"
3. **Entrer un Room Code** : "AMIS2024" (ce que vous voulez)
4. START SESSION
5. **Partager le code** : "AMIS2024"

**Joueur 2 (Ami)** :
1. Ouvrir le jeu
2. Entrer pseudo : "Bob"
3. **Entrer le MÊME code** : "AMIS2024"
4. START SESSION

→ 🎮 **Vous jouez ensemble dans une room privée !**

---

## ⚡ Quick Start (30 secondes)

```
1. Ouvre : https://thomasbazeille.github.io/turingarou/turingarou-online.html
2. Pseudo : [ton nom]
3. Room Code : [VIDE] ← Important !
4. START SESSION
5. Partage le lien à un ami
6. → Jouez ! 🎮
```

**⚠️ Premier lancement** : Peut prendre 30 secondes (serveur se réveille)

---

## 🎲 Configuration Actuelle

```
🎮 Jeu à 3 joueurs :
   👤 Humain 1 (Vous)
   👤 Humain 2 (Ami)
   🤖 IA (LLM Deepseek - nom aléatoire)

⏱️  Timing :
   - Question : 15 secondes
   - Discussion : 60 secondes
   - Vote : 10 secondes
   - Rounds : 5 maximum
```

---

## 🎯 Objectif du Jeu

**Pour les Humains** : Identifier et éliminer l'IA  
**Pour l'IA** : Se faire passer pour un humain

### Comment Jouer

1. **Phase Question** :
   - Répondez à la question personnelle
   - Observez les réponses des autres

2. **Phase Discussion** :
   - Chattez avec les autres joueurs
   - Analysez les comportements suspects
   - L'IA envoie des messages générés par LLM

3. **Phase Vote** :
   - Votez pour éliminer le joueur le plus suspect
   - L'IA vote aussi (avec délai pour sembler humain)

4. **Fin de Round** :
   - Un joueur est éliminé
   - Passez au round suivant

### Conditions de Victoire

- 🏆 **Humains gagnent** : L'IA est éliminée
- 🤖 **IA gagne** : Un humain est éliminé
- ⏱️ **Match nul** : 5 rounds terminés

---

## 💡 Conseils

### Pour Trouver l'IA

- 🔍 Réponses trop génériques
- 🔍 Messages trop parfaits (pas de fautes)
- 🔍 Comportement trop logique
- 🔍 Timing des messages suspect

### Pour l'IA (Si Vous Êtes l'IA... 🤖)

- Attendez, l'IA est contrôlée par le LLM !
- Elle essaie activement de se faire passer pour humaine
- Elle analyse la conversation et s'adapte

---

## 🧪 Test Rapide (Seul)

Vous pouvez tester avec 2 onglets :

1. **Onglet Normal** : Entrez "Alice", START
2. **Onglet Privé** (⌘+Shift+N) : Entrez "Bob", START
3. → Jouez contre vous-même ! (pratique pour tester)

---

## 📊 Indicateurs Visuels

### Bordure du Navigateur
- **Vert** 🟢 : Connecté au serveur
- **Orange** 🟠 : Reconnexion en cours
- **Rouge** 🔴 : Déconnecté

### Console (F12)
```
✅ Connected to server
✅ Joined as player: player-xxx in room: public-12345
⏳ Waiting for another player...
📊 Game state update: question  ← Jeu démarré !
```

---

## ❓ FAQ

### "Le jeu démarre pas, je suis seul"
✅ **Normal** - Attendez qu'un 2ème joueur rejoigne le lobby public

### "Le serveur met 30s à démarrer"
✅ **Normal** - Premier lancement (cold start Render gratuit)

### "L'IA s'appelle toujours Alex"
✅ **Corrigé** - Les noms sont maintenant randomisés (7 options)

### "Je veux jouer avec un ami spécifique"
✅ Utilisez le **Mode Room Privée** avec un code personnalisé

### "Combien de joueurs max ?"
✅ Actuellement : **3 joueurs** (2 humains + 1 IA)

---

## 🔧 Support

**Problème technique ?**
- Consulter : [`TEST_2_PLAYERS.md`](./TEST_2_PLAYERS.md)
- Backend logs : https://dashboard.render.com
- Documentation : [`DEPLOYMENT.md`](./DEPLOYMENT.md)

---

## 🎉 Bon Jeu !

Amusez-vous bien et essayez de démasquer l'IA ! 🤖🔍

**Partager le jeu** :
```
🎮 Joue à TURINGAROU avec moi !
Ouvre : https://thomasbazeille.github.io/turingarou/turingarou-online.html
Laisse le code vide, on sera matché automatiquement ! 🚀
```
