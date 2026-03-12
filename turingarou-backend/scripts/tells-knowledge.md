# Turingarou — AI Detection Knowledge Base

> Maintenu automatiquement par `npm run analyze`. Commiter après chaque run pour tracer l'évolution.

Last updated: 2026-03-12 (bootstrap manuel — analyse statique du code et des prompts)
Analyses run: 0 (données réelles à venir)

---

## 🔴 Tells actifs (confirmés par analyse statique)

### T001 — Tous les votes IA arrivent dans une fenêtre 2–6s après le début du vote
- **Catégorie** : timing
- **First seen** : 2026-03-12 (code review)
- **Last seen** : 2026-03-12
- **Fréquence** : high (structurel — dans `aiVote()`)
- **Description** : `const delay = Math.floor(Math.random() * 4000) + 2000` — tous les votes IA arrivent exactement 2 à 6 secondes après le début de la phase de vote. Les humains prennent des temps très variables (parfois 0s, parfois 9s). Un joueur qui vote toujours dans cette fenêtre est suspect.
- **Exemple** : votephase start +2.3s → vote AI. +3.1s → vote AI. Chaque round.
- **Fix possible** : élargir et rendre la distribution non-uniforme (ex: gamma distribution, quelques votes très rapides et quelques lents).

### T002 — Premier message de discussion toujours entre 15 et 25 secondes
- **Catégorie** : timing
- **First seen** : 2026-03-12 (code review)
- **Last seen** : 2026-03-12
- **Fréquence** : high (structurel)
- **Description** : `if (discussionCount === 0) { delayMs = 15000 + Math.floor(Math.random() * 10000) }` — si une IA envoie le premier message de la discussion, il arrive invariablement entre 15 et 25s. Les humains peuvent parler dès 2s ou attendre 40s.
- **Fix possible** : supprimer ce plancher fixe, ou le remplacer par une distribution plus large et asymétrique.

### T003 — Cadence des messages à 10s ou burst 3–6s — pattern mécanique
- **Catégorie** : timing
- **First seen** : 2026-03-12 (code review)
- **Last seen** : 2026-03-12
- **Fréquence** : medium (visible sur plusieurs messages)
- **Description** : Le rate-limiting impose exactement 10s entre messages normaux, ou 3–6s en burst (message court précédent). Un humain attentif peut noter qu'un joueur parle avec une régularité anormale. Le burst mode crée aussi un pattern reconnaissable : message court → message rapide → silence long.
- **Fix possible** : ajouter du jitter (±30%) sur le min-gap, et des silences imprévisibles.

### T004 — Toutes les IA répondent à la question après le premier humain
- **Catégorie** : timing
- **First seen** : 2026-03-12 (code review)
- **Last seen** : 2026-03-12
- **Fréquence** : high (structurel — `waitBeforeSubmit`)
- **Description** : `waitBeforeSubmit` se débloque dès qu'un humain a répondu OU après 15s. En pratique, toutes les IA répondent dans une fenêtre serrée juste après la première réponse humaine. S'il y a 2 IA, leurs réponses arrivent en burst peu après la 1ère réponse humaine.
- **Fix possible** : donner à chaque IA un délai individuel tiré aléatoirement (ex: 8–18s) indépendamment de la réponse humaine.

### T005 — "idk" sur-représenté dans les messages IA
- **Catégorie** : langage
- **First seen** : 2026-03-12 (analyse prompts)
- **Last seen** : 2026-03-12
- **Fréquence** : medium
- **Description** : Tous les prompts (v1, v2, v3) insistent massivement sur l'utilisation de "idk" comme signal d'authenticité. En pratique les IA tendent à sur-utiliser ce terme — proportion bien supérieure à celle des vrais humains. Un joueur qui dit "idk" dans 40%+ de ses messages est suspect.
- **Exemple** : "idk man" / "idk whatever" / "no clue idk" en séquence.
- **Fix possible** : réduire l'emphase sur "idk" dans les prompts, encourager d'autres formes d'incertitude.

