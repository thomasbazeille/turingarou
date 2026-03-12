# TURINGAROU

> *"Have you ever doubted your own humanity?"*

Un jeu de déduction sociale où les joueurs doivent identifier et éliminer les intelligences artificielles cachées parmi eux.

## 🎮 Description

TURINGAROU est un jeu web standalone (fichier HTML unique) inspiré du test de Turing. Les joueurs participent à des rounds de discussion et de vote pour démasquer les IA cachées avant qu'elles ne prennent le contrôle.

### Caractéristiques principales

- **9 joueurs** : 1 humain local + 8 joueurs simulés (dont 3 IA cachées)
- **8 rounds maximum** : 100 secondes par round
- **Chat en temps réel** : Messages organisés en colonnes par joueur
- **Système de vote** : Éliminez un joueur suspect à chaque round
- **Immunité** : Le joueur le plus aimé (❤️) reçoit l'immunité
- **Historique** : Consultez les votes précédents de chaque joueur

## 🚀 Installation et Utilisation

### Deux Versions Disponibles

#### 📦 Version Standalone (démo/test rapide)

Ouvrez simplement le fichier HTML dans un navigateur moderne :

```bash
open turingarou-final\ \(14\).html
# ou double-cliquez sur le fichier
```

- ✅ Aucune dépendance, serveur ou installation requise
- ✅ Fonctionne hors ligne
- ⚠️ IA avec messages aléatoires basiques (pas de LLM)
- ⚠️ Pas de multijoueur

#### 🌐 Version Connectée (backend + LLM)

**A. Tests en Local**

```bash
# Terminal 1 - Backend
cd turingarou-backend
npm install
cp .env.example .env
# Éditer .env et ajouter votre clé API
npm run dev

# Terminal 2 - Frontend
cd turingarou
python -m http.server 8000
# Puis ouvrir http://localhost:8000/turingarou-connected.html
```

**B. Déploiement En Ligne (Jouer avec des amis)**

🚀 **Déploiement rapide (10 min)** : [`QUICK_START_ONLINE.md`](./QUICK_START_ONLINE.md)

```bash
# Utilisez turingarou-online.html (version optimisée pour production)
# Déployez sur GitHub Pages + Render.com
# → Gratuit, jouer à plusieurs en ligne !
```

📖 **Documentation complète** : [`DEPLOYMENT.md`](./DEPLOYMENT.md)

**Fonctionnalités :**
- ✅ **IA intelligentes** utilisant des LLM (Deepseek/Mistral)
- ✅ Messages contextuels et votes stratégiques
- ✅ **Multijoueur en ligne** avec room codes
- ✅ Backend authoritative
- ✅ Indicateur de connexion visuel
- ✅ Gestion automatique du cold start

**Coût estimé** : ~$0.003 par partie avec Deepseek (ultra économique !)

### Comment jouer

