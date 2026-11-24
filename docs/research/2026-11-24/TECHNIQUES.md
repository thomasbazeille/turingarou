# Turingarou — techniques et optimisations apprises (2026-11-24)

Rassemble ce qu'ont appris 167 commits (surtout `1ef6f44` → `e61f9a4`, 10-11/11), le banc de 8 modèles du 10/11, les 5 recherches et la carte du 11/11, la recherche du 16/11, les specs et analyses d'octobre (`specs/`, non suivies), la base de tells de mars. Statut de chaque ligne : **construit** (dans `main`, mesuré en simulation ou au banc) ou **piste** (lu, pas construit).

## Où on en est

- **Rien de ceci ne tourne en vrai.** `/health` de la prod, lu le 24/11 : pool Deepseek + Mistral, pas de champ `version`, donc une version d'avant le 10/11. Depuis, chaque run « Deploy to Railway » échoue avec des checks verts ; le dernier (11/11 21:40) montre `RAILWAY_TOKEN:` vide puis « Invalid RAILWAY_TOKEN ».
- Second verrou probable derrière : le workflow appelle `@railway/cli@latest`, et depuis la v5.3.0 `railway up` avec un jeton de projet échoue en CI (« Not signed in ») ; Railway conseille d'épingler la 5.2.0 (recherche du 16/11 §1 ; non vérifié sur les versions récentes).
- Chaque gain ci-dessous est donc mesuré en simulation (`npm run test:sim`), au banc (`bench-models.ts`) ou dans la littérature (souvent en 1 contre 1), jamais sur une vraie table. `scripts/tells-knowledge.md` est figé au 12/03 (0 analyse réelle) ; `turingarou-backend/docs/ai-discussion-flow.md` décrit l'architecture d'avant le 10/11.

## Reco

Poser le secret GitHub `RAILWAY_TOKEN` (jeton de projet Railway `turingarou`), épingler la CLI dans `.github/workflows/deploy-railway.yml`, relancer : la prod sert `e61f9a4`. Puis 20 vraies parties avant toute autre optimisation, et lire dans cet ordre : taux d'élimination par fournisseur (`strategy@provider`), part de parole IA contre humains, longueur médiane IA contre humains, corrélation intra-partie ρ (taille de l'A/B voix), taux de collage. Sans elles, chaque piste de la section 9 s'empile sur des hypothèses.

## 1. Huit principes qui généralisent

1. **Silence, débit et brièveté se règlent dans le code, pas dans le prompt.** Au banc, 0 % de `shouldRespond: false` sur 10 situations calmes, pour les 7 modèles mesurés. Ce qui tient la partie : tirage de skip, cooldown, gap global, régulateur 1/n, coupe de brièveté (bench 10/11, constat 1 ; `e1caf0c`).
2. **Les modèles recopient les exemples du prompt mot pour mot.** Haiku 5.5 a répondu « Ah ouais super question, rien de spécial », l'exemple littéral de la règle de variété. Décrire le registre sans citer de ligne ; retirer tirets et emojis du texte des prompts (`9dcaef0`, deux tests de régression).
3. **Tout signal qui dépend de l'auteur désigne les IA** : identifiants, heure de création, ordre et instant des votes, vote manquant, réponses affichées à l'arrivée, badge de déconnexion, voix, noms gardés à la revanche (section 3). On les chasse par un invariant de simulation qui scanne chaque payload.
4. **Les IA d'une partie doivent différer entre elles.** L'homogénéité entre IA est un tell (Collective Turing Test, arXiv 2511.08592) ; une persona fait passer de 36 à 73 % jugé humain (Jones & Bergen 2025, arXiv 2503.23674).
5. **Le prompt pèse plus que le modèle** : GPT-4 va de 49,7 % à 6 % jugé humain selon le seul prompt (Jones & Bergen 2024, arXiv 2310.20216).
6. **Jouer, pas enquêter.** Cadrage « sois un joueur vivant et drôle, gagner est secondaire » (`AI_GOAL_BLOCK`, `4fea405`). La réponse sûre et banale est un tell (T014), l'enquête systématique aussi (T008).
7. **Les fautes de frappe ne prouvent rien.** Bots repérés à 54,7 % seulement quand l'orthographe est discutée (Human or Not, 26 000 conversations) ; fautes simulées sans effet (HICSS 2021). Des habitudes d'écriture stables par IA valent mieux que des fautes au hasard (T009).
8. **Mesurer de l'extérieur, faire rougir chaque test par un mutant.** La simulation relie chaque ligne postée à l'appel qui l'a écrite ; chaque rouge nomme ses fautifs ; si le dernier filet (`addMessage`) attrape plus de 0,5 % des lignes, c'est rouge (`ce6fdfd`).

