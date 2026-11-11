# Inventaire de l'existant — Turingarou au 2026-11-11 (main 4ca1de6)

Relevé dans le code, chaque ligne citée. Sert de colonne « existe déjà / manque » à la carte des fonctionnalités.

## Ce qui existe

| Domaine | Ce que fait le jeu | Où |
|---|---|---|
| Entrée | Salon public qui remplit la première partie en attente ; salon privé par code | `src/server.ts:62-93`, `#room-input`, `#room-code-display` |
| Taille | 8 places, 3 IA (`AI_COUNT`), 5 humains ; à 4 humains un « inspecteur » (bot rangé côté humains) peut compléter | `GameRoom.ts:190-250` |
| Phases | question 20 s → discussion 100 s → vote 30 s → fin de manche 8 s, 7 manches au plus | `GameRoom.ts:75-79` |
| Vote | Majorité ; égalité = personne ; un survivant tiré au sort est immunisé tant qu'il reste plus de 4 joueurs ; votes visibles pendant discussion et vote | `GameRoom.ts:434-470`, `:713` |
| Fin | Humains gagnent si plus aucune IA ; IA gagnent si plus aucun humain ; nul à 7 manches ou à 2 joueurs | `GameRoom.ts:473-500` |
| Écrans | Attente, question, jeu (chat colonnes ou liste), vote, fin de manche (historique), fin de partie (historique), barre spectateur des éliminés | `turingarou-online.html` |
| Signalement | Un humain peut signaler un message suspect (stocké, non montré) | `GameRoom.ts:669-675` |
| IA | Pool de modèles par variable, délais humains, filtre de forme, réponse < 1 s quand on les nomme, persona tirée de vrais joueurs par langue | `src/llm/`, `BotDirector.ts`, `formGate.ts` |
| Voix | Voix par joueur, push-to-talk transcrit puis relu (Cartesia/Deepgram ou Gradium), éteinte sans clé | `src/voice/` |
| Historique | Export pseudonymisé sous `ADMIN_SECRET`, analyse, briefing appris (≥ 20 parties, non câblé) | `src/history/` |
| Langues | FR / EN | `#lang-select` |

## Manques vérifiés

1. **Pas de révélation finale.** En fin de partie, l'état envoyé ne contient que `gameOverReason` ; les IA encore en jeu ne sont jamais dévoilées, ni leur modèle (`GameRoom.ts:712`). La récompense du genre — « c'était lui ! » — manque.
2. **Pas de reprise après coupure.** Une déconnexion retire le joueur sur-le-champ (`removePlayer`, `GameRoom.ts:260`) ; le client se reconnecte (5 essais, `turingarou-online.html:687`) mais avec un nouveau socket, inconnu de la partie. Un téléphone qui passe en veille = joueur perdu.
3. **Pas de « rejouer ensemble ».** La fin de partie ne propose que « Retour à l'accueil » (`turingarou-online.html:2539`).
4. **Aucun score personnel**, statistique, partage de résultat ou classement.
5. **Démarrage à froid** : 5 humains (ou 4 + inspecteur) simultanés exigés (`GameRoom.ts:252`) ; pas de mode à moins d'humains.
6. **Signalements inexploités** : stockés mais jamais rendus au joueur ni à la fin (`GameRoom.ts:674`).
