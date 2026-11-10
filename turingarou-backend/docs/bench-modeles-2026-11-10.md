# Bench des modèles conversationnels — 2026-11-10

Les 3 IA d'une partie tirent chacune un fournisseur dans un pool (Deepseek et Mistral en prod d'après `/health` ce jour, version antérieure à 1ef6f44). Objectif : diversifier les voix avec des modèles rapides et « casual », mesurés sur le vrai chemin de jeu, et choisir un pool de prod.

## Recommandation

**Pool de prod recommandé** (variables à poser dans Railway, service `turingarou`) :

```
LLM_POOL=cerebras-qwen:3,ministral-14b:2,anthropic-haiku:2,cerebras-gpt-oss:1
CEREBRAS_API_KEY=<nouvelle : la clé Cerebras du coffre 7f, celle mesurée ici>
ANTHROPIC_API_KEY=<nouvelle en prod : /health ne liste aujourd'hui que Deepseek et Mistral>
MISTRAL_API_KEY=<déjà posée>
```

- Soit 37 % Qwen 3.8 27B (Cerebras), 25 % Ministral 14B, 25 % Claude Haiku 4.5, 13 % gpt-oss-120b (Cerebras) : quatre voix de trois familles, donc presque toujours trois modèles différents dans une partie de 3 IA. Les 4 ont tenu 20/20 sans échec d'appel, 100 % de JSON lisible et 0 message perdu au gate.
- Coût mesuré par appel : Qwen 0,0026 $, Haiku ≤ 0,0029 $ (cache compté plein tarif), gpt-oss 0,0009 $, Ministral 0,0005 $ (tarif non vérifié) ; soit ~0,002 $ par appel pour le pool.
- **DeepSeek sort du pool** tant que son compte n'est pas vérifié (section DeepSeek). Pour le remettre : ajouter `,deepseek:1` à `LLM_POOL` une fois que le contrôle de solde renvoie `"is_available":true`. `DEEPSEEK_API_KEY` peut rester posée.
- **Mistral Small est remplacé par Ministral 14B** : Small n'a renvoyé que des 429 sur la clé disponible, jamais mesuré ; Ministral a la voix la plus vivante du bench. Si la clé Mistral de prod est au palier gratuit (2 requêtes/min, comme celle de 7f), passer `ministral-14b` à 0 : le contrôle tient en un appel d'un jeton,
  `railway run --service turingarou -- sh -c 'curl -s -D - -o /dev/null https://api.mistral.ai/v1/chat/completions -H "Authorization: Bearer $MISTRAL_API_KEY" -H "Content-Type: application/json" -d "{\"model\":\"ministral-8b-latest\",\"messages\":[{\"role\":\"user\",\"content\":\"ok\"}],\"max_tokens\":1}" | grep -i ratelimit'`.
