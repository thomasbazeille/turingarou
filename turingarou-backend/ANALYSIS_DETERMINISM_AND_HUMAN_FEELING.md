# Analysis: Deterministic vs AI-Driven Steps & Human Feeling

> **Status (2026-03-13): toutes les recommandations de la section 8 ont été implémentées.**
> Voir commit `4fea405`. Résumé des fixes :
> - **Question** : délai indépendant par AI (7–16s) au lieu d'un gate partagé → réponses naturellement étalées
> - **Discussion** : `setInterval(5s)` → `setTimeout` récursif 3–8s variable; shuffle de l'ordre par tick; 30% de skip aléatoire par AI; déclencheur sur message humain (5–15s); burst mode (suivi 4–9s après message court)
> - **Vote** : prompt enrichi avec hints stratégiques (bandwagon, survie, coalition)
> - **Comportement** : `AI_GOAL_BLOCK` réécrit (fun d'abord, stratégie secondaire); toutes les stratégies : "investigator mode" → "réagis, sois fun"; `buildDecisionPrompt` : répondre si quelque chose t'a touché; InspectorController moins passif
> - **Bugs** : `clearInterval` → `clearTimeout` (x2)

---

This document analyses every step of the game flow to identify what is **deterministic** (or rule-based) vs **AI-driven**, and what can **break the human illusion**.

---

## 1. High-level flow (per round)

| Phase        | Order in code | What happens |
|-------------|----------------|--------------|
| Question    | 1             | One question shown, everyone answers (humans via UI, AIs via LLM). |
| Discussion  | 2             | Chat; AIs are periodically asked whether to post. |
| Voting      | 3             | Everyone votes; AIs choose target via LLM. |
| End round   | 4             | Tally votes → one eliminated, one protected (random), then next round or game over. |

Below we go phase by phase and then list all issues that hurt “human feeling”.

---

## 2. Question phase

### 2.1 What is deterministic

- **Which question is shown**: `getRandomQuestion()` — random choice from a fixed list. No AI.
- **When the phase ends**: fixed `QUESTION_PHASE_MS` (15s). No adaptation to “who has answered”.

### 2.2 What is AI-driven

- **AI answers**: `aiAnswerQuestion(question)` is called for each AI; the LLM generates the text. So *content* is AI-driven.

### 2.3 Human-feeling issues

- **All AIs are polled in a strict loop** (`for ... await aiPlayer.answerQuestion(...)`). So:
  - Order is fixed (e.g. always same AI first).
  - Answers are added as soon as each LLM call returns (no simulated “typing” or spread over the 15s).
- **No option to “skip” or “refuse”**: every AI *must* answer. A human might not answer in time or might give a minimal “idk”. The AI instructions say “Don’t answer EVERYTHING systematically” but the code never asks the model “do you want to answer or stay silent?” in this phase.
- **No timing variance**: no delay before calling the LLM, no delay after (e.g. “submit at 8s”). So all AI answers land in a short burst at the start of the phase.

So in the question phase, **who answers** and **when they answer** are fully deterministic; only **what they say** is AI-driven. That can feel robotic.

---

## 3. Discussion phase

### 3.1 What is deterministic

- **When the phase starts/ends**: `DISCUSSION_PHASE_MS` (60s). Fixed.
- **When the AI is “asked” to act**: **every 5 seconds**, for **every** non-eliminated AI, in a fixed order (`setInterval` → `for (id, aiPlayer)`). So:
  - The *schedule* of “should I say something?” is fully deterministic (every 5s, same order).
  - The AI is **always called** at those ticks; there is no “maybe we don’t even ask this AI this time”.

### 3.2 What is AI-driven

- **Whether to respond**: `decideAction()` returns `shouldRespond` (and optionally `message`, `delayMs`). So the *decision* “post or not” and the *content* are LLM-driven.
- **What to say**: LLM-generated.
- **Delay before posting**: `delayMs` from the LLM (with fallback 2000 ms). So timing of the *single* next message is partly AI-driven once the decision is taken.

### 3.3 Human-feeling issues

- **Fixed 5s polling**: Humans don’t “wake up” exactly every 5 seconds. The rhythm is mechanical. Options that would feel more human:
  - Vary the interval (e.g. 3–8s) or randomize *when* each AI is next considered.
  - Don’t call every AI at every tick; sometimes skip an AI (e.g. “this AI is not considered this tick” at random or with a rule).
- **Every AI is “asked” every time**: So the *opportunity* to speak is deterministic and identical for all AIs. A human might only look at the chat occasionally; here the AI is explicitly prompted every 5s. The instructions say “strategic silence” and “don’t answer every message”, but the *invitation* to decide is still every 5s for everyone.
- **Order of evaluation**: The same AI is always first in the loop. Combined with fixed 5s, that can create a predictable pattern (e.g. “AI often speaks first after each tick”).
- **No message-driven triggers**: The AI is never “woken up” specifically because someone @’ed them or asked them something; it’s only time-based. So “react when addressed” is not structurally encouraged (only via context in the prompt).
- **Single message per decision**: Each call to `decideAction()` produces at most one message. Humans sometimes send 2–3 short messages in a row; that’s not modeled (could be a follow-up decision after a short delay, but currently it’s one shot per tick).

So in discussion: **when** and **how often** the AI is asked is deterministic; **whether to answer** and **what to say** are AI-driven. The deterministic part (fixed 5s, every AI every time) is what most hurts human feeling here.

---

## 4. Voting phase

### 4.1 What is deterministic

- **Duration**: `VOTE_PHASE_MS` (10s). Fixed.
- **When each AI vote is “scheduled”**: For each AI, a **random delay** `Math.floor(Math.random() * 4000) + 2000` (2–6s), then `decideVote` is called. So the *time* at which the AI is asked to vote is random, not AI-driven.
- **Order of AIs**: The loop order is fixed; only the delay varies.

### 4.2 What is AI-driven

- **Who to vote for**: `decideVote(activePlayers)` uses the LLM with game context and conversation, and asks for the most suspicious player. So the *target* is intended to be reasoned (suspicion, strategy). This is already AI-driven and aligned with “reason about who is suspicious”.

### 4.3 Human-feeling issues

- **Vote prompt**: The prompt says “who do you think is most likely an AI?” and “Respond with ONLY the player’s name”. So the model is encouraged to reason about suspicion. Possible gaps:
  - No explicit “your goal is to survive: consider voting for someone who might be gathering votes against you” or “consider who other players might vote for” (strategic voting).
  - No explicit “you can vote for the same person as others to get them out, or spread votes” (coalition / bandwagon).
- **Fallback**: On parse/API error or unrecognized name, the code uses `otherPlayers[0].id`. So in edge cases the vote becomes deterministic (first other player). That’s a small corner case.
- **No “abstain” or “refuse to vote”**: The AI is always assumed to vote. Humans might occasionally not vote in time; the game doesn’t model that for the AI.

So for voting, the main behavior (who to vote for) is already AI-driven. The main improvements would be richer strategic prompt and optional abstention, not “make the target non-deterministic”.

---

## 5. End of round (after votes)

### 5.1 What is deterministic

- **Who is eliminated**: Pure rule — most votes (tie → first in iteration). No AI.
- **Who is protected (immunity)**: **Fully random** among non-eliminated players (`Math.floor(Math.random() * eligibleForProtection.length)`). No AI, no narrative, no “who deserved it”.
- **Duration of end-round screen**: 13s fixed.
- **Next phase**: Rules (next round vs game over by remaining players / win conditions). No AI.

### 5.2 Human-feeling issues

- **Immunity is random**: Players might expect immunity to be “earned” or story-driven. Right now it’s a dice roll. That can feel arbitrary rather than “human” or “narrative” (it doesn’t make the AI *feel* more machine-like; it makes the game feel more random).
- **Tie-break**: First in map iteration. No “revote” or “no elimination”. Minor.

So here the only “human feeling” lever is whether immunity should stay random or become rule-/narrative-based; the rest is game logic.

---

## 6. Other deterministic elements (full game)

- **Room setup**: Who joins, how many humans, how many AIs — from server/constants. No AI.
- **AI personality choice**: Random shuffle of personalities, then `slice(0, count)`. So which *personality* (Alex, Jordan, …) is random; the *content* of that personality is fixed in code (system prompts).
- **Question list**: Fixed list; random pick. No AI.
- **Timers**: All phase lengths are constants. No AI.

---

## 7. Summary: what is still deterministic / not AI-driven

| Step | Deterministic / rule-based | AI-driven | Hurts human feeling? |
|------|----------------------------|-----------|----------------------|
| **Question** | Which question; when phase ends; **that every AI is asked**; **order and timing of AI answers** | Content of AI answer | Yes: all AIs must answer, no skip, no spread over 15s. |
| **Discussion** | **Fixed 5s polling**; **every AI asked every tick**; **same order every time** | Whether to respond, content, delay before this message | Yes: mechanical “every 5s ask everyone”. |
| **Voting** | When (random 2–6s), that every AI votes | Who to vote for | Largely OK; vote target is AI-reasoned. Could add strategy/abstain. |
| **Immunity** | Random among non-eliminated | — | Can feel arbitrary. |
| **Elimination** | Majority rule, tie-break order | — | Game logic; OK. |

So the two biggest sources of “non-human” feeling are:

1. **Discussion**: *When* and *how often* the AI is asked is deterministic (every 5s, every AI). The AI *can* decline to write (shouldRespond) but is still *invited* on a fixed schedule. There’s no “sometimes we don’t even ask this AI” or “ask after a new message” or variable rhythm.
2. **Question**: Every AI is *forced* to answer; no “decline to answer” and no human-like spread of answer times over the 15s.

Voting is already largely AI-driven for “who”; the remaining issues are strategic depth and optional abstention.

---

## 8. Recommendations — toutes implémentées (commit `4fea405`, 2026-03-13)

- **Vote** ✅ : prompt enrichi avec hints bandwagon, survie, coalition.
- **Discussion — quand l’AI est appelée** ✅ :
  - Intervalle variable 3–8s (plus fixe 5s).
  - Skip aléatoire 30% par AI par tick.
  - Déclencheur sur message humain (5–15s).
  - Burst mode : suivi 4–9s après message court (~40% de chance).
- **Discussion — option de silence** ✅ : déjà possible via `shouldRespond: false`. Le vrai fix était la *fréquence* et la *régularité*, pas l’option elle-même.
- **Phase question** ✅ :
  - Refus déjà géré via `SKIP` dans `answerQuestion`.
  - Étalement : chaque AI a son propre délai aléatoire indépendant (7–16s) au lieu d’un gate partagé — les réponses arrivent naturellement à des moments différents.
- **Ton & engagement** ✅ (ajout par rapport aux recommandations initiales) :
  - `AI_GOAL_BLOCK` réécrit : fun d’abord, stratégie secondaire.
  - Toutes les stratégies : discussion = réagir/jouer, pas “investigator mode”.
  - `buildDecisionPrompt` : répondre si quelque chose t’a touché.
