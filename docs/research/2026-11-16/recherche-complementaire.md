# Turingarou — recherche complémentaire du 16 novembre 2026

Complète la carte du 11 novembre (`../2026-11-11/CARTE.md`) sur ses trous déclarés : le déploiement (« Non mesuré »), le texte d'annonce (« à faire valider, AI Act art. 50 »), le copier-coller (« Aucune source trouvée »), le tirage A/B (« calcul non sourcé ») et les tarifs du pool (`providerRegistry.ts`, « Price unverified »).

**Méthode.** Recherche web, puis ouverture des pages clés par WebFetch (un petit modèle relit la page ; les citations viennent de sa sortie). *Page ouverte* = lue par WebFetch ; *résultat de recherche* = extrait du moteur, page non ouverte ; **Déduction** = raisonnement de Claude. Aucun code, aucun réglage Railway ni aucune variable n'a été modifié. Ce n'est pas un avis juridique.

## En bref

1. **Le déploiement a probablement deux verrous, pas un seul.** Le workflow installe `@railway/cli@latest`, or depuis la v5.3.0 (5 juin 2026) `railway up` avec un jeton de projet échoue en CI (« Not signed in »). Un employé de Railway parle de régression et conseille d'épingler la v5.2.0. Aucun correctif publié n'a été trouvé.
2. **Haiku 5.5 coûte dix fois moins que ce que compte le registre** : 0,10 $ / 0,50 $ par million de jetons, au lieu de 1 $ / 5 $. Le coût du bench pour Haiku 5.5 est donc surestimé d'environ dix fois, ce qui en fait l'un des modèles les moins chers du pool. Ministral 14B et les deux modèles Cerebras sont confirmés au prix du registre. `deepseek-chat` n'apparaît plus sur la page des tarifs de DeepSeek.
3. **L'art. 50 de l'AI Act s'applique depuis le 2 août 2026**, et les lignes directrices finales de la Commission datent du 20 juillet. L'exception « évident d'après le contexte » s'interprète étroitement, et le jeu multijoueur où une IA peut passer pour un joueur est justement le cas qui la fait tomber. Il faut donc informer, au plus tard à la première interaction, ce que fait déjà l'annonce. Le seuil est plus bas si des mineurs jouent.
4. **Le copier-coller a maintenant des sources.** Une étude sur 928 participants de Prolific (mai-juillet 2025) signale environ 9 % de réponses compatibles avec une aide par IA, détectées par les deux mesures qu'ajoute L6 : le collage, et un nombre de frappes anormalement bas pour la longueur.
5. **Le « ~60 parties par bras » de l'A/B se retrouve par le calcul**, à condition de supposer une corrélation intra-partie d'environ 0,1 avec une vingtaine de votes par partie. Cette corrélation n'est pas connue : il faut la mesurer sur les premières parties.

---

## 1. Déploiement (CARTE, « Non mesuré »)