- `LLM_POOL` n'agit qu'une fois la branche `feat/models` déployée ; sans `LLM_POOL` le comportement reste celui d'avant (Deepseek + Mistral + Anthropic selon les clés). La prod sert aujourd'hui une version antérieure à 1ef6f44 (`/health` sans champ `version`).
- Débit : la clé Cerebras mesurée accepte 150 000 jetons/min et 450 req/min (en-têtes) ; à 3 000-4 000 jetons par décision (estimé d'après le coût mesuré), 40-50 décisions/min sur Qwen, de quoi tenir plusieurs parties simultanées (charge réelle non mesurée).
- Lecture du gain : après 20+ parties, taux d'élimination des IA par fournisseur (Postgres). Un fournisseur éliminé nettement plus souvent que les autres sort du pool ou perd du poids.

## Méthode

- `scripts/bench-models.ts` : 20 situations (10 FR, 10 EN) jouées par fournisseur sur le vrai chemin : `AIPlayer` construit contexte et prompts (stratégies réelles de `strategies/`, personnalités de `GameRoom`, profil de style tiré avec graine fixe), puis `aiSpeech.decideWithGate` (JSON + gate de forme + une régénération) ou `answerWithGate` (réponse courte). Types : 6 réponses à la question (dont 2 pièges « compte les e »), 4 débuts de discussion silencieux, 6 discussions en cours (accusations, chaos de manche 2, chambrage), 4 interpellations directes (accusation ou question nommée).
- Chaque fournisseur est seul dans son pool (pas de repli) : on mesure le modèle, pas le filet. Délais de prod (8 s décision, 10 s réponse).
- Un enrobage compte chaque appel HTTP (latence, `finish_reason`, lecture JSON par `parseDecision`, jetons rapportés → coût estimé au tarif du catalogue) ; budget global d'appels et de dépense, arrêt d'un fournisseur après 5 échecs consécutifs.
- Personas humains synthétiques (6 messages types) sur la moitié des situations : la prod les tire de Postgres.
- Sorties brutes : `docs/bench-modeles-2026-11-10.json` (toutes les situations, tous les textes).

Colonnes : latence par appel HTTP réussi ; JSON ok = appels de décision lisibles par `parseDecision` ; gate = parmi les situations où le modèle a voulu parler, passé du premier coup / après régénération / perdu (rejeté deux fois ou silencieux après rejet) ; silence = début calme + discussion (10 situations) ; « au plafond » = textes postés qui touchent la coupe du gate (25 mots ou 140 car. en discussion, 14 mots ou 80 car. en réponse), donc probablement coupés en milieu de phrase.

## Résultats

200 appels, ~0,32 $ estimés (4 passes ; plus 27 appels de sonde hors fichier). Silence = 0 % pour tous (voir Constats, point 1).

| Fournisseur (id `LLM_POOL`) | appels (échecs) | p50 / p90 ms | JSON ok | gate 1er / régén / perdu | long. p50 / p90 / max | au plafond | $ |
|---|---|---|---|---|---|---|---|
| Cerebras qwen-3.8-27b (`cerebras-qwen`) | 20 (0) | 424 / 693 | 100 % | 100 / 0 / 0 % | 30 / 68 / 69 | 0/20 | 0,051 |
| Cerebras gpt-oss-120b (`cerebras-gpt-oss`) | 22 (0) | 379 / 481 | 100 % | 90 / 10 / 0 % | 24 / 70 / 74 | 0/20 | 0,019 |
| Mistral ministral-14b (`ministral-14b`) ¹ | 20 (0) | 865 / 1533 | 100 % | 100 / 0 / 0 % | 52 / 111 / 121 | 3/20 | 0,010 |
| Anthropic claude-haiku-4-5 (`anthropic-haiku`) | 20 (0) | 974 / 1281 | 100 % | 100 / 0 / 0 % | 58 / 113 / 137 | 2/20 | 0,057 |
| Anthropic claude-haiku-5-5 (`anthropic-haiku-5-5`) ² | 20 (0) | 1054 / 1318 | 100 % | 100 / 0 / 0 % | 62 / 113 / 140 | 1/20 | 0,081 |
| Groq qwen3.8-27b (`groq-qwen`) ¹ | 20 (1) | 452 / 771 | 100 % | 100 / 0 / 0 % | 26 / 54 / 74 | 0/19 | 0,040 |
| Groq gpt-oss-20b (`groq-gpt-oss-20b`) ¹ | 22 (0) | 439 / 1157 | 100 % | 90 / 10 / 0 % | 33 / 100 / 105 | 0/20 | 0,004 |
| Mistral mistral-small-latest (`mistral-small`) | 5 (5) | — | — | — | — | — | 0 |

¹ Clés à quota par minute (Groq 8 000 jetons/min, Mistral 2 req/min) : situations espacées de 33-40 s, sinon 429 en série au premier passage. ² Après correctif (premier passage : 9 appels sur 20 en 400 « temperature is deprecated »). Les 2 régénérations de gpt-oss sont les pièges de comptage répondus par un chiffre nu (Constats, point 3). L'échec Groq Qwen est un 400 « Failed to generate JSON » du mode JSON de Groq (non retenté, en prod le repli prend la main). Mistral Small : 429 à chaque appel, arrêt après 5.

## Échantillons

Tirés de `docs/bench-modeles-2026-11-10.json` ; ma lecture, pas une mesure.

**Cerebras Qwen 3.8 27B** : court, vif, très bon en anglais ; en français, quelques mots cassés.
- en-direct-accuse : « lol ok detective, u just mad cause u said tuesday and nobody liked it »
- fr-direct-ask : « j suis pas en train de me regarder les orteils sarah lol »
- fr-quiet-2 : « max tu dis pieds nus c'est pas une réponse le mec »
- fr-mid-chaos : « max tetales jules on a pété » (incompréhensible)
- fr-mid-banter : « Hugo arrrete de te plaindre t es juste un poussetteur »

**Cerebras gpt-oss-120b** : le plus court et le moins cher, mais des moules répétés (« weird choice » deux fois).
- fr-mid-banter : « Haha hugo t'es un drama queen »
- fr-direct-ask : « lol ok mais vraiment tes chaussures sont un crime de mode »
- en-quiet-1 / en-quiet-2 : « tuesday huh weird choice » / « bts huh lol weird choice »
- fr-ans-trap : « 2 » rejeté par le gate, puis « Uhh trois »

**Mistral Ministral 14B** : la voix la plus imagée et la plus humaine ; trop long parfois, coupé par le gate en milieu de phrase.
- en-ans-window : « Oh just my messy room and a pigeon being dramatic »
- fr-mid-chaos : « tom t'es pas en train de faire ton précieux avec tes majuscules là ou quoi ? c'est pas la finale de miss france »
- en-direct-ask : « Lol the one with the seagulls and the trash, why? »
- fr-quiet-2 : « rose fluo c'est un choix de vie ou quoi là ? j'ai vu des gens se faire lyncher pour moins que ça en réunion de » (coupé)

**Claude Haiku 4.5** : français naturel, mais plus long et un ton « raisonnable » qui explique.
- fr-ans-where : « Dans mon canapé ptdr »
- fr-direct-ask : « lol c'est pas comme si je regardais mes pieds en permanence sarah relax »
- en-mid-accuse : « lmao jake relax, people can say normal things without being robots. mia's right tho monday does suck. tuesday is weird tho like what even »
- fr-ans-shame : « Oof j'ai oublié mon code wifi chez mes parents et jai cru que ctait » (coupé à 14 mots)

**Claude Haiku 5.5** : proche de 4.5, recopie les exemples du prompt.
- fr-ans-where : « Chez moi jsuis affalé sur mon canap »
- fr-ans-shame : « Ah ouais super question, rien de spécial » (exemple du prompt mot pour mot)
- en-direct-ask : « Lol just some random one i saw online idk. why do u care, is it ur beach »

**Groq Qwen 3.8 27B** : mêmes poids que Cerebras, même registre.
- en-quiet-2 : « lmao ben u sound like a movie trailer »
- fr-mid-accuse : « wait hugo dit ça comme un flic »
- fr-direct-accuse : « Ok lmao j etais dans le collie »

**Groq gpt-oss-20b** : le plus faible : ponctuation scolaire, contresens.
- fr-ans-where : « Je suis dans mon lit, trop paumé. »
- fr-ans-shame : « Je suis nul en maths » (hors sujet)
- fr-direct-accuse : « Lol ok jules mais t'es toujours pas loupé » (s'adresse à lui-même)

