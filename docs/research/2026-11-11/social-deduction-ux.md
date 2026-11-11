# UX des jeux de déduction sociale en ligne : ce qui sert Turingarou (2026-11-11)

## Où on en est, et limites de cette recherche

Recherche web seule (environ 40 appels), pour nourrir l'interface de Turingarou : 5 humains + 3 IA cachées, phases question / discussion / vote / fin de manche, mode voix optionnel, population faible.

Limite à lire d'abord : le web accessible était mince. Fandom (wiki Among Us) renvoie 402, GamesRadar, TechRaptor, PC Gamer et Medium/Gartic renvoient 403 ou du contenu tronqué. Je n'ai trouvé aucun postmortem GDC sur ces interfaces, ni avis Steam détaillés sur Town of Salem 2, ni documentation de clocktower.online, secrethitler.io, Spyfall ou Codenames en ligne. Chaque fait ci-dessous est cité avec son URL. Les points marqués **[non sourcé]** sont des inférences de conception de ma part, jamais présentées comme observations. Les écrans pour lesquels je n'ai rien de sourcé sont signalés « lacune ».

Enjeu réel : Turingarou n'a pas le luxe d'un onboarding long ni d'un lobby peuplé (il faut 5 humains simultanés). Les leçons les plus utiles viennent donc de Jackbox (zéro friction, un téléphone, une tâche à la fois) et des tests de Turing en ligne (comment les joueurs détectent les IA), pas des jeux à rôles complexes.

---

## 1. Meilleures pratiques par écran clé

