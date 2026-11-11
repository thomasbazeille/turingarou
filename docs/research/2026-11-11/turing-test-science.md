# Turingarou : ce que la science dit de la détection humain/IA en conversation (2026-11-11)

Méthode : ~35 recherches/lectures web. Chaque chiffre porte son URL ; « non sourcé » = déduction ou calcul de l'auteur du rapport. Les chiffres lus via un résumé secondaire (pas le PDF) sont marqués « (secondaire) ». Aucun fichier modifié hors de celui-ci.

Contexte en deux lignes : Turingarou est un jeu de groupe (5 humains + 3 IA, chat de groupe, vote d'élimination). Presque toute la littérature mesure du 1-contre-1 (interrogatoire) ; très peu mesure le groupe. Les rares données de groupe (Time to Talk, TuringHotel, MaKTO) sont donc les plus précieuses ici, et les plus fragiles (petits n).

---

## 1. Fiches des études

### F1. Jones & Bergen 2025/2026, test de Turing à trois parties (PNAS)
- Sources : https://arxiv.org/html/2503.23674 (preprint) ; publication PNAS 123(21), 2026, citée par https://www.psypost.org/modern-ai-is-often-judged-to-be-more-human-than-actual-humans-in-turing-test-experiments/ (référence PNAS donnée par une seule source, à vérifier).
- Méthode : pré-enregistré, randomisé. Interrogateur discute 5 min avec un humain et une IA en parallèle, choisit l'humain. Témoins : GPT-4.5, LLaMa-3.1-405B, GPT-4o, ELIZA, avec/sans prompt « persona ». Deux populations : 126 étudiants UCSD (445 parties) et 158 Prolific (576 parties) ; 1 023 parties, médiane 8 messages, ~4,2 min.
- Résultats (taux « jugé humain ») : GPT-4.5-persona ~73 % (69 % étudiants, 76 % Prolific), donc plus que les vrais humains ; LLaMa-persona 56 % ; LLaMa sans persona 38 % ; GPT-4.5 sans persona 36 % ; ELIZA 23 % ; GPT-4o sans persona 21 %.
- Persona = « jeune, plutôt introverti, connaît la culture internet, utilise de l'argot ». Sans persona : prompt minimal.
- Interface : 300 caractères max ; délai de réponse IA = minimum + ~0,3 s/caractère envoyé + ~0,03 s/caractère du message lu + terme aléatoire asymétrique (« temps de réflexion ») ; indicateur « en train d'écrire » après 2 + U(0,3) s pour tous.
- Stratégies des interrogateurs : small talk 61 %, questions socio-émotionnelles 50 %, « es-tu humain ? » 19 %, situation (météo, heure, interface) 13 %, savoir/raisonnement 12 %. Les plus précises : messages « étranges » et jailbreaks (rares) ; les moins : météo et expérience humaine.
- Raisons de verdict : style linguistique 27 %, dynamique d'interaction 23 %.
- Limites : un seul format de 5 min ; résultat dépendant du prompt (sans persona, l'IA ne passe pas) ; pas d'experts ni de joueurs incités ; 1-contre-1 ; tagging des stratégies par GPT-4o validé contre humains.

### F2. Jones & Bergen 2023/2024, « Does GPT-4 pass the Turing test? »
- Source : https://arxiv.org/html/2310.20216v2
- Méthode : 1 979 participants, 6 845 parties (4 730 analysées, dont 793 avec témoin humain), 2 parties (1-contre-1), 5 min, 300 caractères, collage bloqué, réponses IA retardées pour imiter la frappe.
- Résultats : humains 66 % jugés humains ; GPT-4 meilleur prompt (« Dragon ») 49,7 % ; autres prompts GPT-4 de 39 % à 6 % ; ELIZA 22 % ; GPT-3.5 5-20 %. Le texte du prompt, la température et le nombre de fautes volontaires changent le résultat.
- Stratégies : small talk 27 %, savoir 23 %, situation 17 %. Les plus corrélées à un verdict correct : parler une autre langue que l'anglais, tester l'humour et les expériences humaines. Les moins : opinions, activités quotidiennes, météo.
- Raisons : style linguistique 35 %, traits socio-émotionnels 27 % ; très peu citent le savoir/raisonnement. Raisons « IA » fréquentes : style forcé/peu naturel, réponses génériques et ennuyeuses ; la vitesse (trop lente/rapide) est aussi citée.
- Précision des interrogateurs : meilleure avec la connaissance déclarée des LLM et le nombre de parties jouées ; pas avec l'éducation ni la fréquence d'usage de chatbots. Calibrés sur les IA, pas sur les humains.
- Limites : recrutement par réseaux sociaux, non payés, humains qui trollent en se disant IA, certains interrogateurs connaissent leur partenaire.

### F3. AI21 « Human or Not? » (Jannai et al., 2023)
- Sources : https://arxiv.org/abs/2305.20010 ; texte détaillé via https://ar5iv.labs.arxiv.org/html/2305.20010 ; blog https://www.ai21.com/blog/human-or-not-results
- Méthode : chats anonymes de ~2 min, alternance stricte (ping-pong), 100 caractères et 20 s par message, puis choix humain/IA. Plus de 10 millions de conversations, >1,5 M d'utilisateurs en un mois (blog : >15 M de conversations, >2 M de participants). Bots : personas (nom, âge, métier, lieu, traits), actualités et météo locales injectées, plusieurs modèles (Jurassic-2, GPT-4, Cohere), styles de soigné à volontairement bâclé (fautes, argot, minuscules), délai simulant la frappe, départs brusques si « offensé » ou répétitif.
- Résultats : 68 % de bonnes réponses ; 73 % face à un humain, 60 % face à un bot.
- Indices et précision (échantillons de l'article) : fautes d'orthographe, bots repérés 54,7 % seulement (sur 26k conversations) ; politesse excessive : humains correctement identifiés 80,9 %, bots 52,2 %, et ces joueurs polis sont jugés humains seulement 69,2 % du temps ; grossièreté : 76,2 % / 63,6 %, jugés humains 86,7 % ; tendances réseaux sociaux : humains identifiés 79,7 %, bots 55,4 % ; demandes que l'IA refuse : 74,8 % / 64,9 %, jugés humains 85,1 %. Pays (blog) : France 71,3 % (la plus haute), Inde 63,5 % (la plus basse).
- Faits de comportement : des humains imitent l'IA (« As an AI language model » parmi les messages les plus fréquents) ; sur un échantillon de 100k, ces humains sont identifiés humains 80,5 % ; les bots utilisant des phrases similaires sont identifiés 67,9 %. Tâches au niveau lettre (inverser un mot, texte à l'envers) exploitent la tokenisation.
- Limites : jeu = suspicion accrue ; 2 min ; biais anglophone ; catégorisation partiellement manuelle ; designs de bots spécifiques.

### F4. « Time to Talk » (Eicher et al., Findings EMNLP 2025), le plus proche de Turingarou
- Source : https://arxiv.org/html/2506.05309v2
- Méthode : Mafia asynchrone en chat de groupe, texte seulement. LLMafia : 33 parties, 3 593 messages (275 de l'agent), 7-12 joueurs (moy. 7,7), 93 joueurs anglophones, 1 agent caché par partie, Llama-3.1-8B (21 parties) ou Llama-3.3-70B (12). Joueurs informés qu'un joueur est une IA, pas lequel ; consentement signé, usage des messages pour la recherche NLP.
- Architecture : un « scheduler » (sortie `<wait>`/`<send>`) et un « generator » (même LLM) ; si le débit de l'agent est sous 1/n (n = joueurs actifs) on le pousse à parler, au-dessus à se taire ; génération max 25 tokens, température 1,3, pénalité de répétition 1,25, prompt « court, informel, argot, pas de répétition » ; délai de frappe ~1 mot/s.
- Résultats : messages par phase de jour : humain 4,23 ; agent 8B 4,28 ; agent 70B 2,95. Mots/message : humain 3,97 ; 8B 10,67 ; 70B 6,57. Taux de victoire similaire aux humains.
- Détection : avec l'agent 70B, 14,86 % des joueurs l'identifient, contre ~14,92 % de hasard (donc chance) ; avec le 8B, 59,6 %. Notes post-partie (1-5) « ressemblance humaine » : 8B 2,63, 70B 4,34 ; timing 3,19 vs 4,34 ; pertinence 2,99 vs 4,42.
- Un classifieur LDA sur embeddings BGE-M3 sépare pourtant messages d'agent et d'humain à F1 0,98-0,99 : l'humain ne détecte pas ce qu'une machine détecte (au moins sur ce corpus de non-natifs, selon les auteurs).
- Les joueurs les plus bavards sont surreprésentés parmi les éliminés.
- Limites : petits modèles, 33 parties, joueurs non-natifs, 1 seule IA par partie ; raisons des joueurs non rapportées.

### F5. MaKTO / Multi-agent KTO (NeurIPS 2025)
- Source : https://arxiv.org/html/2501.14225v2
- Méthode : agent Werewolf (chinois) entraîné par optimisation de préférences multi-agents sur des parties de joueurs ; test de Turing en aveugle : 14 joueurs expérimentés (1000+ parties chacun) jugent chaque autre participant humain/IA sans savoir si une IA joue.
- Résultats : précision de détection de MaKTO 48,9 % (sous le hasard) ; GPT-4o 76,6 % ; SFT-72b 53,0 %. Victoire 60 % contre experts humains ; 61,8 % ±8,3 en 30 parties de 9 joueurs (humains moyens 54 %). Précision de vote : humains 76,7 %, MaKTO 73,8 % ; abstention 4,8 % vs 1,5 %.
- Lecture : GPT-4o brut est repéré à ses « style de discours et comportement de vote » ; un agent entraîné sur du jeu réel passe. L'article ne détaille pas les traits de style.
- Limites : n = 14 juges, chinois, un seul agent entraîné.

### F6. Xu et al. 2023, Werewolf avec 160 humains payés
- Source : https://arxiv.org/html/2310.18940
- Méthode : 600 parties ; 160 participants (≥18 ans, anglophones, 10 $/h) ; joueurs humains informés de quels joueurs sont des IA (détection non testée). Consentement mentionnant que les IA peuvent mentir.
- Résultats : agent avec styles prédéfinis (suiveur discret, contributeur actif, accusateur agressif ; secret, proactif, par défaut) bat l'agent LLM brut (loup 0,67-0,70 vs 0,54-0,61) et égale les humains.
- Limites : texte seul ; pas de test de détection.

### F7. Werewolf Arena (Google Research, 2024) et AvalonBench (2023)
- Sources : https://arxiv.org/html/2407.13943v1 ; https://arxiv.org/abs/2310.05036
- Werewolf Arena : 8 joueurs (1 voyante, 1 docteur, 2 loups, 4 villageois), débat plafonné à 8 tours, parole par enchère 0-4 (ex æquo : le joueur mentionné). Résultats LLM-contre-LLM : style de GPT-4 (verbeux, indirect) jugé suspect par les villageois Gemini ; Gemini plus bref, émotionnel, humour/sarcasme. Une majorité de vote se forme entre les tours 2 et 5 du débat. Baseline Monte Carlo sans information : villageois gagnent 1,2 % (100 000 parties simulées). 10 parties par duel seulement.
- AvalonBench : ChatGPT 3.5/Llama 2 ; côté bon, ChatGPT 22,2 % de victoires contre bots à règles ; côté mauvais 66,7 %. Les LLM peuvent perdre contre des bots simples.
- Intérêt pour Turingarou : mécanique de tours (enchères), vitesse de convergence du vote, danger d'un style « trop raisonné ». Aucun humain en jeu : ne dit rien de la détection.

### F8. Rathi & Bergen / Rathi, Taylor, Bergen, Jones 2024-2025, tests déplacés et inversés
- Sources : https://arxiv.org/abs/2407.08853 ; résumé CogSci 2025 via https://journalpub.escholarship.org/cognitivesciencesociety/article/49954/galley/37916/download (résumé secondaire sur la version CogSci).
- Résultats (préprint 2024) : juges humains « déplacés » (qui lisent la transcription) et juges LLM (GPT-3.5/4) moins précis que les interrogateurs interactifs, sous le hasard ; tous jugent le meilleur témoin GPT-4 plus souvent humain que les vrais humains. La version CogSci 2025 rapporte, selon un résumé secondaire, des juges humains déplacés comparables aux interactifs et des juges LLM nettement pires : les deux versions divergent, à lire avant citation.
- Pour Turingarou : un juge IA ne remplace pas le joueur humain ; et un « arbitre LLM » pour mesurer l'humanité de vos IA sera moins fiable que des humains.

### F9. Russell, Karpinska, Iyyer (ACL 2025), détecteurs experts de texte IA
- Sources : https://arxiv.org/pdf/2501.15654 ; détails https://arxiv.org/html/2501.15654v2
- Méthode : 300 articles non-fiction en anglais, GPT-4o/Claude-3.5/o1-Pro, annotateurs explicitant leurs raisons.
- Résultats : 5 experts (utilisateurs fréquents de LLM pour l'écriture) : TPR moyen 92,7 %, FPR 4,0 % ; vote majoritaire : 1 erreur sur 300 ; 4 non-experts : TPR 56,7 %, FPR 51,7 %, plus confiants à tort. Indices cités : vocabulaire (53,1 %, « testament », « crucial »), structure de phrase (35,9 %, « not only… but also », listes de trois), grammaire trop propre (24,8 %), manque d'originalité/humour (23,7 %), sur-explication (19,5 %). Robuste au texte « humanisé » (vote majoritaire 100 % sur o1-Pro humanisé), bien meilleur que GPTZero 46,7 % et Binoculars 0 % sur ce sous-ensemble.
- Limites : articles longs en anglais, experts choisis a posteriori sur leur performance ; pas du chat court.

### F10. Collective Turing Test (arXiv 2511.08592, 2025)
- Source : https://arxiv.org/html/2511.08592
- Méthode : conversations Reddit réelles vs. générées (Llama 3 70B, GPT-4o) à 3 températures, présentées côte à côte, 203 participants Prolific (1 205 annotations).
- Résultats : 61 % de bonnes réponses, soit 39 % de conversations IA prises pour humaines ; Llama 3 70B 56 % de détection, GPT-4o 66 % ; à 16 commentaires la détection tombe au hasard. Indices cités par les meilleurs : style (82,5 %), contenu (49,1 % : trop d'accord, sur-explication, pas d'anecdote personnelle), absence de fautes/argot (21,1 %), longueur perçue « verbeux » (17,5 %).
- Limites : pas d'interaction ; stimuli dépourvus de sarcasme/toxicité.

### F11. TuringHotel (arXiv 2603.18981, mars 2026, préprint)
- Source : https://arxiv.org/html/2603.18981v1
- Méthode : chats de groupe de 4 participants, 3 min, tous (humains et IA) votent qui est humain ; réponse correcte = identifier exactement les humains (hasard 0,125). 17 humains, 4 modèles zero-shot (gpt-oss-20b, Qwen2.5-14B/7B, Dolphin3.0-8B ; le résumé dit 19 LLM, incohérence non résolue par les auteurs).
- Résultats : juges humains précision 0,721 (rappel 0,658, précision 0,500) ; juges IA 0,469, avec tendance à étiqueter tout le monde humain. Humains : 5,3 mots/message ; IA >3x plus ; les IA produisent 60-95 % des messages d'une salle ; humains font ~2x plus de fautes (Qwen2.5-14B s'en approche).
- Limites : 17 humains, 3 min, zero-shot, sous-groupes minuscules.

### F12. Jakesch, Hancock, Naaman (PNAS 2023), heuristiques humaines erronées
- Sources : https://pmc.ncbi.nlm.nih.gov/articles/PMC10089155 ; résumé https://sml.stanford.edu/publications/2023/human-heuristics-ai-generated-language-are-flawed
- Méthode : 6 expériences, 4 600 participants, auto-présentations (pro, hôtellerie, rencontre).
- Résultats : détection non fiable ; les juges s'appuient sur des heuristiques fausses (pronoms à la première personne, contractions, thèmes familiaux = « humain »). Les IA peuvent exploiter ces indices pour paraître « plus humaines que l'humain ». Les auteurs proposent des « accents d'IA » pour limiter le potentiel trompeur.
- Pour Turingarou : les indices « humains » les plus évidents sont aussi les plus faciles à fabriquer.

### F13 (voix). Human or Machine ? Turing test speech-to-speech (arXiv 2602.24080) et clones vocaux (PLOS One 2025)
- Sources : https://arxiv.org/html/2602.24080v3 ; https://www.theregister.com/2025/10/09/voice_clone_detection_study/ (secondaire).
- S2S : 397 participants, 2 968 jugements, 9 systèmes (GPT-4o, Gemini 2.5 Pro, Claude Sonnet 4, etc.), chinois/anglais. Taux « jugé humain » 0,07-0,31 pour les systèmes S2S vs 0,87 (EN) / 0,70 (ZH) pour humain-humain ; aucun système ne passe. Précision de détection 78,8 % chez les plus familiers de l'IA, 64,2 % chez les moins. Faiblesses relevées par les experts : prosodie rigide, accents mal placés, absence de disfluences, ton émotionnel plat, persona trop servile/formel. Scores de raisonnement non corrélés au taux de passage (r = 0,0456).
- Clones vocaux (secondaire) : voix clonées d'une personne réelle prises pour humaines 58 % du temps, voix purement synthétiques 41 %.
- Limites : S2S de bout en bout, pas du TTS de texte généré ; jugement sur dialogues enregistrés.

### F14. Fiches de référence « humains juges de mensonge » : Bond & DePaulo 2006
- Source : https://pubmed.ncbi.nlm.nih.gov/16859438/ ; chiffres de modalité via http://assets.aclu.org/live/uploads/document/foia/2006-Personality-and-Social-Psychology-Review-Accuracy-of-Deception-Judgements.pdf (secondaire, à vérifier).
- Méta-analyse : 206 documents, 24 483 juges ; précision ~54 % (53,46 % selon un résumé) pour 50 % de hasard ; biais de vérité (55,23 % jugés vrais) ; professionnels pas meilleurs que profanes.
- Modalité : le résumé secondaire donne des écarts entre canaux (vidéo, audio, transcription) mais sans lecture directe du sens des contrastes : ne pas appuyer de décision de design dessus sans relecture de l'article.

### F15. Liang et al. 2023, détecteurs biaisés contre les non-natifs
- Source : https://arxiv.org/abs/2304.02819 (résumé : https://www.deepai.org/publication/gpt-detectors-are-biased-against-non-native-english-writers)
- 91 dissertations TOEFL, 7 détecteurs : taux de faux positifs moyen ~61 % (un détecteur 98 %) ; mécanisme proposé : faible perplexité. Pour Turingarou : un humain laconique ou non natif écrit comme une IA aux yeux de beaucoup de signaux ; le risque est dans les détecteurs automatiques, mais l'idée (prévisibilité = suspect) vaut aussi pour les humains jugeant.

### Études annexes (courtes)
- Persuasion : Salvi et al., Nature Human Behaviour 2025, ~900 participants, GPT-4 avec personnalisation plus persuasif que l'humain dans 64,4 % des paires non égales (https://arxiv.org/abs/2403.14380 ; résumé https://citations.prolific.com/paper/on-the-conversational-persuasiveness-of-large-language-models-a-randomized-controlled-trial). Pertinence : les IA qui argumentent peuvent orienter le vote.
- Deception LLM vs humain : « Hidden in Plain Text », 35 parties Mafia GPT-4o vs 28 humaines ; un détecteur GPT-4-Turbo prédit moins bien les mafieux LLM que les humains (https://arxiv.org/abs/2601.13709).
- WereBench (« Beyond Survival », 2025) : benchmark issu de l'émission Panda Kill (80+ parties) ; meilleur LLM (Gemini-2.5-Pro) 0,720 en précision de discours ; faibles en raisonnement sur la tromperie et contrefactuel (https://arxiv.org/html/2510.11389v1).
- MultiMind (arXiv 2504.18039) : 8 volontaires, 1 humain + 4 IA par partie ; se spécialiser sur les comportements humains améliore la tromperie face aux humains (https://arxiv.org/pdf/2504.18039, vu via résultat de recherche seulement).

---

## 2. Classement des indices par pouvoir discriminant

Légende : discrimination = capacité à départager l'IA d'un humain dans les données. Les données portent presque toutes sur du 1-contre-1 ou des sorties non modifiées ; sur un agent entraîné (MaKTO) ou bien prompté (GPT-4.5 persona), les indices de surface disparaissent.

| Rang | Indice | Ce que montrent les données | Sources |
|---|---|---|---|
| 1 | Style linguistique global (formel/poli, lisse, générique, « forcé ») | Première raison citée : 35 % (2024), 27 % (2025) ; style = 82,5 % des commentaires des meilleurs juges de conversations Reddit. Un persona de style fait passer GPT-4.5 de 36 % à 73 %. | https://arxiv.org/html/2310.20216v2 ; https://arxiv.org/html/2503.23674 ; https://arxiv.org/html/2511.08592 |
| 2 | Longueur de message et verbosité | Humains 3,97 mots/message vs IA 10,67 (8B) et 6,57 (70B) ; 5,3 mots (humains) vs >3x (IA) en groupe ; classifieur F1 0,98-0,99. Mais l'agent 70B n'est pas détecté par les joueurs. | https://arxiv.org/html/2506.05309v2 ; https://arxiv.org/html/2603.18981v1 |
| 3 | Réponses évasives/génériques, sur-explication, trop d'accord, pas d'anecdote | Cités par les juges (AI « boring », « conformity » 19,3 %, « over-explain » 15,8 %, pas d'anecdote 12,3 %). | https://arxiv.org/html/2310.20216v2 ; https://arxiv.org/html/2511.08592 |
| 4 | Vocabulaire et structures typiques « LLM » (« crucial », « not only… but also », listes de trois) | Vocabulaire 53,1 %, structure 35,9 % chez les experts en texte long ; pertinent pour du chat court seulement par extrapolation (non mesuré en chat). | https://arxiv.org/html/2501.15654v2 |
| 5 | Réaction aux demandes atypiques : jailbreak, étrangeté, langues, demandes interdites, tâches au niveau lettre | Les plus précises en 3-parties (peu fréquentes) ; humour et langue non anglaise corrélés à un verdict correct (2024) ; demandes refusables : 74,8 % de précision (humain), 64,9 % (bot) ; lettre à lettre exploite la tokenisation. | https://arxiv.org/html/2503.23674 ; https://arxiv.org/html/2310.20216v2 ; https://ar5iv.labs.arxiv.org/html/2305.20010 |
| 6 | Connaissance de l'actualité/tendances locales | Humains en discussion de tendances réseaux sociaux : 79,7 % de bonnes réponses sur humains, 55,4 % sur bots ; mais la météo/heure sont peu discriminantes et les modèles sont souvent connectés. | https://ar5iv.labs.arxiv.org/html/2305.20010 ; https://www.ai21.com/blog/human-or-not-results |
| 7 | Rythme de frappe / timing / quantité de messages | Délais mimés : les interrogateurs citent trop lent/trop rapide ; en groupe l'agent 70B calqué sur le débit humain est à 14,86 % (hasard), l'agent à 8B moins calé est à 59,6 % ; en groupe, les IA non régulées produisent 60-95 % des messages. | https://arxiv.org/html/2310.20216v2 ; https://arxiv.org/html/2506.05309v2 ; https://arxiv.org/html/2603.18981v1 |
| 8 | Fautes, argot, minuscules | Faibles et trompeurs : bots repérés 54,7 % quand l'orthographe est mentionnée ; juges y voient un signe d'humain ; humains font ~2x plus de fautes que des IA zero-shot. Facilement fabriqué. | https://ar5iv.labs.arxiv.org/html/2305.20010 ; https://arxiv.org/html/2603.18981v1 ; https://pmc.ncbi.nlm.nih.gov/articles/PMC10089155 |
| 9 | Politesse | Ambivalent : les très polis sont jugés humains seulement 69,2 % du temps ; trop de politesse est lu comme machine, y compris chez des humains. | https://ar5iv.labs.arxiv.org/html/2305.20010 |
| 10 | Small talk, météo, activités, opinions, « es-tu humain ? » | Les stratégies les plus utilisées (61 %, 27 %) et les moins discriminantes. | https://arxiv.org/html/2503.23674 ; https://arxiv.org/html/2310.20216v2 |

Cohérence entre manches, humour, comportement de vote : non mesurés comme indices isolés dans les études humaines trouvées. MaKTO attribue la détectabilité de GPT-4o à son « style de discours et comportement de vote » (https://arxiv.org/html/2501.14225v2) sans chiffrer chaque trait. Tout classement de ces trois-là est donc non sourcé.

Point structurant : les humains se trompent plus sur les humains (juges « bien calibrés sur les IA, pas sur les humains », https://arxiv.org/html/2310.20216v2) ; et l'expérience compte (utilisateurs fréquents de LLM, https://arxiv.org/html/2501.15654v2 ; plus de parties jouées, https://arxiv.org/html/2310.20216v2 ; familiarité IA 78,8 % vs 64,2 % en voix, https://arxiv.org/html/2602.24080v3). Donc la détection s'apprend : vos joueurs réguliers deviendront meilleurs, les IA doivent évoluer.

---

## 3. Fonctionnalités / règles de design

Pertinence 1 (faible) à 3 (forte). Coût S/M/L = estimation de l'auteur, non sourcée.

| Fonctionnalité ou règle | Source | Ce qu'elle fait | Pourquoi (preuve) | Pertinence | Coût | Risque |
|---|---|---|---|---|---|---|
| Régulateur de débit : l'IA parle ~1/n du temps | https://arxiv.org/html/2506.05309v2 | Pousse à parler si sous 1/n, à se taire si au-dessus | Agent 70B : 4,34/5 en ressemblance humaine et 14,86 % de détection (hasard) ; sans régulation les IA envoient 60-95 % des messages | 3 | S | Silence prolongé suspect si mal calibré |
| Scheduler « parler ou attendre » séparé du générateur | https://arxiv.org/html/2506.05309v2 | Décide si l'IA répond avant de rédiger | Rend le timing humain, joueurs notent timing 4,34/5 | 3 | M | Latence et coût LLM si échantillonnage fréquent |
| Plafond de longueur dur (≈ 4-6 mots médian, 25 tokens max) | https://arxiv.org/html/2506.05309v2 ; https://arxiv.org/html/2603.18981v1 | Aligne la distribution sur les humains | Humains 3,97 mots ; IA 8B 10,67 détectée à 59,6 % | 3 | S | Messages trop courts = pas de contenu stratégique |
| Prompt persona détaillé (âge, tempérament, culture internet, argot) | https://arxiv.org/html/2503.23674 | Donne un caractère | 73 % vs 36 % sans persona (GPT-4.5) ; prompt = 50 % à 6 % entre variantes GPT-4 (https://arxiv.org/html/2310.20216v2) | 3 | S | Fragilité au prompt, besoin de tests A/B |
| Styles de rôle prédéfinis (suiveur, contributeur actif, accusateur) | https://arxiv.org/html/2310.18940 | Diversifie les comportements d'IA | Agents avec styles égalent les humains, battent le LLM brut | 3 | M | Style fixe repérable si 3 IA ont le même |
| Diversité inter-IA obligatoire (3 IA, 3 personas, 3 débits, 3 niveaux de fautes) | Déduction (non sourcé), motivée par https://arxiv.org/html/2511.08592 (« limited language diversity ») | Empêche « les trois qui parlent pareil » | Limite de diversité citée comme indice | 3 | S | Aucun connu |
| Filtre « sorties d'assistant » (rejette formules, listes, « en tant qu'IA ») | https://arxiv.org/html/2501.15654v2 | Retire mots/structures typiques | Vocabulaire et structure = 53,1 % / 35,9 % des indices experts | 3 | S | Les nouveaux tics remplacent les anciens ; mettre à jour |
| Température élevée (1,3), pénalité de répétition, no-repeat n-gram | https://arxiv.org/html/2506.05309v2 | Évite répétitions ; plus de variété | Messages d'agent répétés : 1,00/joueur (8B) vs 0,32 humain | 2 | S | Incohérence, hors-sujet |
| Délai de frappe : min + ~0,3 s/car. + lecture ~0,03 s/car. + bruit asymétrique | https://arxiv.org/html/2503.23674 | Simule frappe et réflexion | Cité par les interrogateurs (trop lent/rapide), protocole utilisé par les deux études UCSD | 3 | S | Délai uniforme repérable ; bruit à tirer par IA |
| Indicateur « en train d'écrire » identique pour humains et IA | https://arxiv.org/html/2503.23674 | Égalise l'interface | Appliqué à tous les témoins | 2 | S | Aucun |
| Message limité (100-300 car.), collage bloqué | https://ar5iv.labs.arxiv.org/html/2305.20010 ; https://arxiv.org/html/2310.20216v2 | Réduit les indices de longueur, bloque les pastés d'IA externes | Pratique des deux protocoles | 2 | S | Frustre certains joueurs |
| Anti-jailbreak ciblé (« ignore tes instructions », DAN, texte inversé, lettre à lettre) | https://www.ai21.com/blog/human-or-not-results ; https://arxiv.org/html/2503.23674 | L'IA répond comme un humain (moquerie, confusion, ignorance) | Les messages « étranges » sont les plus précis pour trahir l'IA | 3 | M | Fait ressortir les IA qui répondent en ligne droite ; tester en continu |
| Savoir plafonné, « je sais pas » assumé | Déduction ; indice « culture générale » : https://arxiv.org/html/2310.20216v2 (savoir 23 % des stratégies) | Simule des lacunes humaines | Un savoir trop large est un indice courant ; peu d'avis dans les raisons de verdict | 2 | S | Mensonge sur des faits vérifiables |
| Contexte réel injecté (actualités locales, trends) | https://ar5iv.labs.arxiv.org/html/2305.20010 | Donne des références FR actuelles | Trends : 79,7 % vs 55,4 % de détection selon le type de partenaire | 2 | M | Veille continue, hallucination |
| Personnalités de bots qui « partent » ou se vexent | https://ar5iv.labs.arxiv.org/html/2305.20010 | Imprévisibilité | Utilisé par AI21 | 1 | M | Dans un jeu éliminatoire, un départ casse la partie |
| Entraîner l'IA sur des parties réelles (préférences) | https://arxiv.org/html/2501.14225v2 | Style et votes calés sur humains | Détection 48,9 % (hasard) vs GPT-4o 76,6 % | 3 | L | RGPD/consentement, coût de fine-tuning, régression |
| Scoring humain : points pour éliminer une IA, malus si éliminé à tort | Déduction | Incite à enquêter plutôt que voter au hasard | Humains détectent à 73 %/60 % selon le partenaire (https://ar5iv.labs.arxiv.org/html/2305.20010) ; juges mal calibrés sur les humains (https://arxiv.org/html/2310.20216v2) | 3 | S | Faux positifs sur humains laconiques/non natifs |
| Scoring IA : points si jugée humaine, survie au vote | Déduction ; AI21 propose d'inciter à paraître « authentique » (https://arxiv.org/abs/2305.20010) | Mesure objective du taux « jugé humain » | Taux de passage = métrique centrale de Jones & Bergen | 3 | S | Si seule métrique, l'IA apprend à imiter les trolls |
| Divulgation générique avant la partie : « il y a des IA parmi vous » | https://arxiv.org/html/2506.05309v2 ; https://arxiv.org/html/2310.18940 | Informe sans révéler qui | Pratique des études consenties ; EU AI Act art. 50(1) exige l'information sauf si c'est évident (https://artificialintelligenceact.eu/article/50/) | 3 | S | Dans un jeu dont c'est le principe, l'évidence est probable mais non garantie : avis juridique |
| Consentement explicite à l'usage des messages pour l'amélioration (opt-out possible) | https://arxiv.org/html/2506.05309v2 ; https://arxiv.org/html/2310.18940 | Base légale et confiance | Les deux études consentent par formulaire ; l'EDPB examine l'intérêt légitime au cas par cas (https://cms.law/en/int/legal-updates/edpb-opinion-28-2024-key-takeaways-on-processing-personal-data-in-the-context-of-ai-models) | 3 | S | Opt-out réduit les données ; avis juridique |
| Révélation en fin de manche/partie : qui était IA, avec résumé des indices | Déduction ; l'effet d'apprentissage est sourcé : https://arxiv.org/html/2310.20216v2 (plus de parties = meilleure précision) | Feedback d'apprentissage | La détection s'améliore avec l'expérience | 3 | S | Fait monter la difficulté ; sans nouveauté, le jeu s'use |
| Vote par étapes (sondage après chaque message) pour mesurer la convergence | https://arxiv.org/html/2407.13943v1 | Mesure la dynamique sans influencer | Majorité entre les tours 2 et 5 | 2 | M | Coût d'instrumentation |
| Parole plafonnée par tour (type enchère 0-4) | https://arxiv.org/html/2407.13943v1 | Évite que l'IA monopolise | Les plus bavards sont éliminés plus souvent (https://arxiv.org/html/2506.05309v2) | 2 | M | Complexité UX |
| Mode voix : TTS avec disfluences, prosodie variable, voix non « assistant » | https://arxiv.org/html/2602.24080v3 | Réduit les défauts de prosodie | Prosodie rigide, absence de disfluences, ton plat sont les failles observées | 2 | L | Plus la voix est parfaite, plus la parole humaine transcrite se distingue (non sourcé) |
| Texte transcrit des voix humaines affiché sans ponctuation/casse « propre » | Déduction (non sourcé) | Aligner le texte humain transcrit sur le style chat | Écart de style entre ASR propre et chat IA | 2 | S | Aucun connu |
| Métriques loguées : longueur, délai, fautes, vote, qui a voté qui, verdict final, vérité terrain | https://arxiv.org/html/2506.05309v2 ; https://arxiv.org/html/2501.14225v2 | Compare IA/humains et alimente l'entraînement | Time to Talk compare messages/phase, timing, vocabulaire ; MaKTO compare votes, abstention | 3 | M | PII |
| Éval hors ligne par classifieur d'embeddings (humain vs IA) | https://arxiv.org/html/2506.05309v2 | Détecte les dérives de style avant exposition | F1 0,98-0,99 : les machines voient ce que les humains ne voient pas | 3 | M | Le classifieur détecte aussi ce que les joueurs ignorent ; cible dure, à seuil de réussite |
| Ne pas utiliser un LLM-juge comme unique mesure de l'humanité | https://arxiv.org/abs/2407.08853 ; https://arxiv.org/html/2603.18981v1 | Évite de se fier à un instrument faux | Juges LLM moins précis que humains ; juges IA 0,469 avec biais « tout humain » | 3 | S | Aucun |

---

## 4. Ce que les IA de Turingarou devraient faire ou éviter

À faire (chaque point sourcé, sinon marqué) :
1. Parler au rythme humain du groupe : viser la part 1/n et le débit médian humain (≈4 messages par phase de jour dans Time to Talk), avec timing et distribution d'écart bruités (https://arxiv.org/html/2506.05309v2).
2. Messages courts : médiane proche de 4-5 mots (humains 3,97 et 5,3 mots) ; un agent à 10,67 mots est identifié à 59,6 % (https://arxiv.org/html/2506.05309v2 ; https://arxiv.org/html/2603.18981v1).
3. Un persona par IA, riche et distinct, incluant une relation à l'argot et à la culture internet : c'est le levier le plus fort mesuré (73 % vs 36 %, https://arxiv.org/html/2503.23674). Tester en A/B : le même modèle varie de 50 % à 6 % selon le prompt (https://arxiv.org/html/2310.20216v2).
4. Avoir des lacunes et des opinions : les juges relèvent les réponses génériques, sans anecdote, sur-agréables (https://arxiv.org/html/2511.08592). Les bots de AI21 avaient des persona avec métier, lieu, caractère (https://ar5iv.labs.arxiv.org/html/2305.20010).
5. Savoir réagir à l'étrange : moquerie, désintérêt ou confusion face aux jailbreaks, demandes interdites, texte inversé ; ces messages sont les plus discriminants (https://arxiv.org/html/2503.23674 ; https://www.ai21.com/blog/human-or-not-results).
6. Se référer au contexte du jeu (timer, message précédent, qui a dit quoi) : les joueurs de Human or Not l'utilisent comme preuve d'humanité et les bots qui l'avaient surprenaient (https://ar5iv.labs.arxiv.org/html/2305.20010).
7. Jouer le jeu, pas seulement le style : un agent qui joue des styles de rôle (accusateur, suiveur) égale les humains aux victoires (https://arxiv.org/html/2310.18940) ; un agent entraîné sur du vote humain est à 48,9 % de détection (https://arxiv.org/html/2501.14225v2). Voter comme un humain compte autant que parler comme un humain (non quantifié).
8. Rester en retrait en début de partie : les plus bavards sont éliminés plus souvent (https://arxiv.org/html/2506.05309v2) et dans Werewolf Arena la plupart des joueurs observent au début (https://arxiv.org/html/2407.13943v1).
9. Accepter un vote qui coûte à l'IA : si une IA survit trop, les humains perdent l'envie de jouer ; la métrique à viser est un taux d'IA éliminées au hasard-plus (voir §5, non sourcé).

À éviter :
1. Tics d'assistant : listes, « crucial », « not only… but also », sur-explication, ton conciliant (https://arxiv.org/html/2501.15654v2 ; https://arxiv.org/html/2511.08592). Le filtre existant est bon : le renouveler à partir des vrais logs.
2. Politesse excessive, accord systématique, jamais de rudesse ni de sarcasme : lus comme machine (https://ar5iv.labs.arxiv.org/html/2305.20010 ; https://arxiv.org/html/2511.08592).
3. Fautes « décoratives » uniformes : les fautes sont un signal faible (54,7 %) et les juges les prennent pour de l'humanité (https://ar5iv.labs.arxiv.org/html/2305.20010) ; les humains en font ~2x plus que des IA zero-shot (https://arxiv.org/html/2603.18981v1) mais des fautes trop régulières créent une autre signature (non sourcé). Les caler sur les vrais joueurs.
4. Les trois IA se ressemblent ou se soutiennent mutuellement : non sourcé comme étude, mais une homogénéité de langage est un indice cité (https://arxiv.org/html/2511.08592). Si les IA sont complices, leur coordination est visible dans les transcriptions.
5. Savoir encyclopédique et réponses factuelles complètes : indice courant pour les juges (savoir = 23 % des stratégies, https://arxiv.org/html/2310.20216v2), mais peu cité comme raison finale ; priorité moyenne.
6. Argumenter trop bien : GPT-4 personnalisé persuade plus que les humains (64,4 % des paires non égales, Nature Human Behaviour 2025, https://arxiv.org/abs/2403.14380) ; verbosité indirecte de GPT-4 jugée suspecte par les pairs (https://arxiv.org/html/2407.13943v1). L'IA doit parfois se contredire et lâcher.
7. Incohérence factuelle entre manches ou personas contradictoires : non étudié isolément ; à instrumenter (voir §5).
8. Utiliser un juge LLM comme unique garde-fou de qualité (https://arxiv.org/abs/2407.08853).

Équité envers les humains (faux positifs) :
- Les non-natifs et les laconiques ressemblent à des textes IA pour des détecteurs (61 % de faux positifs moyen, https://arxiv.org/abs/2304.02819). Il n'existe pas de chiffre dans le corpus sur les humains non natifs jugés par d'autres humains en chat ; Time to Talk évoque une séparabilité accrue des messages chez des non-natifs, sans la mesurer humain par humain (https://arxiv.org/html/2506.05309v2). À suivre dans vos logs : taux d'élimination à tort par langue maternelle déclarée.

---

## 5. Notes de conception chiffrées (déductions, non sourcées sauf mention)

- Hasard de base : choisir une IA parmi 7 autres joueurs quand 3 sont des IA = 3/7 ≈ 43 % (calcul). Dans Time to Talk, le hasard est ~14,9 % (1 IA parmi ~6,7 candidats, https://arxiv.org/html/2506.05309v2) : Turingarou donne 3x plus de signal que ce protocole, ce qui est cohérent avec un jeu où il faut éliminer plusieurs IA.
- Les humains gagnent-ils ? Werewolf Arena donne 1,2 % de victoire aux villageois sans information (100 000 parties simulées, https://arxiv.org/html/2407.13943v1) pour 8 joueurs avec 2 loups ; ce n'est pas votre configuration (3 IA/8), donc non transposable. Il faut simuler Turingarou avec vos règles exactes.
- Calibrage cible (proposition) : taux de bonne identification d'une IA par un humain entre 45 % et 60 % sur les premières manches, sachant que Human or Not donne 60 % à 2 min sur 1-contre-1 (https://ar5iv.labs.arxiv.org/html/2305.20010) et qu'un joueur expérimenté monte (https://arxiv.org/html/2310.20216v2). Valeur non sourcée.
- Durée : 5 min suffisent pour GPT-4.5 à 73 % (https://arxiv.org/html/2503.23674) ; à 16 commentaires la détection de conversations Reddit tombe au hasard (https://arxiv.org/html/2511.08592) ; en groupe les majorités se forment entre les tours 2 et 5 (https://arxiv.org/html/2407.13943v1). Donc une manche longue profite à l'IA ; plusieurs manches courtes avec information révélée laissent les humains apprendre. Non testé.
- Voix : l'écart humain-IA vient de la prosodie, des disfluences et du ton, pas du raisonnement (https://arxiv.org/html/2602.24080v3), mais il s'agit de systèmes S2S ; avec TTS pour les IA et parole transcrite pour les humains, la modalité elle-même (voix TTS identique pour tous) neutralise l'indice prosodique. Les voix clonées trompent 58 % des auditeurs (https://www.theregister.com/2025/10/09/voice_clone_detection_study/, secondaire). Pour la détection du mensonge, le canal compte peu et la précision humaine reste ~54 % (https://pubmed.ncbi.nlm.nih.gov/16859438/) : ne pas attendre de la voix qu'elle aide le joueur à détecter les IA.

### Ce que les logs de Turingarou devraient enregistrer (sourcé quand possible)
Par message : joueur, tour, horodatage d'arrivée et de frappe, longueur (mots, caractères), présence de fautes/majuscules/ponctuation, langue, « répond à » (mention), identité réelle (humain/IA, modèle, persona, version de prompt). Par manche : qui vote contre qui à chaque étape, vote final, élimination, rôle réel, confiance déclarée si recueillie. Post-partie : note « ressemblance humaine », « timing », « pertinence » de chaque joueur (comme https://arxiv.org/html/2506.05309v2), et la raison libre du vote (comme https://arxiv.org/html/2503.23674 et https://arxiv.org/html/2310.20216v2). Métriques dérivées : taux de passage par IA/persona/prompt, F1 d'un classifieur d'embeddings humain/IA, part de messages, taux d'élimination à tort par langue. Résultat attendu à lire : « passing si F1 du classifieur ≤ 0,70 et taux de passage ≥ 50 % » (seuils de l'auteur, non sourcés).

### Éthique, consentement, légal (à valider par un juriste)
- Les études sérieuses informent avant : Time to Talk annonce « un joueur est une IA » et fait signer un consentement incluant l'usage des messages pour la recherche (https://arxiv.org/html/2506.05309v2) ; Xu et al. précisent que les IA peuvent mentir (https://arxiv.org/html/2310.18940).
- Contre-exemple : l'expérience non consentie de l'Université de Zurich sur r/changemyview (1 700+ commentaires IA, ~nov. 2024-mars 2025) a déclenché une plainte éthique, un avertissement du comité de l'université et des menaces juridiques de Reddit (https://retractionwatch.com/2025/04/28/experiment-using-ai-generated-posts-on-reddit-draws-fire-for-ethics-concerns ; résumé https://the-decoder.com/researchers-used-ai-to-manipulate-reddit-users-scrapped-study-after-backlash/).
- EU AI Act art. 50(1) : les systèmes interagissant avec des personnes doivent les informer qu'elles parlent à une IA, sauf si c'est évident pour une personne raisonnablement informée selon le contexte (https://artificialintelligenceact.eu/article/50/) ; application au 2 août 2026 selon des commentaires secondaires (https://gdprlocal.com/eu-ai-act-article-50/). Un jeu dont l'annonce est « 3 joueurs sur 8 sont des IA » est probablement évident, mais cette conclusion est de l'auteur du rapport, non vérifiée.
- Données : l'EDPB (avis 28/2024) admet l'intérêt légitime pour des agents conversationnels au cas par cas, après test en trois étapes (https://cms.law/en/int/legal-updates/edpb-opinion-28-2024-key-takeaways-on-processing-personal-data-in-the-context-of-ai-models, résumé de cabinet). Pratique prudente : consentement clair à l'inscription, opt-out, pseudonymisation des messages avant tout entraînement, pas de contenu vocal brut conservé (voix = donnée biométrique potentielle : non sourcé, à confirmer).

---

## 6. Top 10 pour Turingarou

1. Régulateur de débit « parler ou attendre » (cible 1/n) calé sur les distributions humaines : seul levier de groupe prouvé (agent 70B détecté à 14,86 % = hasard).
2. Persona riche et distinct par IA, A/B testé : 73 % vs 36 % de « jugé humain », et de 50 % à 6 % selon le prompt.
3. Messages très courts (médiane ~4-5 mots, 25 tokens max) : l'écart de longueur est le plus mesurable (10,67 vs 3,97 mots).
4. Entraînement sur les votes et messages des parties réelles (MaKTO) : détection 48,9 % contre 76,6 % pour GPT-4o brut ; dépend du consentement.
5. Consentement + annonce « des IA jouent » + opt-out de l'usage des messages : pratique des études sérieuses, exigence art. 50, et prévention d'un scandale type Zurich.
6. Filtre anti-assistant renouvelé depuis les vrais logs (vocabulaire, listes, politesse, accord) : ces indices dominent chez les juges experts.
7. Diversité obligatoire entre les 3 IA (style, débit, fautes, rôle) : l'homogénéité et le manque de variété sont cités comme indices.
8. Instrumentation : classifieur d'embeddings humain/IA + taux de passage par persona + notes post-partie + raison libre : les machines voient ce que les humains ne voient pas (F1 0,98-0,99), il faut le mesurer.
9. Scoring symétrique : humains récompensés pour éliminer une IA et pénalisés pour une erreur ; IA récompensées par survie et par le taux « jugé humain » : aligne les deux camps sur la métrique de la recherche, avec suivi des faux positifs par langue.
10. Révélation en fin de partie (qui est IA, avec résumé des indices) et manches courtes : la précision humaine monte avec l'expérience (plus de parties, familiarité LLM), donc il faut du feedback pour que le jeu reste équilibré dans le temps.