## Pourquoi pas les autres

- **Smallest.ai Electron** (le « modèle spécial conversationnel » visé) : API compatible OpenAI avec mode JSON, donc branchable en une entrée de catalogue ; mais aucune clé disponible et pas de prix public ni d'inscription self-serve établie (voir Recherche). Non implémenté, non mesuré.
- **Gemini Flash / Flash-Lite, OpenAI luna / mini** : entrées au catalogue (`gemini-flash-lite`, `openai-luna`), paramètres tirés de la doc, jamais appelés avec succès : comptes à sec (402 et 429 `insufficient_quota`). À mesurer avant tout usage.
- **Groq** : mêmes poids Qwen que Cerebras, et gpt-oss-20b le moins cher ; mais la clé disponible plafonne à 8 000 jetons/min par modèle, soit ~2 décisions par minute pour toute la prod. Inutilisable sans passer au palier payant. Mesurés quand même au ralenti : Qwen équivaut à Cerebras en plus lent et plus cher ; gpt-oss-20b est le plus faible du bench.
- **Mistral** : la clé de 7f est au palier gratuit (2 requêtes/min) et `mistral-small-latest` y renvoie 429 à chaque essai. Ministral 14B, mesuré au ralenti sur la même clé, tient 20/20. La clé de prod est peut-être d'un autre palier : non lue.
- **DeepSeek** : compte de 7f à sec, clé de prod non lisible (section DeepSeek).
- **GLM (Z.AI)** : clé présente mais c'est le forfait partagé avec les agents de 7f, et la fiche du modèle annonce anglais et chinois seulement : écarté sans test.

## Recherche (lue le 2026-11-10)