### Lobby et attente
- **Rejoindre par code de salle dans le navigateur, sans app** (Jackbox). Réduit la barrière à l'entrée. Source : https://builtin.com/media-gaming/jackbox-games-design-party-pack
- **QR code qui ouvre jackbox.tv avec le code déjà saisi** (Party Pack 9). Source : https://www.jackboxgames.com/the-ability-to-kick-players-and-other-new-features-coming-to-party-pack-9/
- **Contrôles d'accès de l'hôte** : salle protégée par mot de passe, code de salle masquable, « démarrer depuis la manette seulement ». Sources : https://www.jackboxgames.com/streaming-moderation-accessibility-features-jackbox-party-pack-eight/ et https://www.jackboxgames.com/new-features-in-the-jackbox-party-pack-six
- **Expulsion d'un joueur du lobby ou de la partie** : fonction très demandée, ajoutée au Party Pack 9 ; l'expulsé ne peut plus rejoindre la salle. Source : https://www.jackboxgames.com/the-ability-to-kick-players-and-other-new-features-coming-to-party-pack-9/
- **Salles aléatoires + chat + vote d'expulsion** (skribbl.io) : l'expulsion à la moitié des voix a bien fonctionné contre un joueur qui écrivait le mot au lieu de le dessiner. Source : https://mechanicsofmagic.com/2022/04/15/competitive-analysis-skribbl-io/ (analyse d'étudiant, un seul témoin).
- Lobby à joueurs variables : Wolvesville annonce jusqu'à 16 joueurs, des lobbies classés et personnalisés. Source : https://apps.apple.com/us/app/wolvesville/id1394503496. Un avis App Store trouve « trop de joueurs » et s'y perd (via https://gamebrain.co/game/wolvesville-classic).

### Onboarding / règles
- **Une tâche à la fois, trois types d'entrée seulement (dessiner, choisir un bouton, taper)**, habillage « émission TV » qui guide le rythme. Source : https://builtin.com/media-gaming/jackbox-games-design-party-pack
- **Un hôte-personnage qui parle** (DODE, l'IA du vaisseau dans Push The Button) : les règles passent par un narrateur à voix, pas par un texte. Sources : https://www.jackboxgames.com/making-the-jackbox-party-pack-6 ; principe « Interactive Conversation Interface » dans l'article Built In ci-dessus.
- **Playtests sur des groupes de 3 à 8, observation de streams Twitch pour repérer rires et frustrations.** Source : Built In ci-dessus.
- Lacune : pas de source sur le tutoriel d'Among Us, Wolvesville ou BotC.

### Révélation du rôle
- Le téléphone sert de canal privé : chaque joueur reçoit une information que lui seul voit ; c'est ce qui permet à Push The Button d'attribuer des rôles secrètement. Source : Built In ci-dessus.
- Variante vocale : Town of Salem 2 génère automatiquement les testaments (non éditables) pour ne pas obliger à taper pendant le jeu. Source : https://www.townofsalem.io/ToS2-voice-chat-mode-faq
- Pertinence limitée : dans Turingarou le « rôle » est le même pour tous les humains (« je suis humain »), ce que la source ne couvre pas.

### Phase de réponse (question / tâche)
- **Push The Button : humains et aliens reçoivent des prompts différents**, ceux des aliens sont altérés ou manquants ; tâches variées (dessin, opinion, délibération), temps limité. Les aliens peuvent « pirater » les autres pour obtenir les bons prompts. Source : https://apptrigger.com/2019/10/17/jackbox-party-pack-6-review-spooky-scary-aliens
- Une revue note que le jeu marche en démontrant « que vous avez vu le bon prompt », et que 4 joueurs = 1 seul alien (moins bon) : plus de joueurs est mieux. Sources : https://www.xboxtavern.com/jackbox-party-pack-6-review/ (résumé via recherche) et apptrigger ci-dessus.
- **Quiplash / Fibbage : tous répondent, puis tous votent.** Quiplash : deux réponses en duel par prompt, vote des autres, manche finale « top 3 ». Source : Built In ci-dessus.
- Idée dominante : la réponse d'abord, **sans attribution visible**, puis le vote. Fibbage/Quiplash attribuent les auteurs après le vote **[détail non sourcé directement ; seul l'ordre réponse → vote est sourcé]**.
- Timers rallongeables : toutes les parties Jackbox proposent « Extended Timers » en accessibilité, « No Timers » dans certains jeux (en mode sans timer, la partie attend que tous aient répondu et voté). Source : https://www.jackboxgames.com/streaming-moderation-accessibility-features-jackbox-party-pack-eight/

### Chat de discussion
- **Among Us : Quick Chat** (messages prédéfinis, ajouté en 2021.2.21), seul chat disponible pour les moins de 13 ans. Source : https://among-us.fandom.com/wiki/Quick_Chat (via résumé de recherche).
- **Town of Salem 2 : chat plus encombré et plus dur à suivre que le premier**, selon un avis, mais le « glossaire » de termes avec infobulle est apprécié. Source : https://backloggd.com/u/TheBodyIsAnBlade/likes/ (un seul avis). L'éditeur reconnaît avoir beaucoup retravaillé chat et UI et corrigé un scintillement à l'ajout d'un message. Source : https://townofsalem2.com/news/town-of-salem-2-roadmap-progress-report
- **Wolvesville : « il faut ouvrir et fermer le chat » est une gêne citée** ; la mise à jour Vampire Court ajoute réponses et réactions aux messages. Sources : https://gamebrain.co/game/wolvesville-classic ; https://apps.apple.com/us/app/wolvesville/id1394503496
- **skribbl.io : toutes les tentatives sont publiques**, ce qui fait la dynamique sociale. Source : mechanicsofmagic ci-dessus.
- **Wolfy/Wolvesville : modération par signalement au survol du pseudo ; définitions précises de spam et de flood.** Source : https://help.wolfy.net/en/article/punishable-behavior-i8r1ot
- Town of Salem 2 en voix : pas de chuchotement, on se déplace pour parler en privé ; mute individuel, suppression de bruit par défaut. Source : https://www.townofsalem.io/ToS2-voice-chat-mode-faq. Utile pour le mode voix de Turingarou : volume ou mute par joueur.

### Minuteurs
- **Among Us : discussion et vote configurables de 30 à 300 s (défaut 120 s dans la source)**, signal sonore quand le vote va finir. Source : https://among-us.fandom.com/wiki/Voting (via résumé de recherche).
- **skribbl.io : l'horloge raccourcit quand des joueurs ont déjà trouvé**, ce qui maintient le rythme. Source : mechanicsofmagic ci-dessus.
- **Town of Salem 2 : modes Slow / Fast** (durée de discussion et de vote). Source : https://steamdb.info/patchnotes/11805165 (via résumé de recherche).
- **Jackbox : timers étendus, sans timer, réglables en cours de partie.** Source : Party Pack 8 ci-dessus.

### Vote (secret ou visible, égalités)
- **Among Us : sélectionner une personne ou « skip », puis confirmer par la coche verte ; annulable par la croix rouge ou en changeant de cible.** Source : https://breezewiki.discard.no/among-us/wiki/Voting
- **Égalité, majorité de « skip » ou personne n'a voté : nul n'est éjecté.** Même source.
- **Vote anonyme (option d'hôte) : tous les votes s'affichent en gris, non attribués.** Sources : https://techraptor.net/gaming/news/among-us-update-adds-anonymous-voting-and-more ; https://www.droidgamers.com/news/among-us-gets-anonymous-voting-in-its-latest-update/ (via résumés).
- **Town of Salem 2 : modificateurs « Anonymous Voting » et « One Trial » par jour.** Source : https://steamdb.info/patchnotes/11805165
- **BotC (jeu de table) : n'importe quel vivant nomme n'importe qui ; une égalité avec un précédent nommé annule les deux ; l'Organ Grinder rend le vote secret.** Source : https://wiki.bloodontheclocktower.com/Organ_Grinder et https://lehi-innovation.github.io/boardgame-rules/rules/blood-on-the-clocktower/. Pas d'info sur l'UI de clocktower.online.
- **Push The Button : l'éjection doit être unanime.** Source : https://www.xboxtavern.com/jackbox-party-pack-6-review/ (résumé de recherche).
- Plaintes : Wolvesville « se fige souvent pendant le vote » (agrégateur) ; un commentaire itch.io (jeu non identifié) : « on vote au hasard, sans stratégie, sans raisonner ». Sources : https://gamebrain.co/game/wolvesville-classic ; https://itch.io/post/2064752
- Secret Hitler en ligne (autre site) : icônes pouce haut/bas et étiquettes « vote manquant » faciles à rater. Source : https://mechanicsofmagic.com/?p=14541 (via résumé).

### Élimination et révélation
- **Among Us : option « Confirm Ejects ».** Activée, on révèle le rôle et le nombre d'imposteurs restants ; désactivée : « <Joueur> was ejected. » seulement. Source : https://breezewiki.discard.no/among-us/wiki/Voting
- **Séquence éjection** : sur la Skeld, aucun son propre à l'éjection au début ; l'ouverture du sas est devenue audible en juin 2021. Source : https://among-us.fandom.com/wiki/Ejection (via résumé).
- **Refonte juin 2021** : nouvel écran de réunion avec intro qui montre qui a appelé et qui est mort, animations de signalement, pour tenir 15 joueurs. Sources : https://comicbook.com/gaming/news/among-us-new-meeting-screen ; https://innersloth.itch.io/among-us/devlog/247343/clever-and-interesting-dev-log-title (via résumés).
- **Push The Button** : un joueur démasqué est « figé dans le vide » ; DODE commente (voix déadpan). Sources : https://jackboxgames.com/how-to-put-your-life-back-together-after-pushing-the-button ; https://www.jackboxgames.com/making-the-jackbox-party-pack-6

### Récapitulatif de fin de partie
- **Gartic Phone : tout est anonyme jusqu'à la fin, puis relecture de la chaîne complète (de l'amorce au résultat), trait par trait, partage en GIF animé.** Sources : https://en.wikipedia.org/wiki/Broken_Picture_Telephone ; https://itsallwidgets.com/gartic-phone ; https://www.drawize.com/blog/drawize-phone
- **Jackbox : bouton « galerie » en fin de partie, galeries passées sur jackbox.tv.** Source : https://www.jackboxgames.com/games-like-gartic-phone
- Pour Turingarou, la révélation « qui était IA » avec relecture du chat est l'analogue direct. Aucune source ne l'étudie pour un jeu de déduction ; **[non sourcé]**.

### Rejouer
- Lacune : aucune source utilisable. Seul indice : skribbl.io, rounds identiques, lassitude après environ une heure, et l'auteur suggère des « twists » entre les rounds. Source : mechanicsofmagic ci-dessus.

### Inactivité et modération
- Jackbox : kick, mot de passe, filtres de grossièretés et de famille, modérateurs qui valident le contenu avant affichage (mod.jackboxgames.com). Sources : Party Pack 8 et Party Pack 9 ci-dessus.
- Wolvesville : avis qui déplorent des signalements sans bans et des contournements du filtre par épellation ; d'autres bannis par erreur après un message accidentel. Source : https://apps.apple.com/us/app/wolvesville/id1394503496
- Lacune : aucune source sur la gestion d'un joueur AFK en plein vote (Among Us, Salem).

### Détection d'IA par les joueurs (hors liste, indispensable ici)
- « Human or Not » (AI21, 1,5 million de joueurs, chat de 2 minutes avec un humain ou un LLM, puis verdict) : 73 % de bonnes réponses face aux humains, seulement 60 % face aux bots (68 % global). Source : https://www.ai21.com/blog/human-or-not-results
- Indices utilisés par les joueurs : fautes et argot (pris pour signes d'humain alors que les bots étaient prompts à en faire), questions personnelles, actualité, politesse excessive (suspecte), demandes qu'un bot refuse, injections « ignore previous instructions », tâches au niveau lettre (inverser un texte). Humains qui imitent l'IA. Même source.
- Le jeu garde les temps d'attente courts pour garder les joueurs engagés. Source : https://bohrium.dp.tech/paper/arxiv/2305.20010

---

## 2. Tableau des fonctionnalités

Pertinence 1-3 (3 = fort). Coût S/M/L. Risque : effet sur la crédibilité des IA ou sur la partie.

| fonctionnalité | vue où | ce qu'elle fait | pourquoi ça marche (preuve) | pertinence | coût | risque |
|---|---|---|---|---|---|---|
| Rejoindre par QR code + code de salle, sans compte | Jackbox, https://www.jackboxgames.com/the-ability-to-kick-players-and-other-new-features-coming-to-party-pack-9/ | Le QR pré-remplit le code | Barrière minimale ; Jackbox vise les parents âgés (Built In) | 3 | S | aucun |
| Une tâche à l'écran à la fois | Jackbox, https://builtin.com/media-gaming/jackbox-games-design-party-pack | Un seul type d'entrée par écran | Principe cité par le studio ; pas de métrique publiée | 3 | S | aucun |
| Narrateur-hôte (voix/texte) qui annonce les phases | Push The Button (DODE), https://www.jackboxgames.com/making-the-jackbox-party-pack-6 | Cadence et règles portées par un personnage | Écrit comme fondement des « Jack Principles » (Built In) | 2 | M | peut gêner le sérieux d'un jeu de détection |
| Vote en deux temps : sélection puis coche de confirmation, annulable | Among Us, https://breezewiki.discard.no/among-us/wiki/Voting | Évite le vote par fausse manoeuvre mobile | Mécanisme documenté ; pas de mesure d'erreurs | 3 | S | aucun |
| Option « skip » et égalité = personne éliminé | Among Us, même URL | Autorise l'abstention | Règle documentée ; effet non mesuré | 2 | S | peut rallonger la partie si tout le monde skip |
| Vote anonyme réglable par l'hôte | Among Us, https://techraptor.net/gaming/news/among-us-update-adds-anonymous-voting-and-more | Votes affichés en gris | Ajouté après coup par l'éditeur ; réduit la pression sociale (inférence non sourcée) | 3 | S | aucun ; renforce l'anonymat des IA |
| Révélation du rôle à l'élimination activable (Confirm Ejects) | Among Us, https://breezewiki.discard.no/among-us/wiki/Voting | L'hôte choisit de révéler ou pas le rôle | Option d'hôte conservée par l'éditeur | 3 | S | révéler le statut après chaque manche affecte la tension ; à décider |
| Séquence d'éjection mise en scène (intro, sas, texte) | Among Us, https://comicbook.com/gaming/news/among-us-new-meeting-screen | Dramatise le résultat du vote | Refonte juin 2021 avec animations ; effet non mesuré | 3 | M | aucun |
| Quick Chat (phrases prédéfinies) | Among Us, https://among-us.fandom.com/wiki/Quick_Chat | Parler sans taper | Imposé aux moins de 13 ans ; usage d'accessibilité | 1 | M | trahit les IA : un humain à phrases prédéfinies se démarque d'IA à texte libre |
| Timers étendus / sans timer | Jackbox, https://www.jackboxgames.com/streaming-moderation-accessibility-features-jackbox-party-pack-eight/ | Prolonge ou supprime le chrono | Présent dans toutes les parties du pack | 3 | S | une IA qui répond à la limite du chrono trahit le tempo ; caler sur le dernier humain |
| Timer qui raccourcit quand les autres ont fini | skribbl.io, https://mechanicsofmagic.com/2022/04/15/competitive-analysis-skribbl-io/ | Accélère la fin de phase | Qualifié de choix « savvy » par l'analyste | 3 | S | une IA qui répond trop vite déclenche le raccourcissement : à surveiller |
| Expulsion par vote des joueurs (50 %) | skribbl.io, même URL | Retire les tricheurs | A bien fonctionné contre un cas (un témoin) | 2 | M | mal adapté à 5 humains : un joueur qui quitte casse la partie |
| Kick par l'hôte + interdiction de rejoindre | Jackbox, https://www.jackboxgames.com/the-ability-to-kick-players-and-other-new-features-coming-to-party-pack-9/ | Retire un joueur nuisible | Fonction « très demandée » (communiqué) | 2 | S | aucun |
| Filtre de grossièretés et modération avant affichage | Jackbox, Party Pack 8 | Bloque les mots interdits | Recommandé pour le stream | 2 | S | un filtre qui déforme les messages humains peut les rendre plus « IA » |
| Réponses et réactions aux messages du chat | Wolvesville, https://apps.apple.com/us/app/wolvesville/id1394503496 | Répondre à un message précis | Ajouté dans l'update Vampire Court | 3 | M | les IA doivent savoir répondre à un message précis (cohérence) |
| Chat toujours visible (pas d'ouverture/fermeture) | Wolvesville, avis App Store via https://gamebrain.co/game/wolvesville-classic | Évite de perdre le fil | Plainte sur le chat à ouvrir et fermer | 3 | S | aucun |
| Glossaire en infobulle dans le chat | Town of Salem 2, https://backloggd.com/u/TheBodyIsAnBlade/likes/ | Explique les termes au survol | Apprécié (un avis) | 1 | M | peu utile sans jargon |
| Mute / volume par joueur en voix | Town of Salem 2, https://www.townofsalem.io/ToS2-voice-chat-mode-faq | Règle chaque voix | Documenté ; effet non mesuré | 2 | S | dans Turingarou la voix synthétique est uniforme ; mute utile contre les nuisances |
| Révélation anonyme jusqu'à la fin puis relecture de la chaîne | Gartic Phone, https://en.wikipedia.org/wiki/Broken_Picture_Telephone | Chaque étape est révélée avec son auteur | Reprise par les clones ; partage en GIF | 3 | M | aucun |
| Partage du récapitulatif (GIF/galerie) | Gartic Phone, https://itsallwidgets.com/gartic-phone ; Jackbox galerie | Contenu partageable | Vecteur d'acquisition (inférence non sourcée) | 2 | M | exposer des messages privés : demander le consentement |
| Prompts asymétriques humain / alien | Push The Button, https://apptrigger.com/2019/10/17/jackbox-party-pack-6-review-spooky-scary-aliens | Les imposteurs reçoivent une consigne défectueuse | Qualifié de meilleur mini-jeu du pack | 2 | M | aucune pour Turingarou : les IA ont la même question |
| Éjection à l'unanimité | Push The Button, https://www.xboxtavern.com/jackbox-party-pack-6-review/ | Évite les éliminations légères | Cité par des revues | 1 | S | dégrade le rythme avec 5 humains |
| Modes de rythme Slow / Fast | Town of Salem 2, https://steamdb.info/patchnotes/11805165 | Ajuste la durée de discussion/vote | Modificateurs d'hôte | 2 | S | aucun |
| Salles à nombre variable de joueurs | Push The Button, https://www.xboxtavern.com/jackbox-party-pack-6-review/ | Jeu de 4 à 10, meilleur avec plus de monde | Remarque d'une revue sur le cas à 4 joueurs | 3 | M | permettre de démarrer à 3-4 humains + IA ajustées aiderait la liquidité |

---

## 3. Anti-patterns UX du genre

1. **Chat à ouvrir et fermer, ou encombré.** Plainte App Store Wolvesville (https://gamebrain.co/game/wolvesville-classic) ; Town of Salem 2 jugé plus dur à suivre que le premier (https://backloggd.com/u/TheBodyIsAnBlade/likes/).
2. **Trop de joueurs, perte de repères.** Wolvesville à 16 (même source App Store).
3. **Gel ou plantage pendant le vote.** Plainte agrégée Wolvesville (https://gamebrain.co/game/wolvesville-classic) ; l'éditeur a corrigé reconnexions et état du chat après reconnexion (https://apps.apple.com/us/app/wolvesville/id1394503496). Un vote qui disparaît à la reconnexion est le pire moment pour un bug.
4. **UI téléphone restrictive qui gêne la communication.** Avis sur une appli mobile de Town of Salem 2 (https://gamebrain.co/game/town-of-salem-2-strategy-games), signal faible.
5. **Votes sans raisonnement, au hasard.** Commentaire itch.io, jeu non identifié (https://itch.io/post/2064752) : la phase de vote doit être précédée d'un signal qui aide à décider.
6. **Votes difficiles à lire.** Étiquettes « vote manquant » faciles à rater dans un Secret Hitler en ligne (https://mechanicsofmagic.com/?p=14541).
7. **Modération qui échoue dans les deux sens.** Signalements sans effet et contournement par épellation, ou bans automatiques sur message accidentel (https://apps.apple.com/us/app/wolvesville/id1394503496).
8. **Salles ouvertes sans modération.** skribbl.io : comportements négatifs non contrôlés (https://mechanicsofmagic.com/?p=16922, via résumé).
9. **Lassitude faute de variété.** skribbl.io : mêmes rounds, fatigue après environ une heure (https://mechanicsofmagic.com/2022/04/15/competitive-analysis-skribbl-io/).
10. **Partie qui dépend de la présence de tous.** Push The Button est jugé faible à 4 joueurs (un seul alien) ; une revue recommande de jouer avec le plus de monde possible (https://apptrigger.com/2019/10/17/jackbox-party-pack-6-review-spooky-scary-aliens). Le seuil de 5 humains de Turingarou est le même piège.
11. **Imiter l'humain par des fautes ne suffit plus** : les joueurs d'« Human or Not » interprètent fautes et argot comme signe d'humain, mais apprennent aussi que la politesse et les imitations d'IA brouillent les pistes (https://www.ai21.com/blog/human-or-not-results). Une IA trop « parfaitement imparfaite » peut devenir une signature.

---

## 4. Top 10 pour Turingarou

1. **Vote en deux temps (sélection puis confirmation, annulable) avec option abstention et égalité = personne éliminé** : évite les erreurs au pouce sur mobile, règle documentée dans Among Us.
2. **Chat toujours visible, avec réponse à un message précis** : plainte directe sur Wolvesville, correction apportée par son éditeur.
3. **Séquence d'élimination mise en scène (qui a voté quoi ou résultat anonyme, puis révélation humain/IA)** : la refonte 2021 d'Among Us montre qu'on investit là, et c'est le moment fort du genre.
4. **Option d'hôte : vote anonyme ou visible** : Among Us l'a ajoutée après coup ; protège aussi l'anonymat des IA.
5. **Rejoindre par QR/code, sans compte, une tâche par écran** : principe Jackbox, vital avec une base de joueurs faible.
6. **Timers réglables (étendus, sans chrono) et fin de phase anticipée quand tous ont fini** : Jackbox et skribbl.io ; calibrer les IA pour qu'elles ne déclenchent pas la clôture trop tôt.
7. **Récapitulatif de fin de partie : relecture complète du chat avec la révélation des IA, partageable** : Gartic Phone et Jackbox ont montré que la relecture est le contenu viral.
8. **Parties à effectif variable (démarrer à 3-4 humains + IA ajustées) plutôt que 5 humains exigés** : la revue de Push The Button montre que les petites parties perdent du sel, mais mieux vaut une petite partie qu'aucune ; coût moyen.
9. **Reconnexion fiable qui restaure chat et état du vote, kick par l'hôte** : plaintes Wolvesville, demande des joueurs Jackbox ; l'inactivité est le premier tueur d'une partie à 5 humains.
10. **Calibrage des IA sur les indices que les joueurs utilisent réellement (politesse, fautes trop régulières, refus, actualité, tâches au niveau lettre)** : « Human or Not » donne la liste des tests ; une IA qui échoue à l'un d'eux devient la cible évidente.

Reco assumée si un seul chantier : 1 + 2 + 3, qui touchent chacun une fois par manche, avant tout le reste.
