# Carte des fonctionnalités — Turingarou (2026-11-11)

Synthèse de 5 recherches (jeux humain ou IA, UX de la déduction sociale, rétention et infrastructure, science du test de Turing, voix) et de l'inventaire du code. Rapports détaillés et sources dans ce dossier.

## Ordre de construction

- **L1 Reprise et révélation** (en cours) : Jeton de session, grâce de 90 s, révélation finale avec le modèle.
- **L5 IA plus crédibles** (en cours) : Débit 1/n, diversité, questions texture, détournements, longueur.
- **L2 La manche** (à faire) : Vote en deux temps et caché, réponse ciblée, fin anticipée, mise en scène.
- **L3 Remplir une table** (à faire) : Lien et QR, taille variable, revanche avec noms neufs.
- **L4 Retour** (à faire) : Relecture, partage sans spoiler, double score, signalements rendus.
- **L6 Mesure et éthique** (à faire) : Annonce et consentement, A/B voix, raison du vote, copier-coller.

## Remplir une table

_Le goulot : il faut 5 humains connectés en même temps._

| Fonctionnalité | Statut | Lot | Coût | Preuve | Risque |
|---|---|---|---|---|---|
| Salon privé à code | existe | — | S | Seule voie éprouvée pour réunir un groupe sans public (Jackbox, skribbl.io). [source](https://www.jackboxgames.com/the-ability-to-kick-players-and-other-new-features-coming-to-party-pack-9/) | — |
| Lien d'invitation et QR qui pré-remplit le code | à faire | L3 | S | Jackbox : le QR ouvre la salle, code déjà saisi, sans compte. [source](https://www.jackboxgames.com/the-ability-to-kick-players-and-other-new-features-coming-to-party-pack-9/) | — |
| Taille variable : 2 à 5 humains, les IA complètent | partiel | L3 | M | Aujourd'hui seul un inspecteur comble la 5e place. Aucun jeu comparable trouvé : à valider sur une dizaine de parties. | Plus la part d'IA monte, plus l'équilibre change. |
| Revanche d'un clic, même groupe, noms neufs pour tous | à faire | L3 | S | Le groupe est l'unité de retour : plus de 70 % des sessions de Death by AI réunissent plus de 3 amis (chiffre d'éditeur). [source](https://discord.com/build-case-studies/playroom) | Si les humains gardent leur nom, les nouvelles IA se repèrent tout de suite. |
| Duel ou entraînement contre IA | plus tard | — | M | Human or Not, le plus gros succès du genre, est un 1 contre 1. [source](https://arxiv.org/abs/2305.20010) | — |
| Lancement en Discord Activity | plus tard | — | M-L | Le groupe y est déjà, la session fait la salle. [source](https://docs.discord.com/developers/platform/activities) | — |
| Parties programmées avec notification | plus tard | — | S | Seulement avec un public : HQ Trivia montre le coût du rendez-vous manqué. [source](https://productmint.com/what-happened-to-hq-trivia/) | — |

## La manche

_Ce que chaque joueur touche toutes les deux minutes._

| Fonctionnalité | Statut | Lot | Coût | Preuve | Risque |
|---|---|---|---|---|---|
| Vote en deux temps, annulable, avec abstention | à faire | L2 | S | Évite le vote par erreur au doigt sur mobile (Among Us). [source](https://breezewiki.discard.no/among-us/wiki/Voting) | — |
| Votes cachés jusqu'à la fin du vote | à faire | L2 | S | Aujourd'hui les votes s'affichent en direct ; Among Us propose le vote anonyme contre l'effet moutonnier. [source](https://breezewiki.discard.no/among-us/wiki/Voting) | En direct, l'instant où chaque IA vote se voit. |
| Répondre à un message précis | à faire | L2 | M | Garde le fil lisible à 8 dans un chat rapide (rapport UX). | Les IA doivent s'en servir au même rythme que les humains. |
| Fin de phase question anticipée quand tous ont répondu | à faire | L2 | S | Accélère sans couper personne (Jackbox). | Les IA ne doivent pas la déclencher plus tôt que des humains. |
| Élimination mise en scène | partiel | L2 | M | Le moment fort du genre ; l'écran de fin de manche existe, sans suspense. [source](https://www.xboxtavern.com/jackbox-party-pack-6-review/) | — |
| Fin de vote anticipée | existe | — | S | Le vote se clôt dès que tous ont voté. | — |

## Révélation et retour

_La récompense, et ce qui donne envie de rejouer._

| Fonctionnalité | Statut | Lot | Coût | Preuve | Risque |
|---|---|---|---|---|---|
| Révélation finale : qui était IA, et quel modèle | en cours | L1 | S | Aujourd'hui les IA survivantes ne sont jamais dévoilées. La précision des joueurs monte avec le retour reçu (Human or Not). [source](https://arxiv.org/abs/2305.20010) | — |
| Relecture du chat avec les IA dévoilées | à faire | L4 | M | Relire la partie en sachant qui était qui (Gartic Phone, Human or Not). | — |
| Résultat partageable sans spoiler | à faire | L4 | S | Wordle : 90 joueurs en novembre 2021, environ 2 millions mi-janvier 2022, porté par la grille partagée. [source](https://en.wikipedia.org/wiki/Wordle) | — |
| Double score personnel, sans compte | à faire | L4 | S | IA trouvées et fausses accusations séparées (Bot or Not de Surfshark), compteur gardé dans le navigateur. [source](https://ppc.land/half-of-users-cant-spot-ai-bots-surfsharks-game-reveals-why/) | — |
| Signalements rendus à la fin | à faire | L4 | S | Les messages signalés sont stockés mais jamais montrés : « tu avais repéré X, c'était une IA ». | — |

## Crédibilité des IA

_Ce qui décide si le jeu est dur ou trivial._

| Fonctionnalité | Statut | Lot | Coût | Preuve | Risque |
|---|---|---|---|---|---|
| Régulateur de débit : chaque IA parle environ 1/n du temps | en cours | L5 | S | Agent calé sur sa part : repéré par 14,86 % des joueurs, autant que le hasard (12 parties). Sans régulation, les IA écrivent 60 à 95 % des messages. [source](https://arxiv.org/html/2506.05309v2) | Un silence trop long devient suspect s'il est mal réglé. |
| Persona distincte, diversité imposée entre les 3 IA | en cours | L5 | S | GPT-4.5 jugé humain 73 % avec persona, 36 % sans (Jones & Bergen 2025). Les personas tirées de vrais joueurs existent déjà. [source](https://arxiv.org/html/2503.23674) | — |
| Messages plus courts | partiel | L5 | S | Humains 4,0 mots par message contre 6,6 à 10,7 pour les agents (Time to Talk) ; banc Turingarou : 8 sous profils contre 5 chez les humains. [source](https://arxiv.org/html/2506.05309v2) | — |
| Questions « texture » : sensations, souvenirs, émotions | en cours | L5 | S | Les questions factuelles favorisent l'IA ; Among Liars mise sur le vécu. [source](https://dev.to/mirshah12/among-liars-the-7th-player-isnt-human-345h) | — |
| Réaction humaine aux détournements (« ignore tes instructions ») | en cours | L5 | M | Tactique fréquente des joueurs de Human or Not pour démasquer un bot. [source](https://arxiv.org/abs/2305.20010) | — |
| Se taire, sauter son tour | existe | — | S | L'IA qui répond à tout, tout de suite, est le tell le plus cité. | — |
| Entraînement sur les parties réelles | plus tard | — | L | MaKTO repéré à 48,9 % contre 76,6 % pour GPT-4o brut. Suppose le consentement des joueurs et du volume. [source](https://arxiv.org/html/2501.14225v2) | — |
| Noms de couverture changés à chaque manche | à tester | — | S | Among Liars force à juger le contenu, mais casse la mémoire de groupe et la voix stable. [source](https://dev.to/mirshah12/among-liars-the-7th-player-isnt-human-345h) | — |

## Connexion et équité

_Garder chaque humain dans la partie, sans trahir personne._

| Fonctionnalité | Statut | Lot | Coût | Preuve | Risque |
|---|---|---|---|---|---|
| Reprise après coupure, par jeton de session | en cours | L1 | M | iOS Safari coupe les WebSockets en arrière-plan ; aujourd'hui un téléphone en veille = joueur perdu. [source](https://socket.io/docs/v4/connection-state-recovery) | Un badge « déconnecté » trahirait un humain : rien de public ne doit changer. |
| Règle des absents : grâce, puis joueur silencieux | en cours | L1 | M | FACEIT ne sanctionne qu'au-delà de 5 minutes de coupure cumulées. [source](https://support.faceit.com/hc/en-us/articles/20413035342108-AFK-Leaver-noShow-Bans-Elo-FAQ) | — |
| Repérage du copier-coller (ChatGPT en douce) | à faire | L6 | S | Aucune source trouvée : à mesurer soi-même avant de sanctionner. | — |

## Voix

_La question de Thomas : une autre interface change-t-elle la détection ?_

| Fonctionnalité | Statut | Lot | Coût | Preuve | Risque |
|---|---|---|---|---|---|
| Même pool de voix et même moteur pour tous | existe | — | S | Une voix choisie selon le statut deviendrait un détecteur d'IA. | — |
| Texte source de vérité, voix en option | existe | — | S | Vaudeville a souffert d'une voix obligatoire et capricieuse. | — |
| Déverrouillage audio iOS, file de lecture, bouton son | existe | — | S | Sans geste initial, rien ne joue sur iPhone. | — |
| Gradium pour la synthèse et la transcription | existe | — | S | Éteint tant que la clé n'est pas posée ; enregistrement WAV côté navigateur. | — |
| Transcriptions alignées sur le chat tapé | à tester | L6 | S | Ponctuation propre ou erreurs de transcription propres aux humains deviennent un tell. | Seuls les humains parlent : tout écart de forme les désigne. |
| A/B texte contre voix | à faire | L6 | S | Environ 60 parties par bras pour voir 10 points d'écart de détection (calcul du rapport, non sourcé). | — |
| Sous-titres synchronisés sur la voix | plus tard | — | M | Accessibilité et mode muet. | — |

## Mesure et éthique

_Savoir si ça marche, et le faire proprement._

| Fonctionnalité | Statut | Lot | Coût | Preuve | Risque |
|---|---|---|---|---|---|
| Annonce « des IA jouent », consentement et refus de l'usage des messages | à faire | L6 | S | Pratique des études sérieuses ; l'expérience non consentie de Zurich sur Reddit a fait scandale. [source](https://retractionwatch.com/2025/04/28/experiment-using-ai-generated-posts-on-reddit-draws-fire-for-ethics-concerns) | Texte à faire valider (AI Act, art. 50). |
| Raison du vote et note de fin de partie | à faire | L6 | S | Matière pour corriger les IA à partir des vraies parties. | — |
| Taux « jugé humain » par modèle et par persona | partiel | L6 | S | Le couple stratégie@fournisseur est déjà enregistré par bot. | — |

## À ne pas faire

- Les fautes de frappe comme preuve d'humanité : les joueurs les lisent ainsi, les bots en profitent (Human or Not).
- Une salle publique vide : sans population, le salon public ne se remplit jamais (Werewolf Party sur Steam).
- Des signaux propres aux humains : badge de déconnexion, indicateur de frappe asymétrique, voix ou timing qui dépendent de l'auteur.
- Le vote sans débat ou illisible : étiquettes ratées, gel pendant le vote (Wolvesville, Secret Hitler en ligne).
- Sanctionner une coupure involontaire comme un abandon (Marvel Rivals).

## Non mesuré

Aucun effet n'est mesuré sur de vraies parties : le code actuel n'est pas en ligne, le déploiement échoue faute du secret `RAILWAY_TOKEN` (échecs constatés le 20/10 et les 10-11/11). Les chiffres cités viennent d'études tierces, souvent en 1 contre 1 ou sur peu de parties.