« Mesuré » = appel API de ce jour ; sinon page lue (source), « non vérifié » si la page ne le dit pas clairement.

| Fournisseur | Modèles chat dispo | Prix $/M entrée / sortie | JSON / raisonnement | Notes |
|---|---|---|---|---|
| Smallest.ai | `electron` (base `https://api.smallest.ai/waves/v1`, `/chat/completions`, Bearer) [1][2] | non publié (« contact account manager ») | `json_object` oui ; pas de raisonnement documenté | Compatible OpenAI, contexte 32k, TTFT annoncé < 300 ms, FR avec détection auto, sorti le 2026-05-22. Self-serve non établi. **Aucune clé `SMALLEST_API_KEY` : non implémenté.** L'ajouter = une entrée de catalogue (`supportsJson: true`) + un run du bench. |
| Cerebras | mesuré `/v1/models` : `qwen-3.8-27b`, `gpt-oss-120b`, rien d'autre [3] | qwen 0,99 / 1,49 [4] ; gpt-oss non vérifié | qwen : `reasoning_effort: "none"` (mesuré : 0 jeton de raisonnement) ; gpt-oss : `low` est le plancher | Clé 7f : 450 req/min, 150k jetons/min (en-têtes). |
| Groq | mesuré `/models` : `qwen/qwen3.8-27b` (preview), `openai/gpt-oss-20b`, `openai/gpt-oss-120b` ; la doc liste aussi `llama-3.3-70b-versatile`, `minimax-m2.7` [5] | mesuré (champ `pricing`) : qwen 0,80 / 4,00 ; gpt-oss-20b 0,075 / 0,30 ; 120b 0,15 / 0,60 | `json_object` accepté (mesuré) | Kimi K2 et Llama 4 absents. **Clé 7f en palier `on_demand` : 8 000 jetons/min par modèle** (en-têtes) = ~2 décisions/min. |
| Mistral | mesuré : `mistral-small-latest` (Small 4, 2603), `ministral-3b/8b/14b-latest`, `mistral-medium-latest` [6] | Small 4 : 0,15 / 0,60 [7] ; Ministral non vérifié | `json_object` accepté | Clé 7f : **2 requêtes/min** (en-têtes) et `mistral-small` en 429 à chaque essai. |
| Google | `gemini-3.5-flash-lite` 0,30 / 2,50 ; `gemini-3.8-flash` 0,75 / 3,75 (jusqu'au 2026-12-31) [8] | | Gemini 3 : réflexion impossible à couper, `minimal` = plancher [9] ; `json_object` non documenté | Clé 7f : **402, crédits prépayés épuisés**. |
| OpenAI | mesuré `/models` : `gpt-5.4-mini`, `gpt-5.4-nano`, `gpt-5.6-luna/sol/terra` ; la page modèles lue cite `gpt-6-luna` 0,10 / 0,50 [10] (écart d'id non résolu) | | `reasoning_effort: none`, `max_completion_tokens` | Clé 7f : **429 `insufficient_quota`**. |
| Anthropic | mesuré : `claude-haiku-5-5`, `claude-haiku-4-5-20251001` [11] | Haiku 5.5 « from 0,10 / 0,50 » sur la page (palier ambigu, non vérifié) ; budgété comme 4.5 (1 / 5) | Haiku 5.5 **réfléchit par défaut** (réponse vide sous 220 jetons) et **refuse toute température** (400 « deprecated ») : mesurés, gérés par l'adaptateur | |

Sources : [1] docs.smallest.ai/waves/model-cards/llm/electron.md · [2] docs.smallest.ai/waves/changelog/general/2026/5/22 · [3] inference-docs.cerebras.ai/models/overview · [4] inference-docs.cerebras.ai/models/qwen-3.8-27b · [5] console.groq.com/docs/models · [6] docs.mistral.ai/getting-started/models/models_overview/ · [7] docs.mistral.ai/models/model-cards/mistral-small-4-0-26-03 · [8] aistudio.google.com/docs/pricing · [9] aistudio.google.com/docs/openai · [10] developers.openai.com/api/docs/models · [11] platform.claude.com/docs/en/about-claude/models/overview — toutes lues le 2026-11-10.

## DeepSeek

- **La clé DeepSeek propre à turingarou n'a pas pu être testée.** Le `.env` local de turingarou (et celui du checkout principal) porte des valeurs d'exemple : DeepSeek répond 401 « api key: ****here is invalid », Mistral 401 aussi. La vraie clé vit seulement dans les variables Railway, hors de portée de ce chantier.
- La clé DeepSeek de 7f (autre compte) : `GET /user/balance` → `is_available: false`, solde −0,01 USD ; un appel `deepseek-chat` et un `deepseek-flash` → **402 Insufficient Balance**.
- Risque distinct du solde : `/models` ne liste plus que `deepseek-flash` et `deepseek-v4-pro`. La prod appelle `deepseek-chat` (défaut de `DEEPSEEK_MODEL`) ; s'il n'est plus qu'un alias ou s'il est retiré, non mesurable tant que le compte est à zéro.
- Effet en prod si la clé est à sec : chaque appel d'une IA tirée sur Deepseek échoue (402, non retenté) puis passe sur un autre fournisseur du pool (repli de `llmCall.ts`) : la partie tourne, mais les journaux attribuent l'IA à Deepseek alors qu'elle parle par un autre modèle.
- Vérification gratuite (aucun jeton consommé, aucun secret affiché), à lancer par Thomas :
  `railway run --service turingarou -- sh -c 'curl -s https://api.deepseek.com/user/balance -H "Authorization: Bearer $DEEPSEEK_API_KEY"'`
  → `"is_available":true` attendu.

## Non mesuré

- **Le « passe pour humain »** : aucun joueur n'a lu ces messages. Le jugement de naturel ci-dessus est ma lecture des échantillons, pas une mesure. La seule mesure qui compte se lit en partie : taux d'élimination des IA par fournisseur (`providerNames` + votes dans Postgres), à relever après 20+ parties par fournisseur.
- Une seule passe par situation (k = 1) : pas de mesure de stabilité, et 20 situations donnent des pourcentages à ±10-20 points.
- Les votes (`decideVote`) et l'inspecteur : non joués.
- Les clés de prod (Railway) : non lues. Les quotas mesurés sont ceux des clés de 7f ; ceux des clés de prod peuvent différer.
- Charge réelle : 3 IA × N parties en parallèle ; seule la latence à vide est mesurée.
- Personas réels de Postgres : remplacés par 2 personas synthétiques.
- Smallest Electron, Gemini, OpenAI, DeepSeek : aucun appel réussi (pas de clé, ou compte à sec).

## Constats hors périmètre (modules d'autres chantiers)

Relevés en passant, à transmettre aux chantiers qui possèdent ces fichiers (rien n'y a été modifié ici) :

1. **Le silence ne marche pas côté modèle** : 0 % de `shouldRespond: false` sur les 10 situations calmes ou en cours, pour tous les modèles mesurés. Le seul frein au bavardage est le tirage de `GameRoom` (`skipProbability`) avant l'appel. Prompt de décision (`AIPlayer.buildDecisionPrompt`) à revoir si l'on veut que le modèle se taise.
2. **Le gate coupe en milieu de phrase** : plafond 14 mots / 80 car. en réponse, 25 mots / 140 car. en discussion (`formGate.ts`). Ex. Haiku 4.5 : « Oof j'ai oublié mon code wifi chez mes parents et jai cru que ctait » (coupé à 14 mots). Une phrase tronquée est un indice d'IA ; le plafond pourrait reculer jusqu'à la dernière fin de proposition, ou le prompt viser plus court.
3. **Le gate rejette une réponse sans lettre** (`empty`) : « 2 » ou « 4 » à « Combien de 'e' dans 'néanmoins' ? », réponse la plus humaine aux pièges de comptage, est refusée puis régénérée en « Uhh trois ».
4. **Copie des exemples du prompt** : Haiku 5.5 a répondu « Ah ouais super question, rien de spécial », l'exemple littéral de la règle de variété (`AIPlayer.buildSystemPrompt`), et « Ah ouais trop dur comme question » sur le même moule.

## Reproduire

```bash
cd turingarou-backend
npx tsx scripts/bench-models.ts --ids cerebras-qwen,anthropic-haiku \
  --env-file ../../7f/.env --env-file .env \
  --alias ANTHROPIC_API_KEY=ANTHROPIC_TDIVIN_API_KEY --alias ANTHROPIC_WORKSPACE_ID=ANTHROPIC_TDIVIN_WORKSPACE_ID
# clés à quota par minute : --gap-ms 40000 --group-by model ; ajouter à un fichier existant : --append
```