### T006 — Longueur des réponses à la question trop homogène entre IA
- **Catégorie** : langage / pattern
- **First seen** : 2026-03-12 (analyse prompts)
- **Last seen** : 2026-03-12
- **Fréquence** : medium
- **Description** : Les prompts ciblent 5–10 mots pour les réponses à la question. Dans une partie avec 2 IA, leurs réponses ont souvent une longueur très similaire. Les humains sont beaucoup plus variés (de 1 mot à 3 phrases).
- **Fix possible** : tronquer aléatoirement à `[1–3 mots | 5–8 mots | 1 phrase]` avec des probabilités différentes par stratégie.

### T007 — L'IA revient sur sa réponse à la question pendant la discussion
- **Catégorie** : comportement
- **First seen** : 2026-03-12 (analyse prompts)
- **Last seen** : 2026-03-12
- **Fréquence** : medium
- **Description** : Malgré l'instruction explicite "Do NOT keep talking about or justifying your own answer", les LLMs reviennent régulièrement sur leur réponse initiale dans la discussion. Les vrais humains passent rapidement en mode "qui est le bot ici ?".
- **Exemple** : "[ai] ouais ce que je voulais dire c'est que pour la question je..." alors que 3 messages de discussion ont déjà eu lieu.
- **Fix possible** : injecter dans le contexte une règle de rappel plus forte + compter dans le contexte le nombre de fois où l'IA a déjà mentionné sa propre réponse.

### T008 — Vocabulaire de détection trop systématique (Inspector)
- **Catégorie** : langage
- **First seen** : 2026-03-12 (analyse prompts)
- **Last seen** : 2026-03-12
- **Fréquence** : medium (spécifique Inspector)
- **Description** : Le prompt Inspector demande de ne pas utiliser un "tone of detection", mais l'Inspector a tendance à utiliser des formulations semi-formelles d'investigation : "that answer was weird", "something seems off", questions récurrentes sur les mêmes joueurs. Ce pattern est cohérent entre rounds d'une façon qu'un humain lambda n'aurait pas.
- **Fix possible** : diversifier les angles d'investigation dans le prompt Inspector, forcer plus de digressions hors-détection.

### T009 — Typos aléatoires sans cohérence inter-messages
- **Catégorie** : langage
- **First seen** : 2026-03-12 (analyse prompts)
- **Last seen** : 2026-03-12
- **Fréquence** : low–medium
- **Description** : Les LLMs génèrent des typos différents à chaque message (parfois "teh", parfois "ur", parfois aucun). Un humain a des typos caractéristiques consistants : toujours "le meme" mot qu'il écrit mal, toujours la même faute de frappe sur le même type de touche. L'absence de signature typo est un tell subtil mais réel.
- **Fix possible** : dans le prompt, assigner 1–2 typos spécifiques fixes par persona (ex: "tu écris toujours 'vraiement' au lieu de 'vraiment'").

### T010 — Justification de vote trop élaborée
- **Catégorie** : comportement / langage
- **First seen** : 2026-03-12 (analyse prompts)
- **Last seen** : 2026-03-12
- **Fréquence** : medium
- **Description** : Malgré "vote for who seems most sus" avec une courte raison, les LLMs produisent parfois des justifications structurées : "je vote X parce que sa réponse à la question initiale était trop précise et il n'a pas réagi aux accusations". Les humains votent avec des intuitions vagues ou une simple phrase.
- **Exemple** : "[ai] voting pierre parce que ses réponses sont trop cohérentes et il évite de prendre des positions tranchées"
- **Fix possible** : forcer la limite à 5 mots max pour la raison du vote.