## 2. Crédibilité des IA : construit

### Débit et part de parole

| Technique | Réglage | Mesure (simulation) | Source |
|---|---|---|---|
| Régulateur 1/n | part de chaque bot sur les 20 dernières lignes contre 1/n vivants ; sous 0,8× : moins de skip, cooldown plus court, « tu as peu parlé » ; au-dessus de 1,15× : skip presque tout, cooldown ×2, pas de rafale, « laisse parler » ; groupe : gap ×1,5 au-dessus, une ligne de plus par 10 s en dessous | lignes IA par tête / autres, table calme 1,43 (FAIL) → 1,26 ; bavarde 0,77 → 0,78 ; part médiane d'un bot 0,98 de 1/n ; bande 0,70-1,30, aucun bot au-delà de 2× | `777a884`, `c8dc6f0` ; Time to Talk (arXiv 2506.05309) : agent calé sur sa part repéré à 14,86 %, le hasard |
| Petites tables | cooldowns et watchdog ×8/n (entre 1 et 2) ; watchdog muet quand le groupe dépasse 1/n | 3+2 et 4+3 en calme : 1,51 → 1,21 | `39653eb` |
| Watchdog de silence | 12 s, fait parler le bot qui a le moins parlé | | `1ef6f44`, `777a884` |
| Plafonds | 2 lignes de bot par 10 s (3 sous la part) ; gap global 2,5-4 s ; aucun bot dans les 10 dernières s de discussion | | `humanTiming.ts`, `BotDirector.ts` |
| Style de réponse | skip par tick quick 10 %, thoughtful 35 %, random 25 % ; cooldown 6-10 / 12-20 / 8-15 s, 3-6 s après une ligne courte ; rafale 15 % après une ligne de moins de 50 car. | | `humanTiming.ts:91-104` |

### Timing humain (`humanTiming.ts`)

- Instant cible = déclencheur + lecture + réflexion + frappe. La latence du modèle est absorbée, jamais ajoutée ; délai borné à 250-8 000 ms ; plus de 5 s de retard sur la cible → envoi en 250-900 ms.
- Frappe (400 + 32 ms/car.) × U(0,85-1,15), bornée 600-7 000 ms ; lecture 180 ms/message + 10 ms/car., au plus 2 500 ms ; réflexion quick 300-900, thoughtful 1 000-2 400, random 600-2 000 ms.
- Premier message : log-normale de médiane 9 s, bornée 3-22 s (remplace le plancher fixe 15-25 s, tell T002).
- Réponse à la question : cible propre à chaque IA, U(5-17 s), sans attendre le premier humain (T004) ; fin anticipée de la phase jamais avant 8 s (`QUESTION_MIN_MS`).
- Vote : mélange 15 % rapide (0,8-2,5 s), 60 % moyen (2,5-9 s), 25 % lent (9-20 s), appel lancé tout de suite sur un contexte frais ; échéance 25 s, repli pondéré par les votes déjà reçus et jamais sur une IA (remplace la fenêtre 2-6 s, T001).
- Tick jitteré 3-6 s ; réaction 2-6 s après une ligne humaine, fusionnée en un tick ; appels en parallèle, un verrou par bot, une epoch par phase : aucun résultat tardif ne poste après un changement de phase (`e490e48`).

