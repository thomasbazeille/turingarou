# Turingarou : faire tourner et revenir un jeu de groupe à petite population

Date : 2026-11-11. Méthode : ~35 recherches et lectures web, aucune modification de code. Règle : un chiffre sans URL = « non sourcé ».

Limite à lire d'abord : la plupart des faits viennent de synthèses de recherche web et de pages de presse ou d'éditeurs, pas de postmortems primaires. Aucun postmortem GDC sur le remplissage de salons par des bots dans un jeu de déduction sociale n'a été trouvé. Les points marqués « inférence » sont du raisonnement, pas des faits sourcés.

## 0. Résumé en 6 lignes

1. Les jeux de groupe à petite audience ne cherchent pas des inconnus : ils vendent un salon privé à lien ou code, sans installation (Jackbox, Among Us, skribbl.io). Le goulot « 5 humains simultanés » se contourne par le groupe d'amis, pas par le matchmaking public.
2. Le seul comparable direct trouvé, « Human or Not » (AI21), fait jouer des conversations de 2 minutes contre un humain ou une IA, sans jamais garantir le nombre d'humains. Aucun produit trouvé ne fait varier le nombre d'IA cachées pour compenser un manque d'humains : c'est un espace libre, et un risque (voir §3).
3. Les boucles de retour qui ont démontré un effet chiffré : grille de partage sans spoiler (Wordle), diffusion par streamers (Among Us, Gartic Phone), lancement dans un lieu social existant (Discord Activities : 70 % de sessions à plus de 3 amis pour Death by AI).
4. Les IA de type LLM sont dures à repérer : 60 % de bonnes réponses seulement contre un bot dans Human or Not, et les LLM sont moins détectés que des humains en Mafia (§1.4). C'est bon pour le jeu, et une raison de soigner l'anti-triche côté humains (copier-coller).
5. Robustesse mobile : iOS Safari coupe les WebSockets en arrière-plan ; ne pas se reposer sur `visibilitychange` seul (§1.5).
6. Anti-patterns avérés : prix/promesses diluées et crashs (HQ Trivia), bots qui ne partent jamais (forums EA), joueurs absents sans conséquence, public sans modération (spam Among Us 2020).

## 1. Pratiques observées par thème

### 1.1 Démarrage à froid et remplissage

**Salon privé par code ou lien, sans install**
- Jackbox : les joueurs rejoignent depuis le navigateur du téléphone, sans installer. Chiffres : 100 millions de joueurs en 2019, plus de 110 millions de mars à juin 2020, plus de 430 millions de sessions cumulées. https://www.thumbsticks.com/how-lockdown-opened-up-jackbox-party-to-a-massive-new-audience/
- Jackbox, jeu à distance : l'éditeur a publié des tutoriels pour jouer par-dessus Zoom, WhatsApp, FaceTime, Hangouts (même source). Le jeu ne fournit pas la voix : il se greffe sur l'outil que le groupe utilise déjà.
- skribbl.io : salons privés personnalisables avec lien à partager. Jusqu'à 12 ou 20 joueurs selon les sources (valeur incertaine). https://progameguides.com/skribbl/what-is-skribbl-io-how-to-play-it
- Gartic Phone : jeu navigateur gratuit, porté par les streamers ; pic de plus de 250 000 spectateurs simultanés sur Twitch mi-2021 (chiffre cité par Know Your Meme). https://knowyourmeme.com/editorials/guides/what-is-gartic-phone-and-why-do-streamers-love-it-the-multiplayer-drawing-game-explained
- Codenames Online (codenames.game) : gratuit, audience venue largement par streamers. https://criticalvideogamestudies.com/codenames-and-other-party-games-a-short-analysis/ (source indirecte). Mécanisme exact des salons : non trouvé.