1. **Salle d'attente** : Entrez votre pseudo et choisissez un avatar
2. **Question initiale** : Répondez à la question en 15 secondes
3. **Phase de jeu** : 
   - Discutez avec les autres joueurs
   - Donnez des ❤️ à vos alliés (le plus aimé a l'immunité)
   - Votez pour éliminer un joueur suspect
4. **Répétez** : Continuez jusqu'à la victoire

### Conditions de victoire

- 🏆 **Humains gagnent** : Toutes les IA éliminées
- 🤖 **IA gagnent** : IA ≥ Humains en nombre
- ⏱️ **Match nul** : 8 rounds terminés

## 📋 Directives pour les IA de Développement

### Principes fondamentaux

Lors de modifications du code, suivez ces principes pour maintenir la qualité et la maintenabilité :

#### 1. **Changements minimaux et ciblés**

- ✅ Modifiez uniquement ce qui est nécessaire pour la demande
- ✅ Préservez la structure existante quand c'est possible
- ❌ Évitez les refactorisations non demandées
- ❌ Ne réécrivez pas de sections fonctionnelles sans raison

**Exemple** : Si on demande de changer la couleur d'un bouton, modifiez seulement le CSS du bouton, pas toute la palette de couleurs.

#### 2. **Pas de duplication de code**

- ✅ Réutilisez les fonctions existantes
- ✅ Créez des fonctions génériques pour la logique répétée
- ❌ Ne copiez-collez pas de blocs de code similaires
- ❌ N'insérez pas de code redondant

**Exemple** : Pour afficher un avatar, utilisez la logique existante plutôt que de créer une nouvelle implémentation.

#### 3. **Focalisé sur les demandes**

- ✅ Comprenez l'objectif précis de la demande
- ✅ Posez des questions si la demande est ambiguë
- ❌ N'ajoutez pas de fonctionnalités "bonus" non demandées
- ❌ Ne changez pas le comportement existant sauf si demandé

#### 4. **Réutilisabilité à long terme**

- ✅ Écrivez des fonctions avec des paramètres flexibles
- ✅ Séparez la logique de la présentation quand possible
- ✅ Commentez les parties complexes ou non évidentes
- ✅ Utilisez des noms de variables descriptifs

**Exemple** : Créez `renderAvatar(player, size, showBadge)` plutôt que plusieurs fonctions spécifiques.

### Workflow recommandé

1. **Analyser** : Lisez la demande et identifiez les parties du code concernées
2. **Localiser** : Trouvez les fonctions/sections existantes pertinentes
3. **Planifier** : Déterminez la modification minimale nécessaire
4. **Implémenter** : Faites le changement ciblé
5. **Vérifier** : Testez que le changement fonctionne sans casser l'existant (voir section ci-dessous)

### Vérification de l'état final (obligatoire après chaque changement)

Après toute modification du backend, vérifiez que le serveur démarre et accepte des connexions :

```bash
# Terminal 1 — démarrer le backend
cd turingarou-backend && npm run dev

# Terminal 2 — lancer le client de test
cd turingarou-backend && node test-client.js
```

**Résultat attendu :**
```
✅ Connected to server
✅ Joined successfully! Player ID: <id>
📊 Game State Update:
   Phase: waiting
   Players: 1/9
```

Si l'un de ces messages n'apparaît pas, le changement a cassé quelque chose — investiguer avant de committer.

## 🏗️ Architecture du Code

### Structure globale

Le fichier est organisé en trois sections principales :

```
├── <style>      - CSS complet (lignes 7-149)
├── <body>       - Structure HTML (lignes 151-255)
└── <script>     - Logique JavaScript (lignes 257-896)
```

### État du jeu (objet `G`)

L'état global est centralisé dans l'objet `G` :

```javascript
G = {
  s: 'waiting',      // État de l'écran actuel
  r: 1,              // Round actuel
  mr: 8,             // Rounds maximum
  t: 100,            // Timer (secondes)
  qt: 15,            // Timer question (secondes)
  p: [],             // Joueurs
  m: [],             // Messages
  e: [],             // IDs éliminés
  l: null,           // ID joueur local
  im: null,          // ID joueur avec immunité
  a: {},             // Réponses à la question
  v: {},             // Votes actuels
  h: {},             // Cœurs donnés
  vh: {},            // Historique des votes
  sh: false,         // Afficher l'historique
  sa: null,          // Avatar sélectionné
  ui: false          // Username valide
}
```

### Fonctions principales

#### Initialisation et navigation
- `init()` - Initialisation du jeu
- `showScreen(name)` - Change d'écran
- `startGame()` - Lance le jeu

#### Salle d'attente
- `selectAvatar(avatar)` - Sélection d'avatar
- `updateLocalPlayer()` - Met à jour le joueur local
- `renderWaitingRoom()` - Affiche la salle d'attente

#### Phase question
- `renderQuestionScreen()` - Affiche l'écran de question
- `submitAnswer()` - Soumet la réponse
- `startQuestionTimer()` - Timer de 15s

#### Phase de jeu
- `startGameRound()` - Démarre un round
- `renderGameScreen()` - Affiche l'interface de jeu
- `renderMessages()` - Affiche les messages dans les colonnes
- `sendMessage()` - Envoie un message
- `confirmVote()` - Confirme le vote
- `toggleHeart(id)` - Donne/retire un cœur
- `startTimer()` - Timer de 100s
- `simulateAIMessages()` - IA envoient des messages
- `endRound()` - Termine le round

#### Fin de round
- `renderEndOfRound(eliminatedId, immuneId)` - Affiche les résultats
- `startProgressBar()` - Barre de progression auto
- `nextRound()` - Passe au round suivant

#### Utilitaires
- `scrollToBottom()` - Scroll automatique du chat
- `updateVisiblePlayersBasedOnScroll()` - Met à jour l'affichage selon le scroll
- `updateHeaderAndColumnsForRound(roundNum)` - Affiche les joueurs actifs pour un round

### Constantes

```javascript
AVATARS = ['🕵️','🔍','📜',...] // 20 emojis disponibles
COLORS = [{n:'Red',h:'#ef4444'},...] // 9 couleurs
T = 9  // Total joueurs
A = 3  // Nombre d'IA
```

## 🎨 Personnalisation

### Modifier les paramètres du jeu

```javascript
// Ligne 260-261
const T = 9;  // Nombre total de joueurs
const A = 3;  // Nombre d'IA

// Dans init() ou startGame()
G.mr = 8;     // Nombre de rounds maximum
G.t = 100;    // Durée d'un round (secondes)
G.qt = 15;    // Durée phase question (secondes)
```

### Ajouter des avatars

```javascript
// Ligne 258
const AVATARS = ['🕵️','🔍','📜','🗝️','🌙','⚡',...,'🦊','🎯'];
```

### Modifier les couleurs

```javascript
// Ligne 259
const COLORS = [
  {n:'Red', h:'#ef4444'},
  {n:'Orange', h:'#f97316'},
  // ...
];
```

## 🐛 Débogage

### Inspecter l'état du jeu

Ouvrez la console du navigateur et tapez :

```javascript
G                    // État complet
G.p                  // Liste des joueurs
G.m                  // Tous les messages
G.e                  // Joueurs éliminés
G.v                  // Votes actuels
```

### Logs utiles

Ajoutez temporairement des logs pour comprendre le comportement :

```javascript
console.log('Vote confirmé:', G.v);
console.log('Joueurs actifs:', G.p.filter(p => !G.e.includes(p.id)));
```

## 📝 Exemples de Modifications

### Exemple 1 : Changer la durée d'un round

**Demande** : "Passe les rounds à 120 secondes"

**Modification minimale** :
```javascript
// Ligne 261
let G = {..., t:120, ...}  // Changé de 100 à 120

// Ligne 739
G.t = 120;  // Changé de 100 à 120
```

### Exemple 2 : Ajouter un nouveau message IA

**Demande** : "Ajoute plus de phrases pour les IA"

**Modification minimale** :
```javascript
// Ligne 753 - Ajouter à la fin du tableau existant
const ms = [...messages existants..., 'New message 1', 'New message 2'];
```

### Exemple 3 : Changer la question initiale

**Demande** : "Change la question en 'Quelle est ta couleur préférée ?'"

**Modification minimale** :
```javascript
// Ligne 177 (HTML)
<div class="question-text">"Quelle est ta couleur préférée ?"</div>

// Ligne 613 (dans renderMessages)
qd.innerHTML = '<div class="system-message-text">"Quelle est ta couleur préférée ?"</div>';
```

## 🔒 Sécurité et Limitations

- **Jeu local uniquement** : Aucun multijoueur réel, tout est simulé
- **Pas de persistance** : Les données sont perdues au rechargement
- **Pas de serveur** : Aucune communication réseau
- **Client-side seulement** : Tout le code est visible et modifiable

## 📄 Licence

Projet éducatif et expérimental. Libre d'utilisation et de modification.

## 🤝 Contribution

Pour les IA assistant ce projet :

1. Lisez d'abord les **Directives pour les IA de Développement** ci-dessus
2. Analysez le code existant avant de modifier
3. Testez vos changements dans un navigateur
4. Gardez la cohérence avec le style de code existant
5. Documentez les changements non triviaux

---

**Version** : Final (14)  
**Date** : 2026  
**Technologie** : HTML5, CSS3, JavaScript Vanilla
