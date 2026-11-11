# Voix, avatars et interfaces nouvelles dans les jeux sociaux et jeux à IA (2026-11-11)

Méthode : web uniquement, environ 38 recherches ou lectures. Règle : chaque fait porte son URL ; chiffre sans source = « non sourcé ». Lacunes déclarées en clair : beaucoup de sujets n'ont aucune source primaire accessible (Wolvesville voice, Feign voice, Whispers from the Star latence). Les sources vendeurs (Gradium, Cartesia, Coval) sont signalées comme telles.

Verdict en trois lignes :
1. Aucune étude trouvée ne compare détection texte vs voix dans un jeu de déduction avec IA : le protocole du §4 est donc une première, pas une réplication.
2. La littérature sur la modalité suggère que la voix synthétique rend la détection plus difficile pour les humains, mais l'effet sur « qui est une IA » dans un jeu qui masque déjà la voix humaine par TTS est inconnu : tous les joueurs (humains et IA) sonnent TTS, donc le canal prosodique est neutralisé par construction.
3. Le plus gros risque produit n'est pas la détection mais la mécanique : latence, files de lecture, autoplay iOS, STT mobile.

---

## 1. Les 5 thèmes

### 1.1 Jeux sociaux vocaux

- **Town of Salem 2 (mode Voice Chat)** : voix de proximité via Discord, le texte est désactivé dans ces parties, les chuchotements n'existent plus (il faut s'isoler physiquement), bruit supprimé par défaut, modération identique au texte, but déclaré : « ne pas avoir à taper un mot ». Pas de push-to-talk mentionné (mute/deafen via hotkeys). https://www.townofsalem.io/ToS2-voice-chat-mode-faq
- **Among Us + CrewLink/BetterCrewLink (proximité)** : on entend les joueurs proches, permet de parler pendant les tâches ; avis partagés sur l'équilibre (certains disent que ça aide l'équipage, d'autres que c'est plus équilibré qu'attendu) ; les groupes allongent ou changent la durée des réunions ; limite technique : serveur voix qui sature. https://www.sportskeeda.com/esports/who-benefits-among-us-proximity-chat-mod ; https://gamerant.com/among-us-proximity-chat-mod/
- **Wolvesville** : aucune source fiable trouvée sur des « voice rooms ». Seul fait : une note de patch Steam ajoute le push-to-talk (dans un autre contexte, le chat texte du loup) et réduit le cooldown du chat texte. https://steamdb.info/patchnotes/10705854 . Le reste du thème (voice rooms) = non sourcé.
- **Feign** : très bien noté (environ 91 % positif, plusieurs milliers d'avis) ; une ancienne fiche Steam liste le chat vocal comme fonction prévue, non confirmée livrée. Sentiment joueurs : amusant entre amis, soupçonneux avec des inconnus. https://wasdland.com/game/feign-1436990 ; https://store.steampowered.com/app/1436990/Feign/?l=tchinese
- **Discord Activities** : web apps en iframe via l'Embedded App SDK, lancées depuis un salon vocal, les amis déjà en voix rejoignent ; Discord gère identité et présence, pas le netcode. Aucune Activity Werewolf/Mafia identifiée par la recherche. https://docs.discord.com/developers/platform/activities ; https://gameworldobserver.com/2024/03/13/discord-embedded-games-sdk-third-party-developers
- **Ce qui casse en voix ouverte** : toxicité (environ 70 % des utilisateurs de chat vocal disent avoir subi un événement toxique, via un rapport relayé par GamesBeat, source secondaire) ; vérification impossible des accusations ; bans vocaux durs à appliquer car la voix n'est pas rattachée au compte (fils Steam V Rising). https://gamesbeat.com/?p=219279 ; https://steamcommunity.com/app/1604030/discussions/0/4298194451986898382
- **Push-to-talk vs canal ouvert** : le PTT produit moins de tours, plus longs, plus de silences, sans ralentir la tâche (Fernández et al.) ; le canal ouvert favorise un style « par rafales » (Woodruff & Aoki). Études sur tâches de dialogue, pas sur jeux. https://staff.fnwi.uva.nl/r.fernandezrovira/papers/P2T_SLT_final.pdf ; https://www.paulaoki.com/papers/jcscw05.pdf

### 1.2 Jeux avec PNJ IA en voix

- **Suck Up!** (vampire qui convainc des voisins IA de le laisser entrer) : voix ou texte, déguisements ; Steam « Mixed » (210 avis au moment de la lecture) ; seul chiffre de latence trouvé : 1 à 2 s, une source secondaire sans méthode. https://store.steampowered.com/app/2726370/Suck_Up/ ; https://earlygame.com/gaming/how-ai-will-revolutionize-npc-interactions
- **Vaudeville** (détective, interrogatoire en voix ou texte) : Steam « Mixed » (255 à 279 avis selon l'instantané), plainte la plus fréquente = reconnaissance vocale capricieuse, d'où l'option texte indispensable ; le postmortem dit avoir abandonné un service vocal en ligne plus avancé pour « coût insoutenable » et signale des pannes de l'API externe (dont pendant un stream). https://store.steampowered.com/app/2240920 ; https://www.gamedeveloper.com/press-release/vaudeville-a-pre-mortem ; https://gamebrain.co/game/vaudeville
- **Whispers from the Star** (Anuttacon) : dialogue vocal ouvert avec Stella ; aucune mesure de latence trouvée. https://www.producthunt.com/posts/whispers-from-the-star ; https://sportskeeda.com/esports/ex-hoyoverse-ceo-s-company-reveals-whispers-star-ai-powered-game
- **Inworld / Convai / NVIDIA ACE** : démos surtout vitrines ; Axios juge la démo Origins trop légère pour conclure ; chiffres « <100 ms » exclusifs STT/TTS (source tierce non vérifiée). Rien d'exploitable pour des règles d'interruption. https://www.axios.com/2023/08/07/inworld-ai-origins-demo ; https://app.cinevva.com/guides/ai-npcs-dialogue
- **Verbal Werewolf (arXiv)** : Werewolf avec IA parlant en TTS (GPT-SoVITS, 8 voix clonées), synthèse par demi-phrases pendant que le LLM streame, l'audio dure plus longtemps que génération + synthèse donc la latence se cache sauf sur les premières phrases du premier orateur ; l'engagement supérieur est affirmé sans mesure dans la page lue (pas d'étude utilisateur chiffrée). https://arxiv.org/html/2506.00160v2
- **Leçon transversale** : option texte toujours présente, coût TTS/STT maîtrisé, fournisseur externe = point de défaillance (Vaudeville). Interruption (barge-in) : non pertinente pour Turingarou si les tours sont du chat.

### 1.3 Voix synthétique pour masquer les humains, et modalité de détection

- **Voice changers et anonymat** : Modulate (VoiceWear) : près de 60 % des joueuses interrogées utiliseraient une « voice skin » masculine pour éviter le harcèlement ; hommes avec voix féminine sur VALORANT subissent insultes et perte de coopération. Preuve que la voix porte du statut social que le TTS neutralise. https://www.modulate.ai/blog/voicewear-individual-identity ; https://sg.news.yahoo.com/valorant-male-experience-misogyny-after-using-voice-changers-women-162742458.html
- **Aucun jeu trouvé où tous parlent par TTS pour l'anonymat** (recherche large, pas de résultat) : l'idée de Turingarou n'a pas de précédent documenté ici.
- **Détection de l'IA en texte** :
  - Jakesch, Hancock, Naaman (PNAS 2023, 4 600 participants) : humains incapables de détecter des auto-présentations IA, guidés par des heuristiques fausses (pronoms à la première personne, contractions, sujets familiaux), exploitables pour faire « plus humain que humain ». https://pmc.ncbi.nlm.nih.gov/articles/PMC10089155 ; https://sml.stanford.edu/publications/2023/human-heuristics-ai-generated-language-are-flawed
  - Jones & Bergen 2024 (test de Turing à 2 parties) : GPT-4 jugé humain dans 54 % des parties, humains 67 %, ELIZA 22 %. https://arxiv.org/abs/2405.08007
  - Jones & Bergen 2025 (3 parties) : GPT-4.5 avec persona jugé humain 73 % du temps, plus que le vrai humain ; ELIZA et GPT-4o environ 23 % et 21 %. https://arxiv.org/abs/2503.23674
  - Raisons des interrogateurs (étude 2023) : style linguistique 35 %, traits socio-émotionnels 27 %, connaissances rarement ; consignes de plus de fautes d'orthographe augmentent généralement le taux de réussite des IA ; le délai de réponse a été cité autant pour les humains que pour les IA (fonction de délai bien calibrée) ; la connaissance des LLM de l'interrogateur et le nombre de parties jouées corrèlent avec la précision. https://arxiv.org/html/2310.20216v2
  - Human or Not (AI21, plus de 1,5 million de participants, 2 min) : 68 % de bonnes réponses, 73 % quand le partenaire est humain, 60 % quand c'est un bot ; bots réglés contre les stratégies des joueurs. https://www.ai21.com/blog/human-or-not-results ; https://web3.arxiv.org/pdf/2305.20010
- **Détection de l'IA en audio** :
  - Mai et al. (PLOS ONE 2023, 529 participants) : deepfakes de parole détectés environ 73 % du temps ; 85 % en comparaison par paires ; algorithmes anciens. https://tech.co/news/study-humans-spot-deepfake-speech
  - Lavan et al. (PLOS One 2025, 80 échantillons) : voix clonées jugées humaines 58 %, voix de synthèse pure 41 %, vraies voix humaines identifiées 62 % (pas distinct du hasard). https://www.theregister.com/2025/10/09/voice_clone_detection_study/
  - Barrington, Cooper, Farid (Sci. Reports 2025) : les participants ne distinguent pas de façon fiable les voix IA ; rapporté via synthèse presse. https://www.ischool.berkeley.edu/research/publications/2025/people-are-poorly-equipped-detect-ai-powered-voice-clones
  - Lecture pour Turingarou (inférence, non testée) : ces études jugent la voix comme preuve de nature (IA ou humain). Dans Turingarou la voix TTS est la même pour tous : elle ne prouve rien, mais une voix très expressive d'un message écrit peut changer la perception de personnalité. Le gain probable est sur le rythme et l'émotion perçue, pas sur la détection pure.
- **Détection du mensonge selon la modalité (humain à humain)** : Bond & DePaulo 2006, précision moyenne environ 54 %, modalité : vidéo seule, audio seul et transcription tous moins précis que l'audiovisuel (d = -0,44, -0,37, -0,28), mais certaines études trouvent l'audio seul meilleur que l'audiovisuel ; sources secondaires, à recouper avant citation formelle. https://core.ac.uk/download/153142741.pdf ; https://core.ac.uk/works/100880176
  - Idiap Wolf corpus (parole réelle) : l'énergie totale du signal donne une F-mesure de 0,59 contre 0,33 de base pour repérer les rôles trompeurs. Le TTS efface exactement ce signal. https://infoscience.epfl.ch/record/153574?ln=fr
  - Hancock et al. (CHI 2004) : on ment le plus au téléphone, le moins par e-mail ; synchronicité, enregistrabilité, copresence. https://sml.stanford.edu/publications/2004/deception-and-design-impact-communication-technologies-lying-behavior
  - Schroeder & Epley 2015 : la parole fait juger l'interlocuteur plus intelligent et plus humain que le texte. Hypothèse pour Turingarou : une IA lue en voix peut sembler plus « pensante ». https://www.psychologicalscience.org/journals/psychological-science/0956797615572906/
- **Remarque de méthode** : pas d'étude trouvée sur détection en voix + sous-titres/TTS dans un jeu de groupe. Toute prédiction chiffrée pour Turingarou = non sourcé.

### 1.4 Interfaces de chat travaillées

- **Indicateurs de frappe** : un indicateur atténue l'effet négatif d'une réponse lente sur la perception de présence sociale (étude chatbot clientèle) ; un délai variable selon la complexité augmente l'humanité perçue (ECIS 2018) ; résultats inconstants selon les études, fautes de frappe simulées sans effet sur l'humanité perçue (HICSS 2021, 228 participants). https://aisel.aisnet.org/ecis2018_rp/113/ ; https://arxiv.org/html/2510.08912v1 ; https://studenttheses.universiteitleiden.nl/access/item%3A2609231/view
  - Risque Turingarou : l'indicateur de frappe est un canal de fuite (durée du « en train d'écrire » proportionnelle à la longueur pour les humains ; pour une IA elle doit être simulée avec la même loi). Jones & Bergen ont utilisé 0,3 s par caractère plus un terme gamma pour imiter la frappe. https://arxiv.org/html/2310.20216v2 ; conseils de détection par timing = avis d'éditeur, non mesuré : https://humanornot.so/blog/how-to-spot-a-bot-in-live-matches
- **Chuchotements, procès, vote** : Town of Salem sépare chat public, chuchotements (privés, lisibles par certains rôles), phase de procès avec défense à la parole puis jugement ; 88 % positif sur plus de 36 000 avis Steam (snapshot agrégateur). https://town-of-salem.fandom.com/wiki/File:Filters.png ; https://nodal.gg/game/town-of-salem-334230 . Détails d'interface reply/mention : non trouvés.
- **Jackbox** : le public vote et influe sur le résultat, jusqu'à 10 000 spectateurs ; Fakin' It est un jeu de déduction à tâche secrète. Pas de source sur le sound design du vote. https://www.jackboxgames.com/how-audience-play-along-differs-in-each-jackbox-game ; https://giantbomb.com/wiki/Games/The_Jackbox_Party_Pack_3
- **Avatars animés / lip-sync / visualisation de voix** : aucune source jeu trouvée dans cette voie. Les recommandations de ce thème ci-dessous sont des hypothèses de conception (non sourcées).

### 1.5 Coûts et limites techniques

- **Latence TTS (sources vendeurs, métriques différentes)** : Cartesia Sonic annonce moins de 90 ms de modèle ; Vapi Humanness Index mesure 166 ms (Sonic 3) et 128 ms (Sonic 3.5) réseau inclus ; Coval donne 454 ms (Sonic 3.6) contre environ 214 ms pour Gradium en TTFA perçu (septembre 2026), Gradium étant partie prenante de la publication. Retenir : de l'ordre de 150 à 450 ms avant le premier son, loin d'être le goulot ; le goulot est le LLM. https://humannessindex.vapi.ai/models/cartesia-sonic-3 ; https://gradium.ai/blog/coval-perceived-ttfa-benchmark ; https://www.coval.ai/blog/time-to-first-audio-ttfa-benchmark/
- **Streaming d'un LLM vers le TTS** : Cartesia WebSocket avec un `context_id` stable par énoncé, `continue: true` sur les fragments, `continue: false` à la fin ; préserve la prosodie ; SSE sans continuations. Gradium : streaming par jetons, timestamps de mots (utile pour surligner le texte au fil de la voix), français supporté (EN, FR, DE, ES, PT). https://docs.cartesia.ai/use-the-api/tts-websocket/contexts ; https://docs.gradium.ai/guides/introduction
- **STT** : Web Speech API sans support Firefox, partiel sur iOS Safari (14.5+), envoi de l'audio à un service tiers ; un STT serveur est donc plus fiable pour un jeu mobile. Gradium STT : 2,4 % de WER contre environ 25 % pour Deepgram Nova (blog Gradium, benchmark Coval, vendeur) ; fin de tour Deepgram Flux 100 à 500 ms (docs). https://caniuse.com/speech-recognition ; https://gradium.ai/content/stt-api-benchmark-2026-latency-accuracy ; https://developers.deepgram.com/docs/measuring-streaming-latency.mdx . Aucun chiffre français trouvé.
- **Autoplay et iOS** : Safari impose un geste utilisateur pour l'audio ; déverrouiller l'AudioContext ou un `<audio>` silencieux dans le premier geste (de préférence `touchend`) ; l'audio lancé après un `await` peut échouer ; `speechSynthesis.speak` interrompt d'autres médias ; sources anciennes (2017-2018) à reverifier sur appareil réel. https://webrtchacks.com/autoplay-restrictions-and-webrtc/ ; https://bugs.webkit.org/show_bug.cgi?id=180522 ; https://community.livekit.io/t/seeking-react-patterns-to-gracefully-handle-safaris-strict-autoplay-policies-and-background-audio-suspension-for-ios-users/1649
- **Accessibilité** : WCAG 1.4.2 (niveau A) : un audio de plus de 3 s qui démarre seul doit pouvoir être mis en pause, arrêté ou son volume réglé indépendamment du système. Le texte reste donc la source de vérité ; la voix est une couche. https://dequeuniversity.com/rules/axe/4.13/no-autoplay-audio . Aucune source trouvée sur les sous-titres de chat vocal en jeu.
- **Files de lecture quand plusieurs parlent** : aucune source trouvée. Observation de Verbal Werewolf (lecture plus longue que génération, donc file naturelle). Politique recommandée = §5 (hypothèse de conception).
- **Coût** : Vaudeville a dû abandonner un TTS en ligne trop cher (https://www.gamedeveloper.com/press-release/vaudeville-a-pre-mortem). Tarifs Cartesia/Gradium : non trouvés, à lire sur leurs pages de prix.

---

## 2. Tableau des fonctionnalités

Pertinence 1-3 (3 = fort). Coût S/M/L. « Preuve » = ce qui est sourcé ; « hyp. » = hypothèse non sourcée.

| fonctionnalité | vue où | ce qu'elle fait | pourquoi ça marche (preuve) | pertinence | coût | risque (trahit les IA ?) |
|---|---|---|---|---|---|---|
| Voix unique par joueur (TTS, même pool humains et IA) | Verbal Werewolf, 8 voix (https://arxiv.org/html/2506.00160v2) ; voice skins (https://www.modulate.ai/blog/voicewear-individual-identity) | chaque auteur a une identité sonore stable | voix = identité et statut social ; neutralisée par TTS (Modulate) ; énergie vocale trahit le menteur (https://infoscience.epfl.ch/record/153574?ln=fr) | 3 | S | Faible si pool identique ; tirage de voix indépendant du statut IA |
| Lecture du chat dans la voix de l'auteur | Verbal Werewolf | rend le texte vivant sans taper | engagement affirmé non mesuré ; parole perçue plus pensante que texte (https://www.psychologicalscience.org/journals/psychological-science/0956797615572906/) | 3 | M | Moyen : l'IA lue en voix peut sembler plus humaine ; à mesurer (§4) |
| Push-to-talk avec STT puis relecture par la voix assignée | Wolvesville PTT (https://steamdb.info/patchnotes/10705854) ; Fernández (https://staff.fnwi.uva.nl/r.fernandezrovira/papers/P2T_SLT_final.pdf) | parole humaine convertie en message | PTT : tours plus longs, moins de chevauchement, tâche non ralentie | 3 | M | Élevé : latence STT + erreurs STT visibles ; une IA n'a pas d'erreurs STT, donc corriger/figer l'affichage (pas de fautes d'orthographe de transcription visibles pour l'humain seul) |
| Texte toujours source de vérité, voix en option | Vaudeville (https://gamebrain.co/game/vaudeville) ; ToS2 a supprimé le texte (https://www.townofsalem.io/ToS2-voice-chat-mode-faq) | repli si STT/TTS échoue ou sourd | plainte n°1 de Vaudeville = reconnaissance vocale ; WCAG 1.4.2 | 3 | S | Aucun |
| Délai de « frappe » unifié (même loi humains et IA) | Jones & Bergen, 0,3 s/char + gamma (https://arxiv.org/html/2310.20216v2) | masque les temps de réponse | délai jugé indiscernable entre humains et IA dans leur étude | 3 | S | Élevé si absent ou différent ; indicateur de frappe = canal de fuite |
| Indicateur « en train d'écrire / parler » | études chatbot (https://aisel.aisnet.org/ecis2018_rp/113/) | signale qu'un message arrive | atténue l'effet d'une réponse lente ; résultats inconstants | 2 | S | Élevé si piloté par un autre mécanisme que pour les humains ; mêmes règles pour tous |
| Réponse ciblée (reply/quote) et mention | Town of Salem : chuchotement `/w` (https://town-of-salem.fandom.com/wiki/File:Filters.png) | lie un message à un message ou joueur | détails d'interface non sourcés | 2 | M | Moyen : les IA doivent utiliser reply/mention avec la même fréquence que les humains |
| Visualisation de la voix (onde, halo sur l'avatar actif) | aucune source ; hyp. | montre qui parle | hyp. : réduit la confusion quand plusieurs voix se suivent | 2 | S | Faible si le halo suit la lecture et non l'origine |
| Avatar animé / lip-sync | aucune source ; hyp. | incarne la voix | non sourcé | 1 | L | Faible mais coûteux ; faible gain probable |
| File de lecture ordonnée (un message à la fois, saut possible) | Verbal Werewolf, lecture plus longue que génération (https://arxiv.org/html/2506.00160v2) | évite le chevauchement | hyp. | 3 | M | Moyen : ordre d'arrivée visible peut révéler les IA rapides ; imposer un ordonnancement identique |
| Sous-titres synchronisés mot à mot | Gradium timestamps (https://docs.gradium.ai/guides/introduction) | surligne le texte lu | accessibilité ; couvre le mode muet | 2 | M | Faible |
| Vote mis en scène (suspense, révélation) | Town of Salem procès (https://town-of-salem.fandom.com/wiki/File:Filters.png) ; Jackbox | tension | non sourcé quant à l'effet | 2 | M | Faible |
| Ambiance sonore (tension, jingles de phase) | aucune source jeu ; hyp. | rythme de partie | non sourcé | 1 | S | Faible |
| Proximité spatiale | ToS2, CrewLink (https://www.townofsalem.io/ToS2-voice-chat-mode-faq) | audible si proche | autre genre de jeu | 1 | L | n.a. |
| Voice changer pour humains | Modulate | masque la voix réelle | anonymat | 1 | M | Remplacé par le TTS déjà prévu ; garder la voix réelle hors serveur |
| Barge-in / interruption de l'IA | Convai/Inworld (non vérifié) | coupe le PNJ | hors sujet (tours de chat) | 1 | L | n.a. |
| Déverrouillage audio iOS au premier geste | WebKit/livekit (https://community.livekit.io/t/seeking-react-patterns-to-gracefully-handle-safaris-strict-autoplay-policies-and-background-audio-suspension-for-ios-users/1649) | permet la lecture | obligatoire sur Safari | 3 | S | Aucun |

---

## 3. Anti-patterns

1. **Voix réelle des humains dans la partie** : prosodie, énergie, genre, accent trahissent (Idiap, Modulate) et font du harcèlement ; le TTS-for-all est la bonne idée. Ne jamais relayer l'audio brut des humains.
2. **Voix choisie en fonction du statut IA** (par exemple pool de voix distinct, qualité différente, latence de TTS différente selon l'auteur) : fuite immédiate. Même moteur, même pool, tirage aléatoire.
3. **Timing de lecture dépendant de l'origine** : un message d'IA instantané et un message humain après STT de plusieurs secondes se distinguent à l'oreille. Égaliser par un délai commun (modèle de Jones & Bergen : https://arxiv.org/html/2310.20216v2).
4. **Indicateur de frappe asymétrique** (activé pour les humains par événement clavier, pour les IA par minuterie sans la même loi).
5. **Transcription STT visible avec ses erreurs seulement pour les humains** : les fautes de transcription deviennent un tell humain. Normaliser, ou appliquer le même bruit aux IA (à décider ; non sourcé).
6. **Voix obligatoire** : Vaudeville (reconnaissance capricieuse), ToS2 sans texte. Garder le texte.
7. **Autoplay sans geste** : bloqué par Safari ; l'audio qui démarre seul sans contrôle viole WCAG 1.4.2.
8. **Cumuler des chuchotements privés** : ToS2 les supprime en mode voix ; en multi-voix, le privé casse la lecture publique (observation de ToS2, https://www.townofsalem.io/ToS2-voice-chat-mode-faq).
9. **Dépendre d'un seul fournisseur TTS/STT** : Vaudeville a subi des pannes d'API (https://www.gamedeveloper.com/press-release/vaudeville-a-pre-mortem). Prévoir repli texte, puis second fournisseur.
10. **Gonfler les promesses d'engagement sans mesure** : l'engagement de Verbal Werewolf est affirmé sans chiffre dans la page lue.

---

## 4. Protocole : le mode voix change-t-il la détection ?

Hypothèse H1 : la proportion d'IA correctement identifiées (vote d'élimination d'une IA, ou accusation exacte) diffère entre parties texte et parties voix. Tout est de mon fait (calcul), aucune étude comparable trouvée.

**Plan** : A/B par partie, randomisation à la création du salon (50/50), même version du jeu, mêmes modèles IA, mêmes prompts, même loi de délai. Contrôle : un bras « voix, mais sans voix d'IA distincte » n'est pas nécessaire en V1 car le pool est commun.

**À logger (par événement, horodatés côté serveur)** :
- Partie : id, bras (texte/voix), langue, modèle LLM et version de prompt, moteur TTS/STT, appareil et navigateur de chaque humain, nombre d'humains/IA, nombre de manches.
- Joueur : id anonyme, humain ou IA, voix assignée, a-t-il activé le son (oui/non), temps de lecture effectif, PTT utilisé (nombre, durée), taux d'erreur STT (confiance si fournie).
- Messages : auteur, longueur, délai entre arrivée et affichage, délai entre affichage et fin de lecture, origine (frappé/STT/IA), reply/mention.
- Votes : votant, cible, moment, vérité terrain (IA ou non), confiance déclarée (échelle 1 à 5) ; avant le vote, une question « qui est une IA ? » avec rang des suspects.
- Fin de partie : survie, victoire, questionnaire de 3 questions (immersion 1-5, « les voix m'ont aidé / gêné / sans effet », « j'ai joué avec le son »).
- Qualité : coupures, pannes TTS/STT, latence p50/p95 de bout en bout.

**Métriques** : (1) précision de détection par vote (cible vraie IA / total des votes humains) ; (2) rang moyen des IA dans le classement de suspicion ; (3) manches avant que la première IA soit éliminée ; (4) taux de victoire des humains ; (5) temps de décision au vote ; (6) exclure ou stratifier les parties où le son était coupé.

**Taille d'échantillon (calcul de l'auteur, non sourcé)** : écart de proportions, seuil 5 %, puissance 80 %.
- Pour détecter 50 % vs 60 % : environ 390 observations de vote par bras.
- Pour 50 % vs 65 % : environ 170 par bras.
- Les votes d'une même partie sont corrélés. Avec environ 15 votes humains par partie et une corrélation intra-partie de 0,1 (hypothèse), l'effet de plan vaut environ 2,4 : soit environ 60 parties par bras (≈ 120 au total) pour 10 points d'écart, environ 27 par bras (≈ 55 au total) pour 15 points.
- Analyse : modèle mixte (effet aléatoire partie et joueur) ou régression logistique à erreurs groupées par partie ; rapporter l'intervalle de confiance, pas seulement la p-valeur.
- Règle d'arrêt : fixer N à l'avance (par exemple 60 parties par bras), regarder à 30 par bras seulement pour détecter une panne technique, pas pour conclure.

**Seuils de lecture** : voix « change quelque chose » si l'IC à 95 % de la différence de précision exclut 0 ; « neutre » si l'IC est inclus dans ±8 points ; sinon « non mesuré » (état, pas échec). Rappel de référence : en test de Turing en texte, les humains plafonnent autour de 54 à 73 % de bonnes réponses selon l'adversaire (https://arxiv.org/abs/2405.08007 ; https://www.ai21.com/blog/human-or-not-results), donc attendre des différences modestes.

**Biais à surveiller** : joueurs qui coupent le son (auto-sélection) ; iOS qui bloque l'audio et crée un bras « voix sans son » ; différences de population entre bras (assigner aléatoirement, pas au choix) ; apprentissage (les joueurs réguliers détectent mieux : https://arxiv.org/html/2310.20216v2) donc stratifier par nombre de parties jouées.

---

## 5. Top 10 pour Turingarou

1. **Texte comme source de vérité, voix en couche optionnelle** : repli quand STT/TTS/autoplay échoue, accessibilité, évite l'écueil de Vaudeville.
2. **Même pool de voix et même moteur pour humains et IA, tirage indépendant du statut** : sans cela le mode voix devient un détecteur d'IA.
3. **Loi de délai commune à tous les messages (humain, STT, IA) avant affichage et lecture** : le timing est le tell le plus évident ; modèle sourcé : Jones & Bergen.
4. **Déverrouillage audio au premier geste (iOS) et bouton son/muet visible** : sans cela la fonction ne marche pas sur mobile et viole WCAG 1.4.2.
5. **File de lecture à un message à la fois, avec saut et vitesse réglable** : plusieurs messages quasi simultanés rendraient la voix inécoutable.
6. **PTT avec STT serveur (pas Web Speech API) et relecture par la voix assignée** : PTT limite les chevauchements ; Web Speech non fiable sur Firefox/iOS.
7. **Protocole A/B de la §4 intégré dès la première version** : seule façon de répondre à la question du créateur, aucune étude existante.
8. **Indicateur « parle/écrit » commun, piloté par la même loi** : améliore la présence sociale mais est un canal de fuite si asymétrique.
9. **Sous-titres mot à mot synchronisés sur la voix (timestamps TTS)** : accessibilité et mode muet ; Gradium fournit les timestamps.
10. **Vote mis en scène (suspense, révélation, son de phase)** : tension à faible risque ; effet non sourcé, à ne faire qu'après les points 1 à 9.

Écartés (faible rapport pertinence/coût ou hors sujet) : avatars animés lip-sync, proximité spatiale, barge-in, voice changer sur voix réelle.

---

## Lacunes de la recherche

- Wolvesville voice rooms, Feign voice, Discord Werewolf Activity : aucun fait sourcé trouvé.
- Aucune étude texte vs voix sur la détection d'IA dans un jeu de groupe ; aucune étude sur reply/mention, avatars animés, ambiance sonore.
- Latences TTS/STT : toutes vendeurs, métriques non comparables ; aucune mesure en français trouvée ; tarifs non trouvés.
- Sources iOS anciennes (WebKit 2017-2018) : à tester sur appareil réel.