**Lancement dans un lieu où le groupe existe déjà : Discord Activities**
- Death by AI (Playroom) : près de 7 millions d'utilisateurs en quelques semaines, plus de 70 % des sessions avec plus de 3 amis dans la semaine du lancement, plus de 30 % d'engagement à J7 pendant plusieurs semaines. Mécanique : l'identifiant de session de l'Activity est mappé à l'identifiant de salle du jeu, donc le groupe se forme tout seul ; pas d'UI d'invitation sur mesure. Chiffres d'origine éditeur. https://discord.com/build-case-studies/playroom
- Même étude : lancement test avec des influenceurs, soft launch dans une région puis global, mises à jour entre 23h et 2h PST, environnements staging et production séparés (même URL).
- Doc officielle Discord (Embedded App SDK, Activity Shelf dans un salon vocal, proxy sandbox) : https://docs.discord.com/developers/activities/development-guides
- Statistique « plus d'un quart des utilisateurs actifs mensuels de Discord utilisent Apps et Activities » : source tierce, non confirmée. https://app.cinevva.com/guides/publish-game-discord-activities

**Parties fixées à l'avance / en direct**
- HQ Trivia (rendez-vous quotidien en direct) : 2,38 millions de joueurs simultanés en mars 2018, déclin dès l'été 2018 ; causes citées : crashs sous charge, prix dilués, retrait de prix en argent, départ de l'animateur ; fermeture en février 2020. https://productmint.com/what-happened-to-hq-trivia/ et https://slidebean.com/blog/what-happened-to-hq-trivia . Aucun de ces textes n'analyse le rendez-vous en soi : le lien avec « parties programmées » est une inférence.
- Outils LFG Discord (LFG Hub) : publication en un clic, salon vocal par groupe, planification jusqu'à une semaine à l'avance, ping limité aux joueurs récents et jamais deux fois en 8 h. Affirmations d'éditeur, aucune donnée de rétention indépendante trouvée. https://top.gg/bot/1163043953273217044

