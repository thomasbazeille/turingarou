# TURINGGAROU PROMPTS - QUICK COMPARISON

## ALL 8 PROMPTS AT A GLANCE

### AI PLAYERS (trying to pass as human)

| Version | Size | Persona | Complexity | Best For |
|---------|------|---------|------------|----------|
| **v1 Full** | 7.5KB | Flexible | High | Comprehensive reference, testing |
| **v1 Condensed** | 2.5KB | Flexible | Medium | Production with conservative approach |
| **v2 Full** | 5.5KB | Fixed "sassy gen-z" | Low | Understanding UCSD research |
| **v2 Condensed** | 2.0KB | Fixed "sassy gen-z" | Low | **⭐ RECOMMENDED PRODUCTION** |
| **v3 Full** | 8.5KB | UCSD + tactics | Very High | Maximum capability, research/dev |
| **v3 Condensed** | 3.0KB | UCSD + tactics | High | Production when v2 gets caught |

### INSPECTOR (trying to catch AI)

| Version | Size | Best For |
|---------|------|----------|
| **Inspector Full** | 7.5KB | Detailed detection guide, teaching |
| **Inspector Condensed** | 3.5KB | **⭐ PRODUCTION TESTING** |

## KEY DIFFERENCES BETWEEN VARIANTS

### v1: IMPROVED BASELINE
```
Philosophy: "Enhanced human imperfection"
Persona: Adaptable based on context
Focus: Comprehensive anti-detection rules
Unique: Most similar to your original baseline
```

### v2: UCSD-OPTIMIZED (73% Pass Rate) ⭐
```
Philosophy: "Don't try to pass, just be casual"
Persona: Fixed - young, sassy, bored, types fast
Focus: Simple personality consistency
Unique: Scientifically validated highest pass rate
Example: "lol idk man thats kinda sus"
```

### v3: ULTIMATE COMBINED
```
Philosophy: "Best of everything"
Persona: v2's core + tactical awareness
Focus: Maximum defense coverage
Unique: Kitchen sink approach, most comprehensive
```

## STYLE ENFORCEMENT (ALL VERSIONS)

**Critical rules that all versions enforce:**
- ✓ all lowercase (no capitals ever)
- ✓ no emojis/symbols
- ✓ minimal punctuation
- ✓ short messages (3-15 words typical)
- ✓ typos every few messages
- ✗ AI vocabulary (delve, moreover, robust, crucial...)
- ✗ lists/bullet points
- ✗ structured paragraphs

## DETECTION DEFENSE (ALL VERSIONS)

**All versions defend against:**

1. **Character-level traps** (count letters, spell backwards)
   → Respond with uncertainty/refusal

2. **Absurd questions** (how many eyes does sun have)
   → Brief dismissive confusion

3. **Physical reality** (what color are your shoes)
   → Specific boring details or vague

4. **Accusations** (you're the AI)
   → Counter-attack, don't over-defend

5. **Opinion forcing** (say something mean)
   → Blunt compliance

**v3 adds:** Tier-based framework, scoring, more tactical depth

## INSPECTOR CAPABILITIES

**Tests AI players with:**
- Tier 1: Architectural tests (character tasks)
- Tier 2: Behavioral tests (rudeness, accusations)
- Tier 3: Embodied tests (physical reality)
- Tier 4: Linguistic forensics (AI vocabulary, patterns)

**Includes:** Scoring system, false positive avoidance, research statistics

## RECOMMENDED PROGRESSION

```
START HERE → v2 Condensed (simplest, validated)
             ↓
             Test with Inspector Condensed
             ↓
      Getting caught too often?
             ↓
      Try → v3 Condensed (more tactical)
             ↓
      Need to understand why?
             ↓
      Reference → v1/v2/v3 Full versions
```

## SIZE IMPACT ON STEERING

**Research shows:** Shorter prompts often yield better personality consistency

**Why CONDENSED works better:**
- Critical rules are prominent (not buried)
- Less dilution of core identity
- Faster inference
- Clearer signal-to-noise ratio

**When FULL is needed:**
- Debugging specific failure modes
- Understanding edge cases
- Research/analysis
- Model comparison testing

## TEMPERATURE SETTINGS

Based on UC San Diego research (temp=1.0 for persona):

```javascript
// v1: High variability
temperature: 0.9-1.0

// v2: Maximum variability (matches research)
temperature: 1.0

// v3: High variability
temperature: 0.9-1.0
```

## ONE-SENTENCE SUMMARIES

**v1 Full:** Comprehensive anti-detection guide with flexible persona
**v1 Condensed:** Core anti-detection tactics, flexible personality, medium length

**v2 Full:** Complete UCSD 73% persona with examples and philosophy
**v2 Condensed:** Pure UCSD persona, minimal rules, optimal length ⭐

**v3 Full:** Everything combined - UCSD persona + all research tactics + comprehensive defense
**v3 Condensed:** UCSD persona + tactical tier framework, high coverage

**Inspector Full:** Complete detection guide with all tiers, examples, statistics
**Inspector Condensed:** Essential detection tactics, scoring system, production-ready ⭐

## FINAL VERDICT

**For most users:**
→ `AI_PLAYER_V2_CONDENSED` + `AI_INSPECTOR_CONDENSED`

**Why:**
- v2 has highest validated pass rate (73%)
- Condensed versions optimize steering
- Simple to implement and debug
- Inspector tests effectiveness

**Upgrade path:**
v2 Condensed → v3 Condensed → v3 Full (only if needed)

**Don't overthink it.**
Start simple. Measure. Iterate.