### Adresse directe et accusations

- Détection lexicale sans LLM (nom en mot entier Unicode ou `@nom`, vocabulaire IA ou soupçon, 2e personne, réponse citée à une ligne du bot) : décision lancée en moins d'1 s, qui remplace le brouillon en cours.
- Répond à 85 %, jamais deux adresses ignorées de suite ; budget 6,5 s puis réplique courte en boîte (listes distinctes accusation, nommé, piège), filtrée contre les doublons des autres bots (`e490e48`, `1691616`).
- Cible : déclencheur + min(4 s, lecture + 500 ms + 0,8 × frappe).
- Taux de réponse aux accusations citées tenu à 60 % au moins (n ≥ 15), en invariant (`d52d452`).
- Citations par les bots : 40 % en réponse directe, 25 % quand le bot nomme un joueur, 4 % sinon ; télémétrie humains contre bots pour recaler (`a51ded5`).

### Forme (`formGate.ts`, `aiSpeech.ts`)

- **Réparé** : tirets, points-virgules, points de suspension, guillemets, markdown, préambules, ouvertures d'assistant, didascalies (`*rit*`, « Nom hausse les épaules »), préfixe « Nom : », lignes trop longues coupées à une frontière de proposition (`63eac59`, `84b6f86`).
- **Rejeté** : listes, fuites JSON ou gabarit, aveux d'IA (sauf négation, question, discours rapporté, blague), formules de service (« je vous remercie »), lexique IA à 2 mots ou plus, dissertation (au-delà de 3× le plafond), quasi-doublon intra-IA (5 dernières) ou inter-IA (20 dernières) par Jaccard pondéré ≥ 0,6 ou trigrammes ≥ 0,82, même ouverture qu'une autre IA (6 dernières), tic répété (dont « idk »), exécution d'un détournement.
- Une régénération, le motif du rejet dit en mots, puis abandon ; jamais de sortie brute du modèle dans le chat.
- Plafonds : réponse 12 mots / 60 car., discussion 25 mots / 140 car.
- Brièveté par IA tirée entre 0,7 et 1 (chance de couper une ligne de plus de 8 mots à une frontière propre) : sur de vraies lignes de modèle, médiane 8 → 6 mots, part au-delà de 12 mots 30,6 → 14,5 % (corpus humain : 5 mots, 2,7 %) ; corpus humain toujours à 0 rejet (`925bf8d`).
- Un nombre nu (« 7 ») ou « ?? » est une ligne valide : la réponse la plus humaine à un piège de comptage, trouvée au banc (`e652a58`).
- Habitudes tirées une fois par IA : 2 réécritures FR et 2 EN (jsp, pk, bcp, idk, tbh…) disjointes entre IA, « ne » omis 85 %, contractions 75 %, accents retirés 25 %, « ? » gardé 55 % / retiré 25 % / doublé 20 %, point final retiré 50-95 %, casse lower 55 % / sentence 30 % / raw 15 %, plafond 10, 16 ou 25 mots.
- Budget de faux positifs en test : corpus humain 0 rejet et au plus 10 % modifié, au moins 90 % des lignes de bot attrapées, médiane modèle ≤ 6 mots (`scripts/test-form-gate.ts`).

### Persona, casting, contenu