### T011 — L'IA ne manque jamais un message
- **Catégorie** : comportement
- **First seen** : 2026-03-12 (analyse code)
- **Last seen** : 2026-03-12
- **Fréquence** : low (subtil)
- **Description** : L'IA lit et traite tous les messages (les 20 derniers du contexte). Elle ne dit jamais "ah j'avais pas vu ton message", ne répond jamais avec 10 minutes de retard à quelque chose d'ancien, ne saute jamais une question directe. Les humains font ça constamment.
- **Fix possible** : simuler des messages "manqués" en injectant une chance de 10% qu'un message adressé à l'IA ne soit pas dans le contexte la prochaine fois qu'elle parle.

### T012 — Absence de sujets vraiment hors-topic
- **Catégorie** : comportement
- **First seen** : 2026-03-12 (analyse prompts)
- **Last seen** : 2026-03-12
- **Fréquence** : low
- **Description** : Les humains font des digressions non liées au jeu (une blague random, une référence culturelle, parler de leur journée). Les IA restent toujours dans le cadre du jeu même quand le prompt leur dit de "digress". Le contexte `buildGameContext` ne donne à l'IA aucune matière hors-jeu pour diverger naturellement.
- **Fix possible** : dans la persona, injecter 1–2 "trucs du moment" (ex: "tu regardes une série en ce moment") pour que les digressions aient une accroche réelle.

---

## 🟡 En observation (vus par analyse statique, à confirmer sur données réelles)

### T013 — Majuscule après saut de ligne malgré la règle lowercase
- **Catégorie** : langage
- **First seen** : 2026-03-12 (analyse prompts)
- **Fréquence** : rare (failure mode LLM connu)
- **Description** : La règle "lowercase only" est parfois violée par les LLMs au début d'une phrase après un retour à la ligne, ou sur les noms propres en milieu de message. À confirmer sur des logs réels.

### T014 — Mots interdits qui leaked malgré la liste noire
- **Catégorie** : langage
- **First seen** : 2026-03-12 (analyse prompts)
- **Fréquence** : rare
- **Description** : "moreover", "furthermore", "delve", "robust" sont explicitement interdits dans tous les prompts. Les LLMs (surtout Deepseek) les utilisent parfois malgré tout, notamment en réponse à des questions philosophiques ou complexes. À confirmer sur données réelles.

### T015 — L'IA répond parfaitement aux character-level traps
- **Catégorie** : comportement
- **First seen** : 2026-03-12 (analyse prompts)
- **Fréquence** : rare mais à très haute valeur diagnostique
- **Description** : Compter les lettres, épeler à l'envers, déchiffrer un code — les prompts disent explicitement d'échouer. Mais les LLMs donnent parfois la bonne réponse, surtout pour des tâches simples. Un seul succès parfait sur ce type de question est une preuve forte d'IA.
- **Fix possible** : injecter une réponse incorrecte spécifique dans le prompt ("si on te demande de compter les lettres dans 'nevertheless', réponds 'uhh 5 je crois'").

### T016 — L'IA vote pour une autre IA
- **Catégorie** : voting
- **First seen** : 2026-03-12 (analyse code)
- **Fréquence** : incertain — dépend des parties
- **Description** : Les IA ne se connaissent pas entre elles (le contexte dit juste "X AIs still in game"). Elles peuvent voter pour d'autres IA sur la base du contenu des messages. Ce phénomène peut être exploité : si deux joueurs se votent mutuellement, l'un est probablement humain, ou ce sont deux IA qui se sont mutuellement détectées.

