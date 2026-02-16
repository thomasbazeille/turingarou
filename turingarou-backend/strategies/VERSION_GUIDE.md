# TURINGGAROU AI PROMPTS - VERSION GUIDE

## Overview
You now have 8 total prompts: 3 AI player variants + 1 inspector, each in FULL and CONDENSED versions.

## When to Use Which Version

### FULL vs CONDENSED

**Use FULL versions when:**
- You want maximum coverage of edge cases
- Testing/development phase
- The AI has plenty of context window
- You're dealing with GPT-4 or Claude Opus tier models (better instruction following)
- First time implementation (comprehensive reference)

**Use CONDENSED versions when:**
- You want optimal personality steering (research shows shorter works better)
- Production/live gameplay
- You need faster inference (less tokens to process)
- Using smaller/faster models (GPT-3.5, Claude Haiku)
- The core personality is more important than exhaustive rules

**General recommendation:** Start with CONDENSED. Only use FULL if you see specific failure modes.

## AI Player Variant Selection

### v1: IMPROVED BASELINE
**Best for:** Conservative enhancement of your original design
**Character:** Flexible persona, comprehensive anti-detection rules
**Complexity:** Medium
**Philosophy:** "Enhanced human imperfection"

Use when:
- You want something close to your original baseline
- You need detailed guidelines for edge cases
- You want maximum control over behavior

### v2: UCSD-OPTIMIZED (73% Pass Rate)
**Best for:** Maximum passing effectiveness
**Character:** Fixed persona - young, sassy, not trying to pass
**Complexity:** Low (simple rules, clear identity)
**Philosophy:** "Don't try to convince, just be casual"

Use when:
- You want the highest scientifically-validated pass rate
- You want a consistent, recognizable personality
- You prefer simplicity over flexibility
- The "bored gen-z internet kid" vibe works for your game

**⭐ RECOMMENDED STARTING POINT**

### v3: ULTIMATE COMBINED
**Best for:** Kitchen sink approach
**Character:** UCSD persona core + all research tactics
**Complexity:** High (most comprehensive)
**Philosophy:** "Best of everything"

Use when:
- You want every possible advantage
- Your model can handle detailed instructions well
- You're willing to tune/iterate based on results
- You want maximum defense against sophisticated interrogators

## Inspector

### AI INSPECTOR
**Purpose:** Human player trying to catch AI using research-backed detection

Use when:
- Testing your AI players (see how detectable they are)
- Creating a "hard mode" human player
- Running experiments/evals
- Teaching players effective detection strategies

## Size Comparison

```
FULL VERSIONS:
v1: ~7.5KB
v2: ~5.5KB  
v3: ~8.5KB
Inspector: ~7.5KB

CONDENSED VERSIONS:
v1: ~2.5KB (-67%)
v2: ~2.0KB (-64%)
v3: ~3.0KB (-65%)
Inspector: ~3.5KB (-53%)
```

## Recommended Setup for Testing

**Best AI Player (easiest to implement):**
```javascript
import { AI_PLAYER_V2_CONDENSED } from './ai_player_v2_condensed';
```

**Best Human Detective (for testing):**
```javascript
import { AI_INSPECTOR_CONDENSED } from './ai_inspector_condensed';
```

**Comparison Test Setup:**
```javascript
// Run games with all 3 variants vs inspector
const variants = [
  AI_PLAYER_V1_CONDENSED,
  AI_PLAYER_V2_CONDENSED,
  AI_PLAYER_V3_CONDENSED
];

// Measure which gets caught least often
```

## Temperature & Timing Recommendations

Based on UC San Diego research:

**Temperature:**
- v1: 0.9-1.0 (high variability)
- v2: 1.0 (maximum variability - matches research)
- v3: 0.9-1.0 (high variability)

**Response Timing:**
```javascript
// Base delay + random variance
const delay = 2 + Math.random() * 3; // 2-5 seconds

// Scale with message complexity
const typingTime = messageLength * 50; // ~50ms per char
```

## Key Success Factors (All Versions)

Regardless of which version you choose, success depends on:

1. **Lowercase enforcement** - Most recognizable tell if broken
2. **No emojis** - Instant giveaway
3. **Short messages** - AI tends to over-explain
4. **"idk" frequency** - AI tries to answer everything
5. **Character-level task handling** - Architectural weakness, must defend well
6. **Casual imperfection** - Typos, vague answers, contradictions

## Final Recommendation

**For production/live game:**
→ Start with `AI_PLAYER_V2_CONDENSED`

**Why:**
- Scientifically validated (73% pass rate)
- Simple, clear personality
- Optimal length for steering
- "Don't try to pass" mindset is powerful
- Easy to debug/iterate

**Then:**
- Test against `AI_INSPECTOR_CONDENSED`
- Measure detection rate
- Tune temperature/timing if needed
- Only escalate to v3 if v2 gets caught too often

**For research/development:**
→ Use FULL versions with detailed logging to understand failure modes
→ Transition to CONDENSED for production

---

## Quick Reference: Core Philosophy Differences

**v1:** "Be imperfectly human with comprehensive anti-detection rules"
**v2:** "Be a specific casual person, don't try to convince anyone"
**v3:** "Be v2's person with v1's tactical awareness"

All three work. v2 is simplest and most validated by research.