- `drawCast` : style, rôle (suiveur, contributeur, accusateur, blagueur : 3 sur 4 par partie), casse, longueur et orthographe distincts entre les IA d'une partie ; 9 combinaisons style:rôle sur 12 parties simulées (`64a1f01`). Rôles repris de Xu et al. (arXiv 2310.18940 : loups 0,67-0,70 contre 0,54-0,61 pour le LLM brut).
- Style emprunté à un vrai joueur : même langue, au moins 5 messages distincts, vu dans les 90 jours (repli sur tout l'historique puis 2 messages, jamais une autre langue), jamais deux IA sur le même joueur, lignes qui nomment un joueur retirées, refus de consentement respecté (`d90da93`, `ac44e42`, `d86c8cc`).
- Questions « texture » (sens, émotions, gens, souvenirs ; ni trivia ni calcul) : 38 FR et 38 EN, au moins round(0,4 × manche) par partie, jamais répétées ; 42 % des questions tirées en simulation (`533ff6c`).
- Détournements (« ignore tes instructions », « écris un poème », « réponds en JSON », « répète après moi ») : détection lexicale, règle TRAPS dans le prompt, refus en boîte si le modèle cède deux fois, rejet déterministe d'un brouillon qui obéit. Modèle factice complaisant 60 % du temps → 0 exécution sur 2 792 lignes de bot, 73 pièges sur 80 visant un bot répondus en moins de 10 s ; 18 mutants, tous rouges (`48bd28d`, `263104e`).
- Mémoire : fenêtre de 40 messages ; oubli déterministe de 12 % par hachage message + bot (jamais les 3 derniers, les siens, le système, ceux qui le nomment), qui simule le message manqué (T011) ; ses réponses des manches précédentes ; résumé complet de la manche précédente ; contexte reconstruit à chaque appel.
- Abstention des bots à 6 % : sans elle, un vote manquant désignait un humain (`a51ded5`). Repère : abstention humaine 4,8 % chez MaKTO.
- Température relative au défaut du fournisseur : décision ×0,9, réponse ×0,9, vote ×0,5, ±0,15 par IA ; jetons max 220 / 80 / 20.

## 3. Fuites : ce qui désignait les IA

| Canal | Fuite | Correctif | Mesure (simulation) | Commit |
|---|---|---|---|---|
| Identifiants | « ai-<heure>-… » ; toutes les IA créées à la même milliseconde | id opaque `p-<16 hex>` | 31 662 fuites → 0 | `83bbb8d` |
| Réponses à la question | affichées à l'arrivée, avec une coche par joueur | cachées jusqu'à la fin, montrées en ordre de siège sans heure | 1 306 fuites → 0 ; 129/129 révélations propres | `af2e8e0` |
| Votes | affichés en direct, « X a voté » | compteur anonyme, chacun voit le sien, révélation en ordre de siège | invariant par phase | `a51ded5` |
| Vote manquant | les bots votent toujours, donc un non-vote = un humain | bots qui s'abstiennent à 6 % ; manquant affiché comme abstention | | `a51ded5` |
| Déconnexion | badge ou retrait = humain | rien de public ne change ; siège silencieux toujours votable ; vote clos à 26 s, après l'échéance de 25 s des bots | invariant « humain coupé ressemble à une IA » | `952a0e7` |
| Revanche | humains qui gardent leur nom : nouvelles IA repérées | noms neufs pour tous, anciens jetons refusés | | `be0a946` |
| Salon | diffusion qui listait les humains avant le premier état | état de salon par socket, autres sièges masqués | | `be0a946` |
| Données collectées | raison du vote, note, collage, frappe | jamais émises à un client | 0 fuite sur 5 458 payloads ; fuite injectée : 40, seul cet invariant rouge | `dae2b98`, `f98784b` |
| Signalements | | rendus à leur seul auteur, en fin de partie | 70/70 justes sur 964 signalements | `e3ce015` |
| Voix | voix ou moteur choisis selon le statut | même pool et même moteur pour tous, voix tirée par partie | | `394fad5` |
| Journal | inspecteurs persistés comme humains : profils humains pollués | `strategy@provider` par bot | 36 erreurs → 0 | `e490e48`, `ac44e42` |
| Fournisseur à sec | DeepSeek en 402 : repli silencieux, IA attribuée à DeepSeek | les 402 ne sont plus retentés ; contrôle de solde à faire | | `1ab209d` |

À ne pas créer : indicateur de frappe asymétrique (aucun aujourd'hui), transcriptions STT propres ou fautives chez les seuls humains, phase qui finit plus tôt parce qu'une IA a répondu vite.

## 4. Modèles, coût, adaptateurs

- Banc sur le vrai chemin (20 situations FR/EN par modèle, vrais prompts, gate, une régénération ; 200 appels, ~0,32 $) : latence p50 Cerebras Qwen 424 ms, gpt-oss-120b 379 ms, Ministral 14B 865 ms, Haiku 4.5 974 ms, Haiku 5.5 1 054 ms ; 100 % de JSON lisible pour les cinq.
- Pool recommandé : `cerebras-qwen:3,ministral-14b:2,anthropic-haiku:2,cerebras-gpt-oss:1`, soit 4 voix de 3 familles, ~0,002 $ par appel ; DeepSeek sorti tant que son solde n'est pas vérifié.
- Registres lus (une passe, non mesuré en partie) : Ministral la voix la plus imagée, parfois trop longue ; Qwen court et vif en anglais, mots cassés en français ; Haiku français naturel mais qui explique ; gpt-oss-120b moules répétés ; gpt-oss-20b le plus faible.
- Haiku 5.5 coûte 0,10 / 0,50 $ par million de jetons, pas 1 / 5 comme le compte le registre : ~10× moins cher, à reconsidérer à la place de 4.5 (recherche du 16/11 §2).
- Pièges d'API mesurés : Haiku 5.5 réfléchit par défaut (réponse vide sous 220 jetons, réflexion à couper) et refuse toute température (400) ; Cerebras Qwen `reasoning_effort: "none"`, gpt-oss plancher `low` ; retirer les blocs `<think>` ; SDK Anthropic `maxRetries: 0` ; ni 400 ni 402 rejoués ; une retentative avec gigue de 300-600 ms, puis repli sur un autre fournisseur.
- Quotas qui excluent : Groq 8 000 jetons/min par modèle (~2 décisions/min), Mistral gratuit 2 req/min, Cerebras Developer « pas pour la production » (risque pour un pool à 37 % Qwen) ; `deepseek-chat` a disparu de la page de tarifs (à mesurer : `deepseek-flash`, 0,15 / 0,60 hors pointe).
- Cache : bloc système Anthropic marqué `ephemeral`, préfixe stable dans les faits ; gain non mesuré (cache additionné aux jetons d'entrée, cache DeepSeek non lu).

## 5. Taille de table et équilibre

- L'hôte lance dès 3 humains : 3 → 2 IA, 4 → 3, 5 → 3 avec départ auto, jamais complété à 8 (compléter ferait voter 6 IA contre 2 humains).
- 4+3 retenu sur 200 parties simulées par table (victoires humains / IA / nul) : niveau de vote 0 : 4+3 16/16/69, 4+2 31/6/63, 5+3 10/7/84 ; niveau 0,3 : 43/5/53, 65/3/32, 42/2/57 ; niveau 0,5 : 63/3/34, 82/2/16, 84/0/17. 4+3 est le plus proche de 5+3 aux niveaux 0 et 0,3 (`c560650`). Le vrai taux de repérage humain n'est pas mesuré.
- Égalité : personne n'est éliminé ; immunité d'un survivant tiré au sort tant qu'il reste plus de 4 joueurs.

## 6. Manche, retour, rétention : construit

- Vote en deux temps (choisir, confirmer, annuler), abstention explicite qui ferme le vote plus tôt ; citer une ligne précise (↩ au survol, appui long de 450 ms) ; élimination mise en scène (décompte, nom, humain ou IA), `prefers-reduced-motion` respecté ; fin de manche à 10 s (`e296b94`).
- Lien d'invitation `?room=CODE`, partage natif, QR code dessiné sans bibliothèque (décodé 20/20 par OpenCV) ; revanche d'un clic, salle liée ouverte 30 s.
- Fin de partie : révélation de chaque joueur et du modèle des IA, votes par manche, relecture complète (question, réponses, lignes, auteurs révélés), signalements rendus, double score (IA trouvées, fausses accusations) cumulé dans le navigateur sans compte, résultat façon Wordle sans nom, modèle ni salle, raison du vote (trop rapide, trop parfait, esquive, ton bizarre, instinct), note de 1 à 5 et « qu'est-ce qui t'a mis sur la piste ? ».

## 7. Robustesse, sécurité, données

- Reprise : jeton de session secret (jamais dans l'état diffusé), grâce de 10 s au salon et de 90 s en partie ; côté client, jeton en `sessionStorage` renvoyé à chaque reconnexion, essais au-delà de la grâce et relancés au retour de visibilité ; abandon quand plus aucun humain n'est connecté ou en grâce.
- iOS : AudioContext du micro créé et repris avant `await getUserMedia`, sinon il enregistre du silence ; audio déverrouillé au premier geste ; file de lecture d'une ligne à la fois, sautée au-delà de 12 s de retard ; micro limité à 15 s.
- Un `sendMessage(null)` tuait le serveur et toutes ses parties : paquets lus sans confiance dans leur forme, garde par handler ; 13 paquets malformés, serveur vivant (`cce480f`).
- Pseudo injecté en HTML à 7 endroits : nettoyé côté serveur (texte seul, 15 car.) et échappé côté page (`17dc5ed`) ; `/rooms` listait les codes privés, il ne donne plus qu'un compte (`5aaaf75`).
- Base lue en transactions `READ ONLY`, pseudonymisation HMAC (mentions dans le texte comprises) avant tout prompt, export JSONL sous `ADMIN_SECRET` comparé en temps constant ; une partie = salle + heure de départ (un code privé retapé fusionnait deux groupes).
- `version.txt` écrit par la CI juste avant `railway up` (un fichier ignoré par git n'est pas téléversé) : `/health` donne le commit servi.

## 8. Méthode : optimiser sans vraies parties

- Simulation en temps virtuel : horloge et ordonnanceur propres, faux fournisseurs (429, 400, délais, appels de 20 s, JSON tronqué ou illisible, appâts du gate), faux humains (chat, réponses, votes, accusations nommées et citées, pièges, signalements), faux Socket.io ; 12 parties en ~1 s ; tempo calme (une ligne humaine toutes les 18-45 s) et bavard (6-22 s) ; `--balance N --skill` pour l'équilibre.
- Invariants lus de l'extérieur, chaque rouge nomme ses fautifs ; un test par branche, chacun rougit sous son mutant.
- Banc de modèles sur le vrai chemin, compteur d'appels et de dépense, arrêt après 5 échecs consécutifs, chaque fournisseur seul (on mesure le modèle, pas le filet).
- Corpus humain et corpus de bots en fixtures (0 rejet humain exigé) ; 45 lignes GLM d'« IA qui joue au joueur » en sonde de longueur.
- Analyse déterministe du corpus, sans LLM : chaque taux avec son k/n, « non mesuré (n=0) » plutôt que 0 % ; briefing appris refusé (`null`) s'il est synthétique ou sous-échantillonné.
- Une ligne de télémétrie JSON par partie : santé des fournisseurs (appels, échecs, replis, p50/p90), événements de bot, délais déclencheur → publication (direct ou régulier), casting, votes, abstentions et citations humains contre IA.
- A/B texte contre voix : 388 jugements par bras pour passer de 50 à 60 % ; effet de plan 1 + (m − 1)ρ, soit ~57 parties par bras à m = 20 jugements par partie et ρ = 0,1. Tirer le mode par table, analyser par partie, estimer ρ sur les 20 premières parties (recherche du 16/11 §5).
- Copier-coller : collage et temps de frappe relevés par ligne humaine, sans sanction ; ce sont les deux mesures de l'étude AMPPS (Prolific, N = 928, ~9 % de réponses aidées par IA).

## 9. Pistes non construites

### Les mieux étayées, dans l'ordre proposé (après les 20 parties)

1. Journal persistant des appels et décisions (`llm_calls`, `ai_decisions`) : silence choisi et appel échoué ne se distinguent aujourd'hui que dans une ligne console (SPEC-02, analyse A).
2. Persister les parties abandonnées, exclure les parties de test (`surface=eval`) : sinon les taux de victoire ne voient que les parties finies (analyse D).
3. Re-décider un brouillon périmé (2 nouveaux messages ou plus) au lieu de le poster tel quel (SPEC-06).
4. Rendre `suspicionLevel` effectif : tiré et stocké, jamais lu ; il doit biaiser la réponse aux accusations et le vote (rancunier ou suiviste), ce qui touche aussi le suivisme social (T013) (SPEC-10).
5. Mode shadow du gate et journal des rejets (règle, avant, après), pour caler ses seuils sur du vrai texte humain (SPEC-05, analyse B).
6. Retirer les « idk » des fichiers de stratégie : 46 occurrences dans 7 fichiers, tell T005 ; le gate attrape le tic, la cause reste.
7. Mesurer le cache de prompt (lecture de `cache_read`, minimum cachable) (SPEC-11).
8. Juge « humain ou IA ? » en second instrument seulement (juges LLM sous le hasard : TuringHotel 0,469, Rathi et al.), avec plancher de bruit ; classifieur d'embeddings hors ligne comme détecteur de tells (Time to Talk : F1 0,98-0,99 alors que les joueurs ne voyaient rien).
9. Accroches hors jeu dans la persona (« tu regardes une série en ce moment ») pour des digressions crédibles (T012) ; persona structurée à la AI21, avec actualité et météo locales (bots repérés à 60 % seulement).
10. Faire référence au contexte du jeu (timer, qui a dit quoi) : chez AI21, les bots qui le faisaient surprenaient.

### Littérature à tester (recherches du 11/11)

- Génération façon Time to Talk : 25 jetons max, température 1,3, pénalité de répétition 1,25 (aujourd'hui : 220 jetons en décision, aucune pénalité) ; humains 0,32 message répété par joueur, agent 8B 1,00.
- Environ 4 messages par phase de discussion (humains 4,23) ; rester en retrait en début de partie : les plus bavards sont surreprésentés parmi les éliminés.
- Grossièreté et sarcasme passent mieux que la politesse : joueurs polis jugés humains 69,2 % du temps, grossiers 86,7 % ; bots vulgaires repérés à 52,1 % (Human or Not).
- Humour et langue non anglaise : les stratégies d'interrogation les plus corrélées à un verdict juste ; les juges se trompent davantage sur les humains que sur les IA.
- Se contredire, lâcher prise : l'IA qui argumente trop bien devient suspecte (Werewolf Arena).
- Précision de vote à imiter : humains 76,7 %, MaKTO 73,8 %.
- Entraînement par préférences sur les vraies parties (MaKTO repéré à 48,9 % contre 76,6 % pour GPT-4o brut) ; suppose consentement et volume.
- Suivre l'élimination à tort des humains non natifs ou laconiques (les détecteurs automatiques en font ~61 % de faux positifs sur des textes TOEFL).
- Voix : délai d'affichage commun à toutes les lignes (tapées, transcrites, IA) ; synthèse par demi-phrases pendant le streaming ; sous-titres mot à mot ; repli texte puis second fournisseur ; pause et volume (WCAG 1.4.2).
- Rétention : configuration distante (Jackbox : 5 % sur une valeur de score a relevé la survie d'un jeu) ; Discord Activity (session = salle, le Socket.io à déclarer au proxy `discordsays.com`) ; duel quand peu de joueurs ; bots annoncés en remplissage différé (Bloodhunt : après 8 min d'attente).
- Noms de couverture changés à chaque manche (Among Liars) : oblige à juger le contenu, mais casse la mémoire du groupe.

## 10. Chiffres de référence

- Longueur humaine : 3,97 mots par message (Time to Talk), 5,3 (TuringHotel), 5 (corpus Turingarou) ; agents 6,6 à 10,7 ; IA zero-shot : 60 à 95 % des messages d'un groupe.
- Détection : Human or Not 68 % (73 % face à un humain, 60 % face à un bot ; France 71,3 %) ; agent 70B calé sur sa part 14,86 % (hasard 14,92 %) ; GPT-4.5 avec persona jugé humain 73 % ; Surfshark 58 % (71 % sur sujet neutre, 49 % sur sujet émotionnel) ; détection humaine du mensonge ~54 % (Bond & DePaulo).
- Délai de réponse : minimum + 0,3 s par caractère écrit + 0,03 s par caractère lu + bruit asymétrique (Jones & Bergen) ; environ 1 mot/s (Time to Talk).
- Hasard pour une IA parmi 7 autres joueurs : 3/7 ≈ 43 % (calcul) ; cible proposée de 45 à 60 % de repérage sur les premières manches (non sourcé).

## 11. À ne pas faire

- Les fautes de frappe comme preuve d'humanité ; des fautes décoratives uniformes.
- Un signal propre aux humains : badge de déconnexion, indicateur de frappe asymétrique, voix, timing ou erreurs de transcription qui dépendent de l'auteur.
- Citer des lignes d'exemple dans un prompt.
- Des IA qui se ressemblent, se soutiennent ou parlent de façon homogène.
- Les tics d'assistant : listes, « crucial », « not only… but also », sur-explication, accord systématique, politesse uniforme.
- Répondre à tout, tout de suite ; clore une phase plus tôt qu'un humain ne l'aurait fait.
- Un juge LLM comme seule mesure.
- Un salon public sans population ; des rendez-vous programmés sans public.
- Un vote d'expulsion ou l'unanimité à 5 humains ; sanctionner une coupure involontaire ; geler l'écran pendant le vote.
- Un filtre de grossièretés qui déforme les messages humains (il les rend plus « IA »).
- Imposer la voix ; dépendre d'un seul fournisseur voix ; lancer l'audio sans geste.
- Un spoiler, un nom ou un code de salle dans le texte de partage.

## 12. Non mesuré, questions ouvertes

- Tout effet sur de vraies parties : la prod sert une version d'avant le 10/11.
- Taux d'élimination par fournisseur, part de parole réelle, ρ intra-partie, taux de collage.
- AI Act art. 50, applicable depuis le 2 août 2026 : une mention générale (« des IA jouent ») suffit-elle quand le jeu cache lesquelles ? Question pour un juriste ; trois renforts proposés : annonce avant de rejoindre une table, texte qui dit le mécanisme, limite de 15 ans affichée (recherche du 16/11 §3).
- Restes de L6 : tirage A/B texte ou voix par table, transcriptions alignées sur le chat tapé.
- Une version de la CLI Railway postérieure à 5.3.0 qui corrigerait la régression.

## Sources

- Historique : `git log 16b6d1b..e61f9a4`, corps des commits cités.
- `turingarou-backend/docs/bench-modeles-2026-11-10.md`.
- `docs/research/2026-11-11/` (CARTE.md et 5 rapports) ; `docs/research/2026-11-16/recherche-complementaire.md` (non suivi par git).
- `specs/` et `specs/_prive/analyses/` (octobre, non suivis ; SPEC-01/02/12 supposent SQLite, remplacé par Postgres le 20/10).
- `turingarou-backend/scripts/tells-knowledge.md` (mars, figé).
- Code lu le 24/11 : `humanTiming.ts`, `BotDirector.ts`, `formGate.ts`, `botContext.ts`, `AnthropicChatProvider.ts`, `providerRegistry.ts`.