| Fait | Source |
|---|---|
| Le workflow lance `npx -y @railway/cli@latest up --service turingarou --detach` avec `RAILWAY_TOKEN` | `.github/workflows/deploy-railway.yml`, dernière étape |
| Après la publication de `@railway/cli` v5.3.0 (2026-06-05, vers 16 h 42 UTC), `railway up` échoue en CI avec « Not signed in. » malgré un jeton de projet valide ; la v5.2.0 marchait | [Station Railway, « CLI v5.3.0 railway up fails »](https://station.railway.com/questions/cli-v5-3-0-railway-up-fails-with-no-1b04e9fc), page ouverte |
| Un employé de Railway parle d'« a regression in CLI v5.3.0 », rappelle que les jetons de projet sont « fully supported for `railway up` », et appelle l'épinglage à la v5.2.0 « the right workaround for now ». Le fil est clos par un robot, sans correctif annoncé | idem, page ouverte |
| Même panne sur un autre projet, réparée par l'épinglage à la v5.2.0 ; aucune réponse technique du personnel dans le fil | [Station Railway, « Railway CLI 5.3.0 breaks GitHub Actions »](https://station.railway.com/questions/railway-cli-5-3-0-breaks-git-hub-actions-3f12fa24), page ouverte |
| La première page des versions va de v5.45.6 à v5.47.2 (1er septembre 2026), et aucune note n'y parle de jeton de projet ni d'authentification | [GitHub, railwayapp/cli, releases](https://github.com/railwayapp/cli/releases), page ouverte (pages suivantes non lues) |
| Le guide de Railway, mis à jour le 2026-10-29, recommande toujours un jeton de projet dans `RAILWAY_TOKEN` | [Railway, *Using GitHub Actions with Railway*](https://railway.com/guides/github-actions.md), résultat de recherche |

**Déduction.** La carte attribue les échecs au secret `RAILWAY_TOKEN` absent. Une fois le secret posé, le prochain échec probable est « Not signed in », venu de `@latest`. Correctif proposé, non appliqué : remplacer `@railway/cli@latest` par `@railway/cli@5.2.0`, ou par une version testée, dans le workflow. Avec une version épinglée, chaque déploiement est aussi reproductible.

## 2. Tarifs du pool (SPEC-11, `src/llm/providerRegistry.ts`)

| Entrée du registre | Prix du registre (in / out, $ par Mjetons) | Prix relevé | Source |
|---|---|---|---|
| `anthropic-haiku` (`claude-haiku-4-5`) | 1 / 5 | **1 / 5** ; écriture de cache 1,25, lecture 0,10 | [Claude, *Pricing*](https://platform.claude.com/docs/en/about-claude/pricing), page ouverte |
| `anthropic-haiku-5-5` (`claude-haiku-5-5`) | 1 / 5 (« Price unverified, budgeted like 4.5 ») | **0,10 / 0,50** pour un prompt de 100 000 jetons au plus ; 0,50 / 2,50 au-delà ; écriture de cache 0,125, lecture 0,01 | idem, page ouverte ; lancement le 7 octobre 2026 ([mixed-news.com](https://mixed-news.com/en/?p=35955), résultat de recherche) |
| `ministral-14b` | 0,20 / 0,20 (« Price unverified ») | **0,20 / 0,20** ; lecture de cache 0,02 | [Developers Digest, d'après docs.mistral.ai au 17/10/2026](https://www.developersdigest.tech/models/ministral-3-14b), résultat de recherche ; page de Mistral non ouverte |
| `cerebras-qwen` (`qwen-3.8-27b`) | 0,99 / 1,49 | **0,99 / 1,49** | [BenchLM, 20/10/2026](https://benchlm.ai/hosts/cerebras), [claudelog](https://claudelog.com/faqs/cerebras-api-pricing/), résultats de recherche ; la page de Cerebras, ouverte, n'affiche pas les chiffres |
| `cerebras-gpt-oss` (`gpt-oss-120b`) | 0,35 / 0,75 (« Price unverified ») | **0,35 / 0,75** | idem |
| `deepseek` (`deepseek-chat`) | 0,30 / 1,20 (« Price unverified ») | `deepseek-chat` absent de la page. `deepseek-flash` (DeepSeek-V4.1-Flash-1017) : 0,15 / 0,60 hors pointe, 0,30 / 1,20 en pointe ; lecture de cache 0,003 / 0,006. Pointe : 01 h-04 h et 06 h-10 h UTC en semaine | [DeepSeek, *Models & Pricing*](https://api-docs.deepseek.com/quick_start/pricing), page ouverte |

**Conditions d'usage relevées.**
- Cerebras : le palier Developer (crédit de 5 $) est « not intended for production » ; limites annoncées pour Qwen 3.8 27B : 300 requêtes/min, 150 000 jetons/min non mis en cache ([usagepricing](https://www.usagepricing.com/blueprint/activity/cerebras-2026-10-05-qwen-3-8-developer-tier-merge), [morphllm](https://www.morphllm.com/cerebras-pricing), résultats de recherche). Le bench a lu 150 000 jetons/min et 450 req/min dans les en-têtes de sa clé.

**Déductions.**
- Le coût mesuré de Haiku 5.5 dans `docs/bench-modeles-2026-11-10.md` (0,081 $ pour 20 situations) tombe à environ 0,008 $ au vrai tarif. La reco du bench (25 % Haiku 4.5) peut être revue au profit de 5.5, à qualité égale au bench. Les prompts de Turingarou restent très loin des 100 000 jetons.
- Le prix du registre pour `deepseek` correspond au tarif de pointe de `deepseek-flash`. Si `deepseek-chat` n'est plus qu'un alias, `deepseek-flash` est l'identifiant à mesurer.
- Le Developer de Cerebras « pas pour la production » est un risque pour un pool où Qwen pèse 37 %.

## 3. Annonce et consentement (CARTE, « Texte à faire valider ») — à faire relire par un juriste

| Fait | Source |
|---|---|
| L'art. 50 est applicable et sanctionnable depuis le 2 août 2026 ; le *Digital Omnibus* a reporté le régime à haut risque, pas l'art. 50(1) | [Goodwin, août 2026](https://www.goodwinlaw.com/en/insights/publications/2026/08/alerts-technology-dpc-eu-ai-act-transparency-obligations-now-in-force), [Process Excellence Network](https://www.processexcellencenetwork.com/ai/articles/eu-ai-act-2026-what-actually-changed-and-what-deployers-still-must-do), résultats de recherche |
| Seul l'art. 50(2) (marquage des contenus) est décalé au 2 décembre 2026, pour les systèmes déjà sur le marché | [CASRAI](https://casrai.org/wp/?p=3315), résultat de recherche |
| Lignes directrices finales de la Commission, C(2026) 5054, publiées le 20 juillet 2026, non contraignantes | [Stephenson Harwood](https://www.stephensonharwood.com/post/102nfqh/eu-ai-act-update-european-commission-adopts-guidelines-on-article-50-transparency-obligations/), résultat de recherche ; [Chambers](https://chambers.com/articles/same-npc-different-rules-how-a-player-s-age-changes-their-responsibilities-under-the-ai-act), page ouverte |
| Pour les jeux, l'évidence dépend du mode (solo ou multijoueur, « where an AI-NPC might be mistaken for another player »), du réalisme, de l'immersion et du public réel. « The nature of the game must unambiguously indicate that no other person is involved in the interaction » ; le seuil d'évidence est abaissé quand le public compte des enfants | [Chambers](https://chambers.com/articles/same-npc-different-rules-how-a-player-s-age-changes-their-responsibilities-under-the-ai-act), page ouverte |
| L'exception d'évidence s'interprète restrictivement | [Mishcon de Reya](https://www.mishcon.com/news/what-the-eus-final-ai-transparency-guidelines-mean-for-providers-and-deployers), résultat de recherche |
| L'information est due au plus tard au moment de la première interaction | [Addleshaw Goddard](https://www.addleshawgoddard.com/link/ddfd91aa7c2d47f590734875b3d3f577.aspx), résultat de recherche |
| Les lignes directrices mettent en garde contre une information trop intrusive, que l'on finit par ne plus lire (« banner blindness ») | [Gleiss Lutz](https://www.gleisslutz.com/en/know-how/update-ai-transparency-advertising-european-commissions-guidelines-ai-act), résultat de recherche |
| RGPD en France : 15 ans pour consentir seul (art. 45 de la loi Informatique et Libertés) quand le traitement repose sur le consentement ; en dessous, consentement conjoint d'un parent | [CMS](https://cms.law/en/fra/legal-updates/jeux-video-et-compagnons-ia-quand-le-rgpd-le-ria-et-le-dsa-se-cumulent-pour-proteger-les-mineurs), [donneespersonnelles.fr](https://www.donneespersonnelles.fr/rgpd-donnees-mineurs), résultats de recherche |
| Pour la CNIL, l'éditeur qui sait ou devrait savoir que des mineurs jouent leur doit les protections renforcées, même si le jeu ne les vise pas | [CMS](https://cms.law/en/fra/legal-updates/jeux-video-et-compagnons-ia-quand-le-rgpd-le-ria-et-le-dsa-se-cumulent-pour-proteger-les-mineurs), résultat de recherche |
| CNIL (19 juin 2025) : la réutilisation des conversations d'un agent conversationnel pour améliorer le modèle peut reposer sur l'intérêt légitime, sous garanties | [CNIL](https://cnil.fr/fr/node/167310), résultat de recherche |

**Déductions.**
- Turingarou ne peut pas s'appuyer sur l'exception d'évidence : tout le jeu consiste à ce qu'une IA passe pour un joueur. Il doit donc informer, et l'annonce actuelle (« Des IA jouent dans chaque partie… ») va dans ce sens.
- **La question pour le juriste** : une information générale (« certains joueurs sont des IA ») suffit-elle, quand le jeu cache volontairement lesquels ? Aucune source trouvée ne traite ce cas précis.
- Trois gestes renforcent la position, sans rien casser du jeu :
  1. l'annonce visible avant de rejoindre une table, et non seulement à la création ;
  2. un texte qui dit le mécanisme : « des IA se font passer pour des joueurs humains » ;
  3. une limite d'âge affichée (15 ans), puisque la case « exemples de style » repose sur le consentement.

## 4. Copier-coller et frappe (CARTE, L6, « Aucune source trouvée »)

| Fait | Source |
|---|---|
| *Chatbots Are Undermining Crowdsourced Research in the Behavioral Sciences: Detecting AI–Assisted Cheating With a Keystroke-Based Tool* : trois études sur Prolific (N = 928, mai-juillet 2025) ; environ 9 % des participants ont rendu des réponses compatibles avec une aide par IA, malgré la dissuasion | [*Advances in Methods and Practices in Psychological Science*](https://www.psychologicalscience.org/journals/ampps/25152459261424723/), page ouverte |
| Règles de signalement : un collage dans la réponse, ou un nombre de frappes anormalement bas pour la longueur ; puis comparaison manuelle des frappes et du texte final. La page ne donne pas de taux de faux positifs | idem, page ouverte |
| Mehta *et al.*, *Detecting LLM-Assisted Academic Dishonesty using Keystroke Dynamics* (arXiv 2511.12468, v2 du 14 avril 2026) : 40 participants dans l'étude d'origine, plus 90 nouveaux ; les modèles fondés sur la frappe battent les détecteurs de texte, et les juges humains sont proches du hasard. Les chiffres ne sont pas dans le résumé | [arXiv](https://arxiv.org/abs/2511.12468), page ouverte |

**Déduction.** Les deux mesures livrées par L6 (collage, temps de frappe par ligne) sont exactement celles de l'étude AMPPS. Le taux de 9 % vient de participants payés, pas de joueurs, et n'est qu'un ordre de grandeur. Garder « mesurer sans sanctionner » : un humain qui colle une réponse de ChatGPT fausse surtout la mesure « jugé humain », et ses parties peuvent être marquées dans l'analyse.

## 5. Taille de l'A/B texte contre voix (CARTE, « calcul du rapport, non sourcé »)

**Calcul de Claude.** Test de deux proportions, α = 0,05 bilatéral, puissance de 0,8. Pour passer de 50 % à 60 % de détection, il faut 388 jugements par bras. Les jugements d'une même partie se ressemblent : avec *m* jugements par partie et une corrélation intra-partie *ρ*, l'effet de plan vaut 1 + (*m* − 1)*ρ*.

| Jugements par partie (*m*) | *ρ* = 0 | *ρ* = 0,05 | *ρ* = 0,1 | *ρ* = 0,2 |
|---|---|---|---|---|
| 10 | 39 parties/bras | 57 | 74 | 109 |
| 20 | 20 | 38 | 57 | 93 |

Pour un écart de 15 points (50 → 65 %) : 170 jugements par bras, soit 25 à 33 parties par bras à *ρ* = 0,1.

**Déductions.**
- Les « ~60 parties par bras » de la carte tiennent pour *ρ* ≈ 0,1 et une vingtaine de votes par partie, ou pour *ρ* ≈ 0,05 et une dizaine.
- *ρ* est inconnu. Il faut l'estimer sur les 20 premières parties journalisées, avant de fixer la durée de l'A/B.
- Tirer le mode au niveau de la table, jamais du joueur, et analyser par partie (ou par modèle mixte avec un effet aléatoire de partie).

## 6. Veille : études et jeux récents

| Fait | Source |
|---|---|
| *RogueAI* (CLiC-it 2026, arXiv 2606.13310, 11 juin 2026) : un humain interroge deux agents LLM, dont un seul a le droit de mentir. C'est un test inversé centré sur la confiance | [arXiv](https://arxiv.org/pdf/2606.13310), résultat de recherche |
| *TuringHotel* (arXiv 2603.18981) : 17 humains et 19 instances de LLM, juges et jugés à la fois ; des IA passent encore pour humaines, mais des « empreintes » humaines restent visibles | [newx.sg](https://www.newx.sg/paper/detail/ed4312e0-280e-11f1-b84c-00163e10baa7), résultat de recherche (déjà la fiche F11 du 11/11) |
| *SpotTheAgent* : jeu de déduction sociale en temps réel où l'on cherche l'agent synthétique (billet du 27 mars 2026) | [blog](https://aeon-elio.github.io/elios_blog/posts/the-game-that-tests-who-is-real-2026-03-27.html), résultat de recherche |
| Discord Activities : Embedded App SDK v2.5.0 (5 mai 2026) ; tout appel réseau passe par le proxy `discordsays.com` sous une CSP stricte, et un domaine non déclaré est bloqué ; la vérification ouvre la découverte et les serveurs de toute taille | [Cinevva, juillet 2026](https://app.cinevva.com/guides/publish-game-discord-activities), [Discord Developers](https://support-dev.discord.com/hc/en-us/articles/26576097154199), résultats de recherche |

**Déduction.** Pour une future Activity Discord (« plus tard » dans la carte), le Socket.io du backend devra être déclaré dans les correspondances d'URL du proxy de Discord.

## Non vérifié

- Une version de la CLI Railway postérieure à 5.3.0 qui corrigerait la régression.
- La page de tarifs de Mistral, et les prix de Groq.
- Le statut exact de `deepseek-chat` (alias ou retiré) : à lire dans le changelog de DeepSeek.
- Le texte même des lignes directrices C(2026) 5054 (seuls des résumés de cabinets ont été lus).
