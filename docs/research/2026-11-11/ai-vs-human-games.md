# Jeux et produits « humain ou IA ? » : état de l'art pour Turingarou

Date : 2026-11-11. Recherche web uniquement (environ 40 lectures/recherches). Un chiffre sans URL est marqué « non sourcé ». Les blogs de humanornot.so sont du contenu promotionnel du site lui-même : à lire avec prudence.

Constat d'ensemble : aucun produit grand public trouvé ne fait exactement Turingarou (5 humains + 3 IA cachées, chat libre, vote d'élimination, manches, voix TTS). Les plus proches sont des prototypes indie (The4thMind, Among Liars, Turing Heads sur Steam). Les gros succès d'audience (Human or Not) sont en 1 contre 1, sans vote de groupe. Le seul problème que les petits jeux de groupe citent est le même que celui de Turingarou : trouver assez de joueurs simultanés.

## 1. Fiches produit

### 1.1 Human or Not (AI21 Labs, 2023)
- Mécanique : chat anonyme de 2 minutes avec un humain ou un bot, puis vote Humain/IA. Tour à tour strict (pas deux messages d'affilée), 100 caractères max par message, 20 s pour écrire, 4-5 messages par côté. Sans inscription, parties illimitées. Source : https://ar5iv.labs.arxiv.org/html/2305.20010
- Score : aucun classement ; seul retour = compteur de bonnes réponses sur parties jouées. Le joueur ne saura pas comment l'autre humain l'a jugé (pour ne pas pousser à imiter un bot). Même source.
- Bots : persona (nom, âge, métier, lieu, traits), contexte temps réel (date, météo, actus, tweets), styles variés (fautes volontaires, minuscules, argot), délais de frappe, certains quittent le chat « vexés » ; modèles Jurassic-2, GPT-4, Cohere. Même source.
- Résultats : 68 % de bonnes réponses ; 60 % face à un bot, 73 % face à un humain. Même source. Nombre de joueurs : plus de 1,5 million (étude : https://ar5iv.labs.arxiv.org/html/2305.20010) ; 15 millions de conversations selon https://knowyourmeme.com/memes/sites/human-or-not-social-turing-game ; les sources divergent.
- Fermeture : expérience limitée du 7 mai au 28 juin 2023, prévue pour se terminer (https://knowyourmeme.com/memes/sites/human-or-not-social-turing-game). Pas d'annonce d'échec : fin de projet de recherche.
- Boucle virale : vidéos TikTok (7,8 M de vues pour une vidéo, 2,4 M pour une autre), captures d'écran sur X (77 000 likes pour un post sur une mauvaise réponse). Même source KYM.
- Ce que les joueurs disent : confusion entre humains trollant et IA qui bugue (Amos Meron, créateur : « there's just humans being humans »), imitation de bots par des humains très répandue (paper). Comparé à Omegle.

### 1.2 Human or Not (version Humans & AI Inc.) et humanornot.so
- Reprise « durable » de décembre 2023 par Humans & AI Inc., nouvelles illustrations, sans date de fin ; les créateurs prévoient de passer de 2 à 5 minutes (comme Turing). Source : https://knowyourmeme.com/memes/sites/human-or-not-social-turing-game
- Mécanique : 2 min de chat, vote Human/AI, révélation avec étiquette « Bot ». Source (blog du site, promotionnel) : https://humanornot.so/blog/why-human-or-not-game-addictive
- humanornot.so : site tiers, lancé sur Product Hunt le 22 février 2024 (https://hunted.space/product/humanornot-so-a-turing-test-game/launches/humanornot-so), bots présentés comme faits avec GPT-4o/Claude/Gemini (non confirmé, https://humanornot.so/blog/is-human-or-not-playable-2026).
- Audience : r/humanornot environ 600 abonnés en mai 2024 (KYM). Pas d'autres chiffres : non sourcé.
- Rétention revendiquée (blog du site, non mesurée) : parties de 2 min, bots variés, mauvaise réponse = histoire à raconter.

### 1.3 Jones et Bergen, turingtest.live (UC San Diego, 2023-2025)
- Test de Turing public à trois parties en ligne (interrogateur, humain, IA). GPT-4 : 49,7 % de parties jugées humaines (meilleur prompt), ELIZA 22 %, GPT-3.5 20 %, humains 66 %. Source : https://arxiv.org/html/2310.20216v2 ; suite avec GPT-4.5 : https://arxiv.org/html/2503.23674
- Intérêt : preuve que le prompt compte plus que le modèle ; format 5 min avec deux interlocuteurs en parallèle (interrogateur voit l'humain et l'IA côte à côte).

### 1.4 The Turing Game (Lewandowski et al., NeurIPS 2024 workshop)
- 2 humains + 1 chatbot LLM ; les humains cherchent la machine, le bot cherche à passer pour humain. Lancement public à l'Ars Electronica en septembre 2024, expérience toujours en cours ; pas de chiffres de participants. Source : https://mlanthology.org/neuripsw/2024/lewandowski2024neuripsw-turing

### 1.5 The4thMind (indie, navigateur)
- 4 joueurs, 1 IA cachée ; chat limité dans le temps, questions, défense, puis vote ; mode Duel 1 contre 1 entre humains. Source : https://www.producthunt.com/p/the4thmind/the4thmind
- Le créateur dit s'être inspiré de Human or Not et que son plus gros problème est d'attirer assez de joueurs. Lancement : 2 upvotes, 2 commentaires (tous des créateurs). Même source. C'est l'analogue le plus proche de Turingarou, et son mode Duel est une réponse à la pénurie de joueurs.

### 1.6 Among Liars (jam, dev.to)
- 6 humains + 1 IA (Gemini) cachée du côté Espions. 3 Détectives vs 3 Espions humains. Manche : échauffement 2 min, question 90 s, réponses 45 s, lecture finale 30 s ; un Détective choisit la carte de réponse qu'il croit être l'IA. Mauvais choix = Détective éliminé ; bon choix = un Espion humain éliminé. Noms de couverture changés à chaque manche. Source : https://dev.to/mirshah12/among-liars-the-7th-player-isnt-human-345h
- Leçons de l'auteur (non mesurées) : réponses trop lisses suspectes, mais faux « humain » aussi ; bonnes questions = texture sensorielle/émotionnelle plutôt que faits ; l'IA est ambiguë car un Espion humain peut protéger l'IA.

### 1.7 The Imitation Game / Eyefold-Nightfall (dev.to, concours)
- Eyefold : chat libre avec une IA cachée (« Quanbit ») ; Nightfall : rounds de discussion, accusations, vote, l'IA peut voter via un outil `voteAgainst`. Joueurs identifiés par les 2 derniers caractères de leur ID. Source : https://dev.to/quantumweb/the-imitation-game-most-people-think-they-can-spot-an-ai-are-you-sure-3h4b
- Leçons de l'auteur : une IA qui répond à tout message se repère ; le silence la rend plus humaine ; des fautes crédibles sont plus dur à produire que de l'intelligence ; appels IA en tâches de fond (BullMQ/Redis) pour les délais. Pas de chiffres.

### 1.8 Turing Heads (Steam)
- Jeu de soirée : tout le monde répond à la même consigne, on lit les réponses, on devine qui est humain/IA ; vote majoritaire final. 3 à 8 joueurs + 1 IA cachée ; l'IA apprend des réponses de vrais joueurs ; spectateurs Twitch peuvent voter. Source : https://store.steampowered.com/app/4998270/ (date de sortie affichée : 13 août 2026 ; une recherche a montré 10 août 2026, incohérent). Aucun avis utilisateur à la lecture.

### 1.9 AmongAI (Dentro, Product Hunt, 12 nov. 2025) : « reverse Turing test »
- Tu es l'humain unique parmi plusieurs IA ; chaque manche tu chats, les IA votent qui est l'humain, tu gagnes en survivant. Classement des IA par capacité à trouver l'humain. Source : https://www.producthunt.com/products/amongai/reviews
- Audience : 19 upvotes, 31 abonnés, aucun avis. Même source. Règles de manche/score non décrites.

### 1.10 Among Humans (hackathon, Product Hunt, mai 2025)
- Un joueur est secrètement une IA imposteur, chaque joueur écrit un prompt qui façonne l'IA ; salle privée entre amis. 3 upvotes, 1 commentaire (créateur). Source : https://www.producthunt.com/products/amonghumans

### 1.11 PretendAI et Reverse Turing Test (jeu inversé)
- Tu joues l'IA face à un humain simulé ; un 3e IA note sur 8 critères (utilité, structure, hallucination, etc.) ; 5 min ; 4 modes (Classic, Interview, Chaos, Jailbreak) ; carte de score partageable et classement mondial. Source : https://dev.to/mkishoredev/i-built-a-reverse-turing-test-can-humans-convince-ai-that-theyre-ai-3737
- Constat : les humains qui imitent l'IA sonnent moins « IA » que les vrais modèles (retirent émotion, formalisent). Même source. Cohérent avec le paper AI21.

### 1.12 Surfshark « Bot or Not » (2025-2026)
- Simulation de fil de commentaires : 120 s pour repérer 10 commentaires de bots sur 4 sujets. 710 participants à l'UNFOLD Milan Design Week ; 53 % gagnent ; détection moyenne 58 %, précision 66 % ; 71 % de détection sur un sujet neutre (data centers), 49 % sur un sujet émotionnel (droits des femmes) ; public sur botornot.one depuis le 1er juin 2026. Source : https://ppc.land/half-of-users-cant-spot-ai-bots-surfsharks-game-reveals-why/
- Deux scores (détection et précision) : sépare « j'ai trouvé les bots » de « j'ai accusé à tort ».

### 1.13 Jeux Werewolf/Mafia avec LLM
- Wolfcha (open source) : 1 humain + joueurs LLM, 8-12 sièges, rôles multiples (Seer, Witch, Hunter...), voix IA optionnelle, mode spectateur, style rétro, animations clignement jour/nuit et lip-sync. 746 étoiles GitHub. Multijoueur et chat libre uniquement en feuille de route. Source : https://github.com/oil-oil/wolfcha. Ici l'IA n'est pas cachée.
- LLM Mafia Game Competition : 8 LLM jouent Mafia entre eux, historiques publiés, classement de victoires par modèle (Claude 3.7 Sonnet extended en tête, 57,78 % sur 45 parties). Source : https://gigazine.net/news/20250310-llm-mafia-game-competition
- Turing Games : plus d'une douzaine d'IA jouent Mafia/Among Us en direct sur Twitch/YouTube, « des millions de vues » (pas de chiffre précis), séances de « thérapie » entre IA, forte communauté de fans. Source : https://www.tubefilter.com/2026/03/02/turing-games-generative-ai-llm-social-deduction-mafia/
- Bot Discord Werewolf : IA qui remplit les sièges vides et bluffe ; 356 serveurs, 15 avis 5 étoiles (listing). Sources : https://discordbotlist.com/bots/werewolf-2503 et https://top.gg/bot/1510711904543182970
- Recherche : un détecteur GPT-4-Turbo retrouve les mafieux LLM moins bien que les mafieux humains (single-match 52,27 % contre 58,62 %) ; aucun indice fiable relevé. Source : https://www.alphaxiv.org/abs/2601.13709.md

### 1.14 Produits secondaires (moins pertinents)
- Captcha Kills (Steam, 2022) : battle royale où l'on se fait passer pour une IA, 11 avis, 72 % positifs. https://store.steampowered.com/app/1964800
- Imitation (Steam, 2024) : jeu solo, 150 paires question/réponse, 4,99 EUR, 1 avis. https://store.steampowered.com/app/3054760
- AlibAi (Steam, 2024) : solo, tueur caché parmi des PNJ IA, 65 % positif sur 20 avis, dernière mise à jour il y a plus de 24 mois. https://store.steampowered.com/app/3325660/AlibAi
- Bot Buster (jeu de cartes) : un seul joueur utilise vraiment une IA, le juge doit trouver ; 5 bonnes réponses pour gagner. https://news.northeastern.edu/2025/03/04/can-you-identify-ai
- I'm Not a Human (jeu de plateau, 3-8 joueurs) : un humain parmi des robots qui connaissent la bonne image. https://hobbyworldint.com/portfolio-item/i-am-not-a-human/
- Bot or Not (Foreign Objects, 2020) : 3 min, joueur trouve le bot facilement. https://www.sophos.com/en-us/blog/bot-or-not-a-game-to-train-us-to-spot-chatbots-faking-it-as-humans

## 2. Fonctionnalités repérées

| fonctionnalité | vue où | ce qu'elle fait | pourquoi ça marche (preuve) | pertinence 1-3 | coût | risque |
|---|---|---|---|---|---|---|
| Partie courte et chronométrée (2 min) | Human or Not, https://ar5iv.labs.arxiv.org/html/2305.20010 | Limite le chat, force le vote | A porté 1,5 M de joueurs ; faible engagement par partie | 2 | S | Peu de signal pour juger ; limite aussi les contenus profonds |
| Réplique limitée en taille et en temps (100 car., 20 s) | Human or Not, même source | Rend tout joueur lisible et rapide | Limite les pavés qui trahissent l'IA, homogénéise | 3 | S | Frustre les joueurs bavards |
| Tour à tour strict | Human or Not, même source | Pas deux messages d'affilée | Évite le spam, donne un rythme | 1 | S | Inadapté à un chat de groupe libre |
| Délais de frappe + départs « vexés » | Human or Not, même source | Imite la frappe, une IA quitte le chat | Les IA les plus crédibles ; modèles divers | 3 | S | Si un humain n'a jamais ces comportements, ça devient un tell |
| Persona + contexte temps réel (météo, actus, tweets) | Human or Not, même source | IA avec backstory et actu du jour | Bots à 60 % de détection seulement | 3 | M | Coût d'API/RAG ; contexte faux = tell |
| Pairs/trio : IA peut se taire | The Imitation Game, https://dev.to/quantumweb/the-imitation-game-most-people-think-they-can-spot-an-ai-are-you-sure-3h4b | L'IA choisit de ne pas répondre | Auteur : répondre à tout = repérable (non mesuré) | 3 | S | Une IA muette ne participe pas |
| Révélation « Bot » après vote | Human or Not blog, https://humanornot.so/blog/why-human-or-not-game-addictive | Moment de surprise, histoire à partager | Vidéos TikTok virales sur les mauvaises réponses (KYM) | 3 | S | Aucun si la fin de manche existe déjà |
| Ne pas montrer à l'humain comment il a été jugé | Human or Not, paper | Évite qu'on joue au bot | Les joueurs imitant l'IA étaient jugés humains à 75,3 % : ça ne marche pas, mais incite au trolling | 2 | S | Frustration (« pourquoi ai-je perdu ? ») |
| Noms de couverture changés à chaque manche | Among Liars, https://dev.to/mirshah12/among-liars-the-7th-player-isnt-human-345h | Empêche de suivre une identité | Oblige à juger le contenu, pas le pseudo | 3 | S | Perte de continuité, plus dur pour les voix TTS |
| Question « texture » (sensoriel, émotionnel, social) | Among Liars, même source | Question à un joueur ; réponses affichées en cartes | Auteur : fait ressortir les différences (non mesuré) | 3 | S | Une même question à tous = style des IA devient comparable |
| Réponses anonymes en cartes puis choix d'une | Among Liars, Turing Heads, https://store.steampowered.com/app/4998270/ | Lit toutes les réponses d'une même consigne, vote | Évite l'ordre d'arrivée comme indice | 3 | M | Proche de la phase « question » de Turingarou : déjà couvert |
| Mode Duel 1 contre 1 quand peu de joueurs | The4thMind, https://www.producthunt.com/p/the4thmind/the4thmind | Rempli quand la table n'est pas pleine | Le créateur nomme le manque de joueurs comme problème n°1 | 3 | M | Dilue le jeu ; deux modes à maintenir |
| Remplir les sièges vides par des bots (annoncés) | Bot Discord Werewolf, https://top.gg/bot/1510711904543182970 | Une partie démarre sans attendre | 356 serveurs, 5 étoiles (15 avis) | 3 | S | Trahit le principe « 5 humains » si non annoncé ; ici bots annoncés |
| IA qui apprend des réponses de vrais joueurs | Turing Heads, Steam | Style tiré des joueurs | Idée déjà dans Turingarou | 3 | M | Données personnelles, modération |
| Spectateurs qui votent/jugent | Turing Heads (Twitch), Turing Games, https://www.tubefilter.com/2026/03/02/turing-games-generative-ai-llm-social-deduction-mafia/ | Public externe voit et vote | « Millions de vues » sur Turing Games (non précisé) | 2 | L | Spectateur voit l'état caché si mal isolé |
| Double score : détection et précision | Surfshark Bot or Not, https://ppc.land/half-of-users-cant-spot-ai-bots-surfsharks-game-reveals-why/ | Sépare « bots trouvés » et « fausses accusations » | Données utiles (58 % / 66 %) | 3 | S | Aucun |
| Carte de score partageable + classement | PretendAI, https://dev.to/mkishoredev/i-built-a-reverse-turing-test-can-humans-convince-ai-that-theyre-ai-3737 | Image à partager, rang mondial | Mécanisme viral standard ; pas de preuve d'impact chiffrée | 2 | S | Peu d'effet avec peu de joueurs |
| Classement des modèles qui trouvent l'humain | AmongAI, https://www.producthunt.com/products/amongai/reviews | Rend les IA elles-mêmes compétitives | 19 upvotes seulement, preuve faible | 1 | M | Hors sujet |
| Historiques de parties publiés/rejouables | LLM Mafia Competition, https://gigazine.net/news/20250310-llm-mafia-game-competition | Lecture après coup | Contenu pour curieux et médias | 2 | S | Doit être anonymisé |
| Voix disguisées pour tous | Captcha Kills, https://store.steampowered.com/app/1964800 | Voix modifiées pour cacher qui est humain | 72 % positif sur 11 avis (faible échantillon) | 3 | M | Déjà dans Turingarou (TTS) |
| Animations jour/nuit, lip-sync, style rétro | Wolfcha, https://github.com/oil-oil/wolfcha | Identité visuelle forte | 746 étoiles | 1 | M | Charge mobile, hors cœur |
| Page « comment repérer » éducative | humanornot.so blog | Contenu SEO | Source promotionnelle, pas de preuve | 1 | S | Apprend à tricher |
| Replay d'un même seul compteur « bonnes réponses / parties » | Human or Not, paper | Mesure personnelle simple | A suffi sans classement | 3 | S | Aucun |
| Joueurs identifiés par suffixe d'ID | The Imitation Game, dev.to | Anonymat de table | Pas de preuve | 1 | S | Peu lisible |

## 3. Anti-patterns observés

1. Les fautes de frappe comme indice : les joueurs les lisent comme humaines, donc les bots en reçoivent ; 26 000 conversations, 54,7 % de détection quand l'orthographe est discutée. Source : https://ar5iv.labs.arxiv.org/html/2305.20010. Conséquence : si les fautes de Turingarou sont trop mécaniques, elles deviennent un tell inverse (humains « trop propres » suspectés).
2. IA qui répond à tout, tout de suite : repérée par l'auteur de The Imitation Game (non mesuré). https://dev.to/quantumweb/the-imitation-game-most-people-think-they-can-spot-an-ai-are-you-sure-3h4b
3. Humains qui trollent ou imitent l'IA : le paper note que l'imitation de bot est répandue ; les humains imitant l'IA étaient jugés humains à 75,3 %, et leur propre détection tombait à 54,6 %. Même source paper. Frustration rapportée par le créateur d'AI21 (« humans being humans »).
4. Politesse = bot : biais des joueurs qui jugent humain un partenaire poli ; les vulgaires étaient plus facilement identifiés (bots vulgaires détectés à 52,1 % seulement). Paper.
5. Trop peu de joueurs : The4thMind (2 upvotes, créateurs seuls), AmongAI (19 upvotes, pas d'avis), Among Humans (3 upvotes). Le créateur de The4thMind dit que le manque de joueurs est le problème n°1. Sources en section 1.
6. Jeu solo contre PNJ/IA : AlibAi 65 % positif sur 20 avis, plus de mise à jour depuis plus de 24 mois ; Imitation 1 avis. Sources : https://store.steampowered.com/app/3325660/AlibAi et https://store.steampowered.com/app/3054760
7. Expérience de recherche à durée limitée : Human or Not AI21 a fermé après 7 semaines par conception, la version tiers a repris l'audience. KYM (lien ci-dessus). Il n'y a pas eu de plateforme pour garder les joueurs.
8. Jeu court sans rétention : aucun classement ni compte dans Human or Not ; on ne trouve aucune donnée de retour (non sourcé). Hypothèse : audience ponctuelle venue de TikTok.
9. Doute sur la qualité de l'IA dans la durée : l'IA de Among Liars n'est testée par aucune mesure ; les auteurs avouent « sans chiffres ». Pas de preuve que l'équilibre fun/réalisme tient.
10. Chiffres de popularité contradictoires (1,5 M joueurs contre 15 M de conversations ; Human or Not sans compteur officiel après 2023) : ne pas bâtir de projection sur ces chiffres.

## 4. Top 10 pour Turingarou

1. Rendre l'attente de joueurs courte : mode Duel ou petite table quand moins de 5 humains (The4thMind) : le manque de joueurs est le risque n°1 du projet et du genre.
2. Laisser les IA se taire et varier leur rythme (The Imitation Game, Human or Not) : répondre à tout est le tell le plus cité ; coût faible.
3. Persona + contexte temps réel par IA (Human or Not) : les bots d'AI21 ont tenu à 60 % de détection avec cette recette.
4. Noms de couverture changés à chaque manche (Among Liars) : force à juger le contenu ; compatible avec les voix TTS si la voix suit la couverture.
5. Questions « texture » plutôt que factuelles dans la phase question (Among Liars) : fait ressortir l'humain sans piéger sur le savoir.
6. Double score : bots trouvés et fausses accusations (Surfshark Bot or Not) : donne un retour personnel sans classement, à coût faible.
7. Révélation de fin de manche mise en scène (Human or Not) : moment qui nourrit les vidéos virales (7,8 M de vues sur TikTok).
8. Compteur personnel « bonnes réponses / parties » sans compte (Human or Not) : suffisant pour rejouer, aucune infrastructure.
9. Bots complétant une table incomplète, annoncés comme tels (bot Discord Werewolf) : option de repli pour jouer à moins de 5 humains, sans mentir sur le principe.
10. Historiques de parties anonymisés, rejouables (LLM Mafia Competition, Turing Games) : contenu partageable et matière de recul pour affiner les IA.

Limites de la recherche : pas d'avis Reddit directs lisibles pour Human or Not (le moteur n'a pas retourné de fils) ; chiffres d'audience post-2023 de humanornot.so non sourcés ; aucune donnée de rétention publiée pour aucun produit.