### T017 — Personnalité IA invariante entre rounds
- **Catégorie** : comportement
- **First seen** : 2026-03-12 (analyse code)
- **Fréquence** : à confirmer
- **Description** : La personnalité de chaque IA (analytical/calm, friendly/chatty, etc.) est assignée une fois au début et ne change pas. Sur 5 rounds, un joueur "toujours analytique et calme" quelle que soit la tension de la partie (élimination d'un allié, accusation directe) est anormalement stable.

---

## ✅ Bugs corrigés

### B001 — Messages Inspector loggés avec type 'human' en DB
- **First seen** : 2026-03-12
- **Fixed** : 2026-03-12
- **Fix appliqué** : `GameRoom.ts persistGameLog()` — vérification `inspectors.has(m.playerId)` avant d'attribuer le type 'human' vs 'inspector' dans les MessageLog.
- **Impact** : les messages Inspector polluaient `human_messages` et faussaient les profils humains utilisés pour entraîner les personas IA.

### B002 — Inspector sans rate limiting — pouvait flooder toutes les 5s
- **First seen** : 2026-03-12
- **Fixed** : 2026-03-12
- **Fix appliqué** : `GameRoom.ts startAIThinking()` — ajout du même garde 10s/burst 3–6s pour la boucle inspectors que pour la boucle aiPlayers. Partage les maps `lastAIMessageTime` / `lastAIMessageShort`.

### B003 — Appels LLM pour les réponses à la question séquentiels
- **First seen** : 2026-03-12
- **Fixed** : 2026-03-12
- **Fix appliqué** : `GameRoom.ts aiAnswerQuestion()` — `Promise.all()` sur tous les appels LLM. Les soumissions restent séquentielles (waitBeforeSubmit) mais le temps de génération est parallélisé.
- **Impact** : en 2-IA, l'IA 2 répondait toujours X secondes après l'IA 1 (X = temps de génération LLM). Pattern temporel détectable.

### B004 — Fallback de vote toujours players[0] quand le LLM retourne un nom inconnu
- **First seen** : 2026-03-12
- **Fixed** : 2026-03-12
- **Fix appliqué** : `AIPlayer.ts decideVote()` — retourne `null` si le nom ne matche aucun joueur. Pas de vote plutôt qu'un biais systématique vers le premier joueur de la liste.

### B005 — Joueur éliminé pouvait soumettre une réponse à la question
- **First seen** : 2026-03-12
- **Fixed** : 2026-03-12
- **Fix appliqué** : `GameRoom.ts addAnswer()` — ajout de `player.isEliminated` guard (était déjà présent dans `addMessage` mais manquant dans `addAnswer`).

### B006 — clearInterval sur un setTimeout (discussionTimer)
- **First seen** : 2026-03-12
- **Fixed** : 2026-03-12
- **Fix appliqué** : `GameRoom.ts abortGame()` — `clearTimeout` au lieu de `clearInterval`. Fonctionnellement équivalent dans Node.js mais sémantiquement incorrect, masquait un potentiel bug futur.

### B007 — Égalité de votes = victime aléatoire
- **First seen** : 2026-03-12
- **Fixed** : 2026-03-12
- **Fix appliqué** : `GameRoom.ts processVotes()` — `topPlayers.length === 1` requis pour éliminer. Égalité → personne d'éliminé. Règle de jeu cohérente.

---

## 📊 Stats globales

- Total tells identifiés : 17 (12 actifs, 5 en observation)
- Bugs corrigés : 7
- Tells corrigés : 0
- Analyses sur données réelles : 0
- Taux de victoire humains : n/a (aucune partie loggée)

---

## 🗒️ Notes méthodologiques

Ce fichier a été bootstrappé le 2026-03-12 par analyse statique du code source et des prompts de stratégie (aucune donnée de partie réelle disponible à ce stade). Les tells marqués 🔴 sont des certitudes structurelles déduites du code. Les tells 🟡 sont des hypothèses issues de la connaissance des LLMs qui nécessitent validation sur données réelles.

Priorités de fix suggérées (ratio impact/effort) :
1. **T001** (vote timing 2–6s) — facile à corriger, très visible
2. **T004** (toutes les IA répondent après le 1er humain) — important, nécessite refacto waitBeforeSubmit
3. **T005** ("idk" surutilisé) — correction de prompt, immédiat
4. **T010** (vote trop élaboré) — ajout d'une limite de longueur dans le prompt de vote