**Bots qui complètent un salon**
- Bloodhunt : bots ajoutés seulement après 8 minutes d'attente. https://bloodhunt.com/news/upcoming-changes-to-the-trios-matchmaker
- Forums EA (Battlefield) : plaintes sur des bots qui ne sont jamais remplacés par de vrais joueurs, ou des serveurs qui ne se remplissent plus une fois la partie lancée. https://forums.ea.com/idea/battlefield-6-bug-reports-en/official-servers-they-never-get-filled-with-bots/12837610
- Bots de Discord pour Werewolf : « AI bot players that fill empty seats and bluff » (fiche top.gg, non vérifiée). https://top.gg/bot/1519070490390560930
- Un développeur de Mafia/Werewolf numérique craint que des bots en parties publiques heurtent la nature sociale du jeu (cité dans les résultats de recherche, source d'origine non ouverte).
- Werewolf Party (Steam) : la faible population est un grief récurrent, certains joueurs ne trouvent pas de partie. https://vaporlens.app/app/2920510/werewolf_party

**Ajuster le nombre d'IA : ce qui existe de comparable**
- Human or Not (AI21, 2023) : chaque conversation de 2 minutes est avec un humain ou un bot, au choix du système ; plus de 15 millions de conversations, plus de 2 millions de participants selon le billet AI21 (le communiqué de presse annonce 10 millions et 1,5 million). https://www.ai21.com/blog/human-or-not-results et https://prnewswire.com/news-releases/ai21-labs-human-or-not-the-largest-turing-test-to-date-finds-that-32-of-people-cant-tell-the-difference-between-a-human-and-ai-301838505.html . C'est un 1 contre 1 : le ratio humain/bot n'y est pas documenté.
- Aucun jeu de groupe de déduction avec plusieurs IA cachées dont le nombre s'adapte aux humains présents n'a été trouvé. Étudier DoppelBot (chat et vote contre des « doubles » LLM de joueurs, collégiens, rondes de chat de 100 secondes) : https://arxiv.org/pdf/2608.30948 (texte du PDF illisible par l'outil, seuls titre et résumé de format connus).

**Mode solo d'entraînement**
- Chess.com : bots nommés avec personnalités, ouverts aux débutants comme étape avant le classé. Aucune donnée de rétention trouvée ; le bénéfice est anecdotique. https://www.chess.com/blog/Chessable/train-against-bots-the-highly-requested-feature-is-here

**Étalement de la croissance et rôle de la population**
- Among Us est sorti en 2018 avec environ 30 à 50 joueurs simultanés, a failli être abandonné plusieurs fois, a trouvé son premier public en Corée (50 % des ventes Steam d'après le développeur) puis a explosé en 2020. https://gameworldobserver.com/2020/12/01/among-us et https://globalgamesforum.com/features/the-long-and-winding-road-to-success-for-among-us
- Town of Salem : pic Steam de 3 787 simultanés en janvier 2018, environ 100 à 170 aujourd'hui ; Wolvesville : pic Steam de 308 (captures de trackers, chiffres Steam seuls, mobile exclu). https://steamdb.info/app/334230/charts et https://tracker.gg/population/steam/2502760 . Lecture : les jeux de déduction en ligne vivent avec de petites populations ; ce n'est pas une preuve de ce qui les fait survivre.

### 1.2 Boucles de retour

**Partage de résultat à la Wordle**
- La grille d'emoji vient d'une joueuse néo-zélandaise qui la tapait à la main ; Wardle l'a intégrée. Elle raconte le chemin de la partie, sans spoiler de la réponse, sans lien (« ça rendrait la grille moche »). Wordle : une partie par jour, trois minutes, pas de monétisation. https://gamedeveloper.com/gdc2022/josh-wardle-reflects-on-the-the-unconventional-road-to-wordle-s-success et https://syntax.fm/show/430/creator-of-wordle-josh-wardle/transcript
- Chiffres : environ 90 joueurs le 1er novembre 2021, plus de 300 000 au 2 janvier 2022, environ 2 millions mi-janvier ; 1,2 million de résultats partagés sur Twitter entre le 1er et le 13 janvier. https://en.wikipedia.org/wiki/Wordle et https://siliconrepublic.com/?p=957516 (la croissance coïncide avec la grille ; la cause n'est pas prouvée, le jeu est resté six mois à deux joueurs avant, selon l'article GDC).

**Séries et habitudes**
- Duolingo : la série (streak) est présentée comme levier central ; un utilisateur à 10 jours de série décroche moins ; Streak Freeze aurait réduit de 21 % l'abandon des utilisateurs à risque. Sources secondaires et blogs, non vérifiées sur la source primaire. https://www.businessofapps.com/news/duolingos-streak-feature-drives-record-17-million-daus et https://lazyweb.com/research/duolingo-streak-goals-retention
- NYT Games : aucun chiffre de rétention publié trouvé (les pages trouvées sont du contenu d'agrégation). Non sourcé.

**Rangs, saisons, profils, succès, codes d'amis**
- Aucune donnée solide de rétention pour un jeu de déduction sociale trouvée. Pénalités et classements : voir §1.5 (Riot, FACEIT). Le reste de ce volet = non sourcé.

**Rejouer avec le même groupe**
- Death by AI : plus de 70 % des sessions avec plus de 3 amis (voir 1.1) ; le groupe est l'unité de retour. Jackbox : mises à jour de valeurs par configuration distante au lancement, sans nouveau build (https://jackboxgames.com/blog/behind-the-scenes-of-pp10-engineering) ; réglage de 5 % d'une valeur de score a relevé le taux de survie d'un jeu, mesuré par télémétrie (même source). Utile pour calibrer sans redéployer.

### 1.3 Streamers et public

- Jackbox, audience : jusqu'à 10 000 spectateurs jouent de concert avec les joueurs ; options « Require Twitch » (connexion Twitch obligatoire, pseudo = nom Twitch, plus d'anonymat) ; limite de joueurs qui renvoie le surplus vers l'audience ; Audience Kit : extension Twitch pour rejoindre sans quitter la plateforme. Dans Poll Mine, l'audience vote comme un seul groupe. https://www.jackboxgames.com/streaming-moderation-accessibility-features-jackbox-party-pack-eight/ , https://jackboxgames.com/the-jackbox-party-pack-5-streamers-guide/ , https://support.jackboxgames.com/hc/en-us/articles/15794775761047-How-do-I-use-the-Audience-Kit-extension-for-Twitch , https://www-origin.jackboxgames.com/blog/fun-party-games-for-large-groups
- Intention de design côté audience (interview développeur Party Pack 11) : choix simples à des moments clés (égalités), jamais d'interférence avec les joueurs. https://lootlevelchill.com/?p=8040
- Among Us 2020 : démarrage par des streamers coréens et brésiliens ; moment Sodapoppin mi-juillet ; streamers qui invitent d'autres streamers ; 221,38 millions d'heures vues sur Twitch au dernier trimestre 2020 ; jeu stable et complet à l'arrivée du public. https://www.cnbc.com/2020/10/14/how-among-us-became-a-mega-hit-thanks-to-amazon-twitch.html , https://www.globalgamesforum.com/ctv/the-long-and-winding-road-to-success-for-among-us , https://streamscharts.com/news/phenomena-2020-among-us
- Ce qui rend un jeu de déduction regardable (inférence tirée des mêmes sources) : rôle caché, parties courtes (moins de 15 minutes), commentaire et accusations parlées.

### 1.4 Les IA qui imitent des humains (comparables directs)

- Human or Not : 68 % de réponses justes au total ; 73 % contre un humain, 60 % contre un bot ; France 71,3 % (meilleure parmi les pays principaux), Inde 63,5 %. Les bots étaient entraînés à faire des fautes de frappe et à utiliser de l'argot, pouvaient répondre sur des questions personnelles et connaissaient l'actualité. https://www.ai21.com/blog/human-or-not-results
- Stratégies de détection observées : fautes (peu fiable, les bots en font), questions personnelles, actualité et météo, questions philosophiques ou politiques, politesse excessive jugée suspecte, demandes interdites, « ignore all previous instructions », astuces au niveau des lettres (épeler à l'envers), et humains qui imitent des bots (« As an AI language model »). Même source.
- Mafia LLM : sur 35 parties de GPT-4o contre 28 parties humaines, un détecteur identifie moins bien les mafieux LLM que les mafieux humains : « LLMs blend in better ». https://www.alphaxiv.org/abs/2601.13709
- Avalon et Secret Hitler : les LLM jouent mal en rôle adverse et révèlent souvent des informations cachées (benchmarks). https://arxiv.org/pdf/2310.05036 . Résultats mitigés selon les papiers : à vérifier avant d'en tirer un choix de prompt.
- Étude jeune public (collégiens) : détection d'imposteurs LLM, stratégies non lues. https://arxiv.org/pdf/2608.30948
- Copier-coller ChatGPT par un humain pour imiter une IA, ou latence/frappe comme indice : aucune source trouvée. Non sourcé.

### 1.5 Robustesse technique

**Reconnexion**
- Socket.IO a une fonction connectionStateRecovery : l'identifiant de session et un offset sont renvoyés par le client ; `maxDisconnectionDuration` à borner ; non garantie, il faut toujours resynchroniser l'état ; adaptateur Redis classique non supporté ; Postgres en cours de travail. https://socket.io/docs/v4/connection-state-recovery
- iOS Safari : sockets coupés en arrière-plan ; `visibilitychange` ne se déclenche pas toujours ; en février 2026 un bug WebKit documente `new WebSocket()` bloqué en CONNECTING après reprise (Safari 26.3), contourné par détection de dérive de minuterie et rechargement. https://bugs.webkit.org/show_bug.cgi?id=308073 , https://bugs.webkit.org/show_bug.cgi?id=207256 , https://developer.apple.com/forums/thread/696310 , https://www.github.com/socketio/socket.io/issues/2924
- Pause de jeu en cas de coupure : Jackbox met en pause la chanson et refait le décompte (Dodo Re Mi) ; latence : attente supplémentaire en fin de manche pour les retardataires. https://jackboxgames.com/blog/behind-the-scenes-of-pp10-engineering

**Joueurs inactifs ou partis**
- League of Legends : paliers de pénalités pour AFK, réduction de la perte de points si un coéquipier est AFK. https://www.leagueoflegends.com/en-au/news/dev/dev-tackling-afks/
- FACEIT : drapeau « leaver » seulement au-delà de 5 minutes cumulées de déconnexion. https://support.faceit.com/hc/en-us/articles/20413035342108-AFK-Leaver-noShow-Bans-Elo-FAQ
- Overwatch, annulation de la partie si départ très tôt (message de forum, règle exacte de Blizzard non sourcée). https://us.forums.blizzard.com/en/overwatch/t/why-i-could-never-make-it-to-masters/137146

**Anti-triche et collusion**
- Among Us 2020 : collusion par Discord (voix hors jeu), spam et piratage en lobbies publics, annonce de comptes individuels et de signalement ; recommandation de jouer en privé avec des gens de confiance. https://www.techradar.com/news/cheaters-have-arrived-on-among-us-and-devs-will-fight-back-with-individual-accounts , https://www.pcgamer.com/of-course-there-are-already-among-us-cheaters , https://www.gamingbible.com/news/games-among-us-is-going-to-let-you-report-toxic-crewmates-20201106
- Death by AI : un contournement signalé par interception de requêtes réseau (résumé vidéo, non vérifié). https://sozai.app/transcript/cheating-hacking-discord-activity-broken/ . Leçon : état et validation côté serveur.
- Jackbox : options de masquer le code de salle et d'exiger Twitch. https://www.jackboxgames.com/streaming-moderation-accessibility-features-jackbox-party-pack-eight/

## 2. Tableau des fonctionnalités

| fonctionnalité | vue où | ce qu'elle fait | pourquoi ça marche (preuve) | pertinence 1-3 | coût | risque |
|---|---|---|---|---|---|---|
| Salon privé par code et lien, sans install | Jackbox https://www.thumbsticks.com/how-lockdown-opened-up-jackbox-party-to-a-massive-new-audience/ ; skribbl.io https://progameguides.com/skribbl/what-is-skribbl-io-how-to-play-it | Un hôte crée, les autres rejoignent par code | Jackbox : 110 M de joueurs de mars à juin 2020, join dans le navigateur | 3 | S | Code deviné par des inconnus (Among Us 2020, spam) |
| Taille variable : N humains + IA complètent jusqu'à 8 | aucun comparable de groupe trouvé ; Human or Not mélange humains et bots en 1 contre 1 https://www.ai21.com/blog/human-or-not-results | Lance à 3-5 humains, le nombre d'IA s'ajuste | Pas de preuve directe ; Bloodhunt remplit après 8 min https://bloodhunt.com/news/upcoming-changes-to-the-trios-matchmaker | 3 | M | Si peu d'humains, la déduction perd son sens (inférence) ; à tester |
| Backfill différé (attendre X minutes avant d'ajouter des bots) | Bloodhunt https://bloodhunt.com/news/upcoming-changes-to-the-trios-matchmaker | Attente puis remplissage | Pratique d'éditeur ; pas de mesure d'effet | 2 | S | Bots jamais remplacés : plainte EA https://forums.ea.com/idea/battlefield-6-bug-reports-en/official-servers-they-never-get-filled-with-bots/12837610 |
| Lancement dans Discord Activity | Death by AI https://discord.com/build-case-studies/playroom | Le jeu se lance depuis un salon vocal/texte, la session devient la salle | 70 % de sessions à plus de 3 amis ; 30 % J7 (éditeur) | 3 | M-L | Dépendance Discord, proxy, revue d'app |
| Grille de résultat partageable sans spoiler | Wordle https://gamedeveloper.com/gdc2022/josh-wardle-reflects-on-the-the-unconventional-road-to-wordle-s-success | Texte copiable : parcours de la partie sans révéler la réponse | 90 à 300 000 joueurs de nov. à janv. ; 1,2 M de partages en 13 jours (corrélation) | 3 | S | Spoiler d'un rôle caché ; à concevoir |
| Défi quotidien (même partie pour tous) | Wordle (une partie par jour) https://gamedeveloper.com/gdc2022/josh-wardle-reflects-on-the-the-unconventional-road-to-wordle-s-success | Une seule partie par jour, comparable entre joueurs | Wardle : la contrainte a créé la conversation | 1 | M | Incompatible avec 5 humains simultanés ; à adapter en mode solo |
| Mode audience / spectateur | Jackbox https://www-origin.jackboxgames.com/blog/fun-party-games-for-large-groups | Spectateurs votent à des moments précis | Jusqu'à 10 000 spectateurs ; Jackbox cite les streamers | 2 | L | Spectateurs qui divulguent les rôles (inférence) |
| Intégration Twitch / streamer-friendly | Jackbox Audience Kit https://support.jackboxgames.com/hc/en-us/articles/15794775761047-How-do-I-use-the-Audience-Kit-extension-for-Twitch | Rejoindre depuis Twitch, pseudo = Twitch | Among Us : 221 M d'heures vues au T4 2020 | 2 | L | Streamers absents : rien ne démarre |
| Mode solo d'entraînement | Chess.com https://www.chess.com/blog/Chessable/train-against-bots-the-highly-requested-feature-is-here | Jouer contre des bots hors ligne | Pas de mesure de rétention trouvée ; Human or Not : 2 M de participants en 1 contre 1 | 2 | M | Coût LLM par partie |
| Parties programmées + notification | LFG Hub https://top.gg/bot/1163043953273217044 ; HQ Trivia (contre-exemple) https://productmint.com/what-happened-to-hq-trivia/ | Créneau annoncé, ping Discord | Aucune donnée indépendante de rétention | 2 | S-M | Créneau raté = salle vide |
| Reconnexion / reprise de session | Socket.IO https://socket.io/docs/v4/connection-state-recovery | Reprendre sa place et les messages manqués | Documentation officielle, non garantie | 3 | M | iOS Safari : https://bugs.webkit.org/show_bug.cgi?id=308073 |
| Gestion des absents (pénalité, pause, remplacement) | League of Legends https://www.leagueoflegends.com/en-au/news/dev/dev-tackling-afks/ ; FACEIT https://support.faceit.com/hc/en-us/articles/20413035342108-AFK-Leaver-noShow-Bans-Elo-FAQ | Paliers de sanction, tolérance de coupure | Choix d'éditeurs, pas de mesure publiée | 3 | M | Pénaliser une coupure réseau |
| Série (streak) et stats | Duolingo https://lazyweb.com/research/duolingo-streak-goals-retention | Compteur de jours consécutifs | Chiffres secondaires non vérifiés | 1 | S | Pression sans jeu quotidien |
| Revanche avec le même groupe | Death by AI https://discord.com/build-case-studies/playroom | Même salle, nouvelle partie | 70 % de sessions de groupe (éditeur) | 3 | S | Fatigue, mêmes IA reconnues |
| Config distante des paramètres de jeu | Jackbox https://jackboxgames.com/blog/behind-the-scenes-of-pp10-engineering | Régler des valeurs sans redéployer | Réglage de 5 % a relevé la survie dans un jeu | 2 | S | Changement non tracé |
| Validation côté serveur | Death by AI https://sozai.app/transcript/cheating-hacking-discord-activity-broken/ | Le serveur seul décide | Contournement réseau rapporté | 3 | S-M | Source non vérifiée |
| Code de salle masqué / identité vérifiée | Jackbox https://www.jackboxgames.com/streaming-moderation-accessibility-features-jackbox-party-pack-eight/ | Limite les intrus | Fonction livrée, effet non chiffré | 2 | S | Friction à l'entrée |

## 3. Anti-patterns

1. **Salle vide en public.** Population trop faible pour 5 humains simultanés : Werewolf Party (Steam) https://vaporlens.app/app/2920510/werewolf_party ; Town of Salem à environ 100 à 170 simultanés aujourd'hui https://steamdb.info/app/334230/charts . Remède : privé d'abord.
2. **Bots qui ne partent jamais ou qui rendent la partie creuse.** Plaintes EA https://forums.ea.com/idea/battlefield-6-bug-reports-en/official-servers-they-never-get-filled-with-bots/12837610. Pour Turingarou : si la partie révèle trop vite combien d'IA il y a, elle perd son enjeu (inférence).
3. **Crash sous pic et promesse diluée.** HQ Trivia : plantages, prix dilués, retrait de l'argent, fermeture en 2020 https://productmint.com/what-happened-to-hq-trivia/ .
4. **Public sans modération ni identité.** Among Us 2020 : spam et piratage de lobbies publics https://www.techradar.com/news/cheaters-have-arrived-on-among-us-and-devs-will-fight-back-with-individual-accounts .
5. **Collusion hors jeu.** Discord vocal pendant la partie : Among Us https://www.pcgamer.com/of-course-there-are-already-among-us-cheaters . Aucun remède propre : le temps réel ne l'empêche pas.
6. **Sanctionner une coupure involontaire.** Marvel Rivals ne distingue pas bug et départ voulu https://www.gfinityesports.com/article/marvel-rivals-how-does-the-penalty-system-work ; FACEIT tolère 5 minutes cumulées.
7. **Dépendance à une seule audience.** Among Us a dépendu de 50 % de ventes coréennes pour démarrer https://globalgamesforum.com/features/the-long-and-winding-road-to-success-for-among-us (observation, pas règle).
8. **Timeline d'indices trop faibles.** Des fautes de frappe volontaires des bots ne départagent plus rien (Human or Not : les bots en faisaient) https://www.ai21.com/blog/human-or-not-results . Si les IA de Turingarou reprennent ce truc, il devient un faux indice.
9. **Lien partagé qui gâche le plaisir.** Wardle refuse l'URL dans le partage (grille « moche ») : un partage chargé fait fuir https://gamedeveloper.com/gdc2022/josh-wardle-reflects-on-the-the-unconventional-road-to-wordle-s-success .

## 4. Top 10 pour Turingarou

1. **Salon privé à code et lien, sans compte ni install** : c'est la seule voie prouvée (Jackbox, skribbl.io) pour réunir un groupe sans population publique.
2. **Taille de partie variable (3 à 5 humains, IA complétant jusqu'à 8)** : lève le goulot des 5 humains ; aucun comparable direct, donc à prototyper avec un mini-test de 10 parties avant de s'y engager.
3. **Reconnexion et reprise de session sur mobile** (session token, `connectionStateRecovery` borné, détection de dérive de minuterie, rechargement en secours) : iOS Safari casse les WebSockets en arrière-plan.
4. **Règle claire pour les absents** (pause courte, puis une IA reprend la place, tolérance de 5 minutes cumulées comme FACEIT) : évite la partie bloquée sans punir la coupure réseau.
5. **Partage de résultat sans spoiler** (grille manche par manche : qui a voté juste, combien d'IA trouvées) : le seul ressort viral chiffré de la liste (Wordle).
6. **Revanche d'un clic avec le même groupe** : le groupe est l'unité de retour (70 % de sessions à plus de 3 amis pour Death by AI).
7. **Discord Activity** (puis Embedded App SDK) : le groupe y est déjà, la session fait la salle ; coût plus lourd, à lancer après 1-6.
8. **Mode solo ou duo d'entraînement contre IA** (à la Human or Not) : onboarding et amorçage de l'envie, sans exiger 5 humains ; vérifier le coût LLM.
9. **Parties annoncées avec notification** (créneau + ping Discord ou web push) : ne faire que si un public existe ; HQ Trivia montre le risque de rendez-vous manqué.
10. **Validation côté serveur et durcissement anti-triche** (code de salle masqué, rôle jamais envoyé au client, détection de collage de texte) : indispensable avant tout public ou streamer ; aucune source trouvée sur le copier-coller, donc à instrumenter soi-même.

Lacunes non comblées : mécanique exacte des salons Codenames et Gartic Phone, effet mesuré des classements/ELO sur les jeux de déduction, rétention NYT Games, détection du copier-coller ChatGPT, détection de bots en Among Us. À creuser avec des sources primaires (GDC Vault, interviews développeur, Reddit) si l'une de ces pistes devient prioritaire.
