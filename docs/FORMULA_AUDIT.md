# Formula audit (Part 6, F.14) — 2026-11-23

Read-only audit of every formula and numeric rule the app uses, taken from the code as of commit `812e25f`
(before any Part 6 change). Working file for Claude; all numbers are synthetic.

**How it was done.** The code was split into four groups. Each formula got a record (where, formula as coded, what it
is meant to compute, edge cases, source, a hand-computed example, verdict). Examples were run against the real code with
scratch scripts (`vite-node`, default settings, UTC). Every verdict other than "correct" / "correct but weakly supported"
was then checked a second way: the cited lines were re-read by a second reader and the arithmetic redone by hand. Only
what survived both is listed as a finding. No formula, test expectation or data file was changed in this step.

**Verdicts.** CORRECT · CORRECT BUT WEAKLY SUPPORTED (a heuristic that does what it says; the evidence behind the number
is thin and the app says so) · QUESTIONABLE (works as written, but arguable — an alternative is given) · WRONG (the code
does not do what its comment / CLAUDE.md / rules.ts says, or the arithmetic is wrong) · INCONSISTENT (two places compute
the same thing differently, or code and documentation disagree).

## 1. Totals

| Group | Files | Records | Correct | Weakly supported | Questionable | Inconsistent | Wrong |
|---|---|---|---|---|---|---|---|
| M | quality, volume, progression, increments, prescription | 43 | 14 | 22 | 4 | 3 | 0 |
| A | recovery, targets, analysis, history, dates, muscles, registry, failure, feedback, effort, defaults | 99 | 48 | 30 | 8 | 9 | 4 |
| B | baseline, reports, bodyweight, sessionSummary, increments, ruleChecks, mappingUncertainty, fatigue, equipmentMemory | 63 | 32 | 17 | 2 | 9 | 3 |
| C | readiness, planner, volumeResponse, exerciseChoice | 73 | 17 | 40 | 7 | 6 | 3 |
| **All** | | **278** | **111** | **109** | **21** | **27** | **10** |

The core arithmetic — effective sets (coefficient × effort credit), the RIR credit table, left / right pairing, the
per-session ceiling, rounding, the Epley index, load steps, the rep estimate at a new load, today's share, the 7-day
body-weight average — computes exactly what it says. The findings are at the edges: what happens when a piece of
information is missing (no RIR, a session with only excluded sets, no body weight), a few thresholds decided by
floating-point noise or by an empty card, and several places where two screens use slightly different rules.

Status key: **PART 6** = changed in Part 6 because the owner asked for it (F.4 warm-up credit, F.7 perception,
F.8 fatigue between exercises); **OPEN** = reported only, waits for the owner's OK.

## 2. Findings that matter in practice

### F-1 The strength index changes when RIR stops being typed — QUESTIONABLE → PART 6 (F.7)
- Where: `progression.ts` `epley`, `pickTop`, `sessionPerf`.
- As coded: index = weight × (1 + (reps + RIR) / 30); a set without RIR is treated as RIR 0.
- Example (run): pec deck 60 × 12 / 11 / 10 with RIR 3 for four sessions → index 90. The same sets without RIR in the next
  two sessions → index 84. Trend: **declining**, although nothing changed. With RIR 2 the gap is 88 → 84 ("stable", but the
  baseline % would show −4.5 %).
- Second check: by hand 60 × (1 + 15/30) = 90 and 60 × (1 + 12/30) = 84; slope over [90,90,90,90,84,84] = −1.37 per
  session ÷ mean 88 = −1.56 % ≤ −1.5 % and the last two are below the first → "declining" by the coded rule. Confirmed.
- Why it matters now: the new flow has no RIR chips. Every history that has RIR in older sessions (imports) and none in
  new ones would show a false decline; and an over- or under-rated RIR moves the index by 3.3 % of the load per rep.
- Change (F.7): one basis per history — RIR-adjusted only when EVERY scored session has RIR on its top set; otherwise reps
  and weight only for all sessions of that history. Histories with RIR everywhere are unchanged.

### F-2 An increase is never suggested when no effort was recorded — QUESTIONABLE → PART 6 (F.7)
- Where: `progression.ts` `suggestNextLoad` → `hitsTop` requires `effortKnown` on every set at the working load.
- Example (run): four sessions of 3 × 15 at 60 kg (range 10–15), no RIR and no feel → "hold: effort was not recorded".
- Second check: read `hitsTop`: `at.every((p) => reps ≥ hi && effortKnown(p))`. Confirmed.
- Why it matters now: the effort answer becomes optional (one tap, skippable). Reps at the top of the range in two
  consecutive sessions are objective evidence by themselves.
- Change (F.7): the two-session rule no longer needs an effort answer. The one-session shortcut ("clearly too light")
  still needs it, on at least two sets, with no rep drop across them.

### F-3 "Two consecutive sessions" has no time limit — QUESTIONABLE → OPEN
- Where: `suggestNextLoad` (`prev = rep[rep.length - 2]`).
- Example (run): 2 × 15 at 60 kg on 2 March and again on 16 November → "increase".
- Second check: no date is read anywhere in `suggestNextLoad`. The separate "back after > 14 days" rule only looks at days
  without ANY workout, so it does not cover one exercise that was not done for months.
- Proposed fix: the previous session must be within the trend window (56 days); otherwise "confirm it next session".

### F-4 A second "reduce" rule exists only in the code — INCONSISTENT (documentation) → OPEN
- Where: `suggestNextLoad`, last `reduce` branch: more than half of the sets under the bottom of the range AND a declining
  trend AND no short-rest explanation → one step down.
- CLAUDE.md §G says a reduction happens for broken technique, "never merely because a set was hard". The rule is sensible;
  the documentation does not mention it.
- Proposed fix: document it (rules.ts `double_progression` + CLAUDE.md §G), or remove it.

### F-5 Upper / lower chest emphasis ignores the per-session ceiling — INCONSISTENT (minor) → OPEN
- Where: `volume.ts` `computeVolume` (regions loop).
- Example (run): 14 incline dumbbell press sets at RIR 1 in one session → chest 12.5 (11 + 3 × 0.5), upper-chest emphasis 14.
  A share of chest work above 100 % is possible in very long single sessions.
- Second check: `regions[rid].effective += emph * chestCoef * q.credit * k` uses the untapered product; `mv.effective`
  uses `taperBeyondCap`. Confirmed.
- Proposed fix: apply the same taper factor to the regional number.

### F-6 "Best" of a history compares different index kinds — INCONSISTENT (minor) → OPEN
- Where: `progression.ts` `buildProgression` (`best`).
- Example (run): weighted dips, two sessions before any weigh-in (belt-only index 13 and 13.3) and two after (body + belt
  index 120 and 123) → best = 123. Trends and progress % keep kinds apart; `best` does not.
- Proposed fix: best within the latest index kind only.

### F-7 Default load steps — QUESTIONABLE (minor) → PART 6 (F.3, by the step chooser)
- Where: `defaultIncrement`: machine 5 kg, cable 2.5, dumbbell 2 kg.
- Many stacks move in 2.5 kg (or have add-on weights), many dumbbell racks in 2.5 kg above 10 kg. A default that is too
  coarse hides weights from the stepper (the owner's feedback 8) and makes "+1 step" too large.
- Change (F.3): the default stays, but one tap on the step chooser stores the real step for that machine / gym, and any
  value can be typed.

### A-1 A card without a performed set can add 12 h of recovery — WRONG → OPEN
- Where: `recovery.ts` lines 181–187 ("exercise new to you").
- Example (run by the first reader): 3 familiar pushdown sets + a skull-crusher card holding only a warm-up (or an
  unticked planned set) → triceps window 36 h instead of 24 h.
- Second check: the `novel` filter looks at `exercises`, never at their sets. Confirmed by reading.
- Proposed fix: count an exercise as "new" only when it has at least one performed working set.

### A-2 Impossible dates are accepted — WRONG → OPEN
- Where: `dates.ts` `isIsoDate`.
- Example: `2026-02-30` → valid (the JavaScript engine rolls it over to 2 March), so week buckets (text comparison) and
  recovery (milliseconds) disagree about the day. Checked on V8 only.
- Proposed fix: round-trip check (`msToDate(dateMs(s)) === s`).

### A-3 "Restart Learning Mode from today" does nothing when history exists — WRONG → OPEN
- Where: `targets.ts` line 32 vs `Settings.tsx` line 282.
- As coded: start = the EARLIER of the stored date and the first workout. After "Restart from today" with 8 weeks of
  history the mode is still on day 57 (inactive).
- Second check: `firstWorkout < learning.startDate ? firstWorkout : learning.startDate`. Confirmed.
- Proposed fix: an explicitly stored start date wins.

### A-4 Opening a workout counts as "trained today" — WRONG → OPEN
- Where: `analysis.ts` lines 125–128 (`trainedToday = todays.length > 0`).
- Example (run): Sunday, chest 5 / 12. Opening the logger (zero sets) moves the sessions left this week from 1 to 0 and
  the status from "behind" to "at risk".
- Proposed fix: a workout counts once it has one performed set.

### A-5 … A-13 Smaller inconsistencies (group A) — OPEN
| # | What | Where | Example → actual | Proposed fix |
|---|---|---|---|---|
| A-5 | Failure / novelty use base coefficients, significance uses resolved ones | `recovery.ts` 170 | OHP 3 sets + bench at −10° 2 × RIR 0: front delts 36 h, expected 24 h | use `resolveCoefficients` |
| A-6 | Bench-angle range | `registry.ts` 48 (−30…90) vs importer / schema (−45…90) | −31° is imported but credited as flat | one range |
| A-7 | Fail chip vs failure status when technique gave out | `failure.ts` 86 + `quality.ts` 45 | to_failure + technical → 0.70; muscular + technical → 0.53 | one handling |
| A-8 | "Effort recorded" counts pain / wrong-weight answers | `effort.ts` 10 | six pain-only sets → "missing 0" | drop `!!s.feel` |
| A-9 | Confidence text vs field | `targets.ts` 180 | field `low`, text "Confidence moderate" | set the field first |
| A-10 | "Maintain" priority can still say "increase" after Learning Mode | `targets.ts` 106 vs 164–182 | chest on maintain: 9 / 12 / 18 and action "increase" | never increase a maintain muscle |
| A-11 | Per-session cap has a floor of 3 | `analysis.ts` 145 vs rule `todays_share` ("≤ 60 %") | preferred 4 → share 3 (75 %) | document the floor |
| A-12 | Status just below the target | `analysis.ts` 140 vs 150 | chest 11.9 / 12: "Target met" but status "on track" | "done" when the rounded remainder is 0 |
| A-13 | Legacy `analysis.plan` | `analysis.ts` 236–261 | suggested 10 vs today's share 4; nothing reads it | remove |

### A-14 … A-21 Questionable choices (group A) — OPEN
| # | What | Alternative |
|---|---|---|
| A-14 | Recovery looks only at the LATEST significant session (12 sets Monday + 2 sets Tuesday → "likely recovered" on Wednesday) | latest expiry across recent sessions |
| A-15 | The last ticked set is trusted as the session end for 48 h | shorter window, or prefer the end time |
| A-16 | A positive angle on `decline_press` is credited as an incline | document the sign, or treat as decline |
| A-17 | Share of sets at failure is taken over sets WITH a failure answer only (30 RIR-2 sets + 6 "muscular" → "100 %") | count RIR ≥ 1 as "not failure" |
| A-18 | Changing `loadMode` on a finished workout is not written to the audit trail | audit it |
| A-19 | Effort distribution pairs left / right by the first side only | weight by `sideFactors` |
| A-20 | Computed end of Learning Mode can be a date before the criteria were met | real date or null |
| A-21 | Muscle trend summary: a tie reads "progressing" | strict majority |

### B-1 Weekly "progressed / declined" drops an exercise after one excluded session — WRONG → OPEN
- Where: `reports.ts` 109–114. The index kind is taken from the week's LAST session; if that session has no index (all
  sets excluded: pain, wrong weight), the exercise disappears from the report.
- Second check: `kind = all.at(-1)!.indexKind ?? null` → `before` needs `index != null` and `indexKind === null` → empty →
  skipped. Confirmed by reading.
- Proposed fix: take the kind from the last session of the week that has an index.

### B-2 Deload check treats an excluded session as performance 0 — WRONG → OPEN
- Where: `reports.ts` 403 (`(index ?? 0) <= (index ?? 0)`).
- Example (run): two exercises improving slightly; mark the last set of each as pain → "Same performance feels harder: 2 exercises".
- Proposed fix: representative sessions on one index scale only.

### B-3 Monthly weight note decided by floating-point noise — WRONG → OPEN
- Where: `reports.ts` 480–484 (`dw > 0.3`).
- Example: 80.3 − 80.0 = 0.29999999999999716 → no note; 80.4 − 80.1 = 0.30000000000001137 → "Weight up…".
- Proposed fix: round the difference to 0.1 kg first.

### B-4 … B-12 Inconsistencies (group B) — OPEN
| # | What | Where | Example → actual | Proposed fix |
|---|---|---|---|---|
| B-4 | Progress % uses the FIRST session's index kind; rule `index_scale` says the latest | `baseline.ts` 45 | 2 bodyweight dip sessions, then 7 with a belt → "baseline only" for ever | latest kind, baseline from its first 28 days |
| B-5 | "First check at week 8" vs code (day 56 = week 9) | `baseline.ts` 128, `Reports.tsx` | day 55 (week 8) is still "too early" | say "after 8 weeks" |
| B-6 | Baseline report ignores `failure: muscular` as RIR 0 | `reports.ts` 277 | known effort 86 % instead of 100 % | use `failureImpliedRir` |
| B-7 | Outdated weigh-in still feeds the body + belt index | `bodyweight.ts` 74 vs callers | one weigh-in, pull-ups 148 days later → same body weight used | flag or exclude outdated weights |
| B-8 | Duration cap 600 min (summary) vs 400 min (stored) | `sessionSummary.ts` 45 vs `Logger.tsx` | 08:00 → 15:00: summary 420, stored nothing | one helper (the new training mode uses the shared one) |
| B-9 | Summary average rest includes drop segments | `sessionSummary.ts` 51 | rests 120, 90, 100 + drop 8 s → 80 instead of 103 | working sets only |
| B-10 | Weighted dips / pull-ups without `loading` are not HIGH fatigue cost | `fatigue.ts` 27 | dips + 20 kg → not HIGH | derive "weighted" from the performed sets |
| B-11 | Fatigue classes vs rule text | `exercises.ts` vs `rules.ts` | hack squat HIGH (machine), farmer carry MODERATE | align text or data |
| B-12 | Session load counts each side as a set | `fatigue.ts` 71 | 2 L + 2 R to failure → 4 sets / 4 failure sets ("heavy") | weight by `sideFactors` |

### B-13, B-14 Questionable (group B) — OPEN
| # | What | Alternative |
|---|---|---|
| B-13 | Baseline weekly distribution counts a partial first week as full (Sunday start: 3, 6, 6 → 5.0) | only weeks fully inside the period |
| B-14 | A timed same-day weigh-in tagged "before workout" is rejected when the workout has no start time | accept tagged entries either way |

### C-1 An exercise on "pain hold" can still be planned through the "new exercise" path — WRONG → OPEN
- Where: `planner.ts` 382–390 (seed list for a persistent deficit) vs line 344 (normal list, which does apply `painHold`).
- Example (run by the first reader): pec deck skipped for pain two days ago (14 sessions on record), chest with its own
  target and a persistent deficit → pec deck is planned, 4 sets, labelled "new to you", without the safety line.
- Second check: the seed filter tests `usedEx` and `exclude` only; `prefs.painHold` is not read there. Confirmed by reading.
- Proposed fix: apply the pain hold (and "avoid") to the seed filter; never call a library exercise with history "new to you".

### C-2 Plan adherence can never say "fewer sets" — WRONG → PART 6 (F.2 removes planned rows, so this function is rewritten)
- Where: `planner.ts` 636–641. The planned count is taken with `countedSetCount`, which drops unticked planned sets, so
  "planned" equals "done". 1 of 3 planned squat sets done → "followed". Used by tests only; no screen reads it.
- Change (F.2): the planned count comes from the stored target.

### C-3 Volume is cut "with adequate effort" although effort is unknown — WRONG → OPEN
- Where: `volumeResponse.ts` 190–195. The decline branch tests `!effortLow` (median logged RIR ≥ 4), not "effort known and adequate".
- Examples (run): declining trend, baseline 10 sets, NO effort logged → reduce to 8 "with adequate effort" (expected: hold);
  every set "too easy" → same reduce; RIR 5 → "observe" with the false reason "volume changed recently".
- Second check: read the branch — `trend.overall === 'declining' && !effortLow && …`; `effortAdequate` is not consulted. Confirmed.
- Why it matters after Part 6: the effort tap is optional, so "no effort logged" becomes common.
- Proposed fix: reduce only when effort is known and adequate; separate, true messages for unknown and low effort.

### C-4 … C-9 Inconsistencies (group C) — OPEN
| # | What | Where | Example → actual | Proposed fix |
|---|---|---|---|---|
| C-4 | The plan and the first live re-assessment size sets differently | `planner.ts` 283–290, 353 vs 536–542 | squat planned 5 sets (quads open 3); re-assessment with nothing done → 3 | one allocation routine; cap by every muscle with coefficient ≥ 0.75 |
| C-5 | Usual session size counts left and right separately | `planner.ts` 123 | 3 L + 3 R + 3 → 9, expected 6 | `countedSetCount` |
| C-6 | "Earlier 4 weeks" is really 2 | `volumeResponse.ts` 32, 93 vs `targets.ts` 113 (last 6 weeks passed) | "more volume did not help" needs 8 weeks to fire as described | pass 8 weeks or correct the comment |
| C-7 | "Left today" computed three ways | `exerciseChoice.ts` 271 vs `analysis.ts` 209, `prescription.ts` 399 | share 4, done 3.75: analysis 0, choice card "0.5 sets left" | reuse the analysis formula |
| C-8 | Only the first 3 significant muscles get a state | `exerciseChoice.ts` 267 | biceps loaded yesterday: cable row ACCEPTABLE (biceps 3rd), barbell row GOOD (biceps 4th) | assess all muscles ≥ 0.5 |
| C-9 | Rule text for the operating modes | `rules.ts` 258 ("with gyms identified") vs code and CLAUDE.md (≥ 80 % of machine exercises linked) | — | reword the rule |

### C-10 … C-16 Questionable choices (group C) — OPEN
| # | What | Alternative |
|---|---|---|
| C-10 | Re-assessment ignores the sets still planned on the exercise in progress (pushdown card flickers 4 / 4 / 3 / 3 / 2 while pressing) | count the planned remainder (Part 6: the target) |
| C-11 | Skip reason "no familiar exercise available here" when the real reason is that a synergist's target is met | plan it capped, or name the real reason |
| C-12 | Three skips "for time" count as avoiding the exercise | treat like "busy" |
| C-13 | A learned softening of a warning never reaches the synergist warnings | soften both |
| C-14 | "Not lower after an override" allows −3 % per step (136.7 → 128.5 over three steps still "not lower") | compare with the level before the first override |
| C-15 | An alternative is offered as "without the triceps load" although it loads triceps at 0.5 | require < 0.5, or say "less" |
| C-16 | Usual number of exercises is the upper middle value ([4, 6] → 6) | true median |

## 3. What the owner's Part 6 requests change (after this audit)

| Request | Formula today | Change | Audit entries |
|---|---|---|---|
| Warm-ups are just the first sets (F.4) | `type: warmup` → 0; every other set without RIR → 0.75 | a set before the session's best set is credited by its estimated reps in reserve through the same RIR table (M1); never more than the provisional 0.75 without an effort answer | M1, M2, M10 |
| "The brain might lie" (F.7) | effort answer / RIR decides credit alone; index includes RIR; increase needs an effort answer; one "form broke" on a 1–2-set session reduces the load | cross-check against the next set and the ramp; index basis per history (F-1); increase on reps alone (F-2); reduce needs two answers or reps under the range | M3, M14, M26, M27, M29 |
| Second exercise for the same muscle (F.8) | every session of a history is compared with every other | context FRESH / PRE-LOADED per session; like-with-like or a normalised index; expected rep loss in the prescription | M18–M21, M26, M38, M39 |

Each change is recorded in section 5 when it is made (old → new, why, test).

## 4. Inventory

### Group M — set credit, volume, strength index, trend, double progression, prescription

Files: `src/domain/quality.ts`, `volume.ts`, `progression.ts`, `increments.ts`, `prescription.ts`. Examples were run against the code (scratch scripts, synthetic numbers).

#### quality.ts

| # | Formula (where) | As coded | Hand example → code | Source | Verdict |
|---|---|---|---|---|---|
| M1 | RIR → effort credit (`assessSet`) | `rirCredit[round(RIR)]`, table `[1,1,1,1,0.6,0.3,0.15,0.15,0]`, index clamped to 8 | RIR 0–9 → 1,1,1,1,0.6,0.3,0.15,0.15,0,0 ✓; RIR 3.5 → index 4 → 0.6 ✓; RIR 2.5 → 3 → 1 ✓ | rule `rir_credit_table` | CORRECT BUT WEAKLY SUPPORTED (0–3 = full credit is research-based; the exact steps 0.6 / 0.3 / 0.15 are a heuristic shape) |
| M2 | Unknown effort | no RIR, no failure status, no feel → `unknownRirCredit` 0.75, flagged uncertain | 50 × 10, RIR empty → 0.75 ✓ | `unknown_effort` | CORRECT BUT WEAKLY SUPPORTED (a provisional middle value) |
| M3 | Feel → estimated RIR | no RIR → `EFFORT_RIR_ESTIMATE` (very easy 5+, easy 3–4, appropriate 1–3, hard 1–2, near max 0–1); the HIGHER-RIR end goes through M1 | very easy → 0.3, easy → 0.6, appropriate / hard / near max → 1 ✓ | `feel_estimated_rir` | CORRECT BUT WEAKLY SUPPORTED (stated as an assumption) |
| M4 | Muscular failure without RIR | `failureImpliedRir` → RIR 0 → credit 1 (same as RIR 1–3) | failure = muscular, RIR empty → 1 ✓ | `failure_no_bonus` | CORRECT |
| M5 | Low reps | reps < 1 → 0; reps < 5 (not timed) → ×0.8 | 100 × 4 RIR 1 → 0.8 ✓; 0 reps → 0 ✓ | `drop_and_low_reps` | CORRECT BUT WEAKLY SUPPORTED |
| M6 | Drop segment, ROM, technique | drop ×0.5; partial ×0.8; lengthened partial ×1.0; compromised / failed technique ×0.7; all multiply | drop + partial + compromised at RIR 1 = 0.5 × 0.8 × 0.7 = 0.28 ✓; unknown × compromised = 0.75 × 0.7 = 0.525 → 0.53 ✓ | `drop_and_low_reps`, `rom_partials`, `compromised_technique` | CORRECT BUT WEAKLY SUPPORTED |
| M7 | Rounding | `round2` half-up with a 1e-9 nudge | 0.5249999 → 0.53 ✓ | CLAUDE.md §I | CORRECT |
| M8 | Left / right pairing (`sideFactors`) | i-th left + i-th right of the same set type = 0.5 each; unpaired side = 1 | L R L R L → 0.5, 0.5, 0.5, 0.5, 1 → 3 sets ✓ | CLAUDE.md §C | CORRECT |
| M9 | Per-session ceiling (`taperBeyondCap`) | above 11 effective sets for one muscle in one session → ×0.5 (split exactly at the cap) | 10.5 done + 1 → 0.5 + 0.5 × 0.5 = 0.75 ✓; 14 full sets → 11 + 3 × 0.5 = 12.5 ✓ | `session_taper` | CORRECT BUT WEAKLY SUPPORTED (preprint) |

#### volume.ts

| # | Formula | As coded | Hand example → code | Source | Verdict |
|---|---|---|---|---|---|
| M10 | Effective sets per muscle (`computeVolume`) | Σ coefficient × credit × side factor, tapered (M9); warm-ups and planned sets skipped | 14 incline DB press sets at RIR 1: chest 12.5, front delts 14 × 0.5 = 7 ✓ | `fractional_coefficients` | CORRECT |
| M11 | Regional emphasis (upper / lower chest) | Σ emphasis × chest coefficient × credit × side factor — **not tapered** | same 14 sets: upper chest = 14, chest = 12.5 | `regional_emphasis_not_added` | **INCONSISTENT (minor)** — finding F-5 |
| M12 | Quality-set total | Σ credit × side factor over working + drop sets (each set once) | 14 sets at RIR 1 → 14 ✓ | CLAUDE.md §I | CORRECT |
| M13 | Sessions per muscle | +1 for every session with a counted set touching the muscle (even when the credit is 0) | — | — | CORRECT (definition; display only) |

#### progression.ts / increments.ts

| # | Formula | As coded | Hand example → code | Source | Verdict |
|---|---|---|---|---|---|
| M14 | Strength index (`epley`) | `weight × (1 + min(reps + RIR, 30) / 30)`; missing RIR counts as 0; best benchmark set of the session | 60 × 12 RIR 2 → 60 × (1 + 14/30) = 88 ✓; no RIR → 84 ✓; 100 × 1 → 103.3 ✓; 40 × 40 → capped → 80 ✓ | `index_scale` | **QUESTIONABLE** — finding F-1 (the index depends on whether RIR was typed) |
| M15 | Bodyweight / assisted index | best `reps + RIR` | — | `index_scale` | CORRECT BUT WEAKLY SUPPORTED |
| M16 | Body + belt index ("system") | Epley on (body weight before the session + added load) when every working set is `bodyweight_plus` and a weigh-in exists | dips +10 kg × 9 RIR 1, body 80 → 90 × (1 + 10/30) = 120 ✓ | CLAUDE.md §I | CORRECT (labelled estimate) |
| M17 | Best of a history (`buildProgression.best`) | highest index over ALL sessions, whatever the index kind | 4 dip sessions: indices 13, 13.3 (belt only, no weigh-in) and 120, 123 (body + belt) → best = 123 | — | **INCONSISTENT (minor)** — finding F-6 |
| M18 | Trend (`classifyTrend`) | last ≤ 6 scored sessions of the latest index kind within 56 days, ≥ 3 needed; least-squares slope ÷ mean; progressing ≥ +1 %/session and last ≥ first; declining ≤ −1.5 % and the last TWO below the first | [88,88,88,88,84,84]: slope −0.914, mean 86.67 → −1.05 % → stable ✓ | CLAUDE.md §D | CORRECT BUT WEAKLY SUPPORTED |
| M19 | One bad session (`SINGLE_DIP` 5 %) | with ≥ 4 sessions: latest < 95 % of the median of the earlier ones (or 5 % below the previous one and under that median) while the previous one was normal → judged without it | covered by unit tests (`review-part4`) | `single_bad_session` | CORRECT BUT WEAKLY SUPPORTED |
| M20 | Sustained decline (8 %) | ≥ 6 sessions in 56 days: median of the last 3 ≤ 92 % of the median of the first 3 and every one of the last 3 below all of the first 3 | [90,90,90,84,84,84]: 84 ≤ 82.8 is false → not by this rule (the slope rule flags it) | `sustained_decline` | CORRECT BUT WEAKLY SUPPORTED |
| M21 | Possible plateau | ≥ 4 non-fatigued sessions spanning ≥ 21 days and the best of the last 2 ≤ the best before them | unit tests | `plateau` | CORRECT BUT WEAKLY SUPPORTED |
| M22 | Default load steps (`defaultIncrement`) | machine 5, cable 2.5, barbell / Smith 2.5, plate-loaded 2.5 (per side 1.25), dumbbell / kettlebell 2, other 2.5 kg | — | — | QUESTIONABLE (minor) — finding F-7 |
| M23 | `loadStep` | equipment's smallest increment → gym's dumbbell step → default | — | CLAUDE.md §H | CORRECT |
| M24 | `roundToIncrement`, `stepLoad` | round to the grid; a step snaps to the grid only when the current load is on it | 25 + 2 (step 2) → 27 ✓; 27 + 2 → 29 ✓ (not 28); 41 + 2.5 → 43.5 ✓; 43 on a 5-kg grid → 45 ✓ | CLAUDE.md §G | CORRECT |
| M25 | Rest attribution (`restInsight`) | last session: reps fell ≥ 2 vs the first set at the same load and the rest before that set < 70 % of the median rest of the history | unit tests | `rest_attribution` | CORRECT BUT WEAKLY SUPPORTED |
| M26 | Increase — two sessions (`suggestNextLoad`) | all benchmark sets at the working load ≥ top of the range, in the last TWO representative sessions at the same load, **and effort recorded on each of those sets** | 4 sessions of 3 × 15 at 60 kg (range 10–15) with no effort recorded → "hold" | `double_progression` | **QUESTIONABLE** — finding F-2 |
| M27 | Increase — one-session shortcut | every set at the load ≥ top AND each clearly light (RIR ≥ target + 2, or felt "too easy") | unit tests | `double_progression` | CORRECT; the code comment above the function still says "a little too easy" also counts — code and CLAUDE.md §G say it does not (stale comment) |
| M28 | "Two consecutive sessions" has no time limit | previous representative session = any age | 3 × 15 on 2 March and on 16 November → "increase" | `double_progression` | **QUESTIONABLE** — finding F-3 |
| M29 | Reduce — technique | technique compromised / failed on ≥ half of the last session's intended sets → one step down (or a clean load within 1.5 steps) | unit tests | CLAUDE.md §G | CORRECT BUT WEAKLY SUPPORTED; with one or two sets a single answer decides (matters for feedback 11) |
| M30 | Reduce — below range | more than half of the sets under the bottom of the range AND trend declining AND no short-rest explanation → one step down | — | code only | **INCONSISTENT (documentation)** — finding F-4 |
| M31 | No increase after pain | last session has a pain flag → hold | unit tests | CLAUDE.md §G | CORRECT |
| M32 | Load-feel map (`loadMap`) | per load: ≥ 60 % of rated sets "right" / "easy" / "heavy" → verdict, else mixed | — | — | CORRECT BUT WEAKLY SUPPORTED |
| M33 | Suggested warm-ups (`warmupFor`) | free-weight compound 50 % × 8, 70 % × 4, 85 % × 2; machine compound 50 % × 8, 75 % × 3; isolation 60 % × 8; one feeler at 70 % (or none) after ≥ 2 same-muscle sets; snapped to the step | bench 80 kg, step 2.5 → 40, 55, 67.5 ✓ | `warmups_not_counted` | CORRECT BUT WEAKLY SUPPORTED |

#### prescription.ts

| # | Formula | As coded | Hand example → code | Source | Verdict |
|---|---|---|---|---|---|
| M34 | Confidence | representative sessions on this key in 56 days: ≥ 4 high, 2–3 moderate, 0–1 low | 4 sessions → high ✓ | `presc_confidence` | CORRECT BUT WEAKLY SUPPORTED |
| M35 | RIR target | free-weight compound 2–3, everything else 1–2; +1 after broken technique in the last 2 sessions or ≥ 1/3 of recent sets at the limit on a free-weight compound; the owner's override wins | pec deck → 1–2 ✓ | `presc_rir_targets` | CORRECT BUT WEAKLY SUPPORTED |
| M36 | Load | M26–M31 on the real step; snapped to the stack (min + k × step) or the gym's dumbbell grid; an increase that does not exist → keep | 3 × 15 twice at 60, step 5 → 65 ✓ | `double_progression` | CORRECT |
| M37 | Back after a break | no workout at all for > 14 days → one existing step below the last load | unit tests | `planner_returning` | CORRECT BUT WEAKLY SUPPORTED |
| M38 | First-set reps at a new load | `floor(30 × (e1RM ÷ load − 1) − middle of the RIR target)` — the inverse of M14 | e1RM 94, load 65, target 1–2: 30 × 0.446 − 1.5 = 11.88 → 11 → range 10–12 ✓ | `presc_rep_ranges` | CORRECT (inherits M14's limits: rough above ~12 reps) |
| M39 | Reps per set | first reps from the last session at this load; set i = first − round(i × typical drop); same load → "match or +1" | 12, 11, 10 last time, drop 1 → 12–13, 11–12, 10–11, 9–10 ✓ | `presc_rep_ranges` | CORRECT |
| M40 | Typical rep drop | median of (previous − next) reps at the same load with rest within ±30 % of the usual; rounded to 0.5, clamped 0–3; 1 when unknown | → 1 ✓ | `presc_rep_ranges` | CORRECT BUT WEAKLY SUPPORTED |
| M41 | Rest advice | owner's median rest on this key, clamped (isolation 60–180 s, compound 120–300 s), ± 15 s rounded to 15 | median 120 → 105–135 ✓ | `presc_rest` | CORRECT BUT WEAKLY SUPPORTED |
| M42 | Set count | (today's share − effective sets already done today for the primary muscle) ÷ coefficient, rounded, 1…4 (isolation) or 5 (compound); 0 when < 0.5; one fewer when the muscle is "nearly recovered" | share 7, coefficient 1 → 7 → capped 4 ✓ | `presc_set_count` | CORRECT BUT WEAKLY SUPPORTED; the "one fewer when nearly recovered" step is not written in CLAUDE.md |
| M43 | Live adjustment (`adaptRemaining`) | too easy (RIR ≥ target max + 2 or "too easy") with reps at the top and clean technique → +1 step; broken technique at the limit, or on ≥ 2 sets → −1 step; ≥ 2 sets ≥ 2 reps under the range → lower the rep target; one such set → wait | 60 × 14 at RIR 5 (target 1–2, top 13) → +5 kg ✓ | CLAUDE.md §H | CORRECT BUT WEAKLY SUPPORTED |

### Group A — recovery, targets, weekly status, dates, registry, failure, feedback, effort, defaults

Records as written by the first reader (verdicts for the findings above were re-checked).

### Formula audit A — recovery, targets, analysis, history, dates, muscles, registry, failure, feedback, effort, defaults

Read-only audit, 2026-11-23. All numbers are synthetic. "Ran" = executed with `npx vite-node` from the repo root using the scratch scripts next to this file (`a1.ts` … `a6.ts`, fixtures from `tests/fixtures.ts`, timezone UTC, default settings). Sources are named only by ids that exist in the repo (`src/data/scientific-evidence/rules.ts`, `CLAUDE.md`). No research is cited from memory.

Verdict key: CORRECT · CBWS = CORRECT BUT WEAKLY SUPPORTED (heuristic that matches its documentation) · QUESTIONABLE · WRONG · INCONSISTENT.

Totals: 99 records — CORRECT 48 · CBWS 30 · QUESTIONABLE 8 · INCONSISTENT 9 · WRONG 4.

---

#### recovery.ts

##### 1. Movement families for the "new exercise" rule
- Where: recovery.ts: `MOVEMENT_FAMILIES`, `movementFamily`, `sameMovement` (48–64)
- Formula as coded: 4 families (pushdown / bar / rope; barbell_curl / ez_bar_curl; preacher_curl / machine_biceps_curl; romanian_deadlift / dumbbell_romanian_deadlift); canonical id = first member, else the id itself.
- Meant to compute: whether two exercise ids are the same movement for novelty.
- Edge cases checked: unknown id → itself; hanging_leg_raise vs hanging_knee_raise_pelvic_curl deliberately not paired.
- Source: rule `recovery_windows` ("a new exercise"); CLAUDE.md "Recovery (heuristic)". The family list itself is not documented anywhere.
- Hand-computed example: rope pushdown last session, bar pushdown 10 days earlier → same family → no +12 h. Hand: window 24 h. Code: 24 h (ran, R4).
- Verdict: CBWS
- Notes: list is a judgement call (e.g. lying / seated leg curl, lat_pulldown / close_grip_pulldown are not families).

##### 2. Base recovery window by session size
- Where: recovery.ts: `baseWindowHours` (67–69)
- Formula as coded: sets ≤ 3 → 24 h; ≤ 6 → 36; ≤ 9 → 48; ≤ 12 → 60; else 72.
- Meant to compute: baseline hours to recover from the last significant session.
- Edge cases checked: 0 → 24; 3 → 24; 3.01 → 36; 6.5 → 48; 9.5 → 60; 12.5 → 72; 30 → 72 (ran). Input is the tapered effective-set number (12 raw sets at full credit → 11.5).
- Source: rule `recovery_windows` (basis: heuristic, confidence low); CLAUDE.md "Recovery (heuristic)" — identical table.
- Hand-computed example: 7 triceps sets RIR 2 → 7 effective → 48 h. Code: 48 (ran, R2).
- Verdict: CBWS

##### 3. "Significant" session threshold
- Where: recovery.ts: `estimateRecovery` (108–109, 126–127, 138); defaults.ts:42
- Formula as coded: per session, effective sets counting only coefficients ≥ 0.5 (`SIG = { minCoef: 0.5 }`, resolved coefficients, per-session taper applied); significant when ≥ `significantStimulusSets` (default 2).
- Meant to compute: which sessions start a recovery hold for a muscle.
- Edge cases checked: 1 direct set → insufficient_data; 3 pulldown sets → biceps 1.5 → not significant; pec deck → front delts (0.25) never significant (ran, R1, R8).
- Source: CLAUDE.md C ("Only contributions ≥ 0.5 can make a session 'significant' for recovery"). The value 2 is in no rule and not in CLAUDE.md.
- Hand-computed example: 3 lat pulldown sets RIR 2 → lats 3.0 (significant), biceps 3 × 0.5 = 1.5 (< 2). Code: lats window 24 h, biceps insufficient_data.
- Verdict: CBWS
- Notes: the 2-set threshold is an undocumented heuristic; consider adding it to `recovery_windows`.

##### 4. Only the most recent significant session sets the window
- Where: recovery.ts: `estimateRecovery` (102, 123–131)
- Formula as coded: sessions sorted by end time, newest first; the first one with ≥ 2 effective sets is "last"; window and hoursSince come from that session alone.
- Meant to compute: the session recovery is counted from.
- Edge cases checked: a small later session replaces a large earlier one.
- Source: rule `recovery_windows` ("by the last significant session"); CLAUDE.md same wording — the code does what the text says.
- Hand-computed example (ran, R6): Mon 18:00 — 12 pec-deck sets (11.5 effective → 60 h + 12 h large = 72 h). Now = Wed 18:00. Alone: 48 h since, **recovering, 24 h left**. Add Tue 18:00 — 2 pec-deck sets (window 24 h): **likely_recovered, 0 h left**.
- Verdict: QUESTIONABLE
- Notes: doing 2 more sets makes the muscle "recover" 24 h sooner. Alternative: take the latest expiry over recent sessions, i.e. max over significant sessions of (end + its window), and count hoursLeft to that.

##### 5. Large muscle after a very high-volume session
- Where: recovery.ts: `estimateRecovery` (164–167)
- Formula as coded: `size === 'large' && last.sets > 9` → window += 12.
- Meant to compute: extra recovery for big muscles after > 9 effective sets.
- Edge cases checked: exactly 9 → no; 10 → yes; medium/small muscles never.
- Source: rule `recovery_windows`; CLAUDE.md ("a large muscle after >9 sets").
- Hand-computed example: 10 pec-deck sets → 60 + 12 = 72 h; 10 pushdown sets (triceps = medium) → 60 h. Code: 72 / 60 (ran, R2).
- Verdict: CBWS

##### 6. Failure sets extend the window
- Where: recovery.ts: `estimateRecovery` (170–180); failure.ts: `isFailureSetForFatigue` (66–68)
- Formula as coded: count non-warm-up, non-planned sets with `toFailure || rir === 0 || failure === 'muscular' || technicalFailure` on exercises whose coefficient for the muscle ≥ 0.5; L/R pair = 1 (0.5 each); count ≥ 2 → +12 h (once).
- Meant to compute: +12 h after ≥ 2 sets to failure.
- Edge cases checked: 1 failure set → none; L+R to failure = 1 → none; warm-ups ignored; RIR 0.5 not counted; one working set to failure plus one drop segment at RIR 0 = 2 → +12 h (ran, R3).
- Source: rule `recovery_windows` ("+12 h for ≥ 2 failure sets"); CLAUDE.md H ("failure sets count toward the +12 h recovery rule").
- Hand-computed example: 2 sets RIR 2 + 2 sets RIR 0 pushdown → 4 effective → 36 + 12 = 48 h. Code: 48.
- Verdict: CBWS
- Notes: a single drop set taken to failure already counts as 2 failure sets, although `drop_and_low_reps` treats drop segments as "short continuations of one set" — arguable, conservative.

##### 7. Coefficient source for the failure and novelty modifiers
- Where: recovery.ts: `hitsM` (170) vs the significance test (109, 126)
- Formula as coded: significance uses `sessionMuscleEffective` → `resolveCoefficients` (variation-adjusted); `hitsM` uses `registry.get(id).contributions` (base library values, no variation).
- Meant to compute: which exercises of the last session "hit" the muscle.
- Edge cases checked: decline bench (−10°): resolved front delts 0.25, base 0.5.
- Source: CLAUDE.md C (bench-angle rules: decline → "front delts capped at 0.25"; "Only contributions ≥ 0.5 can make a session significant").
- Hand-computed example (ran, R3b): overhead press 3 × RIR 2 + barbell bench at −10° 2 × RIR 0. Front delts: significant sets = 3.0 (bench contributes 0.25 → excluded) → 24 h; the two failure sets are on an exercise below 0.5 for front delts → expected 24 h. Code: **36 h**, factor "2 sets to failure in that session: +12 h."
- Verdict: INCONSISTENT
- Notes: same mismatch the other way for steep inclines (front delts resolved 0.75, base 0.5 → not "direct" for novelty) and supinated pulldowns (biceps resolved 0.75, base 0.5). Fix: use `resolveCoefficients(def, e.variation).contributions` in `hitsM`.

##### 8. Novel exercise extends the window
- Where: recovery.ts: `estimateRecovery` (181–187)
- Formula as coded: among the last session's exercises with coefficient ≥ 0.75, any whose movement family appears in no earlier workout within 21 days (`o.date < lastDate && diffDays ≤ 21`) → +12 h, provided at least one earlier workout exists.
- Meant to compute: +12 h when a direct exercise is new to the owner in the last 3 weeks.
- Edge cases checked: first workout ever → no; same exercise 21 days earlier → no, 22 days → yes; other family member → no (ran, R4). **Exercise entry with no performed working set still counts.**
- Source: rule `recovery_windows` ("a new exercise"); CLAUDE.md ("+12 h for … a new exercise"); factor text says "more muscle damage expected".
- Hand-computed example (ran, R4): 3 bar-pushdown sets (familiar) + a skull_crusher entry holding only one warm-up set (or only an unticked planned set). Expected triceps window 24 h. Code: **36 h** with "Exercise new to you in the last 3 weeks (more muscle damage expected): +12 h."
- Verdict: WRONG
- Notes: an exercise that contributed zero working sets cannot have caused damage; this happens live as soon as a new exercise card is added (planned sets are stripped but the empty entry stays, analysis.ts:107). Fix: require ≥ 1 counted non-warm-up set on the novel exercise (and use resolved coefficients, record 7).

##### 9. Soreness modifier and forced "recovering"
- Where: recovery.ts: `estimateRecovery` (132–136, 188–194, 205–208)
- Formula as coded: soreness = max over daily logs and session wellness of the last 3 days (0–4); ≥ 3 → +24 h; ≥ 2 → +12 h; if ≥ 3 and the window has passed, status is still set to 'recovering'.
- Meant to compute: longer recovery when the owner reports soreness.
- Edge cases checked: 1 → none; 2 → +12; 3 → +24; log 3 days old → ignored; a log dated on the session day (possibly entered before training) counts (ran, R5).
- Source: rule `recovery_windows` ("+12/24 h for soreness"); CLAUDE.md same. The forced status is not documented.
- Hand-computed example: 3 pushdown sets, 49 h ago, soreness 3 → 24 + 24 = 48 h → window passed, status forced 'recovering'. Code: window 48, status recovering, hoursLeft 0, readiness 1.
- Verdict: CBWS
- Notes: the forced status has hoursLeft 0, so nothing is blocked (analysis.ts:191 needs > 6 h); it only feeds the Week badge and volumeResponse's "recoveryPoor". Output is self-contradictory (recovering, readiness 1.0, 0 h left) but harmless.

##### 10. Short sleep modifier
- Where: recovery.ts (115, 117, 195–198)
- Formula as coded: mean of all sleepHours values (daily logs + session wellness) in the last 3 days; < 6 → +12 h.
- Edge cases checked: 5.9 → +12; exactly 6 → none; (5, 8) → mean 6.5 → none; no data → none (ran, R5).
- Source: rule `recovery_windows` ("short sleep"); CLAUDE.md. The 6 h cut-off is not stated in either.
- Hand-computed example: 3 sets, sleep 5.9 → 24 + 12 = 36. Code: 36.
- Verdict: CBWS

##### 11. High fatigue modifier
- Where: recovery.ts (116, 118, 199–202)
- Formula as coded: max fatigue (1–5) over the last 3 days; ≥ 4 → +12 h.
- Edge cases checked: 3 → none; 4 → +12 (ran, R5).
- Source: rule `recovery_windows` ("high fatigue"); CLAUDE.md. Cut-off 4 undocumented.
- Hand-computed example: 3 sets + fatigue 4 → 36 h. Code: 36. All modifiers stack: soreness 3 + sleep 5 + fatigue 5 → 24 + 24 + 12 + 12 = 72 (code 72).
- Verdict: CBWS

##### 12. Look-back window for subjective inputs
- Where: recovery.ts (111–114)
- Formula as coded: `since = addDays(today, −2)`; logs with `since ≤ date ≤ today` (3 calendar days).
- Edge cases checked: log dated today − 3 ignored (ran).
- Source: none in rules.ts / CLAUDE.md (code comment "last 3 days").
- Hand-computed example: today 11-19 → 11-17, 11-18, 11-19 count; 11-16 does not. Code: same.
- Verdict: CBWS

##### 13. hoursSince, readiness, status, hoursLeft
- Where: recovery.ts (157–159, 203–214)
- Formula as coded: hoursSince = max(0, (now − end)/3.6e6); readiness = clamp(hoursSince/window, 0, 1) rounded to 0.01; status = hoursSince ≥ window ? likely_recovered : recovering; hoursLeft = recovering ? max(0, round(window − hoursSince)) : 0; hoursSince reported rounded; > 240 h adds a "more than 10 days" note.
- Edge cases checked: 23.98 h of 24 → recovering, hoursSince shown 24, left 0, readiness 1.00 (rounding only); exactly 24 h → recovered (ran, R1). Rounded hoursLeft is what analysis compares with 6 h, so the real cut is 6.5 h (6.6 h left → 7 → blocked; 6.4 → 6 → not; ran R9).
- Source: CLAUDE.md "Recovery (heuristic)… up to the current time".
- Hand-computed example: window 36, 15 h since → readiness 0.4167 → 0.42, left 21. Code: 0.42 / 21.
- Verdict: CORRECT

##### 14. Session end clamped to "now"
- Where: recovery.ts: `at` (97–100), skip of future sessions (125)
- Formula as coded: if the session is dated ≤ today and its estimated end is in the future, use now; sessions still in the future are skipped.
- Edge cases checked: session today without a time (assumed 18:00) at 10:00 → counted from 10:00, 0 h ago (ran, R7).
- Source: CLAUDE.md (end-time resolution; "assumed 18:00 (shown with '?')").
- Hand-computed example: 4 sets today, no time, now 10:00 → hoursSince 0, window 36, left 36. Code: same.
- Verdict: CORRECT
- Notes: the factor then reads "Counted from 10:00 … (no time recorded — 18:00 assumed)" — the label names 18:00 while 10:00 is used (cosmetic).

##### 15. Recovery entering today (`before`)
- Where: recovery.ts (71–74, 101); analysis.ts:119
- Formula as coded: `opts.before = today` drops workouts dated ≥ today from the pool.
- Edge cases checked: only session is today → planRecovery insufficient_data while recovery is "recovering" (ran, R7).
- Source: CLAUDE.md ("Only an EARLIER session can hold a muscle back today (today's own sets never do)").
- Hand-computed example: as above. Code: same.
- Verdict: CORRECT

##### 16. 7-day and 14-day context numbers
- Where: recovery.ts (103–105, 109, 137–138)
- Formula as coded: recent7 = workouts with 0 ≤ diffDays(today, date) < 7; exposures14d = sessions in the last 14 days (pool) with significant sets ≥ threshold.
- Edge cases checked: future-dated workouts excluded; coefficient < 0.5 work shows in recent7dEffective but not in exposures.
- Source: display only; no rule.
- Hand-computed example: 3 pulldown sets yesterday → lats exposures 1, 7-day effective 3; biceps 7-day 1.5, exposures 0. Code: [1, 3, 1.5] (ran, R8).
- Verdict: CORRECT

---

#### dates.ts

##### 17. isIsoDate
- Where: dates.ts: `isIsoDate` (9–11); used by importer.ts:118
- Formula as coded: `/^\d{4}-\d{2}-\d{2}$/` and `!isNaN(Date.parse(s + 'T00:00:00Z'))`.
- Meant to compute: whether a string is a real calendar date.
- Edge cases checked (ran, Node/V8): '2026-13-01' → false; **'2026-02-30', '2026-02-31', '2026-04-31' → true**. WebKit was not checked (browser binary not installed here).
- Source: CLAUDE.md E.2 (validate: required `date`); docs say "date must be YYYY-MM-DD".
- Hand-computed example: 2026-02-30 does not exist → expected false. Code: true; `dateMs('2026-02-30')` → 2026-03-02.
- Verdict: WRONG
- Notes: such a workout is stored with the string "2026-02-30": string comparisons put it in the week 02-23…03-01, while `diffDays` / `sessionEndVirtualMs` treat it as 2 March (the next week) → week volume and recovery disagree. Fix: add a round-trip check `msToDate(dateMs(s)) === s`.

##### 18. dateMs / msToDate / addDays / diffDays
- Where: dates.ts (14–28)
- Formula as coded: UTC midnight epoch; add n × 86 400 000 ms; diff = round((a − b)/DAY).
- Edge cases checked: leap day (2024-02-28 + 1 → 02-29); month rollover (2026-02-27 + 3 → 03-02); across a DST weekend → 2 (pure UTC, no DST effect) (ran).
- Source: CLAUDE.md I ("Monday 00:00 (owner's timezone)" — calendar arithmetic on local dates).
- Hand-computed example: diffDays('2026-03-30', '2026-03-28') = 2. Code: 2.
- Verdict: CORRECT

##### 19. dayOfWeek / weekStart / weekOf / inRange
- Where: dates.ts (30–32, 55–73)
- Formula as coded: back = (dow − weekStartsOn + 7) % 7; start = d − back; end = start + 6.
- Edge cases checked: Monday start: Mon 11-23 → 11-23; Sun 11-29 → 11-23; Sunday start: Mon 11-23 → 11-22; Saturday start → 11-21 (ran).
- Source: CLAUDE.md I (weekly counters start Monday 00:00).
- Hand-computed example: 2026-11-25 (Wed, dow 3), start 1 → back 2 → 11-23 … 11-29. Code: same.
- Verdict: CORRECT

##### 20. daysLeftInWeek
- Where: dates.ts (76–78)
- Formula as coded: max(0, diffDays(end, today) + 1) — includes today.
- Edge cases checked: Mon 7, Wed 5, Sun 1 (ran).
- Source: used by today's share (rule `todays_share`).
- Hand-computed example: Wed → 29 − 25 + 1 = 5. Code: 5.
- Verdict: CORRECT

##### 21. localNowParts / todayIn
- Where: dates.ts (34–53)
- Formula as coded: Intl parts (en-CA, h23) in the training timezone → date, HH:mm, virtualMs = Date.parse(date + 'T' + time + ':00Z'); invalid timezone → system timezone.
- Edge cases checked: 23:30Z in Europe/Berlin → next day 00:30; 00:05 → hour "00" (not "24"); invalid zone → falls back to the machine's zone (ran).
- Source: CLAUDE.md (owner's timezone; recovery "up to the current time").
- Hand-computed example: 2026-11-22T23:30Z, Berlin (UTC+1) → 2026-11-23 00:30. Code: same.
- Verdict: CORRECT
- Notes: seconds are dropped (minute resolution); DST changes shift elapsed hours by ≤ 1 h twice a year — negligible for a 24–72 h heuristic.

##### 22. Session end-time resolution order
- Where: dates.ts: `sessionEndVirtualMs` (88–108)
- Formula as coded: (1) latest `completedAt` of non-planned sets, converted to local wall time, if within [day, day + 48 h); (2) endTime (+1 day if endTime < startTime); (3) start + durationMin (> 0); (4) startTime; (5) 18:00 "assumed".
- Edge cases checked: planned ticks ignored; tick before the day ignored; 23:30 + 90 min → next day 01:00; duration without start → assumed 18:00; duration 0 → start_time; "7:30" (not HH:mm) → assumed; end == start → same day (ran).
- Source: CLAUDE.md ("the last ticked set, else the end time, else start + duration, else the start time, else an assumed 18:00").
- Hand-computed example: start 17:00, duration 75 → 18:15. Code: 18:15 (tests/recovery-time.test.ts and ran).
- Verdict: CORRECT
- Notes: `hhmm` accepts "25:99" (regex only checks digits) → 02:39 next day; the importer's `time` regex has the same gap (importer.ts:21). Only an end time and no start for a session past midnight cannot be recognised (unknowable).

##### 23. How long a last-tick time is trusted
- Where: dates.ts (93, 97)
- Formula as coded: `v >= day && v < day + 2 * DAY` → tick wins over a recorded end time.
- Meant to compute: per the comment, "Only trusted if it falls on the workout's day or the night after."
- Edge cases checked (ran): workout dated 03-02 with endTime 19:00, a set ticked 03-03 15:00 → end = **03-03 15:00 (last_set)**; ticked 03-03 23:59 → last_set; ticked 03-04 00:00 → end_time 03-02 19:00.
- Source: CLAUDE.md order (tick first) — but the comment limits it to "the night after".
- Hand-computed example: a session logged the next afternoon (date set to yesterday, end time 19:00 entered, sets ticked at 15:00 today). Expected end: yesterday 19:00. Code: today 15:00 → recovery starts 20 h late.
- Verdict: QUESTIONABLE
- Notes: the window is the whole following day, not "the night after". Alternative: trust ticks only until about 06:00 of the next day, or prefer a recorded end time when the tick is more than a few hours after it.

##### 24. workoutVirtualMs
- Where: dates.ts (111–114)
- Formula as coded: date + startTime (HH:mm) else 18:00, as UTC-scaled virtual ms.
- Edge cases checked: null → 18:00; '07:15' → 07:15 (ran).
- Source: same 18:00 convention as record 22.
- Hand-computed example: ('2026-03-02', null) → 2026-03-02T18:00. Code: same.
- Verdict: CORRECT

##### 25. formatDuration
- Where: dates.ts (120–126)
- Formula as coded: s = round(sec); m = floor(s/60); r = s % 60; "m:rr" if m > 0 else "rs"; null / non-finite → "—".
- Edge cases checked: 59.6 → "1:00"; 0 → "0s"; 125 → "2:05"; 3600 → "60:00"; −5 → "-5s" (ran).
- Source: display only.
- Hand-computed example: 125 s → 2:05. Code: 2:05.
- Verdict: CORRECT

---

#### history.ts

##### 26. Weekly buckets
- Where: history.ts: `weeklyHistory` (15–30)
- Formula as coded: weeks from the week of the earliest workout to the current week; workouts with start ≤ date ≤ end; `complete = range.end < today`; at most 1000 weeks.
- Edge cases checked: no workouts → []; empty weeks in between are kept (0 workouts); the current week is never complete; on Sunday the running week is still incomplete (ran).
- Source: CLAUDE.md I ("previous weeks are derived from raw sets").
- Hand-computed example: workouts 11-03 and 11-27, today 11-23 → 4 buckets [11-02 ✓ 1], [11-09 ✓ 0], [11-16 ✓ 0], [11-23 ✗ 1]. Code: same.
- Verdict: CORRECT
- Notes: the current bucket includes workouts dated later this week (analysis.ts:114 excludes them for the live numbers); only complete weeks feed targets, so no effect.

##### 27. median / mean
- Where: history.ts (32–41)
- Formula as coded: median = middle (odd) or mean of the two middle values (even); empty → 0; mean empty → 0.
- Edge cases checked: [] → 0; [3] → 3; [1, 9] → 5; [5, 1, 3] → 3 (ran).
- Source: —
- Hand-computed example: as above. Code: same.
- Verdict: CORRECT

##### 28. cv (coefficient of variation)
- Where: history.ts (43–49)
- Formula as coded: sample SD (n − 1) ÷ mean; fewer than 2 values or mean 0 → 1.
- Edge cases checked: [5] → 1; [0, 0] → 1; [10, 10, 10] → 0 (ran).
- Source: used by the target confidence score (record 76).
- Hand-computed example: [8, 10, 12]: SD = √(8/2) = 2; ÷ 10 = 0.2. Code: 0.2.
- Verdict: CORRECT

---

#### muscles.ts

##### 29. Provisional weekly reference ranges
- Where: muscles.ts: `MUSCLES[].reference` (21–117)
- Formula as coded (min / preferred / max): chest, lats, quads 6/12/18; upper back, side delts, biceps, triceps, hamstrings, glutes, calves 6/10/16; rear delts 6/8/14; traps, front delts 4/6/12; abs, adductors 3/6/12; spinal erectors 2/4/10; forearms 0/4/10.
- Meant to compute: starting weekly effective-set ranges in Learning Mode.
- Edge cases checked: regions have `reference: null` and are not tracked.
- Source: rule `weekly_target_reference` ("preferred ≈ 10–12, min 6"; basis research_informed_heuristic); CLAUDE.md ("preferred ≈ 10–12 for most muscles, lower end 6 for large muscles").
- Hand-computed example: all six large muscles have min 6; 10 of 17 muscles have preferred 10–12. Code/table: same.
- Verdict: CBWS
- Notes: the seven muscles below 10 (rear delts, traps, front delts, abs, adductors, erectors, forearms) rely on the per-muscle "indirect work" notes, which no rule quantifies.

##### 30. Muscle size classes
- Where: muscles.ts `size` field
- Formula as coded: large = chest, lats, upper back, quads, hamstrings, glutes; medium = regions, traps, triceps, abs, erectors, adductors; small = delts, biceps, forearms, calves.
- Meant to compute: input to the large-muscle +12 h rule and to scoring.
- Source: rule `recovery_windows` ("a large muscle after > 9 sets"); class membership is not documented.
- Hand-computed example: 10 sets chest → +12 h, 10 sets triceps → none. Code: 72 / 60.
- Verdict: CBWS

##### 31. involvement thresholds
- Where: muscles.ts: `involvement` (136–141)
- Formula as coded: coef ≥ 0.75 direct; ≥ 0.4 indirect; > 0 minor; else none.
- Edge cases checked: 0.75 → direct (same 0.75 cut as novelty, trend summary and the legacy plan); 0.5 → indirect; 0.25 → minor.
- Source: rule `fractional_coefficients` (1 / 0.5 / 0.25 / 0); CLAUDE.md C.
- Hand-computed example: incline press: chest 1 → direct, triceps 0.5 → indirect. Code: same.
- Verdict: CBWS
- Notes: classification only (reporting); credit always uses the coefficient itself.

##### 32. Tracked muscles exclude regions
- Where: muscles.ts (124–125)
- Formula as coded: TRACKED_MUSCLES = muscles with `isRegion === false` (17); REGIONS = upper_chest, lower_chest.
- Source: rule `regional_emphasis_not_added`; CLAUDE.md C.
- Hand-computed example: 19 entries − 2 regions = 17 targets. Code: 17.
- Verdict: CORRECT

---

#### registry.ts

##### 33. Registry build and coefficient overrides
- Where: registry.ts: `buildRegistry` (7–23)
- Formula as coded: seed → custom (same id replaces) → overrides replace `contributions`, `regionEmphasis`, `repRange`, `defaultRestSec` when present.
- Edge cases checked: override for an unknown id is skipped.
- Source: CLAUDE.md C ("Changing a coefficient in the app recalculates all historical volume").
- Hand-computed example: n/a (data plumbing).
- Verdict: CORRECT

##### 34. Bench-angle coefficient groups
- Where: registry.ts: `resolveCoefficients` (46–73)
- Formula as coded (angle-sensitive exercises, −30 ≤ angle ≤ 90): ≤ −5 → lower_chest 1, presses: front delts capped at 0.25; < 10 → lower_chest 0.5 (no upper); ≤ 45 → upper_chest 1, presses: front delts ≥ 0.5; > 45 → upper_chest 0.5, presses: front delts = 0.75, chest = min(chest, 0.75). Flys change regions only.
- Edge cases checked (ran, barbell bench): −5 decline; −4.9 flat; 9.9 flat; 10 incline; 45 incline; 45.1 steep; 90 steep; 91 and −31 → ignored (base values); non-sensitive machine press ignores the angle; dumbbell fly at 60° keeps chest 1, front delts 0.25.
- Source: rule `bench_angle_groups` (confidence low); CLAUDE.md C and F ("coarse heuristic groups only").
- Hand-computed example: bench 60° → chest 0.75, front delts 0.75, triceps 0.5, upper_chest 0.5. Code: same.
- Verdict: CBWS
- Notes: "flat → whole pec" is represented as lower_chest 0.5 (same as the flat presses' library default); regions are never added to chest.

##### 35. Valid angle range vs the import schema
- Where: registry.ts:48 (−30…90) vs importer.ts:87, docs/schema/workout-import.v1.schema.json:107, docs/WORKOUT_SCHEMA.md:42 (−45…90)
- Formula as coded: registry ignores angles < −30; the importer accepts down to −45.
- Edge cases checked (ran): bench at −30 → front delts 0.25, lower_chest 1; at −31 or −45 → base values (front delts 0.5, lower_chest 0.5).
- Source: CLAUDE.md J ("bench angles outside −30…90° ignored") matches the registry; the import contract does not.
- Hand-computed example: a schema-valid `bench_angle_deg: -35` on a bench press → expected the decline rule; code silently treats it as "no angle" for muscle credit (it still starts its own strength history).
- Verdict: INCONSISTENT
- Notes: align the two ranges (narrow the schema to −30, or apply the decline group down to −45).

##### 36. Positive angle on `decline_press`
- Where: registry.ts (48–63); exercises.ts:69–71
- Formula as coded: the same sign-based groups apply to every angle-sensitive exercise, including `decline_press`.
- Edge cases checked (ran): decline_press, no angle → lower_chest 1, front delts 0.25; angle −15 → same; **angle +15 → upper_chest 1, lower_chest removed, front delts 0.5**.
- Source: rule `bench_angle_groups`; neither CLAUDE.md, docs/WORKOUT_SCHEMA.md nor WORKOUT_PARSING.md states that decline must be entered as a negative number.
- Hand-computed example: "decline press, 15° decline" imported as `bench_angle_deg: 15` → expected lower-chest emphasis; code gives upper-chest emphasis and doubles the front-delt credit.
- Verdict: QUESTIONABLE
- Notes: document the sign convention in the schema docs / CLAUDE.md A.2, and/or treat a positive angle on `decline_press` as a decline.

##### 37. Supinated grip on vertical pulls
- Where: registry.ts (76–79)
- Formula as coded: `grip === 'supinated'` && pattern vertical_pull && category compound → biceps = max(biceps, 0.75).
- Edge cases checked (ran): lat pulldown 0.5 → 0.75; straight-arm pulldown (isolation) unchanged; barbell row unchanged; 'Supinated' (capital) → no effect (exact string match; the import field is free text ≤ 40 chars).
- Source: rule `supinated_vertical_pull` (heuristic, low); CLAUDE.md C, J.
- Hand-computed example: 4 supinated pulldown sets RIR 2 → biceps 3.0 instead of 2.0.
- Verdict: CBWS
- Notes: consider normalising grip case on import.

##### 38. Squat depth
- Where: registry.ts (82–86)
- Formula as coded: back_squat / smith_squat with `depth === 'above_parallel'` → glutes and adductors capped at 0.5.
- Edge cases checked (ran): back squat 0.75/0.75 → 0.5/0.5; smith 0.75/0.5 → 0.5/0.5; 'parallel' unchanged.
- Source: CLAUDE.md C, F, J ("above-parallel squats credit glutes/adductors 0.5").
- Hand-computed example: 4 above-parallel squat sets RIR 2 → glutes 2.0 (not 3.0). 
- Verdict: CORRECT
- Notes: stale comment on `Variation.depth` in types.ts ("Recorded, not used for coefficients") contradicts this rule.

##### 39. loadUnitLabel
- Where: registry.ts (94–105)
- Formula as coded: assisted → "kg assistance"; bodyweight_plus → "kg added"; per_side → "kg per side"; else by equipment kind (dumbbell → per dumbbell, barbell/smith → total, machine/cable → on stack, plate_loaded → plates).
- Source: CLAUDE.md A.4 load conventions.
- Hand-computed example: dumbbell press, total → "kg per dumbbell".
- Verdict: CORRECT

##### 40. searchExercises / normalizeName
- Where: registry.ts (108–140)
- Formula as coded: score 100 exact; 70 + min(len) prefix; 50 + min(len)/2 substring; 40 × token overlap (tokens > 2 chars, ÷ max token count); normalise: lower-case, ё → е, non-alphanumerics → space.
- Edge cases checked (ran): "bench" → barbell_bench_press first; "жим лёжа" → barbell_bench_press first; "  Жим ЛЁЖА (45°)!! " → "жим лежа 45°".
- Source: CLAUDE.md A.2 (name-only entries resolve only on exact match — that is the importer; this is the picker ranking).
- Verdict: CORRECT

---

#### failure.ts

##### 41. effectiveFailure
- Where: failure.ts (51–57)
- Formula as coded: `failure` field wins; else `toFailure` → muscular; else unknown; `technical = technicalFailure === true`. RIR 0 alone gives no status.
- Edge cases checked (ran): none + toFailure → 'none' (recorded wins); RIR 0 only → unknown.
- Source: CLAUDE.md H (failure status separate from RIR; "absent fields = unknown").
- Verdict: CORRECT

##### 42. isCleanMuscularFailure
- Where: failure.ts (60–63)
- Formula as coded: status muscular and not technical.
- Edge cases checked: muscular + technical → false (ran).
- Source: CLAUDE.md H.
- Verdict: CORRECT

##### 43. isFailureSetForFatigue
- Where: failure.ts (66–68)
- Formula as coded: `toFailure || rir === 0 || failure === 'muscular' || technicalFailure === true`.
- Edge cases checked (ran): RIR 0.5 → false; technical only → true; failure 'none' with RIR 0 → true.
- Source: CLAUDE.md H ("failure sets count toward the +12 h recovery rule"); rule `recovery_windows`.
- Hand-computed example: see record 6.
- Verdict: CBWS
- Notes: RIR 0 counts here although `effectiveFailure` refuses to call RIR 0 a failure — intentional (fatigue vs status), documented in the code comment only.

##### 44. techniqueWithFailure
- Where: failure.ts (74–79)
- Formula as coded: technical failure → 'compromised' unless technique is explicitly good / compromised / failed (slightly_degraded and not_assessed become compromised).
- Edge cases checked (ran): technical + technique good → good (no ×0.7).
- Source: rule `failure_no_bonus` ("technical failure ×0.7"); CLAUDE.md H ("technique ×0.7 unless marked good").
- Hand-computed example: technical failure, RIR 2 → 1.0 × 0.7 = 0.7. Code: 0.7.
- Verdict: CORRECT

##### 45. failureImpliedRir
- Where: failure.ts (85–89)
- Formula as coded: null if a RIR is logged or `toFailure`; 0 if failure === 'muscular' and not technical; else null.
- Edge cases checked (ran): muscular → 0 (credit 1.0, source failure_status); muscular + RIR 5 → RIR wins (0.3); none / uncertain → null (0.75); muscular + "too easy" feel → failure status wins (1.0).
- Source: rule `failure_no_bonus`; CLAUDE.md H ("muscular failure without RIR ≈ RIR 0 with the SAME credit as RIR 1–3").
- Hand-computed example: muscular, no RIR → table[0] = 1.0. Code: 1.0.
- Verdict: CORRECT

##### 46. "Fail" chip vs failure status when technique gave out
- Where: failure.ts:86–87 with quality.ts:45–48
- Formula as coded: `toFailure` → RIR 0 before the technical check (quality.ts:45); failure 'muscular' + technicalFailure → no implied RIR (failure.ts:87) → unknown effort.
- Edge cases checked (ran): toFailure + technical → 1.0 × 0.7 = **0.70**; muscular + technical → 0.75 × 0.7 = 0.525 → **0.53**.
- Source: CLAUDE.md H ("technical failure … does not necessarily mean 0 muscular RIR"; six-month audit example "0.75 × 0.7 = 0.53"); A.4 maps "to failure" to failure_status muscular + to_failure true.
- Hand-computed example: the same event ("went to failure, form broke first") gets 0.70 if it carries the Fail chip / import `to_failure`, 0.53 if only the failure answer.
- Verdict: INCONSISTENT
- Notes: `effortDistribution` (effort.ts:49) has the same split (chip + technical → RIR 0 column). Fix: when `technicalFailure` is true, do not derive RIR 0 from `toFailure` either (or accept RIR 0 in both paths).

##### 47. failureConsistency
- Where: failure.ts (95–111)
- Formula as coded: warm-ups skipped; muscular + technical → note; muscular with RIR ≥ 2 → note; 'none' with RIR 0 / Fail → note; technical without status and RIR 0 / Fail → note.
- Edge cases checked (ran): muscular + RIR 1 → no note; RIR 2 → note.
- Source: CLAUDE.md H ("a gentle note when the answer and RIR disagree"; never overwrite RIR).
- Verdict: CBWS (the RIR ≥ 2 cut-off is a judgement call)

##### 48. failureCategory
- Where: failure.ts (120–135)
- Formula as coded: 17 listed ids → technique_first_compound; unknown def → compound; compound → compound; isolation on machine / cable / plate_loaded / smith → stable_isolation; else isolation.
- Edge cases checked (ran): dumbbell lateral raise → isolation; cable isolation → stable_isolation.
- Source: code comment ("Practical heuristic, not a rule from a specific trial"); rule `presc_rir_targets` uses a similar split.
- Verdict: CBWS

##### 49. Failure counts and share at failure
- Where: failure.ts: `add`, `finish`, `failureProfile` (194–256)
- Formula as coded: per counted working / drop set (L/R pair = 0.5 each): workingSets += k; technical += k if technical; a set is "recorded" only if it has a failure answer, the Fail chip or a technical failure; muscular counts clean muscular only; shareAtFailure = muscular ÷ recorded (2 decimals).
- Edge cases checked (ran): L (muscular) + R (none) pair → muscular 0.5, none 0.5; warm-ups and planned sets ignored.
- Source: CLAUDE.md H ("a weekly failure profile describes patterns").
- Hand-computed example (ran): 30 sets logged RIR 2 with no failure answer + 6 sets answered "muscular" → 6 of 36 sets at failure (17 %). Code: recorded 6, share 1.0 → flag `frequently_to_failure`, line "100% of recorded sets reached muscular failure."
- Verdict: QUESTIONABLE
- Notes: the failure question is skippable, and owners answer it mostly when they did fail — the denominator is self-selected. Alternative: count sets with a logged RIR ≥ 1 as "stopped before failure" for this descriptive profile (not stored), or base the share on all working sets.

##### 50. Failure pattern thresholds
- Where: failure.ts: `FAILURE_MIN_RECORDED`, `failureFlags` (190, 258–312)
- Formula as coded: < 6 recorded → not_enough_data only; share ≥ 0.5 → frequently_to_failure; ≤ 0.2 → usually_rir; compound muscular ÷ compound recorded ≥ 0.4 → failure_often_compounds; else isolation failures > 0, ≥ 2 × compound failures and ≥ 67 % of failures → failure_mostly_isolation; per exercise recorded ≥ 3, technical > 0 and ≥ muscular → technical_before_muscular.
- Edge cases checked (ran): 5 recorded → not enough; 3/6 → frequent; 2/10 → usually_rir; 3/10 → neither; squat 4/10 → compounds; 3/10 → none.
- Source: CLAUDE.md H (profile "often to failure, on compounds, technique before muscle"); thresholds are in no rule.
- Hand-computed example: squat 4 muscular of 10 recorded → 0.4 → flag. Code: flag with exerciseIds [back_squat].
- Verdict: CBWS

##### 51. failureLine
- Where: failure.ts (314–319)
- Formula as coded: null without working sets; else the first flag other than not_enough_data, else the first flag.
- Edge cases checked: 6+ recorded with no flag (e.g. share 0.3) → "x of y recorded sets reached muscular failure."
- Verdict: CORRECT

---

#### feedback.ts

##### 52. Feel → effort / weight accuracy / technique
- Where: feedback.ts: `FEEL_OPTIONS`, `feelPatch` (25–61)
- Formula as coded: too_easy → very_easy; bit_easy → easy; just_right → appropriate + good technique; hard_good → near_max + good; too_heavy_form → hard + compromised; wrong_light / wrong_heavy → accuracy only; pain → pain record only. Tapping the same feel clears all derived fields; RIR, weight, reps untouched.
- Edge cases checked (ran): every option; toggle-off → all undefined.
- Source: CLAUDE.md G (eight answers, three separate dimensions).
- Verdict: CORRECT

##### 53. Estimated RIR ranges from effort
- Where: feedback.ts: `EFFORT_RIR_ESTIMATE` (82–88); consumed in quality.ts:57–67
- Formula as coded: very_easy [5, +]; easy [3, 4]; appropriate [1, 3]; hard [1, 2]; near_max [0, 1]; the higher end (5 for "5+") goes through the RIR table.
- Edge cases checked (ran): credits 0.3 / 0.6 / 1.0 / 1.0 (×0.7 with compromised technique = 0.7) / 1.0; switched off (`useFeelWhenNoRir: false`) → 0.75.
- Source: rule `feel_estimated_rir` (heuristic, low); CLAUDE.md G — identical ranges.
- Hand-computed example: "A little too easy" → RIR 3–4 → table[4] = 0.6. Code: 0.6.
- Verdict: CBWS
- Notes: a set marked "Too easy" (0.3) is credited less than a set with no information (0.75) — consistent with the documented rule, worth knowing.

##### 54. estimatedRirRange / formatRirRange
- Where: feedback.ts (90–97)
- Formula as coded: null when RIR is logged, `toFailure`, or no effort; format "5+", "3–4", "2".
- Edge cases checked (ran): too_easy with RIR 1 logged → null, credit 1.0 (RIR decides).
- Source: CLAUDE.md G ("A logged RIR always decides the effort credit").
- Verdict: CORRECT

##### 55. techniqueOf / isCompromised / isWrongWeight / hasPain
- Where: feedback.ts (64–75)
- Formula as coded: technique field, else `techniqueOk === false` → compromised; compromised = compromised | failed; wrong weight = too_light | too_heavy; pain = feel 'pain' or a pain record.
- Edge cases checked (ran): techniqueOk true → undefined.
- Verdict: CORRECT

##### 56. benchmarkExclusion
- Where: feedback.ts (105–115)
- Formula as coded: excluded in order: wrong weight, pain, compromised, failed, technical failure; slightly degraded and clean muscular failure stay benchmarks.
- Edge cases checked (ran): all eight feels; slightly_degraded → null; technical failure → excluded; muscular → null.
- Source: rule `benchmark_exclusion`; CLAUDE.md G.
- Verdict: CORRECT

##### 57. isFinished
- Where: feedback.ts (133–135)
- Formula as coded: endTime set, or finishedAt set, or source ≠ 'live'.
- Edge cases checked (ran): live without end → false; live with end → true; import → true.
- Source: CLAUDE.md G ("finished workout (ended, marked finished, or imported)").
- Verdict: CORRECT

##### 58. Corrections audit — audited fields
- Where: feedback.ts: `AUDITED`, `withCorrections` (130, 143–182)
- Formula as coded: per set, `{at, field, from, to}` for weightKg, reps, rir, type, side, failure, technicalFailure, toFailure; removed sets and exercise / machine changes become workout notes; diffs are against the version opened for editing.
- Edge cases checked (ran): weight 40 → 45 recorded; removed set noted; **loadMode total → per_side on the same set not recorded**.
- Source: CLAUDE.md G ("records original → corrected values per set … never overwrite silently").
- Hand-computed example: set 40 kg "total" corrected to 45 kg "per side" → expected two entries; code records only weightKg 40 → 45.
- Verdict: QUESTIONABLE
- Notes: `loadMode` changes what the kg number means (per side vs total, assisted vs added) and so changes tonnage and the strength index, yet it is overwritten silently; feel / technique / ROM changes (which change credit) are not audited either. Alternative: add `loadMode` (at least) to `AUDITED`.

---

#### effort.ts

##### 59. hasEffortInfo
- Where: effort.ts (9–10)
- Formula as coded: `rir != null || toFailure || effort || feel || (failure === 'muscular' && !technicalFailure)`.
- Meant to compute: per the header comment, whether a set carries effort information — "Sets without it are credited a provisional 0.75".
- Edge cases checked (ran): feel 'pain' → true, yet credit 0.75 / tier unknown / source none; feel 'wrong_light' → true, credit 0.75 unknown; failure 'none' → false (0.75, correct); muscular + technical → false (correct).
- Source: rule `unknown_effort` ("No RIR, feel or failure answer → provisional credit 0.75"); CLAUDE.md G.
- Hand-computed example: 6 sets marked only "Pain" → all six credited the provisional 0.75; expected missing = 6 and a nudge. Code: missing 0, no nudge.
- Verdict: INCONSISTENT
- Notes: `pain`, `wrong_light`, `wrong_heavy` feels have no effort (FEEL_OPTIONS), so `!!s.feel` over-counts; with "use feel when no RIR" switched off, effort-only sets are also credited 0.75 but counted as informed. Fix: drop `!!s.feel` (keep `!!s.effort`).

##### 60. Effort-coverage nudge
- Where: effort.ts: `effortCoverage` (12–24)
- Formula as coded: count non-planned, non-warm-up sets in range; nudge = counted ≥ 6 && missing ÷ counted ≥ 0.5.
- Edge cases checked (ran): 5 sets all missing → no nudge; 6 with 3 missing → nudge; 6 with 2 missing → none; planned and warm-ups skipped; 3 L + 3 R count as 6 here (not paired).
- Source: code comment only (no rule).
- Hand-computed example: 3 of 6 missing = 0.5 → nudge. Code: true.
- Verdict: CBWS
- Notes: left / right sets are not paired here, unlike every other set count (3 unilateral sets logged per side already reach the 6-set minimum).

##### 61. Effort distribution buckets
- Where: effort.ts: `effortDistribution` (33–63)
- Formula as coded: RIR (or 0 for Fail chip / clean muscular failure) → ≤ 0.5 → "0"; < 1.5 → "1"; < 2.5 → "2"; else "3+"; no value → unknown; compromised counts technical failure, compromised / failed technique, `techniqueOk === false`.
- Edge cases checked (ran): RIR 0, 0.5, 1, 1.5, 2, 2.5, 3, null → rir0 2, rir1 1, rir2 2, rir3+ 2, unknown 1.
- Source: CLAUDE.md H (muscular failure ≈ RIR 0).
- Hand-computed example: as above. Code: same.
- Verdict: CORRECT
- Notes: ties are not symmetric (0.5 → column 0, 1.5 → column 2, 2.5 → 3+); the credit model uses Math.round (0.5 → index 1). No effect on credit.

##### 62. Left / right pairing in the effort distribution
- Where: effort.ts (40–47)
- Formula as coded: pairs = min(#left, #right) across working and drop sets together; the first `pairs` right-side sets are skipped entirely.
- Edge cases checked (ran): left RIR 0 + right RIR 4 → total 1, column "0", avgRir 0.
- Source: CLAUDE.md C ("the i-th left and i-th right set pair into ONE set … the pair's credit is the average of both sides").
- Hand-computed example: the volume engine credits this pair (1.0 + 0.6) ÷ 2 = 0.8; an average RIR would be 2. Code here: RIR 0, the right side's effort is discarded.
- Verdict: QUESTIONABLE
- Notes: also pairs across set types, while `sideFactors` (quality.ts:161) pairs within a type. Alternative: use `sideFactors` weights (0.5 + 0.5) for the columns and the average.

##### 63. Average RIR
- Where: effort.ts (50, 61)
- Formula as coded: mean of logged RIR only (no estimates, no failure-implied 0), rounded to 0.1 with Math.round.
- Edge cases checked (ran): (1, 2, 2) → 1.7; (1, 0, 0, 0) → 0.3; 0.35 → 0.4; 1.15 → 1.2; 4.35 → 4.4; no RIR → null.
- Source: code comment ("estimates from feel are not averaged as if measured").
- Hand-computed example: 5 ÷ 3 = 1.67 → 1.7. Code: 1.7.
- Verdict: CORRECT

##### 64. Week totals and tonnage
- Where: effort.ts: `weekTotals` (70–79)
- Formula as coded: workouts in range; working sets = distribution total; effective = round(effectiveSum × 10)/10; tonnage = Σ weightKg × reps over non-planned working / drop sets, excluding `assisted`; null weight or reps → 0.
- Edge cases checked (ran): working 40 × 10 + drop 30 × 8 = 640 (warm-up, assisted, null-reps and planned sets add 0); quality total 1.15 → 1.2; 4.35 → 4.4.
- Source: CLAUDE.md I ("tonnage = weight × reps as logged"; quality sets count each working set once).
- Hand-computed example: 400 + 240 = 640 kg. Code: 640.
- Verdict: CORRECT
- Notes: uses plain Math.round rather than the order-independent helper `round1` (quality.ts:219); no differing value found in the cases tried.

---

#### defaults.ts

##### 65. Default set-quality model
- Where: defaults.ts: `DEFAULT_QUALITY` (3–24)
- Formula as coded: rirCredit [1, 1, 1, 1, 0.6, 0.3, 0.15, 0.15, 0]; unknown 0.75; drop 0.5; partial ROM 0.8; lengthened partial 1; compromised technique 0.7; low reps < 5 → 0.8; min reps 1; session cap 11, beyond 0.5; use feel = true.
- Edge cases checked (ran): RIR 3.4 → index 3 (1.0); 3.5 → index 4 (0.6); 12 → 0; −1 → index 0.
- Source: rules `rir_credit_table`, `unknown_effort`, `drop_and_low_reps`, `rom_partials`, `compromised_technique`, `session_taper`, `feel_estimated_rir`; CLAUDE.md C — every value identical.
- Hand-computed example: RIR 4 → 0.6; RIR 6 → 0.15. Code: same.
- Verdict: CORRECT

##### 66. Default settings
- Where: defaults.ts: `defaultSettings` (26–52)
- Formula as coded: weekStartsOn 1 (Monday); defaultTargetRir 2; significantStimulusSets 2; perSessionSetCap 10; learning length 30 days; experience intermediate; auto-lock 10 min.
- Source: CLAUDE.md I (Monday week); rule `todays_share` ("≤ 10"); the 30-day length, the 2-set significance and target RIR 2 are in no rule.
- Hand-computed example: n/a (constants; ran and matched).
- Verdict: CBWS
- Notes: three different "learning" clocks coexist — Learning Mode here (30 days), the planner's LEARNING mode (rule `planner_modes`, 21/28 days) and the 28-day baseline (CLAUDE.md I). Not an error, but easy to confuse.

##### 67. migrateSettings
- Where: defaults.ts (55–67)
- Formula as coded: defaults ← saved; `quality` and `learning` merged field by field; missing overrides / priorities → {}.
- Edge cases checked (ran): saved quality with only unknownRirCredit 0.5 keeps the default table and cap 11; saved learning length 45 kept.
- Verdict: CORRECT

---

#### targets.ts

##### 68. Learning Mode start date
- Where: targets.ts: `learningState` (29–33); Settings.tsx:276, 282
- Formula as coded: startDate = the EARLIER of the stored start date and the first workout date (whichever exists if only one).
- Meant to compute: per the comment, "never later than the stored start date"; the Settings button says "Restart Learning Mode from today" and writes `{ startDate: today, endedOn: null }`.
- Edge cases checked (ran, L3): 8 weeks of history (16 sessions) and stored start = today → start = first workout, day 57, **active false**.
- Source: CLAUDE.md (Learning Mode references); Settings.tsx wording.
- Hand-computed example: restart on 2026-07-27 → expected day 1 of 30, active. Code: start 2026-06-01, day 57, "Calibration period complete".
- Verdict: WRONG
- Notes: the restart button and any start date later than the first workout have no effect (Settings field hint: "Defaults to your first logged workout" — a default, not a floor). Fix: use the stored start date when it is set; fall back to the first workout only when it is null.

##### 69. Learning day number and days remaining
- Where: targets.ts (38–39)
- Formula as coded: dayNumber = diffDays(today, start) + 1; daysRemaining = max(0, length − dayNumber + 1); no start → day 0, remaining = length.
- Edge cases checked (ran): day 1 → 30 left; day 30 → 1; day 31 → 0.
- Hand-computed example: start 06-01, today 06-30 → day 30, 1 day left (today). Code: same.
- Verdict: CORRECT

##### 70. Learning Mode completion criteria
- Where: targets.ts (25, 40–54)
- Formula as coded: ends when `endedOn` is stored, or when dayNumber > lengthDays AND sessions ≥ 6 AND complete weeks with a workout ≥ 3; otherwise "extended".
- Edge cases checked (ran): day 30 with 6 sessions / 3 weeks → still active; day 31 → complete; 5 sessions at day 31 and day 60 → extended.
- Source: rule `weekly_target_reference` ("Personal baseline replaces it after Learning Mode"); the 6-session / 3-week minimums are in no rule and not in CLAUDE.md.
- Hand-computed example: 5 sessions on day 31 → extended "5/6 sessions and 3/3 complete training weeks". Code: same.
- Verdict: CBWS

##### 71. Computed end date of Learning Mode
- Where: targets.ts:46
- Formula as coded: endedOn = addDays(startDate, lengthDays) whenever the criteria are met.
- Edge cases checked (ran, L2): 5 sessions in the first 30 days, 6th session on day 60, checked on day 67 → endedOn **2026-07-01** (day 31) although Learning Mode was still active through day 59.
- Hand-computed example: expected the first day both conditions held (2026-07-30). Code: 2026-07-01.
- Verdict: QUESTIONABLE
- Notes: the computed value is not persisted or shown today (only `message`), so impact is nil; if it is ever displayed it will be wrong for every extended period. Alternative: leave it null unless stored, or compute the real date.

##### 72. Per-muscle trend summary
- Where: targets.ts: `muscleTrendSummary` (84–97)
- Formula as coded: series with coefficient ≥ 0.75 and a classified trend; declining if declining > n/2; else progressing if progressing ≥ n/2; else stalled if plateau + declining ≥ n/2; else stable; n = 0 → unknown.
- Edge cases checked (ran): [progressing, declining] → progressing; [progressing, plateau] → progressing; [plateau, stable] → stalled; [declining, stable] → stalled; [declining ×2, progressing] → declining; [stable ×2, progressing] → stable.
- Source: CLAUDE.md D (trend classes per exercise); the aggregation is undocumented.
- Hand-computed example: one main lift up, one down (n = 2): 1 > 1 false; 1 ≥ 1 true → "progressing".
- Verdict: QUESTIONABLE
- Notes: ties resolve optimistically (≥ for progressing, > for declining), and base (not variation-resolved) coefficients are used. It feeds "caution", the confidence score and `volumeDecision`. Alternative: require a strict majority for "progressing" too, and call a 1 : 1 split "stable".

##### 73. Reference range — experience adjustment
- Where: targets.ts: `referenceFor` (99–103)
- Formula as coded: novice: min = max(0, min − 2), preferred = max(2, preferred − 2), max unchanged; advanced: min unchanged, preferred + 2, max + 2.
- Edge cases checked (ran): novice chest 4/10/18, forearms 0/2/10, erectors 0/2/10; advanced chest 6/14/20.
- Source: none in rules.ts or CLAUDE.md (rule `weekly_target_reference` gives one reference).
- Hand-computed example: novice abs 3/6/12 → 1/4/12. Code: same.
- Verdict: CBWS (undocumented heuristic)

##### 74. Reference range — priority adjustment
- Where: targets.ts (104–107)
- Formula as coded: high: preferred = min(max, preferred + 2); maintain: min = round(min × 0.5), preferred = max(2, round(min × 0.75)) (old min), max unchanged.
- Edge cases checked (ran): chest high 6/14/18; chest maintain 3/5/18; forearms maintain 0/2/10; abs maintain 2/2/12 (Math.round(1.5) = 2); advanced + high chest 6/16/20.
- Source: rule `exercise_order` only mentions priority for ordering; the amounts are undocumented.
- Hand-computed example: chest maintain: round(3) = 3; round(4.5) = 5 → 3/5/18. Code: same.
- Verdict: CBWS

##### 75. Usable weeks and personal baseline
- Where: targets.ts (113, 132–133)
- Formula as coded: usable = last 6 complete weeks that contain a workout; baseline = roundHalf(median of the muscle's weekly effective sets); none → null.
- Edge cases checked: empty weeks are skipped; never-trained muscle → baseline 0 (individualized target then 1/1/ref.max — by design, see `volume_individual`).
- Source: rule `volume_individual` ("starts from its own baseline"); CLAUDE.md J.
- Hand-computed example: 5 weeks × 2 sessions × 5 pec-deck sets → 10 per week → baseline 10. Code: 10.
- Verdict: CORRECT

##### 76. Target confidence score
- Where: targets.ts (116–123, 137–144, 181)
- Formula as coded: +2 for ≥ 6 usable weeks (+1 for 3–5); +1 if ≥ 70 % of working sets have RIR or the Fail chip; +1 if a trend exists; +1 if ≥ 3 weeks and CV < 0.35; ≥ 4 → high, ≥ 2 → moderate, else low; forced low when < 3 usable weeks.
- Edge cases checked: no working sets → ratio 0; feel-only or failure-answer-only sets do not count as "RIR recorded" (label says RIR).
- Source: none in rules.ts (rule `presc_confidence` is a different score).
- Hand-computed example: 5 weeks (+1), RIR 100 % (+1), trend (+1), CV 0 (+1) = 4 → high. Code: high.
- Verdict: CBWS

##### 77. Confidence text vs confidence field
- Where: targets.ts:180–181
- Formula as coded: the rationale line "Confidence X: …" is pushed BEFORE `if (usable.length < 3) confidence = 'low'`.
- Edge cases checked (ran, C): Learning Mode ended by hand after 2 complete weeks with 3 sessions each → field `confidence: 'low'`, rationale "**Confidence moderate**: only 2 complete week(s) of data, RIR recorded on 100% of sets, progression evidence from 1 exercise(s)."
- Hand-computed example: score = 0 + 1 + 1 = 2 → moderate, then forced low. Expected the text to say low.
- Verdict: INCONSISTENT
- Notes: move the `usable.length < 3` override above the rationale line.

##### 78. Manual target override
- Where: targets.ts (146–150)
- Formula as coded: min / preferred / max taken as entered; source manual; not provisional.
- Edge cases checked (ran): a deload still halves a manual target (5/9/13 → 2.5/4.5/6.5).
- Source: CLAUDE.md ("An active deload block halves all targets").
- Verdict: CORRECT

##### 79. Provisional vs individualized switch
- Where: targets.ts (152–162)
- Formula as coded: Learning Mode active or no baseline → reference range, confidence low, provisional; else individualized.
- Edge cases checked (ran): day 2 of history → reference; after Learning Mode → individualized.
- Source: rule `weekly_target_reference`; CLAUDE.md J.
- Verdict: CORRECT

##### 80. High-priority step on an individualized target
- Where: targets.ts (171–175)
- Formula as coded: only when priority high AND decision.neutral AND recovery not poor AND stable weeks ≥ 3 AND baseline < ref.max: step = baseline < 8 ? 1 : 2; preferred = min(ref.max, baseline + step).
- Edge cases checked (ran): decision "increase" (not neutral) → no extra step (chest stays 12).
- Source: rule `volume_individual` ("+1–2"); CLAUDE.md J.
- Hand-computed example (by hand only — the neutral-hold path did not occur in the synthetic runs; a flat 3- or 5-week history yields "increase", where the step is correctly not added): baseline 10, neutral hold, high → min(18, 10 + 2) = 12; baseline 6 → 7.
- Verdict: CBWS

##### 81. Individualized min and max
- Where: targets.ts (176–178)
- Formula as coded: preferred = roundHalf; min = roundHalf(0.75 × preferred); max = roundHalf(max(ref.max, preferred + 4)).
- Edge cases checked (ran): preferred 12 → 9 / 12 / 18; preferred 2.5 (front delts) → 2 / 2.5 / 12; preferred 1 → 1 / 1 / 18.
- Source: none (rule `volume_individual` covers only the preferred value).
- Hand-computed example: 0.75 × 12 = 9; max(18, 16) = 18. Code: 9 / 18.
- Verdict: CBWS
- Notes: the upper bound never drops below the generic reference maximum, so "over" needs ≥ ref.max even for a muscle whose own target is 1.

##### 82. "Maintain" priority after Learning Mode
- Where: targets.ts:106 (reference path) vs 164–182 (individualized path); volumeResponse.ts has no priority input
- Formula as coded: maintain halves the reference range, but in the individualized path it only adds the text "Priority: maintain."
- Edge cases checked (ran): chest marked maintain — during Learning Mode 3/5/18; after it (baseline 10, stalled) → **9/12/18 with action "increase"**; identical to the unmarked muscle.
- Source: rule `volume_individual` (no mention of priorities); CLAUDE.md J (priorities only for order).
- Hand-computed example: expected a maintain muscle never to be raised (hold at baseline or lower). Code: +2 sets/week.
- Verdict: INCONSISTENT
- Notes: the same setting lowers the target in one mode and is ignored in the other, and the muscle can even be increased. Fix: for maintain, never apply "increase" (hold at baseline, or cap preferred at min(baseline, reference-maintain preferred)).

##### 83. Deload halving
- Where: targets.ts (125–126, 184–194)
- Formula as coded: an active block of kind deload (start ≤ today and no end or end ≥ today) → min, preferred, max each roundHalf(× 0.5), for every source.
- Edge cases checked (ran): chest 6/12/18 → 3/6/9; abs 3/6/12 → 1.5/3/6; the day after the block's end → back to normal; a block without an end date stays active.
- Source: CLAUDE.md ("An active deload block halves all targets").
- Hand-computed example: as above. Code: same.
- Verdict: CORRECT

---

#### analysis.ts

##### 84. Current-week window and planned sets
- Where: analysis.ts (107, 112–115)
- Formula as coded: planned sets are stripped first; this week = workouts with week.start ≤ date ≤ min(week.end, today).
- Source: CLAUDE.md C ("a pre-filled set … is ignored by every calculation"); I (Monday reset).
- Hand-computed example: planned-only chest sets → chest 0 this week (ran, a6).
- Verdict: CORRECT

##### 85. Average sessions per week
- Where: analysis.ts (122–123, 221)
- Formula as coded: mean session count of the last 4 complete weeks that contain a workout; none → 3; shown rounded to 0.1.
- Edge cases checked (ran): no complete week → 3; four weeks of 5 → 5; weeks without training are skipped (a break does not lower the average).
- Source: rule `todays_share` ("sessions likely left"); the default 3 and the 4-week look-back are undocumented.
- Verdict: CBWS

##### 86. Sessions likely left
- Where: analysis.ts (128–129, 133)
- Formula as coded: sessionsLeftInclToday = max(1 if daysLeft > 0, round(avg × daysLeft ÷ 7)); expectedRemainingSessions = the same with daysLeft − 1 once a workout is dated today.
- Edge cases checked (ran, avg 3): Mon 3, Tue 3, Wed 2, Thu 2, Fri 1, Sat 1, Sun 1; avg 5 on Wed → 4 whether or not 3 sessions were already done this week.
- Source: rule `todays_share`; CLAUDE.md ("sessions likely left incl. today").
- Hand-computed example: Wed, avg 3: 3 × 5 ÷ 7 = 2.14 → 2. Code: 2.
- Verdict: CBWS
- Notes: assumes sessions are spread evenly over calendar days and ignores how many were already done this week; someone who trains Fri–Sun gets "1 session left" on Friday. Alternative: max(1, avg − sessions done this week) bounded by days left.

##### 87. "Trained today" with no performed set
- Where: analysis.ts (125–128)
- Formula as coded: `trainedToday = todays.length > 0` — any workout dated today, even when all its sets were planned and stripped.
- Meant to compute: whether today's session is used up (comment at 106: "Planned … sets never count toward anything").
- Edge cases checked (ran, a6; Sunday, chest 5 of 12 earlier in the week): before opening a session: trainedToday false, expectedRemainingSessions 1, chest **behind**. Live session opened, nothing ticked: trainedToday **true**, expectedRemainingSessions **0**, sessionsThisWeek 2, chest **at_risk**.
- Source: CLAUDE.md C (planned sets ignored by every calculation).
- Hand-computed example: no set performed → expected the same numbers as before opening the logger.
- Verdict: WRONG
- Notes: opening the logger on the last training day flips every muscle below its minimum to "At risk" with "~0 session(s) likely left" while the session that could fix it has just started. Fix: count a workout as today's session only if it has ≥ 1 counted set (and consider keeping today in `expectedRemainingSessions` while the session is still live).

##### 88. Elapsed fraction of the week
- Where: analysis.ts:131
- Formula as coded: clamp((7 − daysLeft) ÷ 7, 0, 1) — Monday 0, Sunday 6/7.
- Hand-computed example: Friday: (7 − 3)/7 = 0.571.
- Verdict: CORRECT

##### 89. Remaining sets and percentage
- Where: analysis.ts (138–141)
- Formula as coded: remainingToMin = roundHalf(max(0, min − completed)); remainingToPreferred = roundHalf(max(0, preferred − completed)); pct = min(2, completed ÷ preferred) (preferred 0 → 1).
- Edge cases checked (ran): 3.6 of 12 → 8.5 left (2.5 to min 6); 19 of 12 → 0.
- Source: CLAUDE.md I ("done / target · LEFT or DONE").
- Hand-computed example: 12 − 3.6 = 8.4 → 8.5. Code: 8.5.
- Verdict: CORRECT

##### 90. Per-session cap
- Where: analysis.ts:103, 145
- Formula as coded: sessionCap = max(1, min(perSessionSetCap (10), max(3, round(preferred × 0.6)))).
- Meant to compute: "at most ~60 % of the weekly target and ≤ 10 per muscle per session".
- Edge cases checked (ran, a7): preferred 12 → 7 (58 %); 10 → 6; 8 → 5; 6 → 4 (67 %); **4 → 3 (75 %)**; 5 (chest on maintain) → 3; 2 → 3; 3 (traps in a deload) → 3; 16 → 10.
- Source: rule `todays_share` ("≤ 60 %, ≤ 10"); CLAUDE.md same.
- Hand-computed example (ran): forearms preferred 4, Friday, 1 session left → 60 % = 2.4; code share = min(3, 4, 4) = **3** (75 % of the week in one session).
- Verdict: INCONSISTENT
- Notes: the floor of 3 is not in the rule text or CLAUDE.md and overrides the 60 % limit for every target below 5 (also for halved deload targets). Either document "at least 3" or drop the floor to 2 / apply 60 % strictly.

##### 91. Week status classification
- Where: analysis.ts (146–153)
- Formula as coded: no workouts at all → no_data; completed > max → over; ≥ preferred → done; remainingToPreferred > expectedRemainingSessions × sessionCap and remainingToMin > 0 → at_risk; completed ≥ min or pct ≥ elapsedFrac × 0.8 → on_track; else behind.
- Edge cases checked (ran): Mon 0 done → on_track; Tue / Wed 0 done before the week's first session → behind; Fri 0 → at_risk; Fri 5 of 12 (min 6) → behind; Fri 3 → at_risk; 19 of 12 (max 18) → over.
- Source: none in rules.ts; CLAUDE.md I only defines LEFT / DONE.
- Hand-computed example: Fri, 5 done: remaining 7 ≤ 1 × 7 → not at risk; 5 < 6; pct 0.417 < 0.571 × 0.8 = 0.457 → behind. Code: behind.
- Verdict: CBWS
- Notes: "behind" is a linear calendar expectation — an owner whose first session is on Wednesday is "Behind" for every muscle that morning although nothing is at risk.

##### 92. Status vs remaining sets just below the target
- Where: analysis.ts:140 (rounded) vs 150 (unrounded), 157–173, 195; Dashboard.tsx:111, 121; Muscles.tsx:42
- Formula as coded: remainingToPreferred rounds to the nearest 0.5, but `done` needs completed ≥ preferred exactly.
- Edge cases checked (ran): chest 11.9 of 12 (6 + 5 + one RIR-4 set 0.6 + one RIR-5 set 0.3) → remainingToPreferred **0**, todayNote "Target met", explanation "No more sets are needed this week", but status **on_track** and moreVolumeJustified **yes** ("Below the provisional reference. Adding the remaining sets is reasonable…").
- Source: CLAUDE.md I (LEFT or DONE).
- Hand-computed example: 12 − 11.9 = 0.1 → rounds to 0 → expected status done / "no". Code: on_track / yes. Applies for completed in [preferred − 0.24, preferred).
- Verdict: INCONSISTENT
- Notes: the Week screen shows DONE (it tests remaining ≤ 0) while the Muscles page shows "On track", leaves the muscle out of its "met" count and prints the "adding sets is reasonable" justification. Fix: derive `done` from `remainingToPreferred === 0`.

##### 93. Recovery tolerance and "more volume justified"
- Where: analysis.ts:100, 155–173, 191
- Formula as coded: blocked / "wait" when planRecovery is recovering AND hoursLeft > 6; else declining trend → caution; else yes; done / over → no.
- Edge cases checked (ran, R9): 7 h left → blocked, share 0; 6 h left → not blocked; soreness-forced recovering with 0 h left → not blocked.
- Source: CLAUDE.md ("only when > 6 h of the window remain. Advice, not a rule").
- Hand-computed example: window 24, 17.4 h since → 6.6 → 7 > 6 → blocked. Code: blocked.
- Verdict: CORRECT

##### 94. Today's share
- Where: analysis.ts (189–207)
- Formula as coded: remainingAtDayStart = roundHalf(max(0, preferred − (completed − doneToday))); 0 if met, blocked, or no session left; else todayShare = min(sessionCap, remainingAtDayStart, ceil(remainingAtDayStart ÷ sessionsLeftInclToday)).
- Edge cases checked (ran): Mon 12 left ÷ 3 → 4; Wed ÷ 2 → 6; Fri ÷ 1 → capped 7; share unchanged while logging (3, 4 or 6 chest sets today → share stays 4); 0.5 left → share 0.5 (never more than what is left); blocked → 0.
- Source: rule `todays_share`; CLAUDE.md ("(remaining when the day started) ÷ (sessions likely left incl. today) … fixed for the day").
- Hand-computed example: chest 12, nothing done, Monday, avg 3: cap 7; ceil(12/3) = 4 → 4. Code: 4, note "12 left ÷ ~3 sessions".
- Verdict: CORRECT

##### 95. Carry-over
- Where: analysis.ts:201
- Formula as coded: roundHalf(max(0, remainingAtDayStart − sessionCap × sessionsLeftInclToday)).
- Edge cases checked (ran): Fri, 12 left, cap 7, 1 session → 5; 9 left → 2; 7 left → 0.
- Source: rule `todays_share` ("leftovers carry over, never crammed").
- Hand-computed example: 12 − 7 × 1 = 5. Code: 5.
- Verdict: CORRECT

##### 96. Today's open share
- Where: analysis.ts (208–209)
- Formula as coded: diff = todayShare − doneToday; < 0.5 → 0; else roundHalf(diff).
- Edge cases checked (ran): share 4, done 3 → 1; done 3.6 → 0; done 6 → 0.
- Hand-computed example: 4 − 3.6 = 0.4 < 0.5 → 0. Code: 0.
- Verdict: CORRECT

##### 97. Explanation thresholds
- Where: analysis.ts (177–185)
- Formula as coded: indirect share = round(effectiveIndirect ÷ completed × 100), mentioned when ≥ 60 %; unknown-effort part mentioned when > 0; at-risk sentence when status is at_risk.
- Edge cases checked: completed 0 → share 0, no division by zero.
- Verdict: CORRECT

##### 98. Legacy next-workout plan (`analysis.plan`)
- Where: analysis.ts: `planNextWorkout` (225–309)
- Formula as coded: score = remainingToPreferred × (recovered 1 / else 0.8) × (declining 0.7) × priority (high 1.3, maintain 0.5) × (large 1.1); top 5 muscles; sets = max(1, min(ceil(remainingToPreferred), perSessionSetCap)); exercise score = sessions × 2 − age/7 + 5 if at the last gym; sets split ceil / floor over ≤ 2 exercises.
- Edge cases checked (ran): Monday, nothing done → chest suggestedSets **10** while todayShare is **4** (Sunday: 10 vs 7).
- Source: rule `todays_share`; rule `planner_session_allocation`; planner.ts:276–277 uses maintain **0.6** and size 1.15 / 1.05.
- Hand-computed example: chest remaining 12 → min(12, 10) = 10 sets in one session — more than the 60 % cap (7) and 2.5 × today's share.
- Verdict: INCONSISTENT
- Notes: no UI or test reads `Analysis.plan` any more (the Part 5 planner replaced it), so nothing wrong reaches the owner; but it is computed on every `analyze()` and contradicts today's share and the planner's multipliers. Remove it, or derive `suggestedSets` from `todayShare`.

##### 99. Failure-profile range and display rounding
- Where: analysis.ts (218, 221)
- Formula as coded: profile range = week.start … min(today, week.end); avgSessionsPerWeek rounded to 0.1.
- Hand-computed example: Wednesday → Mon … Wed.
- Verdict: CORRECT

### Group B — baseline, reports, body weight, session summary, load steps, rule checks, mapping spread, fatigue

Records as written by the first reader (verdicts for the findings above were re-checked).

### Formula audit B — baseline, reports, bodyweight, sessionSummary, increments, ruleChecks, mappingUncertainty, fatigue, equipmentMemory

Read-only audit, 2026-11-23. All numbers are synthetic. Every "code returns" value below was produced by running the
repository code with `npx vite-node` from the scratch scripts next to this file:
`a1_baseline.ts`, `a2_reports.ts`, `a3_body_summary.ts`, `a4_rules_fatigue.ts`, `a5_edges.ts`, `a6_partial_week.ts`.
No repository file was changed.

Index used in the examples (progression.ts `epley`): `weight × (1 + min(reps + RIR, 30) / 30)`.
So 40 kg × 10 @ RIR 2 = 56.0; 40 × 11 = 57.33; 40 × 12 = 58.67; 40 × 13 = 60.0; 45 × 10 = 63.0; 45 × 11 = 64.5; 45 × 12 = 66.0.

Verdict totals: CORRECT 32 · CORRECT BUT WEAKLY SUPPORTED 17 · QUESTIONABLE 2 · WRONG 3 · INCONSISTENT 9 (63 records).

---

#### src/domain/baseline.ts

##### B-1 Baseline index
- Where: baseline.ts:strengthProgress (41–54)
- Formula as coded: `rep` = representative sessions with an index, of the same `indexKind` as the FIRST such session; `start = rep[0].date`; `baseEnd = start + 27 days`; baseline = `median(indexRaw of rep with date ≤ baseEnd)`, needs ≥ 2 sessions, shown rounded `Math.round(x*10)/10`; `topWeight` = median of top weights.
- Meant to compute: the starting strength level of one exercise × equipment × configuration history.
- Edge cases checked: no sessions → `more_data`; 1 session → `more_data`; a session on day 28 (start + 27) is inside the window, day 29 is not; even count → mean of the two middle values.
- Source: CLAUDE.md I ("the first 28 days … are its baseline (median index of ≥ 2 representative sessions)"); rules.ts `index_scale`, `benchmark_exclusion`.
- Hand-computed example: sessions 01-01 (56.0), 01-08 (58.67), 01-28 (60.0) → median 58.67 → 58.7. Code: `baseline.index 58.7, sessions 3, to 2026-01-28`.
- Verdict: CORRECT

##### B-2 Current level and progress %
- Where: baseline.ts:strengthProgress (60–64)
- Formula as coded: `recent` = same-kind representative sessions with `date > baseEnd` and `diffDays(today, date) < 28`, last 3; needs ≥ 2; `pct = Math.round((median(recent) / median(base) − 1) × 1000) / 10` (unrounded indices; result to 0.1 %).
- Meant to compute: strength change vs baseline on that setup (estimate; never muscle growth).
- Edge cases checked: a session exactly 28 days old is excluded (window = today − 27 … today); only 1 recent session → `baseline_only`, pct null; baseline median 0 → pct = Infinity (status still `ok`; only reachable with a reps-based index of 0, i.e. 0 reps at RIR 0 twice — not realistic); a FUTURE-dated session passes `diffDays < 28` and is used; negative halves round toward +∞ (−2.25 → −2.2, +2.25 → +2.3; display only).
- Source: CLAUDE.md I ("Progress % = (median of the last ≤ 3 representative sessions in the last 28 days ÷ baseline − 1)").
- Hand-computed example: baseline 58.667; recent 03-01 (63.0), 03-08 (64.5), 03-15 (66.0), today 03-20 → median 64.5 → 64.5 / 58.667 − 1 = 9.94 % → 9.9. Code: `pct 9.9`. Today 03-29: 03-01 is 28 days old → recent = 64.5, 66.0 → 65.25 → +11.2 %. Code: `11.2`. Today 04-05: one recent session → `baseline_only`. Code: same.
- Verdict: CORRECT
- Notes: optional hardening — return pct null when the baseline median is 0, and ignore sessions dated after `today`.

##### B-3 Index scale used for baseline and %
- Where: baseline.ts:strengthProgress (45–46, 56)
- Formula as coded: `kind = all[0].indexKind` (scale of the FIRST representative session); baseline is built from that scale; `if (all.at(-1).indexKind !== kind) return out` (status `baseline_only`, no %).
- Meant to compute: never compare kg-based, body + belt and reps-based indices.
- Edge cases checked: bodyweight dips first, belt later; weighted pull-ups logged before the first weigh-in, then with weigh-ins.
- Source: rules.ts `index_scale`: "trends and progress % use only sessions on the **latest** scale."
- Hand-computed example (a1 case 3d): dips, 2 bodyweight sessions (reps index 12, 14) then 7 belt sessions over 6 weeks with body weight 80 kg (system index 113.3 … 129.5). By the rule text: baseline = first 28 days of the latest (system) scale = sessions 02-10, 02-17, 02-24, 03-03 → median 118.1; current = last 3 (126.0, 126.4, 129.5) → 126.4 → ≈ +7 %. Code returns `status: baseline_only, baseline.index 13 (reps), pct null` — and it stays that way forever, because `kind` is always the first session's. Same for pull-ups (a1 case 3): 2 belt-only sessions (index 6.7, 6.8) then 4 body + belt sessions → `baseline_only`, baseline 6.8 shown.
- Verdict: INCONSISTENT
- Notes: the result is safe (no wrong %), but contradicts rules.ts and leaves a history permanently without progress once its scale changes (very likely for dips: bodyweight → belt; or as soon as the first weigh-in is logged for belt work). Proposed fix: take `kind` from the LATEST representative session, build the baseline from the first 28 days of the sessions on that scale (≥ 2), keep the rest unchanged.

##### B-4 Belt-only guard
- Where: baseline.ts:strengthProgress (59)
- Formula as coded: `if (kind === 'load' && series.loadMode === 'bodyweight_plus') return out` (baseline shown, no %).
- Meant to compute: no % from an Epley on the belt alone.
- Edge cases checked: all sessions without body weight → `baseline_only`; all with body weight → % shown.
- Source: CLAUDE.md I ("no % is shown from a belt-only index"); rules.ts `index_scale`.
- Hand-computed example: pull-ups belt 5 → 10 kg, body 80 kg known throughout: baseline (85 × (1+10/30) = 113.33, 85 × (1+11/30) = 116.17) → 114.75; recent 119.6, 120.0, 123.0 → 120.0 → +4.6 %. Code: `pct 4.6`. Without body weight: `baseline_only`.
- Verdict: CORRECT

##### B-5 Period rates (sessions / effective sets / quality sets per week)
- Where: baseline.ts:periodStats (85–98)
- Formula as coded: `lo = max(first workout date, from)`, `hi = min(today, to)`; `weeks = max(1, (diffDays(hi, lo) + 1) / 7)`; `sessionsPerWeek = round1(sessions / weeks)`; per muscle `round1(effective / weeks)`; `totalWeeklyEffective = round1(Σ of the ROUNDED per-muscle values)`; `qualitySetsPerWeek = round1(quality(ws) / weeks)`.
- Meant to compute: per-week rates for the 4-week check (baseline / previous 4 weeks / last 4 weeks).
- Edge cases checked: window before the first workout → 0 sessions, weeks = 1, all 0; window partly in the future → uses days up to today; without `opts.today` future days are counted (Reports.tsx always passes it); history shorter than 7 days → weeks = 1 (rate = raw count).
- Source: CLAUDE.md I (4-week check); no rules.ts entry.
- Hand-computed example: workouts 03-10 (3 sets pec deck), 03-12 (3), 03-19 (1), today 03-19, window 02-20…03-19: lo = 03-10, days = 10, weeks = 1.4286; sessions 3 / 1.4286 = 2.1; chest 7 / 1.4286 = 4.9; front delts 1.75 / 1.4286 = 1.2 (1.225); total 6.1. Code: `sessionsPerWeek 2.1, chest 4.9, front_delts 1.2, totalWeeklyEffective 6.1`.
- Verdict: CORRECT
- Notes: the total sums rounded values (4 muscles × 3.472 → 4 × 3.5 = 14.0 vs exact 13.9); at most ≈ 0.05 per muscle, only used for the volume ratio in B-9.

##### B-6 Period body weight and waist
- Where: baseline.ts:periodStats (94, 99–100)
- Formula as coded: `bodyWeight7d = rollingAverage(body, hi).kg` (7-day mean of daily means ending at the period end); `waistCm = round1(median(waist values with from ≤ date ≤ to))`.
- Meant to compute: body context per period.
- Edge cases checked: no weigh-in in the last 7 days of the period → null; no waist → null.
- Source: CLAUDE.md I ("Trend = 7-day average of daily means").
- Hand-computed example: weigh-ins 03-14 (80), 03-19 (81 and 82 → day mean 81.5): (80 + 81.5) / 2 = 80.75; waist 86 and 85 → 85.5. Code: `bodyWeight7d 80.75, waistCm 85.5`.
- Verdict: CORRECT

##### B-7 Assessment phase, week number, next check
- Where: baseline.ts:hypertrophyAssessment (126–129); header comment 18–19; label in src/ui/pages/Reports.tsx:458
- Formula as coded: `days = diffDays(today, startDate)`; `week = floor(days / 7) + 1`; phase = `days < 28 → baseline`, `days < 56 → early`, else `assessment`; `nextCheck = startDate + (floor(days / 28) + 1) × 28`.
- Meant to compute: when the growth-signal status may be shown.
- Edge cases checked: no start date or no workouts → `no_data`, week 0.
- Source: CLAUDE.md I ("baseline in weeks 1–4, 'too early' until week 8, then every 4 weeks").
- Hand-computed example (start 2026-01-01): day 27 → week 4, baseline; day 28 → week 5, early; day 55 → week 8, STILL early, next check 02-26; day 56 → week 9, assessment; day 84 → week 13, next check 04-23. Code: identical.
- Verdict: INCONSISTENT
- Notes: wording only. baseline.ts:19 says "from week 8 a first combined assessment" and the UI status reads "TOO EARLY — first check at week 8" (Reports.tsx:458), but during the whole of week 8 (days 49–55) the code still returns `too_early`; the first assessment appears on day 56, which the same function labels week 9. CLAUDE.md's "until week 8" fits the code only if read as "through week 8". Proposed fix: change the texts to "after week 8" / "first check after 8 weeks" (or switch at day 49 if "in week 8" is intended).

##### B-8 Strength signal
- Where: baseline.ts:hypertrophyAssessment (131–135)
- Formula as coded: over histories with status `ok`: `up = pct ≥ 2`, `down = pct ≤ −2`; positive when `up > ok/2 && up ≥ 3 × down`; negative when `down > up`; else neutral; no `ok` history → unknown.
- Meant to compute: whether strength is broadly up.
- Edge cases checked: 3 up / 1 down of 4 → positive; 2 up / 1 down of 3 → neutral (2 < 3); 2 up of 4, 0 down → neutral (not more than half); 3 up of 5 with +1.9 and −1.9 (inside the ±2 band) → positive; 1 up / 2 down → negative.
- Source: CLAUDE.md I ("strength is 'positive' when more than half of the histories are up and ups outnumber downs ≥ 3 : 1"). The ±2 % band is not in rules.ts.
- Hand-computed example: as listed; code returned exactly these signals.
- Verdict: CORRECT BUT WEAKLY SUPPORTED (matches CLAUDE.md; the ±2 % band and the 3 : 1 ratio are practical heuristics without a rules.ts entry).

##### B-9 Volume, consistency, effort, body-weight, waist and photo signals
- Where: baseline.ts:hypertrophyAssessment (137–147)
- Formula as coded: volume ratio = `totalWeeklyEffective / Σ preferred targets`: ≥ 0.8 positive, ≥ 0.5 neutral, else negative (target 0 → unknown). Sessions/week ≥ 2 positive, ≥ 1 neutral, else negative. Effort logged share ≥ 0.6 positive, else neutral (null → unknown). Body weight: `round1(7-day avg now − 7-day avg of the previous period)` ≥ −0.5 kg neutral, else negative — never positive. Waist: value shown, signal always unknown. Photos: count of progress photos in the last 35 days; > 0 neutral, else unknown.
- Meant to compute: indirect indicators next to strength.
- Edge cases checked: boundaries 0.8 / 0.799 / 0.5 / 0.499; 2 / 1.9 / 0.9 sessions; −0.5 vs −0.6 kg (80.1 vs 80.6 → rounded −0.5 → neutral, rounding makes the comparison robust).
- Source: CLAUDE.md I (list of indirect indicators: "strength trend, quality sets, sessions, logged effort, 7-day body weight, waist, photos"). No rules.ts entry for any threshold.
- Hand-computed example: 80 / 100 → "80% of targets", positive; 79.9 → neutral; 49.9 → negative. Code: same.
- Verdict: CORRECT BUT WEAKLY SUPPORTED (pure heuristics; the volume ratio lets a muscle far above its target offset one far below).

##### B-10 Status and confidence
- Where: baseline.ts:hypertrophyAssessment (149–158)
- Formula as coded: baseline phase → `establishing_baseline`; early → `too_early`; else `known < 3 → insufficient_data`; `strength positive && positives ≥ 3 && negatives = 0 → consistent_positive_signals`; `positives > 0 && negatives > 0 → mixed_signals`; else `no_clear_signals`. Confidence `moderate` only in the assessment phase with ≥ 3 `ok` histories, never high.
- Meant to compute: one cautious status, never a growth %.
- Edge cases checked: strength unknown but volume/sessions/effort positive → `no_clear_signals`; strength, volume and sessions ALL negative with no positive → `no_clear_signals` (there is no "negative" status); only consistency known → `insufficient_data`.
- Source: CLAUDE.md I ("never a growth percentage, never claimed from strength alone").
- Hand-computed example: signals [positive ×4, unknown ×3] → consistent positive, moderate. Code: same.
- Verdict: CORRECT BUT WEAKLY SUPPORTED

---

#### src/domain/reports.ts

##### R-1 Rest averages
- Where: reports.ts:restAnalysis (40–70)
- Formula as coded: per exercise, `restSecBefore > 0` of WORKING sets after the first working set; `avgRestSec = round(mean)`; compound / isolation averages pool all samples of that category; between-exercise average = mean of `restAfterSec > 0`.
- Meant to compute: typical rest per exercise and per category.
- Edge cases checked: first working set's rest ignored; drop sets ignored; rest 0 / null ignored; unknown exercise → category "compound"; no samples → null.
- Source: CLAUDE.md D ("Rest periods"), I (measured rest).
- Hand-computed example: pec deck rests 60, 90, 240 → 130; squat 180, 150 (+ a drop set with 10 s, ignored) → 165; restAfterSec 200 and 0 → 200. Code: 130 / 165 / 200.
- Verdict: CORRECT

##### R-2 Rep retention by rest bucket
- Where: reports.ts:restAnalysis (34–39, 49–52, 71)
- Formula as coded: buckets [0, 90), [90, 150), [150, 240), [240, ∞); for a later working set at the SAME weight as the first working set: `reps / first.reps`; bucket mean rounded to 0.01.
- Meant to compute: how many reps are kept after a given rest.
- Edge cases checked: different weight → skipped; first reps 0 / null → skipped; exactly 90 s → second bucket; exactly 240 s → last bucket (its label reads "> 240 s").
- Source: CLAUDE.md D ("compare rep retention between sets against rest duration"). Bucket limits: none.
- Hand-computed example: pec deck 12 reps, then 10 after 60 s → 0.83; 9 after 90 s → 0.75; squat 8, 8 after 180 s (1.0), 6 after 150 s (0.75) → 0.875 → 0.88. Code: 0.83 / 0.75 / 0.88 / null.
- Verdict: CORRECT BUT WEAKLY SUPPORTED (bucket limits are arbitrary; descriptive only)

##### R-3 Weekly result per muscle
- Where: reports.ts:weeklyReport (96–101, 128–130)
- Formula as coded: `effective > max → excess`; `≥ preferred → met`; `< min → short`; else `within`; targets from the frozen snapshot of that week if present; `reached` = met + excess.
- Meant to compute: where each muscle ended the week.
- Edge cases checked: min 0 (forearms) with 0.25 sets → within; no sessions → all short + "No sessions this week".
- Source: CLAUDE.md "Weekly targets" section.
- Hand-computed example: chest 2.0 effective vs 6 / 12 / 18 → short. Code: `chest:2 [6/12/18] short`.
- Verdict: CORRECT

##### R-4 Weekly "progressed" / "declined" lists
- Where: reports.ts:weeklyReport (105–118)
- Formula as coded: `kind = indexKind of the LAST session of the week`; `weekSessions` = week sessions of that kind; `prevBest = max(index of the last 4 earlier sessions of that kind)`; `wkBest = max(index)`; progressed when `wkBest > prevBest × 1.005`; declined when `wkBest < prevBest × 0.95`; no earlier session → skipped.
- Meant to compute: exercises that beat / fell clearly below their recent best this week.
- Edge cases checked: thresholds — 40 × 11 (57.3 vs 56.0) → progressed; 40 × 8 (53.3 ≥ 53.2) → nothing; 40 × 7 (52.0) → declined −7 %; first-ever session → skipped; a non-representative session has `index null, indexKind null`.
- Source: CLAUDE.md G ("wrong-weight, pain and compromised/failed-technique sets are kept in history but never used to judge progress"); rules.ts `benchmark_exclusion`. The +0.5 % / −5 % limits are not documented.
- Hand-computed example (a5 E2): leg extension 50 × 10 @2 on two earlier weeks (index 70.0), Monday 50 × 12 @2 (73.3 = +4.8 %) → expected "progressed". Code: `["Leg extension: index 73.3 vs recent best 70.0"]`. Add a Thursday session whose only set is marked pain: expected unchanged. Code: `[]`.
- Verdict: WRONG
- Notes: a non-benchmark session must not judge progress, but here, when it is the last session of the week, `kind` becomes null, `before` (index ≠ null AND kind = null) is empty, `prevBest` is null and the exercise is skipped — the pain session erases the week's real result (also a real decline). Order-dependent: pain first, clean second → reported. Proposed fix: take `kind` from the last week session that has an index (representative), and skip only if there is none. Separately, the two limits are heuristics (weakly supported).

##### R-5 Weekly recovery notes and recommendations
- Where: reports.ts:weeklyReport (119–136)
- Formula as coded: mean logged sleep (1 decimal) over the week's daily logs; mean fatigue over daily logs + workout wellness; note when ≥ 2 exercises declined; recommendation "keep volume steady" when ≥ 2 declines AND mean fatigue ≥ 3.5; first 3 short muscles named.
- Meant to compute: plain-language notes.
- Edge cases checked: no data → "No sleep or fatigue data logged this week."
- Source: none in rules.ts (text heuristics).
- Hand-computed example: no logs → the fallback note. Code: same.
- Verdict: CORRECT BUT WEAKLY SUPPORTED

##### R-6 Sets still behind (weekly summary)
- Where: reports.ts:weeklySummary (161–165)
- Formula as coded: for rows with `effective < preferred`: `left = Math.round((preferred − effective) × 2) / 2`; rows with left 0 dropped; sorted descending.
- Meant to compute: quality sets missing per muscle, to the nearest half set.
- Edge cases checked: gap 0.2 → 0 → dropped; gap 0.25 → 0.5.
- Source: CLAUDE.md G (UI principle: quality sets left per muscle).
- Hand-computed example: lats 0 of 12 → 12; chest 2 of 12 → 10. Code: `lats 12, chest 10`.
- Verdict: CORRECT

##### R-7 Baseline report: period, frequency, usual days, duration
- Where: reports.ts:baselineReport (246–255, 340–342), durFromTimes (372–379)
- Formula as coded: `end = min(start + lengthDays − 1, today)`; `days = diff + 1`; `perWeek = round1(sessions / days × 7)`; common days = weekdays with count ≥ max(2, sessions / 7); duration = `durationMin ?? (end − start, + 1440 if negative)`, values ≤ 0 dropped, mean rounded to minutes; exercises per session = mean.
- Meant to compute: training behaviour in Learning Mode.
- Edge cases checked: session over midnight 23:30 → 00:20 = 50 min; no times → not sampled; no sessions → 0.
- Source: CLAUDE.md J (Learning mode), I.
- Hand-computed example: 3 sessions in 16 days → 3 / 16 × 7 = 1.31 → 1.3; durations 50 and 50 → 50 (2 samples). Code: `perWeek 1.3, avgMin 50, samples 2`.
- Verdict: CORRECT

##### R-8 Baseline report: sets per session and effort profile
- Where: reports.ts:baselineReport (270–284, 323–324, 343, 349–354)
- Formula as coded: `totalSets` = working sets weighted by side factor (L + R pair = 1); `rir = s.rir ?? (s.toFailure ? 0 : null)`; `rirKnownPct = round(rirKnown / totalSets × 100)`; `avgRir = round1(Σ rir / rirKnown)`; near failure = share with RIR ≤ 2; low effort = share with RIR ≥ 4; data-quality note when `rirKnownPct < 70`.
- Meant to compute: how hard the sets were and how much effort data exists.
- Edge cases checked: no RIR at all → 0 %, avg null; set with the v1.3 failure answer `failure: 'muscular'` and no RIR.
- Source: CLAUDE.md H ("muscular failure without RIR ≈ RIR 0"); effort.ts:49 and failure.ts:failureImpliedRir treat it as RIR 0.
- Hand-computed example (a2 R3): 7 working sets — one `failure: 'muscular'` (no RIR), one `toFailure`, RIR 1, 4, 2, 3, 2. With failure ≈ RIR 0 (as everywhere else): known 7 / 7 = 100 %, avg (0+0+1+4+2+3+2) / 7 = 1.7, near failure 5 / 7 = 71 %. Code: `rirKnownPct 86, avgRir 2, nearFailurePct 67` (the muscular-failure set is "unknown"); `effortDistribution` on the same data: `rir0: 2, unknown: 0`.
- Verdict: INCONSISTENT
- Notes: reports.ts:277 knows only the older `toFailure` flag; a set answered "muscular failure" in the logger's Failure question (stored as `failure`) is counted as effort unknown here and as RIR 0 in effort.ts:49, progression.ts:209 and the quality model. Proposed fix: use `s.rir ?? (s.toFailure ? 0 : failureImpliedRir(s))`. (Side remark: effort.ts averages LOGGED RIR only — 2.4 here — while this report includes failure as 0 — 2.0; one definition should be chosen.)

##### R-9 Baseline report: weekly distribution, low direct, high indirect
- Where: reports.ts:baselineReport (301–311)
- Formula as coded: `weeks` = week buckets overlapping the period; `fullWeeks` = those with `complete`; `avgEffective = round1(mean of weekly effective over fullWeeks)`; `directShare = round2(Σ effectiveDirect / Σ effective)`; `lowDirect` = muscles with total `directSets ≤ max(1, fullWeeks)`; `highIndirect` = `effectiveIndirect ≥ 4 && > effectiveDirect` over the whole period.
- Meant to compute: the owner's usual weekly volume per muscle.
- Edge cases checked: no complete week → mean of [] = 0; first workout late in a calendar week.
- Source: CLAUDE.md "Weekly targets" (personal baseline after Learning Mode); no rules.ts entry for the thresholds.
- Hand-computed example (a6): first workout on a Sunday (3 chest sets), then two full weeks of 6 chest sets each. Usual full-week volume = 6.0. Code: `avgEffective 5` = (3 + 6 + 6) / 3, because the one-day first week counts as a full week.
- Verdict: QUESTIONABLE
- Notes: a partial first calendar week (and, symmetrically, a week that only partly lies inside the learning period) is averaged as if it were a full training week, which understates the usual weekly volume. Alternative: average only weeks fully inside [start, end], or divide the period total by `days / 7` as B-5 does.

##### R-10 Baseline report: consistency, variety, co-occurrence, load changes, rep ranges, data-quality notes
- Where: reports.ts:baselineReport (286–299, 317–332, 345–348, 360–367)
- Formula as coded: `cvSessions = round2(population SD of sessions per week / mean)` (null with < 2 weeks; mean 0 → divisor 1); new exercises in the second half (`halfway = start + floor(days / 2)`); pairs of muscles with coefficient ≥ 0.75 trained in the same session, top 8; within-session load change = last − first working weight (increase / decrease / flat, needs ≥ 2 weights); rep range = min / max / median of working reps; notes: rest samples < 30 % of sets, unidentified machines, unknown gym, no durations.
- Meant to compute: descriptive statistics.
- Edge cases checked: sessions per week [2, 1, 0] → SD √(2/3) = 0.816 → CV 0.82; reps [10, 9, 8, 8, 10, 9, 10] → min 8, max 10, median 9; loads 40/40 flat, 40/42.5 increase.
- Source: none (descriptive). Note: history.ts:cv uses the SAMPLE SD for a different quantity (weekly volume, targets.ts) — not the same number, so not a conflict.
- Hand-computed example: as above. Code: `cvSessions 0.82`, `min 8, max 10, median 9`, `increase 1, flat 1`.
- Verdict: CORRECT BUT WEAKLY SUPPORTED

##### R-11 Deload: effort creep ("same performance feels harder")
- Where: reports.ts:assessDeload (396–405)
- Formula as coded: per recently active history, last 4 sessions (needs ≥ 3): creep when `avgRir(last) < avgRir(first) − 0.9` AND `(index(last) ?? 0) ≤ (index(first) ?? 0)`; indicator present when ≥ 2 histories.
- Meant to compute: sets feel harder without better performance.
- Edge cases checked: last session non-representative (all sets pain / wrong weight / broken technique → `index null`).
- Source: CLAUDE.md G / rules.ts `benchmark_exclusion` (such sets never judge progress). No rules.ts entry for the deload score.
- Hand-computed example (a5 E1): two exercises, 4 weekly sessions 40 × 10, 11, 12 @RIR 3, then 40 × 13 @RIR 1 → index 57.3, 58.7, 60.0, 58.7: last (58.7) > first (57.3) → no creep. Code: `false, 0 exercise(s)`. Same data but the last set marked pain: performance is unknown, so still no creep expected. Code: `true — 2 exercise(s) show falling RIR without better performance`.
- Verdict: WRONG
- Notes: `?? 0` turns "not comparable" into "performance 0", so one pain-flagged or wrong-weight session with a lower RIR counts as a fatigue sign and adds a point to the deload score. It also compares indices of different scales (reps vs kg). Proposed fix: use only representative sessions of one index scale (`index != null`, same `indexKind`) for both ends; skip the history otherwise.

##### R-12 Deload: other indicators and score
- Where: reports.ts:assessDeload (392–394, 407–433)
- Formula as coded: active = trend known and last session ≤ 21 days ago. (1) declining histories ≥ 2 and ≥ 30 % of active; (3) fatigue: ≥ 3 entries in 14 days (today − 13) with mean ≥ 3.5 / 5; (4) sleep: ≥ 3 entries, mean < 6.5 h; (5) soreness: ≥ 4 entries ≥ 3 in 14 days; (6) ≥ 3 muscles above their upper bound in each of the last 2 complete weeks; (7) block week ≥ 6 (`floor(days / 7) + 1`) with ≥ 50 % of ≥ 3 active histories on plateau / declining. `score` = number present; recommend when ≥ 3.
- Meant to compute: whether several fatigue signs coincide.
- Edge cases checked: 2 fatigue entries of 4 / 5 → not present (needs 3); no block → "No active training block"; no data → score 0. Daily log and workout wellness of the same day both count (possible double entry for one night).
- Source: CLAUDE.md "An active deload block halves all targets" (the summary's "~50 % of sets" agrees). No rules.ts entry for any threshold.
- Hand-computed example (a2 R4): 2 of 3 histories declining (≥ 2 and ≥ 0.9) → present; 4 soreness entries ≥ 3 → present; fatigue 4.0 from 2 entries → absent; sleep 6.0 h from 2 entries → absent. Code: same; score 3 → recommend.
- Verdict: CORRECT BUT WEAKLY SUPPORTED (all thresholds are undocumented heuristics; rules.ts claims to list every numeric adjustment but has no deload rule)

##### R-13 Weekly body-weight averages
- Where: reports.ts:dailyWeightMeans (443–447), weeklyWeightAverages (450–458)
- Formula as coded: mean per calendar day, then mean of the daily means per week (`week start = date − ((dow − weekStartsOn + 7) % 7)`), rounded to 0.1.
- Meant to compute: weekly body weight without counting a day twice.
- Edge cases checked: two weigh-ins on one day; Sunday vs Monday week start; weight 0 / null ignored.
- Source: CLAUDE.md I ("Body-weight averages are means of daily means everywhere").
- Hand-computed example: 03-02: 80 and 82 (81), 03-03: 80, 03-08: 81, 03-09: 79. Monday weeks: (81 + 80 + 81) / 3 = 80.67 → 80.7 (n 3); 79 (n 1). Sunday weeks: 80.5; 80.0. Code: same.
- Verdict: CORRECT

##### R-14 Monthly body report: current vs previous 30 days
- Where: reports.ts:monthlyBodyReport (461–472)
- Formula as coded: weight: mean of daily means for days with `0 ≤ diffDays(today, d) < 30` vs `30 ≤ … < 60`; circumferences: mean of every measurement with `diffDays < 30` vs `30…59`; rounded to 0.1.
- Meant to compute: month-on-month body numbers.
- Edge cases checked: no data → null; a measurement dated in the future is ignored for weight but counted for circumferences (no lower bound) — the entry form refuses future dates (AddBodyWeight.tsx:62), so only imported / restored data can hit this.
- Source: CLAUDE.md I.
- Hand-computed example: 03-20: 80 and 82 (81), 03-21: 80, 02-24: 79 (29 days old → current), 02-23: 78 (30 days → previous), today 03-25 → current (81 + 80 + 79) / 3 = 80.0, previous 78.0. Code: same.
- Verdict: CORRECT

##### R-15 Monthly body report: weight / waist notes
- Where: reports.ts:monthlyBodyReport (479–485)
- Formula as coded: `dw = current − previous` (both already rounded to 0.1), `dwaist` likewise; `dw > 0.3 && dwaist ≤ 0.5` → "weight up, waist stable"; `dw > 0.3 && dwaist > 1` → "both rising"; `dw < −0.3` → "trending down".
- Meant to compute: a cautious reading of the month.
- Edge cases checked: the exact 0.3 kg boundary; `dw > 0.3` with waist + 0.5…1.0 → no note (gap by design).
- Source: none in rules.ts (heuristic).
- Hand-computed example (a2 R5): a difference of exactly 0.3 kg is NOT "> 0.3", so no note is expected. Code: 80.3 vs 80.0 → no note; 80.4 vs 80.1 → "Weight up with a roughly stable waist…"; 70.4 vs 70.1 → note; 75.3 vs 75.0 → none; 80.1 vs 80.4 → "Weight trending down…"; 80.0 vs 80.3 → none.
- Verdict: WRONG
- Notes: floating-point subtraction of two one-decimal values (80.4 − 80.1 = 0.30000000000001137; 80.3 − 80.0 = 0.29999999999999716) decides the boundary case, so the same 0.3 kg change gives different texts. Proposed fix: round the difference to 0.1 before comparing (as baseline.ts:141 does), and decide whether the limit is "> 0.3" or "≥ 0.3". The thresholds themselves are heuristics.

##### R-16 Volume trend rows
- Where: reports.ts:volumeTrend (494–500)
- Formula as coded: last n (12) weeks; `total = round1(quality(workouts))` when a quality function is given, else raw working sets; per-muscle effective sets as computed.
- Meant to compute: weekly trend table.
- Edge cases checked: empty week → zeros.
- Source: CLAUDE.md I ("'quality sets' in totals count each working set ONCE").
- Hand-computed example: one session, pec deck 2 sets (RIR 2 → 1.0, RIR 5 → 0.3): chest 1.3, total 2 raw (or the quality total passed in). Code: `total 2, chest 1.3`.
- Verdict: CORRECT

##### R-17 Weekly snapshot
- Where: reports.ts:buildSnapshot (188–206), pendingSnapshot (209–213)
- Formula as coded: copies min / preferred / max / confidence and effective sets per muscle; pending = most recent complete week with workouts and no snapshot.
- Meant to compute: frozen copy of a finished week.
- Edge cases checked: empty week → not pending.
- Source: CLAUDE.md I ("previous weeks are derived from raw sets (never deleted)").
- Hand-computed example: no arithmetic (copy).
- Verdict: CORRECT

##### R-18 Rest attribution (lives in progression.ts, listed in the brief)
- Where: progression.ts:restInsight (386–400)
- Formula as coded: `typical` = median of all rests (> 0) before non-first sets over the given sessions (the last one included); in the last session, a benchmark set at the same weight as the first benchmark set with `first.reps − reps ≥ 2` AND `restSec < typical × 0.7` → attributed to rest.
- Meant to compute: do not blame the load for a rep drop after a short rest.
- Edge cases checked: 84 s vs 120 s (exactly 70 %) → no; drop of 1 rep → no; no rests recorded → null.
- Source: rules.ts `rest_attribution` ("< 70 % of median"); CLAUDE.md G ("a clearly shorter rest (< 70 % of the usual)").
- Hand-computed example: usual 120 s; 12 → 10 reps after 83 s (69 %) → message; after 84 s → none. Code: same.
- Verdict: CORRECT BUT WEAKLY SUPPORTED (research-informed heuristic; code = documentation)

---

#### src/domain/bodyweight.ts

##### W-1 Weigh-in list
- Where: bodyweight.ts:weighIns (29–34)
- Formula as coded: keep `weightKg` finite and > 0; time kept only if `HH:MM`; sort by `date + 'T' + (time ?? '00:00')`, then id.
- Meant to compute: clean ordered weigh-ins.
- Edge cases checked: 0, null, NaN dropped (6 of 9 kept); untimed entries sort first on their day.
- Source: CLAUDE.md I.
- Hand-computed example: latest of the list = 03-14, 82.6 kg. Code: same.
- Verdict: CORRECT

##### W-2 7-day average of daily means
- Where: bodyweight.ts:rollingAverage (40–47)
- Formula as coded: window `endDate − 6 … endDate`; mean per day; mean of the day means; rounded to 0.01; returns days and n; null without data.
- Meant to compute: the body-weight trend value.
- Edge cases checked: one day only → that day's mean; a day leaving the window; empty → null.
- Source: CLAUDE.md I ("Trend = 7-day average of daily means").
- Hand-computed example: 03-01: 80; 03-03: 81 and 83 (82); 03-07: 81.5 → (80 + 82 + 81.5) / 3 = 81.17 (3 days, 4 weigh-ins). End 03-08 (window 03-02…): (82 + 81.5 + 82) / 3 = 81.83. Code: 81.17 / 81.83.
- Verdict: CORRECT

##### W-3 Weekly trend
- Where: bodyweight.ts:weeklyTrend (50–54)
- Formula as coded: `round2(rollingAverage(today) − rollingAverage(today − 7))`; null unless both windows have data.
- Meant to compute: kg per week.
- Edge cases checked: empty previous window → null; each window may hold a single weigh-in (no minimum).
- Source: CLAUDE.md I.
- Hand-computed example: 82.30 (03-08: 82, 03-14: 82.6) − 81.17 = 1.13. Code: 1.13.
- Verdict: CORRECT

##### W-4 Weigh-in selected for a workout
- Where: bodyweight.ts:bodyWeightForSession (83–91)
- Formula as coded: candidates = earlier dates; same day only if (both times known AND weigh-in time ≤ start) OR (weigh-in has NO time AND condition is `morning_fasted` / `before_workout`); pick the last by sort key.
- Meant to compute: the latest weigh-in taken before the session started.
- Edge cases checked: evening weigh-in after a morning session → not used; previous-day evening → used next day; none → `unavailable`; same-day timed weigh-in when the workout has no start time; untimed "before workout" entry next to an earlier timed one.
- Source: CLAUDE.md I ("the latest weigh-in taken before it started (same-day entries without a time count only if tagged morning fasted / before workout)").
- Hand-computed example: 03-10: 07:00 81 kg, 21:00 82 kg, untimed 81.5, untimed "morning fasted" 81.2. Start 18:00 → 81 (07:00); start 06:00 → 81.2; next day → 82. Code: same. Extra: a 07:00 weigh-in TAGGED "before workout" with an unknown start time → code returns `unavailable`, although the same entry without a time would be accepted. A 07:00 entry plus an untimed "before workout" entry (start 18:00) → code picks the 07:00 one (untimed entries sort as 00:00).
- Verdict: QUESTIONABLE
- Notes: the code matches its docstring and CLAUDE.md literally, but the rule is arguable: recording MORE information (a time) makes a "morning fasted / before workout" weigh-in unusable whenever the workout has no start time — the normal case for imported workouts. Alternative: accept a same-day weigh-in tagged morning fasted / before workout regardless of whether it has a time when the start is unknown; and let an untimed "before workout" entry rank after timed entries that precede the start.

##### W-5 Outdated rule and gap
- Where: bodyweight.ts:bodyWeightForSession (93–100), BODY_WEIGHT_MAX_AGE_DAYS (75)
- Formula as coded: `days = diffDays(workout date, weigh-in date)`; `outdated` when `days > 7`; `gapMin = days × 1440 + (start ?? 12:00) − (time ?? 08:00)`; `gapHours = max(0, round(gapMin / 6) / 10)`; `approximate` when either time is unknown.
- Meant to compute: age of the weigh-in used.
- Edge cases checked: exactly 7 days → ok; 8 → outdated; untimed morning entry before a 06:00 start → gap 0 (clamped), approximate.
- Source: CLAUDE.md I ("older than 7 days → 'outdated'").
- Hand-computed example: 03-01 08:00 → 03-02 09:30 = 1530 min = 25.5 h. Code: 25.5; 7 days → ok, 8 → outdated.
- Verdict: CORRECT

##### W-6 How an outdated weigh-in is used
- Where: bodyweight.ts:74 (comment), bodyWeightNote (161–166), bodyLoadSessions (149); reports.ts:184 and analysis.ts:117 (`bodyWeightForSession(...).kg`)
- Formula as coded: the status is returned next to the kg, but the consumers use `.kg` / `status !== 'unavailable'`, i.e. an outdated value is treated like a current one.
- Meant to compute: "Older than this, the weigh-in is shown as outdated (still shown, never silently treated as current)" (bodyweight.ts:74).
- Edge cases checked: one weigh-in, sessions 1 day and 148 days after it.
- Source: bodyweight.ts:74; CLAUDE.md I (weighted pull-ups: "body (latest weigh-in before the session) + belt — an estimate").
- Hand-computed example (a3 B3): weigh-in 80 kg on 01-04; weighted pull-ups 10 kg × 8 @2 on 01-05 and on 06-01. Second session: the only weigh-in is 148 days old → status `outdated`. Code: both sessions get `indexKind 'system', index 120` (90 × 1.333), `estSystemKg 90`, and `bodyWeightNote` returns "Body weight stable (80 → 80 kg) — changes here reflect performance."
- Verdict: INCONSISTENT
- Notes: "stable 80 → 80" is the same single weigh-in read twice, 5 months apart — exactly the silent "treated as current" the comment rules out; the body + belt index and any % built on it also use it without a flag. Proposed fix: in `bodyWeightNote` count only `status === 'ok'` sessions as known (or say "last weighed n days before"); for the index either mark sessions with an outdated weight (and keep them out of the % in baseline.ts) or document that the latest weigh-in is used whatever its age.

##### W-7 Duplicate weigh-in guard
- Where: bodyweight.ts:isDuplicateWeighIn (104–105)
- Formula as coded: an existing weigh-in with `kg === kg`, same date and same time (`null` = no time).
- Meant to compute: block a double tap.
- Edge cases checked: same kg + date, other time → not duplicate; `undefined` time = null; 80.0000001 vs 80 → not duplicate (exact comparison; the form rounds before calling).
- Source: CLAUDE.md I/K (weigh-ins editable; duplicate tap guard).
- Hand-computed example: (81, 03-03, 07:00) exists → true; (81, 03-03, no time) → false. Code: true / false.
- Verdict: CORRECT

##### W-8 Body + external load per session
- Where: bodyweight.ts:bodyLoadSessions (133–153)
- Formula as coded: `top` = max logged load (assisted: MIN assistance) among sets with reps; `bestReps` = max reps at that load; `estSystemKg = round1(max(0, body + max(0, ext)))`, assisted: `body − ext`; only for kind `system` and a known body weight.
- Meant to compute: labelled estimate of the mass moved in pull-ups / dips.
- Edge cases checked: no body weight → null; assistance larger than body weight → 0; a set with null weight counts as 0 (for assisted work that reads as "no assistance").
- Source: CLAUDE.md I ("'Body + belt' is shown only as a labelled estimate"; never added to a bar).
- Hand-computed example: body 80 + belt 10 = 90. Code: 90.
- Verdict: CORRECT

##### W-9 Body-weight note
- Where: bodyweight.ts:bodyWeightNote (160–176)
- Formula as coded: first vs last session with a body weight; `|Δbody| < 0.5 kg` → "stable"; otherwise text by sign of Δbody, Δreps and Δbelt.
- Meant to compute: one honest sentence.
- Edge cases checked: < 2 known → hint to log weight; context exercises → "context only".
- Source: CLAUDE.md I. The 0.5 kg limit: none.
- Hand-computed example: 80 → 80 kg → "stable". Code: same (see W-6 for the outdated case).
- Verdict: CORRECT BUT WEAKLY SUPPORTED

##### W-10 "Add a belt" advice for bodyweight pull-ups
- Where: bodyweight.ts:pullUpLoadingAdvice (179–185)
- Formula as coded: history key contains `load=bodyweight`; last 2 sessions with an index; every set `reps ≥ repTop` and `(rir ?? 0) ≥ 1` in both → suggest 2.5–5 kg.
- Meant to compute: when to start weighted pull-ups.
- Edge cases checked: RIR 0 or unknown on any set → no advice; one set below the top → no; one session only → no.
- Source: CLAUDE.md D / rules.ts `double_progression` (two consecutive sessions, all sets at the top). The 2.5–5 kg start is a heuristic.
- Hand-computed example: 12, 12 @1 and 13, 12 @2 with top 12 → advice. Code: advice; RIR 0 / null / 11 reps → null.
- Verdict: CORRECT BUT WEAKLY SUPPORTED

##### W-11 Where body weight matters
- Where: bodyweight.ts:bodyWeightRelevant (110–115)
- Formula as coded: pull-up, dips, push-up, assisted pull-up or any bodyweight exercise → `system`; squats, split squat, lunge, deadlift → `context`; else null.
- Meant to compute: whether to show body weight next to an exercise.
- Edge cases checked: machines → null.
- Source: CLAUDE.md I ("Squats/lunges/deadlifts show body weight as context only").
- Hand-computed example: no arithmetic.
- Verdict: CORRECT

---

#### src/domain/sessionSummary.ts

##### S-1 Session duration
- Where: sessionSummary.ts:minutesBetween (40–46), summarizeSession (82); compare src/ui/pages/Logger.tsx:494–500
- Formula as coded: `durationMin ?? (now − start in minutes)`, only when the workout date equals today's date and `0 ≤ d < 600`.
- Meant to compute: how long the session took.
- Edge cases checked: no start → null; start after now → null; exactly 600 → null; session crossing midnight (23:30 → 00:20) → null (reports.ts:durFromTimes gives 50 for the same times).
- Source: CLAUDE.md I (Finish summary: duration).
- Hand-computed example: 18:00 → 19:15 = 75. Code: 75. 08:00 → 15:00 = 420. Code: 420.
- Verdict: INCONSISTENT
- Notes: on Finish the Logger stores `durationMin` with a different limit — `if (d > 0 && d < 400)` (Logger.tsx:499) — and then calls `summarizeSession`, which falls back to `minutesBetween` (limit 600). A 420-minute session is therefore shown as "420 min" in the summary but saved without a duration. A session that crosses midnight gets no duration in either place, while reports.ts wraps midnight. Proposed fix: one shared helper with one limit, and use the stored start/end with the midnight wrap.

##### S-2 Working and warm-up set counts
- Where: sessionSummary.ts:summarizeSession (49–50, 85–86)
- Formula as coded: exercises with ≥ 1 performed (not planned) set; `workingSets = Σ countedSetCount(performed sets)` (working + drop, left + right pair = 1); `warmupSets` = performed warm-ups.
- Meant to compute: what was done.
- Edge cases checked: planned sets ignored; skipped exercise with only planned sets not counted.
- Source: CLAUDE.md C ("3 L + 3 R = 3 sets"), I.
- Hand-computed example: pec deck 2 working + 1 drop, lateral raise 2, assisted pull-up 1, leg curl L + R = 1 → 7; 1 warm-up; 4 exercises. Code: `workingSets 7, warmupSets 1, exercises 4`.
- Verdict: CORRECT

##### S-3 Tonnage
- Where: sessionSummary.ts:summarizeSession (87)
- Formula as coded: `round(Σ weightKg × reps)` over performed working + drop sets, `assisted` excluded; values as logged (per dumbbell, per side, belt only).
- Meant to compute: tonnage as logged.
- Edge cases checked: null weight or reps → 0; both sides of a per-side pair are each added (as logged).
- Source: CLAUDE.md I ("tonnage = weight × reps as logged").
- Hand-computed example: 40×11 + 40×9 + 30×8 + 10×12 + 12×8 + 15×10 + 15×10 = 1556 (assisted 25×8 excluded). Code: 1556.
- Verdict: CORRECT

##### S-4 Average rest in the summary
- Where: sessionSummary.ts:summarizeSession (51–52, 88); field comment at 28
- Formula as coded: `work` = performed working AND drop sets; `rests` = their `restSecBefore > 0`; `avgRestSec = round(mean)`.
- Meant to compute: "Mean rest before working sets where rest was measured or entered" (line 28).
- Edge cases checked: no rests → null; drop segment with a measured rest.
- Source: CLAUDE.md I ("Rest between sets of the same exercise is MEASURED"); reports.ts:42 and progression.ts:229 use working sets after the first only.
- Hand-computed example (a3 S2): working-set rests 120, 90, 100 s and a drop segment 8 s after its parent set. Mean rest before working sets = 103 s. Code: `avgRestSec 80` = (120 + 8 + 90 + 100) / 4.
- Verdict: INCONSISTENT
- Notes: the few seconds before a drop segment are not rest between sets, yet they enter this mean (the live logger does measure them: Logger.tsx:456 applies `measuredRestSec` to every set type), while the rest report and the progression rest average exclude drop sets. Proposed fix: take rests from `type === 'working'` sets only.

##### S-5 Muscles in the summary
- Where: sessionSummary.ts:summarizeSession (53, 89)
- Formula as coded: `sessionMuscleEffective` on performed sets; keep `> 0.04`; `Math.round(v × 100) / 100`; sort descending.
- Meant to compute: effective sets per muscle for this session.
- Edge cases checked: quarter-set credits stay 0.25; pain set keeps its credit.
- Source: CLAUDE.md C, G, I.
- Hand-computed example: chest 2 working + drop 0.5 = 2.5; front delts 0.25 × 2.5 = 0.625 → 0.63; side delts 2. Code: 2.5 / 0.63 / 2.
- Verdict: CORRECT

##### S-6 Records
- Where: sessionSummary.ts:summarizeSession (56–79)
- Formula as coded: clean sets = performed working sets with weight and reps, not assisted, not benchmark-excluded, not technical failure; previous = clean sets of earlier workouts with the same progression key; weight record when `max weight today > max weight before`; otherwise reps record when `max reps at today's top weight > previous max reps at that weight` (previous must exist at that weight).
- Meant to compute: new bests on the same exercise × equipment × configuration.
- Edge cases checked: first time on a setup → none; pain set at a heavier weight → no record; assisted → none; same-day earlier workout compared by `createdAt`.
- Source: CLAUDE.md I (summary: records), G (benchmark rules).
- Hand-computed example: before 40 × 10, 9; today 40 × 11 → "11 reps at 40 kg (was 10)"; lateral raise 12 kg set flagged pain → no weight record. Code: one reps record.
- Verdict: CORRECT

##### S-7 Failure and technique counts
- Where: sessionSummary.ts:summarizeSession (91–93)
- Formula as coded: counts of working / drop sets with effective failure `muscular`, `technicalFailure === true`, `isCompromised`.
- Meant to compute: failure sets in the summary.
- Edge cases checked: none flagged → 0.
- Source: CLAUDE.md H.
- Hand-computed example: 0 / 0 / 0 in the sample. Code: same.
- Verdict: CORRECT

##### S-8 Measured rest before a set
- Where: sessionSummary.ts:measuredRestSec (102–106); called at Logger.tsx:456
- Formula as coded: `gap = round((now − previous completion of the same exercise) / 1000 − (reps ?? 8) × 3)`; valid only when `0 < gap < 1800`.
- Meant to compute: rest = time between completions minus the set's own duration (~3 s per rep).
- Edge cases checked: no previous set → null; reps unknown → 8 assumed (24 s); reps 0 → nothing subtracted; gap shorter than the set estimate → null; ≥ 30 min → null; second side of a left/right pair is skipped by the caller.
- Source: CLAUDE.md I ("time between completions minus an estimate of the set's own duration").
- Hand-computed example: 150 s between ticks, 10 reps → 150 − 30 = 120. Code: 120; reps null → 126; 1830 s → null; 1829 s → 1799.
- Verdict: CORRECT BUT WEAKLY SUPPORTED
- Notes: the flat 3 s per rep is a guess; it under-reports rest on fast high-rep sets (30 reps done in 60 s after a 60 s rest → reported 30 s) and over-reports on slow sets. Timed holds are logged as 1 rep (repRange [1, 1]), so a 60 s plank subtracts only 3 s.

---

#### src/domain/increments.ts

##### I-1 Load step
- Where: increments.ts:loadStep (10–21)
- Formula as coded: equipment `min(incrementsKg)` → else, dumbbells / kettlebells only, `min(gym freeWeightIncrementsKg)` → else `defaultIncrement(kind, loadMode)`.
- Meant to compute: the smallest real step for an exercise.
- Edge cases checked: empty list → next source; gym steps ignored for barbells; a 0 in the list would give step 0 (the equipment and gym forms keep only values > 0: Equipment.tsx:182, 263).
- Source: CLAUDE.md G ("Load steps use the equipment's smallest increment from the current load"), H ("equipment → the gym's dumbbell steps → default").
- Hand-computed example: [5, 2.5] → 2.5 (equipment); no equipment, dumbbell, gym [1, 2.5] → 1; barbell → 2.5 default. Code: same.
- Verdict: CORRECT BUT WEAKLY SUPPORTED
- Notes: taking the smallest listed jump assumes it exists at every weight (a rack with 1 kg jumps only up to 10 kg would still get "+1 kg" at 20 kg).

##### I-2 Default increments
- Where: progression.ts:defaultIncrement (348–357), used by increments.ts
- Formula as coded: machine 5; cable 2.5; barbell / Smith 2.5; plate-loaded 2.5 (per side 1.25); dumbbell / kettlebell 2; anything else 2.5.
- Meant to compute: a step when nothing is recorded.
- Edge cases checked: undefined kind → 2.5; bodyweight / band → 2.5.
- Source: CLAUDE.md H ("default"); no rules.ts entry.
- Hand-computed example: table as listed. Code: same.
- Verdict: CORRECT BUT WEAKLY SUPPORTED

##### I-3 Rounding to the grid and one step
- Where: progression.ts:roundToIncrement (359–362), stepLoad (368–372)
- Formula as coded: `round(round(w / inc) × inc × 100) / 100` (inc ≤ 0 → nearest 0.5); `stepLoad`: if the current load is on the grid → round(w + step) to the grid, else `round2(w + step)`; never below 0.
- Meant to compute: next load on the real steps.
- Edge cases checked: 25 kg dumbbell + 2 kg on a 2-kg grid → 27 (not 28); 23 + 2.5 on a 2.5 grid → 25.5 (off-grid stays off-grid); 2 − 5 → 0; half-way 26.25 on 2.5 → 27.5 (half up).
- Source: CLAUDE.md G ("Load steps use the equipment's smallest increment from the current load").
- Hand-computed example: stepLoad(25, 2, 2) = 27; stepLoad(24, 2, 2) = 26; stepLoad(40, −2.5, 2.5) = 37.5. Code: same.
- Verdict: CORRECT

---

#### src/domain/ruleChecks.ts

##### C-1 Relative performance
- Where: ruleChecks.ts:relativePerf (52–62)
- Formula as coded: representative sessions with an index; for session i ≥ 3: reference = median of the previous 3 (all on the same index scale, else skipped); `rel = indexRaw / reference`.
- Meant to compute: each session vs the owner's recent level on the same exercise × machine.
- Edge cases checked: fewer than 4 sessions → nothing; scale change inside the window → skipped; reference 0 → skipped; no age limit on the previous three.
- Source: CLAUDE.md K ("each session vs the median of the previous three on the same exercise × machine").
- Hand-computed example: previous 58.67, 58.67, 58.67 and a session of 56.0 → 0.9545 → −4.5 %. Code: affected median −4.5.
- Verdict: CORRECT

##### C-2 Verdict
- Where: ruleChecks.ts:verdictOf (64–68), RULE_CHECK_MIN_N (40), CLEAR (41)
- Formula as coded: either side < 6 → `insufficient`; `d = round((median(fresh) − median(affected)) × 1000) / 10` percentage points; `d ≥ 2` supports, `d ≤ −2` contradicts, else no clear difference.
- Meant to compute: do the owner's data agree with the rule.
- Edge cases checked: 0 on one side → insufficient; the comparison uses d rounded to 0.1 (1.95 → 2.0 → "supports").
- Source: CLAUDE.md K ("≥ 6 sessions per side; < 2 % = no clear difference"; "the app never changes a rule automatically").
- Hand-computed example: fresh median 1.000, affected 0.9545 → 4.5 → supports (7 vs 18 sessions). Code: `supports, diff 4.5`.
- Verdict: CORRECT BUT WEAKLY SUPPORTED (observational, confounded — as the file says; the reference itself contains affected sessions)

##### C-3 "Inside the recovery window" classification
- Where: ruleChecks.ts:ruleChecks (93–117)
- Formula as coded: primary muscles = coefficient ≥ 0.75; for each, the most recent EARLIER session (by session end) whose effective sets for it (coefficients ≥ 0.5) reach `significantStimulusSets` (default 2) within 7 days; inside when `hours from that end to this start < baseWindowHours(sets)` (24 / 36 / 48 / 60 / 72 h, no modifiers); nothing significant in 7 days → fresh.
- Meant to compute: lifts done inside vs after the app's base window.
- Edge cases checked: unknown start time → 18:00 assumed; a non-significant session in between is skipped.
- Source: rules.ts `recovery_windows`; CLAUDE.md K.
- Hand-computed example: 4 chest-press sets end 18:00, pec deck next day 18:00 → 24 h < 36 h → inside; index 57.33 vs reference 58.67 → −2.3 %. Code: affected n 6, median −2.3, fresh 0 → `supports, diff 2.3`.
- Verdict: CORRECT BUT WEAKLY SUPPORTED

##### C-4 "Pre-loaded by an earlier exercise" classification
- Where: ruleChecks.ts:ruleChecks (119–138)
- Formula as coded: an exercise performed earlier in the same session (by first ticked non-warm-up set; list order when ticks are missing) has coefficient ≥ 0.5 for one of this exercise's primary (≥ 0.75) muscles.
- Meant to compute: lifts done after the same muscle was already worked vs done first.
- Edge cases checked: exercises with only planned sets ignored; the exercise is located by id + equipment (first match), not by configuration.
- Source: rules.ts `exercise_order`; CLAUDE.md J, K.
- Hand-computed example: chest press then pec deck → affected; pec deck then curl → both fresh. Code: affected 7, fresh 18.
- Verdict: CORRECT BUT WEAKLY SUPPORTED

---

#### src/domain/mappingUncertainty.ts

##### M-1 Volume spread from uncertain mappings
- Where: mappingUncertainty.ts:shifted (35–49), mappingSpread (52–64)
- Formula as coded: recompute the week with every uncertain coefficient (no owner override) at the low end and at the high end of its stated range (0 → removed); `low = round2(min(lowRun, counted))`, `high = round2(max(highRun, counted))`; the per-session taper applies inside each run.
- Meant to compute: "counted x; plausible a–b".
- Edge cases checked: verified exercises → no spread; planned sets ignored; override → no range; > 11 sets in a session → tapered in all three runs.
- Source: CLAUDE.md K (1) (`mappingRanges.ts`, "never invented"), C (per-session ceiling).
- Hand-computed example: incline DB press 3 sets (credits 1, 1, 0.6): triceps 0.5 × 2.6 = 1.3, low 0.25 × 2.6 = 0.65; back extension 2 sets: erectors 2 (0.5–2), glutes 1 (0.5–1.5), hamstrings 1 (0.5–2); dips 14 sets: triceps 10.5 counted, high 14 → 11 + 3 × 0.5 = 12.5. Code: same.
- Verdict: CORRECT

##### M-2 Which mappings are uncertain
- Where: mappingUncertainty.ts:isUncertainMapping (24–27), uncertainMuscles (30–33)
- Formula as coded: audit verdict `uncertain` and no owner override for that exercise.
- Meant to compute: when to show a range.
- Edge cases checked: override present → false; uncertain without a stated range → {}.
- Source: CLAUDE.md K (1).
- Hand-computed example: no arithmetic.
- Verdict: CORRECT

---

#### src/domain/fatigue.ts

##### F-1 Fatigue cost of an exercise
- Where: fatigue.ts:fatigueCostOf (25–29)
- Formula as coded: no definition → moderate; `(pull_up or dips) && variation.loading === 'weighted'` → high; else the library value, else isolation → low, compound → moderate.
- Meant to compute: HIGH / MODERATE / LOW cost for the rest of the session.
- Edge cases checked: custom exercises; pull-ups / dips with a belt but no `variation.loading`.
- Source: rules.ts `fatigue_cost` ("… weighted pull-ups / dips" = HIGH); CLAUDE.md J ("weighted pull-ups / dips HIGH"); progression.ts:effectiveVariation derives "weighted" from the logged load.
- Hand-computed example (a4 F1/F2): session with pull-ups 10 kg belt (no `loading` recorded — e.g. an import that did not state it) and dips with a 20 kg belt. Expected by the rule: both HIGH. Code: `highCostDone []`, level `fresh`; with `loading: 'weighted'` on the pull-up → `['pull_up']`. Dips have no `loading` field at all (exercises.ts:347 defines it for `pull_up` only; `SEED_BY_ID.dips.variationFields` is undefined), so weighted dips logged in the app can never be HIGH.
- Verdict: INCONSISTENT
- Notes: the same app already derives bodyweight vs weighted from the sets for the history key. Proposed fix: decide "weighted" from the performed sets (any working set with added load > 0, not assisted) when sets are available (sessionLoad), falling back to `variation.loading`; give dips the same treatment.

##### F-2 Fatigue classes in the library vs the rule text
- Where: src/data/exercises.ts:378–387 (read by fatigue.ts); rules.ts `fatigue_cost` (229)
- Formula as coded: HIGH = a fixed list of 14 ids; isolation → low; other compounds → moderate; `for (const id of ['plank'])` sets low.
- Meant to compute: the initial classification.
- Edge cases checked: listed every HIGH exercise with its equipment kind.
- Source: rules.ts `fatigue_cost`: "HIGH (heavy free-weight squat / hinge / lunge, barbell presses and rows, weighted pull-ups / dips), MODERATE (machine and dumbbell compounds, bodyweight pull-ups)".
- Hand-computed example: code: `hack_squat` (equipment kind `machine`) → HIGH and `isHeavyLower` true; `dumbbell_romanian_deadlift` (free-weight hinge) → moderate; `farmer_carry` → moderate; `plank` is already isolation → low without the loop.
- Verdict: INCONSISTENT
- Notes: minor. (a) a machine compound (hack squat) is HIGH although the rule says machine compounds are MODERATE; (b) the comment at exercises.ts:386 "Carries and core holds are compound in the library but cheap for the lifts that follow" has no effect: the loop names only `plank` (not compound), so the carry stays MODERATE. Proposed fix: either add "hack squat" to the rule text or move it to moderate; add `farmer_carry` to the loop or delete the comment.

##### F-3 Heavy lower-body lift
- Where: fatigue.ts:isHeavyLower (32–34)
- Formula as coded: pattern squat / hinge / lunge AND cost high.
- Meant to compute: lifts that load legs and spine heavily.
- Edge cases checked: leg press → false; hack squat → true (see F-2).
- Source: rules.ts `fatigue_cost`.
- Hand-computed example: no arithmetic.
- Verdict: CORRECT

##### F-4 Session load counts
- Where: fatigue.ts:sessionLoad (57–80)
- Formula as coded: per performed exercise: `workingSets += number of performed working sets`; `failureSets += sets with toFailure / RIR 0 / muscular / technical failure`; rep-drop sets = reps ≥ 3 below the previous set at the same weight (sets logged per side are skipped for this one only).
- Meant to compute: what has actually been done so far.
- Edge cases checked: planned sets ignored; sets logged per side.
- Source: CLAUDE.md C ("the i-th left and i-th right set pair into ONE set … 3 L + 3 R = 3 sets"); recovery.ts:171 ("A left + right pair to failure is one set, not two").
- Hand-computed example (a4 F2): standing single-leg curl, 2 left + 2 right sets to failure = 2 sets, 2 failure sets → same as 2 bilateral sets to failure (level `fresh`). Code: `workingSets 4, failureSets 4, level 'heavy'` (bilateral: 2, 2, `fresh`). 4 L + R pairs at RIR 2 = 4 sets → code: `workingSets 8, level 'moderate'` (4 bilateral sets: `fresh`). The muscle numbers in the same result are right (hamstrings 2).
- Verdict: INCONSISTENT
- Notes: the level feeds the exercise-choice warning for HIGH-cost lifts (exerciseChoice.ts:333), so unilateral work reaches "heavy" twice as fast. Proposed fix: weight both counts with `sideFactors` (as quality.ts / recovery.ts do).

##### F-5 Session load level
- Where: fatigue.ts:sessionLoad (81–83)
- Formula as coded: heavy when ≥ 2 heavy lower lifts, or ≥ 3 HIGH lifts, or ≥ 4 failure sets, or ≥ 3 rep-drop sets; moderate when ≥ 1 HIGH lift or ≥ 8 working sets; else fresh.
- Meant to compute: a summary label, "never a score".
- Edge cases checked: 7 vs 8 isolation sets (fresh / moderate); squat + RDL → heavy; bench + OHP + row → heavy; 3 vs 4 failure sets; reps 12, 9, 6, 3 → 3 drops → heavy; 12, 10, 8, 6 → 0 drops.
- Source: rules.ts `fatigue_cost`, `exercise_order` (classes only); the numeric limits are not in rules.ts.
- Hand-computed example: as listed. Code: same.
- Verdict: CORRECT BUT WEAKLY SUPPORTED

##### F-6 Significant muscles
- Where: fatigue.ts:significantMuscles (88–94)
- Formula as coded: resolved coefficients ≥ 0.5 (default), strongest first.
- Meant to compute: muscles that matter for recovery / choice.
- Edge cases checked: above-parallel squat → glutes and adductors 0.5.
- Source: CLAUDE.md C ("Only contributions ≥ 0.5 can make a session 'significant'"), J.
- Hand-computed example: back squat → quads 1, glutes 0.75, adductors 0.75; above parallel → 1 / 0.5 / 0.5. Code: same.
- Verdict: CORRECT

---

#### src/domain/equipmentMemory.ts

##### E-1 Machine picker counts and limits
- Where: equipmentMemory.ts:equipmentUsage (34–49), equipmentChoices (84–92)
- Formula as coded: `uses` = number of WORKOUTS a machine appears in (once per workout); `lastUsed` = latest workout date; "recent" = linked to the exercise, used before, most recent first, at most 3; each machine appears in one group only.
- Meant to compute: order of machines offered.
- Edge cases checked: the same machine twice in one workout → 1 use; 4 used machines → 3 recent + 1 in "this gym".
- Source: CLAUDE.md H ("favourites, recent for this exercise, this gym's equipment, then 'Not assigned to a gym'").
- Hand-computed example: machines used on 03-01 … 03-04 → recent = d, c, b; this gym = a; uses 1. Code: same.
- Verdict: CORRECT

### Group C — readiness, planner, individual volume, exercise choice

Records as written by the first reader (verdicts for the findings above were re-checked).

### Formula audit C — readiness.ts, planner.ts, volumeResponse.ts, exerciseChoice.ts

Read-only audit, 2026-11-23. All numbers are synthetic. Every "code returns" value was produced by running the
scratch scripts `s1.ts … s8.ts` in this folder with `npx vite-node` from the repo root (fixtures: `tests/fixtures.ts`,
`tests/sim/dataQuality.ts`). "DQ-14" = `dataQualityHistory({ sessions: 14 })`, now = 2 days after the last session.
Verdict scale: CORRECT · CORRECT BUT WEAKLY SUPPORTED (documented heuristic) · QUESTIONABLE · WRONG · INCONSISTENT.

Verdict count: CORRECT 17 · CORRECT BUT WEAKLY SUPPORTED 40 · QUESTIONABLE 7 · INCONSISTENT 6 · WRONG 3 (73 records).

---

### A. src/domain/readiness.ts

##### R1 Operating mode thresholds (LEARNING → PROVISIONAL → FULL)
- Where: readiness.ts:MODE_THRESHOLDS (37–44), readinessReport (197–199)
- Formula as coded: `prov = wd ≥ 8 && spanDays ≥ 21 && equipmentIdentified ≥ 0.8 && calibratedFrequent ≥ 3`; `full = prov && wd ≥ 10 && spanDays ≥ 28 && coverage ≥ 0.8`; mode = full ? 'full' : prov ? 'provisional' : 'learning'.
- Meant to compute: the operating mode from data quality, never from the calendar alone.
- Edge cases checked: 0 workouts → wd 0, span 0 → learning. 8 workouts over 16 days → learning (span). Full always implies provisional. Poorly documented history (12 workouts, no gym/times/effort) → wd 0 → learning.
- Source: rules.ts `planner_modes`; CLAUDE.md J "Operating modes".
- Hand-computed example: DQ sessions every 2,2,3 days. 8 sessions → span 16 d → learning; 10 sessions → offsets 0…21 → span 21 → provisional (28 not reached); 14 sessions → span 30, coverage 1 → full. Code: `learning / provisional / full` (s1) — equal.
- Verdict: CORRECT BUT WEAKLY SUPPORTED (heuristic thresholds, rule basis "heuristic", confidence low; code = CLAUDE.md).
- Notes: see R13 for the rules.ts wording.

##### R2 Counting window and span of well-documented training
- Where: readiness.ts:readinessReport (150–153)
- Formula as coded: `recent` = workouts with `0 ≤ diffDays(today, date) ≤ 84` and ≥ 1 exercise; `wd` = recent ∩ well-documented; `spanDays = diffDays(last wd date, first wd date)` (0 when none).
- Meant to compute: how many well-documented workouts exist and over how many days.
- Edge cases checked: one workout → span 0. Future-dated workouts excluded (diff < 0). The window is inclusive on both ends (85 calendar dates). A workout with exercises but no working set is in `recent` but never in `wd`.
- Source: readiness.ts header; `planner_modes` (no window stated in the rule).
- Hand-computed example: 10 DQ sessions, first 2026-09-07, last 2026-09-28 → span 21. Code: 21.
- Verdict: CORRECT BUT WEAKLY SUPPORTED (the 84-day window is an undocumented heuristic).
- Notes: —

##### R3 Well-documented workout
- Where: readiness.ts:documentationGaps (65–75), isWellDocumented (77)
- Formula as coded: working = performed sets of type 'working'. Gaps: none → `no_working_sets`; `!locationId` → no_gym; `!(startTime && (endTime || durationMin)) && no ticked set` → no_times; any working set with reps or weight null → missing_load_or_reps; `effortKnown / working < 0.7` → effort_missing. Well documented = no gaps.
- Meant to compute: whether a session is logged well enough to count toward a mode.
- Edge cases checked: only warm-ups → `['no_working_sets']`. Exactly 70 % → passes (7/10 = 0.7, not < 0.7). Planned sets ignored. durationMin 0 counts as missing. Bodyweight sets need weight 0 (not null), as the import convention requires.
- Source: CLAUDE.md J "Well-documented = gym, times/duration, every working set with weight + reps, effort on ≥ 70 % of sets".
- Hand-computed example: 10 sets, 7 with RIR → 0.7 → `[]`; 6 with RIR → 0.6 → `['effort_missing']`; no gym, no start, weight null → `['no_gym','no_times','missing_load_or_reps']`; start missing but one ticked set → `[]`. Code: identical (s1).
- Verdict: CORRECT BUT WEAKLY SUPPORTED (70 % is a heuristic; matches the documentation).
- Notes: —

##### R4 Effort known on a set
- Where: readiness.ts:effortKnown (62)
- Formula as coded: `rir != null || feel || effort || toFailure === true || failure === 'muscular'`.
- Meant to compute: whether a set carries any effort information.
- Edge cases checked: `failure: 'no_failure'` alone → false (it gives no RIR); `failure: 'muscular'` → true.
- Source: readiness.ts header ("effort (RIR / how it felt / failure)"); CLAUDE.md H (muscular failure ≈ RIR 0).
- Hand-computed example: set with only `failure:'no_failure'` → false; only `failure:'muscular'` → true. Code: false / true (s1).
- Verdict: CORRECT
- Notes: —

##### R5 Calibrated (comparable) session
- Where: readiness.ts:calibratedSession (97–105)
- Formula as coded: session representative; `bench` = benchmark sets with reps; non-empty; `effort = (bench with rir != null || feel || effort) / bench ≥ 0.6`; `load = indexKind === 'reps' || some bench set has a weight`; result `effort && load`.
- Meant to compute: whether a session counts toward calibration of an exercise × machine × configuration.
- Edge cases checked: no benchmark set → false. Failure sets count because progression fills `rir` with the failure-implied RIR (progression.ts:209). Bodyweight (reps index) needs no weight.
- Source: CLAUDE.md J "(effort on ≥ 60 % of their sets)"; rules.ts `planner_calibration`.
- Hand-computed example: poor DQ history rates 1 set in 5 → 0.2–0.33 < 0.6 → 0 comparable sessions, 0 calibrated. Code: `calFreq 0` (s3).
- Verdict: CORRECT BUT WEAKLY SUPPORTED (60 % heuristic; denominator is benchmark sets only, which is the stricter, sensible reading).
- Notes: —

##### R6 Calibration level per exercise × machine × configuration
- Where: readiness.ts:levelFor (95), keyReadiness (107–119)
- Formula as coded: `comparable` = calibrated sessions with `0 ≤ diffDays(today, date) ≤ 56`; machine-type exercise without equipment id → 0. Level: ≥ 4 WELL_CALIBRATED, 2–3 SUFFICIENT, 1 DEVELOPING, 0 INSUFFICIENT_DATA.
- Meant to compute: how well a history is calibrated.
- Edge cases checked: 0 → INSUFFICIENT; exactly 1 → DEVELOPING; machine exercise with no machine → 0 whatever was logged; window inclusive (57 dates).
- Source: CLAUDE.md J "0 INSUFFICIENT DATA, 1 DEVELOPING, 2–3 SUFFICIENT, ≥ 4 WELL CALIBRATED"; rules.ts `planner_calibration`.
- Hand-computed example: DQ-14 with pec deck moved to machine B in the last session: pd_a 13 → WELL, pd_b 1 → DEVELOPING. Code: `['pec_deck::pd_b',1,'DEVELOPING']`, `['pec_deck::pd_a',13,'WELL_CALIBRATED']` (s5).
- Verdict: CORRECT BUT WEAKLY SUPPORTED (heuristic levels; code = documentation).
- Notes: —

##### R7 Regular ("frequent") exercise
- Where: readiness.ts:keyReadiness (112, 116); MODE_THRESHOLDS.frequentShare (43)
- Formula as coded: `share = distinct workouts of this history in 56 d ÷ workouts (with ≥ 1 exercise) in 56 d` (0 when none); `frequent = share ≥ 0.3 && sessions in window ≥ 2`.
- Meant to compute: whether an exercise is part of the owner's regular routine.
- Edge cases checked: no recent workouts → share 0; a history used once → never frequent.
- Source: readiness.ts header ("≥ 3 frequent exercises"); `planner_modes`.
- Hand-computed example: pd_b used in 1 of 14 → 0.07 → not frequent; pd_a 13/14 = 0.93 → frequent. Code: 0.07 false / 0.93 true (s5).
- Verdict: CORRECT BUT WEAKLY SUPPORTED (30 % is an undocumented heuristic).
- Notes: the planner library (P2) uses the same thresholds with a slightly different denominator (all earlier workouts in 56 d, including empty ones) — no practical difference found.

##### R8 Share of machine exercises linked to a machine
- Where: readiness.ts:readinessReport (158–166, 197)
- Formula as coded: over all exercise entries of `recent` whose registry kind ∈ {machine, plate_loaded, cable, smith}: `equipmentIdentified = entries with equipmentId ÷ entries` (1 when there are none); threshold ≥ 0.8.
- Meant to compute: whether loads can be tied to physical machines.
- Edge cases checked: no machine exercises → 1 (does not block). Unknown exercise ids are skipped. Entries without performed sets are counted too.
- Source: CLAUDE.md J "≥ 80 % of machine exercises linked to a machine".
- Hand-computed example: poor DQ, 12 workouts × 3 machine entries = 36; pec deck unlinked in 6 → 30/36 = 0.8333. Code: 0.8333333333333334 (s3).
- Verdict: CORRECT BUT WEAKLY SUPPORTED (heuristic threshold; code = CLAUDE.md).
- Notes: —

##### R9 Regular exercises calibrated (≥ 3)
- Where: readiness.ts:readinessReport (169, 197, 205)
- Formula as coded: `calibratedFrequent = keys with frequent && level ≥ SUFFICIENT`; threshold ≥ 3.
- Meant to compute: enough regular exercises with ≥ 2 comparable sessions.
- Edge cases checked: counts histories (exercise × machine × configuration), so one exercise at two bench angles could count twice; two sessions are enough (2 DQ sessions → 7).
- Source: CLAUDE.md J "≥ 3 regular exercises calibrated".
- Hand-computed example: DQ-14 → 7 histories, all frequent and WELL → 7. Code: 7 (s1).
- Verdict: CORRECT BUT WEAKLY SUPPORTED
- Notes: —

##### R10 Muscle readiness level
- Where: readiness.ts:readinessReport (179–188)
- Formula as coded: direct = histories whose BASE coefficient for the muscle ≥ 0.75; best = highest level, then most comparable; `directSessions8w` = workouts in 56 d with a performed working set on such an exercise. Level: none → INSUFFICIENT; best WELL and directSessions8w ≥ 4 → WELL; best ≥ SUFFICIENT → SUFFICIENT; best.comparable > 0 or directSessions8w > 0 → DEVELOPING; else INSUFFICIENT.
- Meant to compute: whether the planner can plan a muscle with calibrated loads (`plannable` = ≥ SUFFICIENT).
- Edge cases checked: muscle never trained directly → INSUFFICIENT; trained once → DEVELOPING.
- Source: readiness.ts comments; `planner_modes` (coverage part).
- Hand-computed example: DQ-14 + dumbbell curl once (2 sets, RIR 2) → biceps: 1 comparable, 1 direct session → DEVELOPING; chest 14/14 → WELL. Code: `['biceps','DEVELOPING',1]`, `['chest','WELL_CALIBRATED',14]` (s3).
- Verdict: CORRECT BUT WEAKLY SUPPORTED
- Notes: uses base coefficients (not variation-resolved), unlike the planner library — only matters for steep-incline presses and above-parallel squats.

##### R11 Coverage of major-muscle targets
- Where: readiness.ts:MAJOR_MUSCLES (47), readinessReport (191–195)
- Formula as coded: trained = major muscles (chest, lats, upper_back, side_delts, biceps, triceps, quads, hamstrings, glutes, abs) with directSessions8w ≥ 1; `coverage = Σ preferred(trained with level ≥ SUFFICIENT) ÷ Σ preferred(trained)`; 0 unless ≥ 4 trained majors; threshold ≥ 0.8.
- Meant to compute: share of the trained major muscles' weekly targets covered by calibrated exercises.
- Edge cases checked: < 4 trained majors → 0 (FULL impossible); total 0 → 0; untrained majors do not lower coverage.
- Source: CLAUDE.md J "calibrated exercises cover ≥ 80 % of the trained major muscles' targets"; `planner_modes`.
- Hand-computed example: DQ-14 + one biceps session. Preferred: chest 15, lats 11, side delts 9, biceps 4.5, triceps 10.5, quads 9, hamstrings 9, glutes 7 → total 75; biceps not covered → 70.5 / 75 = 0.94. Code: 0.94 (s3).
- Verdict: CORRECT BUT WEAKLY SUPPORTED (the "≥ 4 trained majors" guard is not in CLAUDE.md or rules.ts).
- Notes: —

##### R12 Area readiness levels (display)
- Where: readiness.ts:readinessReport (213–226)
- Formula as coded: `lv(n,a,b,c)`: n ≥ c WELL, ≥ b SUFFICIENT, ≥ a DEVELOPING. Exercise history lv(wd,3,8,12); equipment calibration lv(histories ≥ SUFFICIENT,1,3,6); strength data lv(histories with a trend,1,3,6); frequency lv(weeks with training,2,3,6); weekly volume history lv(complete weeks with data,1,4,8); recovery information: times known ≥ 0.7 → (subjective entries ≥ max(3, 0.3 × recent) ? WELL : SUFFICIENT), > 0 → DEVELOPING; preference consistency lv(frequent histories,1,3,5).
- Meant to compute: seven descriptive labels; none gates a mode.
- Edge cases checked: no workouts → all INSUFFICIENT. A workout whose only gap is `no_working_sets` counts as "times known" (line 213) — display only.
- Source: none in rules.ts / CLAUDE.md (undocumented heuristics).
- Hand-computed example: DQ-14: wd 14 ≥ 12 → WELL; 7 calibrated ≥ 6 → WELL; 5 weeks → SUFFICIENT; 4 complete weeks → SUFFICIENT; times 100 %, 0 subjective < max(3, 4.2) → SUFFICIENT; 7 frequent ≥ 5 → WELL. Code: identical (s1).
- Verdict: CORRECT BUT WEAKLY SUPPORTED
- Notes: —

##### R13 rules.ts text for the modes
- Where: src/data/scientific-evidence/rules.ts:258 (`planner_modes`) vs readiness.ts:38, 197
- Formula as coded: PROVISIONAL needs `equipmentIdentified ≥ 0.8` (share of MACHINE exercise entries with a machine id). The gym is part of "well-documented".
- Meant to compute: —
- Edge cases checked: —
- Source: rules.ts `planner_modes`: "LEARNING until ≥ 8 well-documented workouts over ≥ 21 days with gyms identified and ≥ 3 frequent exercises calibrated"; CLAUDE.md J: "≥ 80 % of machine exercises linked to a machine".
- Hand-computed example: poor DQ history: no gym on any workout, machines linked on 83 % of entries → the code's machine condition passes (0.833 ≥ 0.8) while "gyms identified" is false.
- Verdict: INCONSISTENT (rules.ts text ≠ code and CLAUDE.md)
- Notes: the rule registry names the wrong condition and omits the 80 % threshold. Proposed fix: reword `planner_modes` to "… with ≥ 80 % of machine exercises linked to a machine and ≥ 3 regular exercises calibrated"; value "8 / 21 d / 80 % → 10 / 28 d + 80 %".

---

### B. src/domain/planner.ts

##### P1 Median helper
- Where: planner.ts:med (72–77)
- Formula as coded: sorted; odd → middle; even → mean of the two middle values; empty → null.
- Meant to compute: median of session sizes / positions.
- Edge cases checked: [] → null; one value → itself.
- Source: —
- Hand-computed example: usual working sets of DQ sessions (all 19) → 19. Code: `usualSets: 19` (s1).
- Verdict: CORRECT
- Notes: —

##### P2 Personal library entry (status, share, position, recency)
- Where: planner.ts:buildLibrary (81–116)
- Formula as coded: per history key: `share = workouts with it in 56 d ÷ earlier workouts in 56 d`; status: `share ≥ 0.3 && recent ≥ 2` frequent; else `recent ≥ 1 && sessions ≥ 3` occasional; else `sessions ≤ 2` tried; else old. `medianPosition` = median of i ÷ (performed exercises − 1) (0 when alone). `recent6` = sessions among the last 6 workouts. `preferred` = id in PREFERRED_EXERCISE_IDS or on a favourite machine.
- Meant to compute: what the owner actually does, how often and where in the session.
- Edge cases checked: no history → []; exercise alone in a session → position 0; only planned sets → not performed, ignored.
- Source: CLAUDE.md J (planner: "familiar, available, recent exercises"); no rule id for the thresholds.
- Hand-computed example: DQ-14 with machine B in the last session: pd_b 1 session, share 1/14 = 0.07 → tried, recent6 1; pd_a 13/14 = 0.93 → frequent, recent6 5, position 2/6 = 0.33. Code: identical (s5).
- Verdict: CORRECT BUT WEAKLY SUPPORTED
- Notes: —

##### P3 Usual session size in working sets
- Where: planner.ts:sessionPatterns (123)
- Formula as coded: `usualSets = med(per workout in 56 d: number of performed sets with type 'working')` (workouts with 0 excluded).
- Meant to compute: the owner's usual number of working sets per session (base of the session ceiling, P10).
- Edge cases checked: no history → null (ceiling 24). Left/right logging: each side is counted as a set.
- Source: CLAUDE.md C "the i-th left and i-th right set pair into ONE set … 3 L + 3 R = 3 sets"; CLAUDE.md J "session near the owner's usual size".
- Hand-computed example: 3 workouts, each standing leg curl 3 L + 3 R and pec deck 3 sets. By the pairing rule 3 + 3 = 6 sets. Code: `usualSets = 9` (s2).
- Verdict: INCONSISTENT (code ≠ CLAUDE.md C; the same file uses `countedSetCount` for adherence at 637)
- Notes: expected 6, actual 9 → the ceiling becomes max(8, round(9 × 1.15)) = 10 instead of 8, so the planner allows more sets than the owner's real sessions. `medianDurationMin` on the next line uses `durationMin` only (null when only start + end are logged) and is not read anywhere. Proposed fix: sum `countedSetCount(e.sets, ['working'])` per exercise.

##### P4 Learning from plan decisions
- Where: planner.ts:planPreferences (144–169); use at 344, 360–361
- Formula as coded: per gym × exercise: count decisions with action replaced / skipped, reason not 'busy' and not 'pain' → `avoid` when ≥ 3; replacements chosen ≥ 3 × → `prefer`. Reason 'pain' within `diffDays(today, date) ≤ 7` → `painHold` (never a preference). Score effect: prefer +4, avoid −10; painHold excludes the exercise from the familiar path.
- Meant to compute: stable preferences from repeated choices; a short safety hold after pain.
- Edge cases checked: 2 repeats → nothing; busy ×3 → nothing; later / reorder → nothing; pain 7 days ago → held, 8 days → not held.
- Source: rules.ts `planner_learning`; CLAUDE.md J E.9.
- Hand-computed example: 3 workouts with pec deck skipped "busy" → no avoid; pain skip, today = +7 d → `['pec_deck']`, +8 d → `[]`. Code: identical (s2, s8).
- Verdict: CORRECT BUT WEAKLY SUPPORTED
- Notes: see P4b and P12b.

##### P4b Skips for lack of time count as "avoid"
- Where: planner.ts:planPreferences (155)
- Formula as coded: only `reason === 'busy'` and `'pain'` are excluded; `reason: 'time'` and decisions without a reason count.
- Meant to compute: preferences, not logistics.
- Edge cases checked: —
- Source: rules.ts `planner_learning` ("Substitutions because equipment was busy, and pain-related skips, never count"); types.ts:221 `PlanDecisionReason = 'busy' | 'time' | 'preference' | 'pain'`.
- Hand-computed example: lateral raise skipped with reason 'time' in 3 workouts → by "preference only" expected no avoid; code: `avoid = { gym_a: ['lateral_raise'] }` (s2) → −10 score from then on.
- Verdict: QUESTIONABLE
- Notes: the code matches the rule's literal text, but running out of time is logistics, like a busy machine; the last exercises of a session are the ones skipped for time, so they get pushed out of future plans. Alternative: count only reason 'preference' (or no reason) as avoid; treat 'time' like 'busy'.

##### P5 Session budget per muscle
- Where: planner.ts:generateWorkout (248–259)
- Formula as coded: `todayBlocked → 0` (named "recovering (~h left)" for major muscles with a remaining weekly need); else `open = max(0, todayShare − doneToday)`; open 0 and status done / over → "weekly target met".
- Meant to compute: effective sets still open today per muscle; never catch-up.
- Edge cases checked: nothing logged → todayShare 0 everywhere → empty plan; blocked → 0 even with a weekly deficit; second session today → doneToday subtracted.
- Source: CLAUDE.md J "session budget = today's share − done today (0 while recovering)"; rules.ts `planner_session_allocation`.
- Hand-computed example: DQ-14: chest preferred 15, share 5, done 0 → 5; triceps 3.5; quads 3. Code: `chest: 5, triceps: 3.5, quads: 3` (s1).
- Verdict: CORRECT
- Notes: raw difference (no rounding); compare E7.

##### P6 Which muscle is served next (need ranking)
- Where: planner.ts:35 (MIN_OPEN), 276–277, 336–340
- Formula as coded: candidates = directly trained muscles with remaining ≥ 1.5; sort by `remaining × priorityMult × sizeMult` desc; priorityMult high 1.3 / maintain 0.6 / else 1; sizeMult large 1.15 / medium 1.05 / small 1.
- Meant to compute: greedy order of muscle needs; leftovers < 1.5 carry over.
- Edge cases checked: nothing ≥ 1.5 → loop ends; at most 30 iterations.
- Source: comments only; no rule id for the multipliers (rules.ts `planner_session_allocation` covers the principle).
- Hand-computed example: DQ-14 + glutes high: glutes 3.5 × 1.3 × 1.15 = 5.23 > quads 3 × 1.15 = 3.45 → glutes are served before quads. Code: squat is added with "Glutes: 3.5 effective sets open today." (s6).
- Verdict: CORRECT BUT WEAKLY SUPPORTED
- Notes: analysis.ts:236, 250 (legacy `planNextWorkout`, not read by any screen) ranks with different constants (maintain 0.5, large 1.1, no medium factor) — harmless today, worth deleting or aligning.

##### P7 Directly trained muscles
- Where: planner.ts:generateWorkout (318–323)
- Formula as coded: the 10 major muscles plus every muscle for which a library exercise used in the last 8 weeks has a resolved coefficient ≥ 0.75.
- Meant to compute: which muscles may pull an exercise into the plan (indirect-only muscles never do).
- Edge cases checked: empty library → majors only.
- Source: planner.ts comment; CLAUDE.md J.
- Hand-computed example: DQ-14: squat gives adductors 0.75 → adductors are "directly trained"; erectors (0.25) are not. Plan: no item with primary erectors; erectors credited 0.75 from squats. Code: `spinal_erectors: 0.75` in `planned`, no own item (s1).
- Verdict: CORRECT
- Notes: —

##### P8 Candidate filters and familiarity score
- Where: planner.ts:generateWorkout (341–369), availableKey (263–272)
- Formula as coded: candidate = library entry, not used / excluded / pain-held, resolved coefficient for the need muscle ≥ 0.75, available here, no OTHER muscle with coefficient ≥ 0.5 that is blocked, no OTHER muscle with coefficient ≥ 0.75 whose remaining < 1. Score = `min(sessions8w, 8) × 0.75 + recent6 × 2 + {0,1,3,4}[calibration] × 2`; −4 if recent6 = 0 and sessions8w > 0; +3 preferred; +2 frequent; −3 old; +4 preferred at this gym; −10 avoided here; −2 only used at other gyms; −1.5 per other muscle with coefficient ≥ 0.5 and remaining ≤ 0; −0.5 if done in the very last session. Highest score wins; ties keep library order.
- Meant to compute: the familiar, available, recently used exercise for a need.
- Edge cases checked: no candidate → unfamiliar path / skip (P11, P12).
- Source: CLAUDE.md J "familiar, available, recent exercises"; no rule id for the weights.
- Hand-computed example: DQ-14, chest: incline DB press = 8 × 0.75 + 6 × 2 + 4 × 2 + 3 + 2 − 0.5 = 30.5; pec deck = 30.5; tie → library order → incline press. Code: the chest item is incline_dumbbell_press (s1). (Scores are internal; only the outcome can be observed.)
- Verdict: CORRECT BUT WEAKLY SUPPORTED
- Notes: —

##### P9 Set count per planned exercise and the overshoot rule
- Where: planner.ts:addItem (283–290), filter at 353; compare replanPending (536–542)
- Formula as coded: `need = remaining[targetMuscle]` (the muscle being served, not the exercise's strongest muscle); `sets = max(2, min(maxSets, round(need ÷ max(coefT, 0.25))))`, maxSets 4 isolation / 5 compound; `while sets > 2 && sets × coefT > need + 0.5: sets−−`; then `max(2, min(sets, room))`. Every muscle's remaining is reduced by sets × coefficient. Other muscles with coefficient ≥ 0.75 are only protected by the filter "remaining ≥ 1".
- Meant to compute: sets for the whole session, fractional contributions, no direct-muscle overshoot.
- Edge cases checked: need 1.5, coefficient 1 → 2 sets (2 ≤ 2.0); need 0 on a forced item → 2 sets; need 8, isolation → 4 (cap).
- Source: rules.ts `planner_session_allocation` ("… without overshoot"); CLAUDE.md J ("no direct-muscle overshoot"); tests/part5-planner.test.ts:127 (direct muscle ≤ open share + 1).
- Hand-computed example (a) normal: DQ-14 chest 5, incline press coefficient 1 → 5 sets; triceps 3.5 − 2.5 = 1 < 1.5 → no pushdown. Code: 5 sets, no pushdown (s1). (b) DQ-14 with ONLY glutes set to high priority: budget quads 3, glutes 3.5. Squat is picked for glutes: round(3.5 ÷ 0.75) = 5; 5 × 0.75 = 3.75 ≤ 4.0 → 5 sets → quads get 5 against an open share of 3. Expected by the rule: ≤ 3 (+ 0.5). Code: `squat planned 5 … planned quads 5`, and `replanPending` with nothing done returns 3 for the same card (s6). With manual targets (glutes 14, quads 8): quads budget 2, planned 5, re-assessment 2 (s3).
- Verdict: INCONSISTENT (code ≠ rules.ts / CLAUDE.md "no direct-muscle overshoot"; generateWorkout and replanPending compute the same card differently)
- Notes: two causes. (1) Sets are sized on the muscle being served, while the exercise's strongest muscle (quads, coefficient 1) is only checked for "≥ 1 open". (2) replanPending always sizes on the strongest muscle and walks the cards in display order, generateWorkout in greedy-selection order — so the first tick of a session rewrites untouched cards (5 → 3 squat sets; also pushdown 4 → 3 with triceps budget 5.5, s6 TP=12.5). Proposed fix: in addItem cap sets so that no muscle with coefficient ≥ 0.75 exceeds its remaining + 0.5 (i.e. `sets ≤ min over direct muscles of (remaining + 0.5) ÷ coefficient`), and after ordering run the same allocation routine that replanPending uses so the plan and the first re-assessment agree.

##### P10 Session size ceiling
- Where: planner.ts:generateWorkout (279, 289, 331, 336); exerciseChoice.ts:usualExerciseCount
- Formula as coded: `maxItems = usualCount` (3…8, default 5); `maxSets = usualSets != null ? max(8, round(usualSets × 1.15)) : 24`; the loop adds items while `items < maxItems && totalSets ≤ maxSets − 2`; each item is cut to the room left (never below 2).
- Meant to compute: a session near the owner's usual size.
- Edge cases checked: no history → 5 items / 24 sets; usual 6 sets → floor 8.
- Source: CLAUDE.md J "session near the owner's usual size"; tests/part5-review.test.ts:119 (≤ +15 %).
- Hand-computed example: DQ-14: usual 19 sets → round(21.85) = 22; usual 7 exercises. Plan: 3 + 5 + 5 + 3 + 3 = 19 sets, 5 items. Code: 19 sets, 5 items (s1).
- Verdict: CORRECT BUT WEAKLY SUPPORTED (+15 % and the floor of 8 are heuristics)
- Notes: inherits P3 and E1.

##### P11 "No familiar exercise available here" when the option was rejected for overshoot
- Where: planner.ts:generateWorkout (353, 394–396)
- Formula as coded: a candidate is dropped when another muscle with coefficient ≥ 0.75 has remaining < 1; if nothing is left the muscle is skipped with reason `held ? 'familiar options also load … (recovering)' : 'no familiar exercise available here'`.
- Meant to compute: why a major muscle gets no exercise today.
- Edge cases checked: —
- Source: rules.ts `planner_session_allocation`; CLAUDE.md J (skipped muscles named with the reason).
- Hand-computed example: DQ-14, glutes weekly target already met (manual target 1), quads open 3, squat is the only familiar quad exercise and is available. Expected: squat for quads (or a reason that names the glutes). Code: no quad item; `skipped = [{glutes: 'weekly target met'}, {quads: 'no familiar exercise available here'}]` (s2).
- Verdict: QUESTIONABLE
- Notes: the stated reason is false (the squat is familiar and available), and a 3-set quad need goes unserved because of a 0.75 co-muscle. Alternative: allow the exercise with the set count capped by the co-muscle's tolerance, or at least report "would exceed today's share for glutes".

##### P12 Unfamiliar exercise only for a persistent deficit
- Where: planner.ts:generateWorkout (325–328, 380–392)
- Formula as coded: only when no familiar candidate: `remaining ≥ 2 && major muscle && targets[m].source !== 'reference' && persistent(m)`; persistent = the last 2 complete weeks both below `targets[m].min`. Seed: base coefficient ≥ 1, no blocked muscle with coefficient ≥ 0.5, available (machine only if known here), sorted by known here, then sessions logged, then isolation for small muscles / compound otherwise.
- Meant to compute: when a new exercise may be proposed.
- Edge cases checked: provisional (reference) target → never; one complete week → never. Empty weeks of a break count as "below min".
- Source: CLAUDE.md J "unfamiliar exercises only for a persistent deficit against the owner's OWN target".
- Hand-computed example: DQ-14 without incline press, chest target set by hand to 20–24–30 (two weeks at ~6 < 20), pec deck pain-held: chest need ≥ 2, own target, persistent → an unfamiliar item is added. Code: machine_chest_press 5 sets with "below the lower end of its weekly range for 2 weeks…" (s2).
- Verdict: CORRECT BUT WEAKLY SUPPORTED
- Notes: see P12b.

##### P12b Pain hold is bypassed by the unfamiliar path
- Where: planner.ts:generateWorkout (382–390) vs 344
- Formula as coded: the familiar path skips `prefs.painHold`; the seed list filters only `usedEx` and `exclude`, and sorts by sessions logged — so a pain-held exercise the owner knows well ranks first.
- Meant to compute: "Exercises with a pain-related skip/replace in the last 7 days (safety, not preference)" must not be planned (planner.ts:136).
- Edge cases checked: —
- Source: planner.ts:136 comment; CLAUDE.md J ("Pain = a separate SAFETY line"; "'busy' and 'pain' never count as preferences").
- Hand-computed example: scenario of P12; pec deck skipped for pain 2 days ago, 14 sessions logged. Expected: pec deck not in the plan. Code: `['pec_deck','pd_a', 4 sets, familiar: false, safety: null, "… no familiar exercise available here — new to you, so it starts calibrating."]` (s2).
- Verdict: WRONG
- Notes: the held exercise is planned 2 days after the pain skip, labelled "new to you" although it has 14 sessions, and carries no safety line (safetyLine reads pain on sets, not plan decisions). The same path also ignores the overshoot filter (P11). Proposed fix: apply `prefs.painHold` (and the avoid list) to the seed filter; exclude exercises that are in the library from the "new to you" path or word the reason accordingly.

##### P13 Exercise order
- Where: planner.ts:generateWorkout (400–403)
- Formula as coded: sort by (primary muscle has priority 'high') desc, fatigue rank high → moderate → low, usual median position, muscle size large → small.
- Meant to compute: demanding lifts first unless a muscle is prioritised.
- Edge cases checked: no usual position → 0.5.
- Source: rules.ts `exercise_order`, `fatigue_cost`; CLAUDE.md J (order is performance protection, not a growth rule).
- Hand-computed example: DQ-14: squat (high) → incline press, pull-up (moderate; positions 0.17, 1.0) → leg curl, lateral raise (low; 0.5, 0.67). With side delts high: lateral raise first. Code: identical (s1, s5).
- Verdict: CORRECT BUT WEAKLY SUPPORTED
- Notes: the rule text says "larger muscles first" and lets "the largest recovered weekly deficit" count as a priority; the planner puts the usual position before muscle size and uses only the explicit setting. Small wording gap, no wrong result found.

##### P14 Returning after a break
- Where: planner.ts:generateWorkout (410–413); prescription.ts:278–296 (the load step)
- Formula as coded: `daysOff = diffDays(today, last workout before today)`; `returning = daysOff ≥ 10`; `stepDown = daysOff > 14` (prescribe() lowers the load one real step).
- Meant to compute: a flagged, slightly lighter first session back; no catch-up volume.
- Edge cases checked: no earlier workout → null; 14 → no step-down; 15 → step-down; any earlier workout counts, even an empty one.
- Source: rules.ts `planner_returning`; CLAUDE.md J "≥ 10 days off → returning; > 14 → one step down".
- Hand-computed example: 9 d → null; 10 d → returning, loads kept (squat 90, press 32.5); 14 d → same; 15 d → step-down: squat 87.5, press 30. Code: identical (s2).
- Verdict: CORRECT BUT WEAKLY SUPPORTED (heuristic; code = documentation)
- Notes: —

##### P15 Calibration label of a plan item
- Where: planner.ts:generateWorkout (429–431)
- Formula as coded: no working weight and not bodyweight_plus → needs_data; readiness level of the item's key SUFFICIENT / WELL (≥ 2 comparable sessions) → calibrated; else provisional.
- Meant to compute: calibrated / provisional / calibrate (no kg).
- Edge cases checked: new machine → needs_data, no kg transferred; bodyweight without history → provisional.
- Source: rules.ts `planner_calibration`.
- Hand-computed example: DQ-14: every item has 14 comparable sessions → calibrated. Code: all `calibrated` (s1).
- Verdict: CORRECT BUT WEAKLY SUPPORTED
- Notes: —

##### P16 Stage and notes
- Where: planner.ts:generateWorkout (447–451)
- Formula as coded: full → 'complete', provisional → 'prescriptions', learning → 'suggestions' (+ note).
- Meant to compute: how the proposal is labelled per mode.
- Edge cases checked: empty plan with history → "Nothing is open today" note.
- Source: CLAUDE.md J.
- Hand-computed example: DQ-14 → full → complete. Code: `stage complete full` (s8).
- Verdict: CORRECT
- Notes: —

##### P17 Start from a plan (edits before Start)
- Where: planner.ts:workoutFromPlan (478–502)
- Formula as coded: sets per card = edit ? clamp(edit.sets, 0, 8) : setCount; each set planned, reps = repsMin, weight = edited weight or prescribed; `plannedCount` only on unedited cards; fallback prototype 10–12 reps, RIR 1–2.
- Meant to compute: the live workout; what was prescribed stays on `prescribed`.
- Edge cases checked: sets 12 → 8; −1 → 0; weight-only edit keeps the count but drops plannedCount.
- Source: CLAUDE.md J ("Start stores the plan in Workout.generated … Edit"), H (`prescribed` written by the app).
- Hand-computed example: edits {0: sets 12, 1: sets −1, 2: weight 7.5} on a 3/5/5/3/3 plan → 8, 0, 5, 3, 3; plannedCount undefined on the first three. Code: `[8,0,5,3,3]`, `[undefined ×3, 3, 3]`, weight 7.5 vs prescribed 0 (s8).
- Verdict: CORRECT
- Notes: —

##### P18 Live re-assessment: sets for a pending exercise
- Where: planner.ts:replanPending (520–553)
- Formula as coded: `open[m] = blocked ? 0 : max(0, todayShare − (this session's effective + other sessions today))`; for each exercise without a performed working set, in card order: primary = strongest coefficient; `n = need ÷ coef < 0.5 ? 0 : max(1, min(maxSets, round(need ÷ coef)))`; `while n > 1 && n × coef > need + 0.5: n−−`; open reduced by n × every coefficient.
- Meant to compute: what the not-yet-started cards should be after what was really done.
- Edge cases checked: nothing done → same as the plan in the plain case; share covered → 0 sets "optional now"; skipped cards ignored; minimum 1 set (the generator's minimum is 2).
- Source: rules.ts `planner_live_reassessment`; CLAUDE.md J E.9.
- Hand-computed example: chest share 5. Pec deck done first, 3 sets RIR 1 → need 2 → press 2 sets; 4 sets → 1; chest done 4.3 → need 0.7 → 1; done 4.6 → 0.4 < 0.5 → 0. Code: 2 / 1 / 1 / 0 (s5).
- Verdict: CORRECT BUT WEAKLY SUPPORTED
- Notes: see P9 (plan vs re-assessment) and P18b.

##### P18b Re-assessment ignores the unticked planned sets of an exercise in progress
- Where: planner.ts:replanPending (533)
- Formula as coded: an exercise with ≥ 1 performed working set is neither re-prescribed nor subtracted: only its ticked sets reduce `open`.
- Meant to compute: remaining need for the cards not started.
- Edge cases checked: —
- Source: rules.ts `planner_live_reassessment` ("sets from the open share minus completed contributions") vs `planner_session_allocation` ("covered by fractional contributions of all planned exercises, without overshoot").
- Hand-computed example: triceps share 4.5; plan: incline press 5 sets (triceps 2.5) + pushdown 2 sets. Following the plan exactly, the pushdown card should stay at 2. Code after 1 / 2 / 3 / 4 / 5 ticked press sets: 4 / 4 / 3 / 3 / 2 (s6, TP=11.5); applyPendingUpdate writes each of these to the untouched card.
- Verdict: QUESTIONABLE
- Notes: the code does what its comment says, but a card doubles the moment the owner starts the exercise before it and shrinks back set by set. Alternative: count an in-progress exercise's untouched planned sets as expected contributions (credit them at the planned count) when sizing the cards after it.

##### P19 Untouched planned sets and applying an update
- Where: planner.ts:untouchedPlanned (556–558), applyPendingUpdate (564–579)
- Formula as coded: untouched = planned, prescribed kind working, weight = prescribed weight, reps = prescribed repsMin, no RIR, no feel. Update only when `plannedCount` is set, working-set count equals it, every working set untouched, no per-side sets, and the new prescription differs; warm-ups kept; new plannedCount = new count.
- Meant to compute: update untouched cards only; never overwrite the owner's edits.
- Edge cases checked: edited reps / RIR / ticked → not untouched; a set removed by the owner → null; no plannedCount → null; identical prescription → null; new count 0 → card emptied (plannedCount 0) and restorable later.
- Source: rules.ts `planner_live_reassessment`; CLAUDE.md J ("only untouched planned sets are updated, edited ones never").
- Hand-computed example: untouched true; reps + 1 → false; RIR 2 → false; ticked → false; fewer sets (1) on a 3-set card → 1 set; with one set removed → null. Code: identical (s5).
- Verdict: CORRECT
- Notes: —

##### P20 Replacement options
- Where: planner.ts:replacementOptions (589–622)
- Formula as coded: same exercise on another free machine at this gym; other exercises with base coefficient ≥ 0.75 for the same primary, available, not in the session, familiar or known here, no blocked muscle with coefficient ≥ 0.5; sort: same exercise first, ≥ 2 sessions, more sessions; first 3.
- Meant to compute: what to do instead when a machine is busy or the owner prefers something else.
- Edge cases checked: unknown exercise → []; busy machines excluded; unassigned machines (no gym) are not offered when a gym is set.
- Source: planner.ts comment (≤ 3); CLAUDE.md J ("Machine busy … alternatives on free equipment").
- Hand-computed example: DQ-14, pec deck A busy → pec deck B (same exercise, 0 sessions), incline DB press (14), machine chest press (0, known here). Code: identical order, 3 options (s5).
- Verdict: CORRECT BUT WEAKLY SUPPORTED
- Notes: —

##### P21 Plan adherence — "fewer sets" cannot be detected
- Where: planner.ts:planAdherence (636–641)
- Formula as coded: `nDone = countedSetCount(performed working sets)`; `nPlanned = countedSetCount(working sets with a working prescription) || snapshot sets`; fewer_sets when nDone < nPlanned.
- Meant to compute: followed / more_sets / fewer_sets / weight_changed / reps_changed per plan item, "compared with what was prescribed on the sets".
- Edge cases checked: `countedSetCount` drops planned (unticked) sets, so nPlanned counts only PERFORMED sets that carry a prescription → nPlanned ≤ nDone whenever any performed set has one. The snapshot fallback is used only when nPlanned = 0.
- Source: planner.ts:635 comment; CLAUDE.md J (plan stored separately from what is performed).
- Hand-computed example: squat planned 3 sets; 1 ticked, 2 left unticked → expected fewer_sets. Code: `followed`; the same after the unticked sets are dropped at Finish (s1). 2 of 3 → `followed`.
- Verdict: WRONG
- Notes: for a card started from a plan the result can only be followed / more_sets / weight_changed / reps_changed. Not read by any screen today (tests only), so no visible effect yet. Proposed fix: count prescribed working sets without the planned filter while the session is live, and keep the last prescribed count on the exercise (e.g. `plannedCount`) so a finished workout can still be compared.

##### P22 Rounding in the plan
- Where: planner.ts:294, 445, 457
- Formula as coded: contribution = round(sets × coefficient × 100) / 100; planned per muscle = running sum rounded to 2 decimals; texts use 1 decimal.
- Meant to compute: display values.
- Edge cases checked: 0.25 × 3 = 0.75 kept; no negative values (remaining is floored at 0).
- Source: —
- Hand-computed example: squat 3 sets → quads 3, glutes 2.25, adductors 2.25, erectors 0.75. Code: identical (s1).
- Verdict: CORRECT
- Notes: —

---

### C. src/domain/volumeResponse.ts

##### V1 Earlier vs recent volume level
- Where: volumeResponse.ts:60, 93–98; caller targets.ts:113, 165
- Formula as coded: `weeks = usable.slice(-8)`, `recent = last 4`, `earlier = the rest`; level = roundHalf(median) when ≥ 2 weeks, else null. The caller passes `usable = complete weeks with workouts .slice(-6)`.
- Meant to compute: "Median weekly effective sets, earlier 4 weeks vs recent 4 weeks" (volumeResponse.ts:32).
- Edge cases checked: < 6 usable weeks → earlier has ≤ 1 week → earlierLevel null → `moreDidNotHelp` and `higherFailedBefore` can never fire.
- Source: volumeResponse.ts:32 comment; rules.ts `volume_individual`.
- Hand-computed example: 8 weeks [4, 4, 10, 10, 6, 6, 6, 6]: earlier 4 weeks → median 7. What the app passes is the last 6 → earlier = [10, 10] → 10. Code: 7 with 8 weeks, 10 with the 6 that computeTargets passes (s4). Real run (26 flat sessions, 8 complete weeks): rationale says "median of 6 recent weeks".
- Verdict: INCONSISTENT (comment and `2 × WINDOW` say 4 + 4 weeks; the only caller caps the input at 6, so "earlier" is always exactly 2 weeks or absent)
- Notes: the earlier slope is then measured over 2 weeks only. Proposed fix: pass at least 8 usable weeks to volumeDecision (keep the 6-week baseline separately), or change the comment / WINDOW to say 2 + 4.

##### V2 Performance slope per week
- Where: volumeResponse.ts:slopePerWeek (62–76)
- Formula as coded: per direct history: representative sessions with an index inside the window, same index kind as the last one, ≥ 2; `((last ÷ first) − 1) × 100 ÷ max(1, days ÷ 7)`; median over histories, rounded to 0.01; null when none.
- Meant to compute: % change per week of the muscle's direct exercises.
- Edge cases checked: one session → skipped; sessions < 7 days apart → divided by 1; mixed index kinds never compared; first index 0 would give Infinity (cannot occur with real loads).
- Source: `volume_individual` (heuristic).
- Hand-computed example: 100 → 104 over 14 days → 4 ÷ 2 = 2 %/week. Code: `recentSlope: 2` (s4).
- Verdict: CORRECT BUT WEAKLY SUPPORTED (end points only, not a regression)
- Notes: —

##### V3 Weeks at a stable volume
- Where: volumeResponse.ts:105–110
- Formula as coded: from the most recent usable week backwards (max 6): count while `|week − baseline| ≤ max(1.5, 0.15 × baseline)`; stop at the first miss.
- Meant to compute: how long the volume has been near its baseline.
- Edge cases checked: no weeks → 0; difference exactly 1.5 at baseline 10 → still stable.
- Source: `volume_individual` ("a stable volume for ≥ 3 weeks").
- Hand-computed example: [10,10,10,13,10,10], baseline 10 → 2; [10,10,10,11.5,10,10] → 6. Code: 2 / 6 (s4).
- Verdict: CORRECT BUT WEAKLY SUPPORTED
- Notes: —

##### V4 Technique breakdown share
- Where: volumeResponse.ts:113–134, 165
- Formula as coded: sets of the direct histories dated ≥ today − 21; `broken ÷ sets` when sets ≥ 4, else null; bad when ≥ 0.25. Broken = technique compromised / failed or technical failure.
- Meant to compute: whether technique is deteriorating.
- Edge cases checked: < 4 sets → null (never bad, and an increase is refused without it).
- Source: `volume_individual` ("technique breakdown on ≥ 25 % of sets").
- Hand-computed example: 1 of 4 → 0.25 → reduce by the step. Code: `brokenTechniqueShare 0.25 → reduce 8` from baseline 10 (s4).
- Verdict: CORRECT BUT WEAKLY SUPPORTED
- Notes: —

##### V5 Effort adequacy
- Where: volumeResponse.ts:124–135, 166
- Formula as coded: per set adequate = RIR ≤ 3, else effort ∈ {appropriate, hard, near_max}, else feel ∈ {just_right, hard_good, too_heavy_form}, else unknown. `effortAdequate = rated ≥ max(3, 0.5 × sets) ? adequate ÷ rated ≥ 0.6 : null`. `medianRir = RIR count ≥ max(3, 0.5 × sets) ? median : null`. `effortLow = medianRir ≥ 4`.
- Meant to compute: whether recent direct sets were close enough to failure.
- Edge cases checked: 2 of 6 rated → null; 3 of 6 rated with 2 adequate → 0.67 → true.
- Source: `volume_individual` ("adequate effort (RIR ≤ 3)"); CLAUDE.md G (estimated RIR from feel).
- Hand-computed example: 6 sets, RIR 2, 3, 5 on three → rated 3 ≥ 3, 2/3 ≥ 0.6 → adequate → increase allowed; RIR on two only → unknown → hold. Code: increase 12 / hold 10 (s4).
- Verdict: CORRECT BUT WEAKLY SUPPORTED
- Notes: two different notions (effortAdequate vs effortLow) are used by different branches — see V11.

##### V6 Consistently poor recovery
- Where: volumeResponse.ts:138–148
- Formula as coded: last 14 days (today − 13 … today), daily logs + workout wellness: soreness of this muscle ≥ 3 at least twice; else ≥ 3 sleep entries with mean < 6 h; else fatigue ≥ 4 at least twice; else currently recovering with soreness ≥ 3.
- Meant to compute: a recovery flag for the reduce / no-increase branches.
- Edge cases checked: no logs → null (never blocks). Sleep and fatigue are global, so they flag every muscle at once.
- Source: `volume_individual` ("consistently poor recovery"); soreness scale 0–4 (types.ts:237).
- Hand-computed example: chest soreness 3 logged 3 and 13 days ago → flagged → stalled chest is reduced 10 → 8; second entry 14 days ago → not flagged → increase to 12. Sleep 5.9 h × 3 with an unknown trend → reduce 10 → 8. Code: identical (s4).
- Verdict: CORRECT BUT WEAKLY SUPPORTED
- Notes: three short nights cut 1–2 sets from every muscle that is not progressing, including muscles with no performance data — as documented, but blunt.

##### V7 Body circumference signal
- Where: volumeResponse.ts:56–58, 151–159
- Formula as coded: site per muscle (arms, chest, shoulders, thighs, calves); measurements within 70 days, ≥ 2, first and last ≥ 28 days apart → "site ±x.x cm over n weeks (context only…)". Never used in a decision.
- Meant to compute: supporting context.
- Edge cases checked: one measurement or < 28 days apart → null; muscles without a site → null.
- Source: CLAUDE.md J ("body circumferences are context only").
- Hand-computed example: chest 100 → 101.2 cm, 35 days apart → "+1.2 cm over 5 weeks"; action unchanged (hold, progressing). Code: identical (s8).
- Verdict: CORRECT
- Notes: —

##### V8 Step size
- Where: volumeResponse.ts:162
- Formula as coded: `step = baseline < 8 || small muscle ? 1 : 2`.
- Meant to compute: +1–2 / −1–2 effective sets per week.
- Edge cases checked: baseline exactly 8, large → 2.
- Source: `volume_individual` ("±1–2 effective sets/week").
- Hand-computed example: baseline 7 → 8; baseline 10 chest → 12; baseline 10 biceps → 11. Code: 8 / 12 / 11 (s4).
- Verdict: CORRECT BUT WEAKLY SUPPORTED
- Notes: —

##### V9 Floor for reductions
- Where: volumeResponse.ts:done (172–183)
- Formula as coded: `floor = max(1, min(baseline, ref.min))`; reduce → `max(floor, proposed)`; if that is ≥ baseline → hold at baseline with "Already at the lower end"; result roundHalf(max(1, p)).
- Meant to compute: never cut below the lower end of the reference range.
- Edge cases checked: baseline below ref.min → hold; baseline 7.5, ref.min 7 → 7 (−0.5).
- Source: tests/part5-review.test.ts:71; no explicit rule text.
- Hand-computed example: declining, baseline 5, ref.min 6 → hold 5; baseline 7 → 6. Code: hold 5 / reduce 6 (s4).
- Verdict: CORRECT BUT WEAKLY SUPPORTED
- Notes: —

##### V10 Training break → observe
- Where: volumeResponse.ts:186–187
- Formula as coded: any of the last 4 complete calendar weeks without a workout, and no poor recovery / bad technique → observe at baseline.
- Meant to compute: no change while performance is not comparable.
- Edge cases checked: `recentWeeks` missing → 0 break weeks.
- Source: tests/part5-planner.test.ts:318; `volume_individual` (hold otherwise).
- Hand-computed example: stalled chest with one empty week among the last 4 → observe 10. Code: observe 10 (s4).
- Verdict: CORRECT BUT WEAKLY SUPPORTED
- Notes: —

##### V11 Reduce on a decline "with adequate effort"
- Where: volumeResponse.ts:190–195, 201, 204, 214
- Formula as coded: `declining && !effortLow && (stableWeeks ≥ 2 || moreDidNotHelp)` → reduce by the step (or back to the earlier level), rationale "… declined across comparable sessions with adequate effort". `effortLow` is true only when the median LOGGED RIR is ≥ 4. Any other declining case falls to line 201: observe, "the volume changed recently (n / 2 weeks at this level)".
- Meant to compute: −1–2 on a repeated decline with adequate effort.
- Edge cases checked: no effort logged; effort logged only by feel.
- Source: rules.ts `volume_individual` ("−1–2 … on repeated decline with adequate effort"); tests/part5-review.test.ts:54 ("stalled but NO effort logged → hold … never 'adequate effort'") for the stall branch.
- Hand-computed example: declining, baseline 10, 6 stable weeks. (a) no RIR / feel on any set → expected hold or observe ("log effort first"); code: reduce to 8, "with adequate effort". (b) every set felt "too easy" → expected hold (effort too low); code: reduce to 8, "with adequate effort". (c) every set RIR 5 → code: observe with "the volume changed recently (6 / 2 weeks at this level)" — the stated reason is false (6 ≥ 2); the real reason is low effort. (d) stalled, every set "too easy" → code: hold with "effort … is not logged on enough recent sets" although it is logged on all of them. (s4)
- Verdict: WRONG (code ≠ rules.ts and ≠ its own rationale)
- Notes: the decline branch tests "RIR not known to be ≥ 4" where the rule and the text require adequate effort; the stall branch already uses `effortAdequate === true`. Proposed fix: require `effortAdequate === true` for the decline-based reduction; when effort is unknown hold with "log effort first", when `effortAdequate === false` or `effortLow` hold with the "closer to failure" text; give line 201 its message only when stableWeeks < 2; split line 214 into "not logged" vs "logged but too easy".

##### V12 More volume did not help / higher volume failed before
- Where: volumeResponse.ts:167–170, 198, 212
- Formula as coded: `moreDidNotHelp = recentLevel ≥ earlierLevel + 1.5 && recentSlope < earlierSlope − 0.5 && trend ≠ progressing` → reduce to earlierLevel. `higherFailedBefore = earlierLevel ≥ recentLevel + 1.5 && earlierSlope ≤ recentSlope` → a stall holds instead of increasing.
- Meant to compute: use the owner's own history of volume changes.
- Edge cases checked: any level / slope null → false (see V1: needs 6 usable weeks).
- Source: `volume_individual` ("a recent increase without better performance"; "no history of more volume failing").
- Hand-computed example: weeks [8,8,12,12,12,12], slopes +2 → 0 %/week, stalled → back to 8. Weeks [12,12,8,8,8,8], slopes 0 / 0, stalled → hold 8. Code: reduce 8 / hold 8 (s8).
- Verdict: CORRECT BUT WEAKLY SUPPORTED (thresholds 1.5 sets and 0.5 %/week are heuristics; the cut can exceed 2 sets, as documented "back to the earlier productive level")
- Notes: depends on V1's 2-week earlier window.

##### V13 Increase (stalled or flat)
- Where: volumeResponse.ts:208–216
- Formula as coded: `flat = stable && recentSlope ≤ 0.25 && comparable sessions in the recent window ≥ 4`; if stalled or flat: stableWeeks < 3 → observe; higherFailedBefore → hold; poor recovery → hold; `effortAdequate !== true` or technique share unknown → hold; else `baseline + step`.
- Meant to compute: +1–2 as a test only when everything else is in order.
- Edge cases checked: 3 comparable sessions → not flat → neutral hold; stable for 2 weeks → observe.
- Source: `volume_individual`; CLAUDE.md J E.10.
- Hand-computed example: stalled, 6 stable weeks, RIR 2, clean technique → 7 → 8, 10 → 12; stable + 6 flat sessions → 12; with 3 sessions → hold. Code: identical (s4).
- Verdict: CORRECT BUT WEAKLY SUPPORTED
- Notes: —

##### V14 Holds and the neutral flag
- Where: volumeResponse.ts:201–204, 217
- Formula as coded: progressing → hold; unknown trend → hold (neutral when effort adequate); median RIR ≥ 4 → hold ("closer to failure"); stable → hold (neutral when effort adequate and no failed higher volume). `neutral` lets targets.ts add a gradual +1–2 for a high-priority muscle.
- Meant to compute: keep what works; never raise toward a generic reference.
- Edge cases checked: progressing below the reference → hold at the own level.
- Source: `volume_individual`; tests/part5-review.test.ts:63.
- Hand-computed example: stable with a +2 %/week slope → hold 10, neutral true. Code: `hold 10 true` (s4).
- Verdict: CORRECT
- Notes: —

---

### D. src/domain/exerciseChoice.ts

##### E1 Usual number of exercises per session
- Where: exerciseChoice.ts:usualExerciseCount (119–127)
- Formula as coded: exercise counts of workouts in 56 days (> 0), sorted; `xs[floor(n ÷ 2)]`, clamped to 3…8; default 5.
- Meant to compute: "Median number of exercises per session over the last 8 weeks".
- Edge cases checked: none → 5; one session with 2 → 3 (clamp).
- Source: comment at 118; CLAUDE.md J (usual session size).
- Hand-computed example: sessions with 4 and 6 exercises → median 5. Code: 6 (s2).
- Verdict: QUESTIONABLE
- Notes: for an even number of sessions this is the upper middle value, not the median (planner.ts:med averages). Effect ≤ 1 exercise on the plan size and on FIRST / SECOND HALF. Alternative: round the true median.

##### E2 Earlier workouts and sessions per exercise
- Where: exerciseChoice.ts:priorWorkouts (100), exerciseSessionCounts (105–116)
- Formula as coded: all workouts except the current one; per exercise the number of workouts with ≥ 1 performed working set (once per workout).
- Meant to compute: familiarity counts.
- Edge cases checked: the same exercise twice in one workout → 1; only planned sets → 0.
- Source: —
- Hand-computed example: DQ-14: pec deck 14, lat pulldown none. Code: 14 / undefined (s8).
- Verdict: CORRECT
- Notes: —

##### E3 Availability at this gym
- Where: exerciseChoice.ts:availableEquipment (133–162)
- Formula as coded: machines linked to the exercise at this gym (or unassigned ones already used), not busy, most used first → ok + known; else free-weight kinds: used here (or anywhere when no gym) → ok + known; never used → ok only for dumbbell / bodyweight (known false); machines otherwise → not ok.
- Meant to compute: where an exercise can be done right now; machines from another gym never count.
- Edge cases checked: busy machine → next one; both busy → not ok; other gym → not ok; barbell never used at that gym → not ok.
- Source: CLAUDE.md H (equipment memory), J (available at this gym, busy excluded).
- Hand-computed example: pec deck at gym_a → pd_a; pd_a busy → pd_b; both busy → not ok; at gym_b → not ok; lateral raise at gym_b → ok, not known. Code: identical (s8).
- Verdict: CORRECT
- Notes: —

##### E4 Safety line (pain)
- Where: exerciseChoice.ts:safetyLine (175–195)
- Formula as coded: workouts dated today − 7 … today (+ the current one): a performed set with pain on the same exercise → SAFETY line; else pain whose area is loaded by this movement pattern → region line; never changes the status.
- Meant to compute: a separate pain warning.
- Edge cases checked: planned sets ignored; no area → same-exercise line without an area; 8 calendar dates are covered.
- Source: CLAUDE.md J ("Pain = a separate SAFETY line").
- Hand-computed example: shoulder pain on pec deck 7 days ago → line on pec deck and a region line on incline press; 8 days ago → none. Code: identical (s8).
- Verdict: CORRECT
- Notes: —

##### E5 Learning from overridden recovery warnings
- Where: exerciseChoice.ts:choiceOutcomes (206–233)
- Formula as coded: observation = an exercise logged with `choice` {reconsider, recovery, continued}; "not lower" = `index ≥ 0.97 × previous representative session of the same history and index kind`; last 3 observations; `softened = observations in view ≥ 3 && notLower ≥ 2`.
- Meant to compute: soften a recovery warning only after ≥ 3 overrides that went fine.
- Edge cases checked: 2 observations → never softened; no previous session → no observation; keyed by exercise id (all machines pooled).
- Source: rules.ts `choice_learning` ("… whose next comparable performance was not lower (≥ 2 of 3)"); CLAUDE.md J.
- Hand-computed example: four sessions 100 / 98 / 96 / 94 kg × 10 at RIR 1, the last three overridden: indices 136.7 → 133.9 → 131.2 → 128.5, each −2 % → by "not lower" 0 of 3. Code: `notLower: 3, softened: true` (s3).
- Verdict: QUESTIONABLE
- Notes: the 3 % tolerance is not in the rule, and because each session is compared with the one just before it, a steady decline (−6 % over the three overrides) counts as "performed as usual". Alternative: keep a small noise tolerance but compare with the last session BEFORE the first override (or with the median of the previous three), and state the tolerance in the rule.

##### E6 Muscle states
- Where: exerciseChoice.ts:assessChoice (267–294)
- Formula as coded: for the first 3 muscles with coefficient ≥ 0.5 (strongest first): recovering with hoursLeft > 6 → RECOVERY_UNCERTAIN when the session time was fully assumed and hoursLeft ≤ 18, else RECENTLY_LOADED (earlier session); else for a non-primary muscle with `max(doneToday, session load) ≥ 3` → RECENTLY_LOADED (this session); else declining trend → PERFORMANCE_DECLINING; else READY.
- Meant to compute: READY / RECENTLY LOADED / RECOVERY UNCERTAIN / PERFORMANCE DECLINING per significant muscle.
- Edge cases checked: unknown exercise → acceptable / uncertain, no lines. The primary muscle's own sets today never make it "recently loaded".
- Source: CLAUDE.md J (states); rules.ts `choice_status`; RECOVERY_TOLERANCE_H = 6 (analysis.ts:100).
- Hand-computed example: 10 chest sets at RIR 1, window 72 h. End time 19:00 known: 21 / 17 / 11 h left → RECENTLY LOADED, 5 h → READY. No times at all (assumed 18:00): 20 h → RECENTLY LOADED, 16 / 10 h → RECOVERY UNCERTAIN (acceptable, confidence low), 4 h → READY. Triceps 2 sets today → READY, 3 sets → RECENTLY LOADED (this session). 4 chest sets today → chest still READY. Code: identical (s7).
- Verdict: CORRECT BUT WEAKLY SUPPORTED (the 18 h bound is an undocumented heuristic)
- Notes: see E6b.

##### E6b Only the first three significant muscles are assessed
- Where: exerciseChoice.ts:assessChoice (267, `sig.slice(0, 3)`)
- Formula as coded: muscles with coefficient ≥ 0.5 sorted by coefficient; ties keep the order in which the exercise lists them; the 4th and later ones get no state.
- Meant to compute: every significant synergist (coefficient ≥ 0.5) should be able to trigger the recovery finding.
- Edge cases checked: 5 library exercises have 4 significant muscles: seated cable row, chest-supported row, barbell row, T-bar row (upper back 1, lats 0.75, rear delts 0.5, biceps 0.5) and deadlift (glutes 1, quads / hamstrings / adductors 0.5).
- Source: rules.ts `choice_status` ("a significant synergist (coefficient ≥ 0.5)"); CLAUDE.md J ("Muscles with coefficient ≥ 0.5 get a state").
- Hand-computed example: 8 hard biceps-curl sets yesterday; biceps recovering. Expected for both rows: biceps RECENTLY LOADED → at least ACCEPTABLE. Code: seated cable row (biceps listed 3rd) → `acceptable recovery`, "biceps recently loaded…"; barbell row (biceps listed 4th) → `good`, no biceps line (s3).
- Verdict: INCONSISTENT (code ≠ rules.ts / CLAUDE.md; the result depends on the listing order of equal coefficients)
- Notes: proposed fix: assess every muscle with coefficient ≥ 0.5 (show three lines if space is the concern, but compute the findings on all).

##### E7 "Left today" on the choice card
- Where: exerciseChoice.ts:assessChoice (270–271) vs analysis.ts:208–209 and prescription.ts:397–399
- Formula as coded: choice: `max(0, round((todayShare − doneNow) × 2) ÷ 2)`. analysis: `diff < 0.5 ? 0 : roundHalf(diff)`. prescription: `need ÷ coefficient < 0.5 → 0 sets`.
- Meant to compute: what is still open of today's share.
- Edge cases checked: differences of 0.25–0.49.
- Source: CLAUDE.md "Today's share" section; MuscleWeek.todayLeft comment (analysis.ts:38).
- Hand-computed example: chest share 4, done 3.75 → by the analysis rule 0 left (the Week screen shows it as done, the prescription gives 0 sets). Code (choice card): `todayLeft 0.5`, "Chest: READY · 0.5 SETS LEFT TODAY", status good; with done 3.76 → 0 and "Today's share … already done" (s3).
- Verdict: INCONSISTENT (two places compute the same quantity differently)
- Notes: also `Math.round` instead of the noise-safe `roundHalf`. Proposed fix: reuse the analysis formula (diff < 0.5 → 0, else roundHalf) on `todayShare − doneNow`.

##### E8 Position in the session
- Where: exerciseChoice.ts:assessChoice (297–299)
- Formula as coded: `exercises done < ceil(usual ÷ 2)` → FIRST HALF, else SECOND HALF.
- Meant to compute: context for the fatigue-cost line.
- Edge cases checked: no session → 0 done → FIRST HALF.
- Source: `exercise_order` (context only).
- Hand-computed example: usual 7 → ceil(3.5) = 4: 3 done → FIRST HALF, 4 done → SECOND HALF. Code: identical (s5).
- Verdict: CORRECT BUT WEAKLY SUPPORTED
- Notes: inherits E1.

##### E9 Priority muscle
- Where: exerciseChoice.ts:isPriority (300–306)
- Formula as coded: priority 'high' in settings, or the muscle with the largest `todayLeft` among those not blocked with todayLeft ≥ 2.
- Meant to compute: when an isolation exercise may go first / a fatigue warning is waived.
- Edge cases checked: nothing ≥ 2 left → only the explicit setting counts; ties → first in muscle order.
- Source: `exercise_order` ("high priority or the largest recovered weekly deficit").
- Hand-computed example: tests/part5-choice.test.ts:172 (priority overrides CONSIDER LATER) — not re-run separately; consistent with the ORDER run below (non-priority triceps → CONSIDER LATER).
- Verdict: CORRECT BUT WEAKLY SUPPORTED
- Notes: uses today's open share, the rule says weekly deficit — close but not the same quantity.

##### E10 Verdict: recovery of the primary muscle, softening
- Where: exerciseChoice.ts:assessChoice (315–322)
- Formula as coded: primary RECENTLY LOADED from an earlier session → reconsider (recovery), or acceptable when the exercise's outcome is softened; RECOVERY UNCERTAIN → acceptable (uncertain).
- Meant to compute: recovery is never overridden by a weekly deficit.
- Edge cases checked: weekly counters at 0 after Monday (tests/part5-choice.test.ts:136).
- Source: `choice_status`, `choice_learning`.
- Hand-computed example: E6 runs: 21 h left → reconsider / CONSIDER ALTERNATIVE; uncertain → ACCEPTABLE. Code: identical (s7).
- Verdict: CORRECT BUT WEAKLY SUPPORTED
- Notes: see E10b.

##### E10b Softening never reaches a synergist recovery warning
- Where: exerciseChoice.ts:choiceOutcomes (213) vs assessChoice (316, 368–375)
- Formula as coded: every overridden warning with reasonKind 'recovery' is an observation — also those caused by a loaded synergist — but only the primary-muscle finding is softened.
- Meant to compute: "A recovery warning for an exercise is softened to ACCEPTABLE only after ≥ 3 overridden warnings …".
- Edge cases checked: —
- Source: rules.ts `choice_learning`.
- Hand-computed example: incline press, chest ready, triceps loaded yesterday, pec deck available; outcome for the press = 3 observations, 3 not lower, softened. Expected by the rule: ACCEPTABLE. Code: `reconsider recovery, softened: false` (s3).
- Verdict: QUESTIONABLE
- Notes: the overrides are learned from but never applied to this kind of warning, so it repeats forever. Alternative: soften the synergist finding too, or do not count synergist warnings as observations.

##### E11 Verdict: weekly volume
- Where: exerciseChoice.ts:assessChoice (326–328)
- Formula as coded: primary status over (completed > max) → reconsider; done (≥ preferred) → acceptable; today's share > 0, nothing left today, READY → acceptable.
- Meant to compute: more sets are optional or unhelpful.
- Edge cases checked: no primary → skipped.
- Source: `choice_status`.
- Hand-computed example: chest 4 / 12 → good; 11.5 / 12 → good; 16.5 / 12 (max 18) → acceptable (volume). Code: identical (s8). "Over" → reconsider is covered by tests/part5-choice.test.ts:66.
- Verdict: CORRECT
- Notes: —

##### E12 Verdict: fatigue cost
- Where: exerciseChoice.ts:assessChoice (331–335); fatigue.ts:sessionLoad
- Formula as coded: HIGH-cost squat / hinge / lunge when ≥ 2 such lifts are already done and the muscle is not a priority → reconsider (fatigue); any HIGH-cost lift when the session level is 'heavy' → acceptable.
- Meant to compute: a third heavy lower-body lift adds much fatigue for little.
- Edge cases checked: no session → no fatigue finding.
- Source: `fatigue_cost`, `exercise_order`.
- Hand-computed example: squat + RDL done, then deadlift → reconsider (fatigue), CONSIDER ALTERNATIVE. Code: identical (s7).
- Verdict: CORRECT BUT WEAKLY SUPPORTED
- Notes: —

##### E13 Verdict: order
- Where: exerciseChoice.ts:assessChoice (338–356), pendingDoable (507–511)
- Formula as coded: LOW-cost exercise whose primary is not a priority: a pending, doable, non-LOW exercise in which that muscle is significant but not primary → reconsider (order) = CONSIDER LATER; with no pending exercises: host muscles (triceps / front delts → chest, biceps → lats / upper back, rear delts → upper back) with ≥ 2 left today and < 1 done → acceptable.
- Meant to compute: protect the reps of the compound still to come.
- Edge cases checked: busy machine, skipped or postponed cards are not "pending" (tests/part5-review.test.ts:81).
- Source: `exercise_order` (soft advice, never a block).
- Hand-computed example: pushdown while an incline press is still planned → CONSIDER LATER, alternative "do first: incline press". Code: identical (s7).
- Verdict: CORRECT BUT WEAKLY SUPPORTED
- Notes: —

##### E14 Verdict: declining performance
- Where: exerciseChoice.ts:assessChoice (359–362)
- Formula as coded: this history's trend declining, or the primary muscle's state PERFORMANCE_DECLINING → acceptable (decline).
- Meant to compute: quality over extra sets; never a recovery claim.
- Edge cases checked: no history → no finding.
- Source: `choice_status` ("ACCEPTABLE when … the trend is declining").
- Hand-computed example: covered by tests/part5-choice.test.ts:83 (not re-run).
- Verdict: CORRECT
- Notes: —

##### E15 Loaded synergist and sparing alternatives
- Where: exerciseChoice.ts:assessChoice (368–375), sparingAlternatives (459–470)
- Formula as coded: synergists RECENTLY LOADED: an alternative exists (primary coefficient ≥ 0.75, each loaded muscle's coefficient ≤ own coefficient − 0.2, ≥ 1 session, available, none of its muscles ≥ 0.5 inside a recovery window) → reconsider (recovery) with it; none → acceptable. Text: "<name>: <primary> without the <muscle> load".
- Meant to compute: CONSIDER ALTERNATIVE only when an option really spares the loaded synergist.
- Edge cases checked: no alternative → ACCEPTABLE, nothing invented (tests/part5-choice.test.ts:99).
- Source: `choice_status`.
- Hand-computed example: (a) triceps loaded yesterday, incline press → pec deck (triceps 0). Code: `pec_deck` (s7). (b) 4 pushdown sets today, then dips (triceps 0.75): bench press has triceps 0.5 ≤ 0.55 → offered. Expected wording "less triceps load". Code: "Barbell bench press: chest without the triceps load", "Incline dumbbell press: chest without the triceps load" (s3). 36 such exercise pairs exist in the library.
- Verdict: QUESTIONABLE
- Notes: when the synergist was loaded in THIS session, an option that still loads it at 0.5 is called "without the load", and the status becomes CONSIDER ALTERNATIVE for a small gain. Alternative: require coefficient < 0.5 for "sparing", or say "less".

##### E16 Final status, reason and label
- Where: exerciseChoice.ts:assessChoice (378–381), labelOf (242–244)
- Formula as coded: status = worst finding (good < acceptable < reconsider); reason = first of recovery, volume, fatigue, order, uncertain, decline among the worst; label: good → GOOD CHOICE, acceptable → ACCEPTABLE, reconsider + order → CONSIDER LATER, other reconsider → CONSIDER ALTERNATIVE.
- Meant to compute: one call; dimensions are never merged into a score.
- Edge cases checked: no findings → good, reason null.
- Source: `choice_status`; CLAUDE.md J.
- Hand-computed example: order finding only → CONSIDER LATER; fatigue → CONSIDER ALTERNATIVE; none → GOOD CHOICE. Code: identical (s7).
- Verdict: CORRECT
- Notes: —

##### E17 Alternatives (≤ 2) and their ranking
- Where: exerciseChoice.ts:assessChoice (383–387, 404), candidatePool (440–457), otherMuscleAlternatives, cheaperAlternatives, doFirstAlternatives
- Formula as coded: pool = other movement families, not in the session, available, familiar or known here, no muscle ≥ 0.5 inside a recovery window; rank `min(sessions, 10) × 2 + (sessions ≥ 2 ? 5 : 0)`. Recovery / volume → up to 2 other muscles with todayLeft ≥ 1 (largest need, then larger muscle), each with coefficient ≥ 0.75; fatigue → same primary at a lower cost class; order → the pending compound first. Output `slice(0, 2)`.
- Meant to compute: at most two familiar options at this gym.
- Edge cases checked: no option → "No better familiar option here today — continuing is reasonable."
- Source: CLAUDE.md J ("≤ 2 alternatives, only familiar ones available at this gym (busy machines excluded)").
- Hand-computed example: dips case → 2 alternatives (cap); triceps case → 1 (pec deck). Code: 2 / 1 (s3, s7).
- Verdict: CORRECT BUT WEAKLY SUPPORTED (ranking weights are heuristics)
- Notes: —

##### E18 Confidence
- Where: exerciseChoice.ts:assessChoice (397–399)
- Formula as coded: no workout before today, or primary RECOVERY UNCERTAIN → low; < 8 earlier workouts with `diffDays ≤ 56` → moderate; else high.
- Meant to compute: how much data stands behind the call.
- Edge cases checked: empty data → low.
- Source: none (undocumented heuristic).
- Hand-computed example: 7 workouts → moderate; 8 → high; none → low. Code: identical (s5).
- Verdict: CORRECT BUT WEAKLY SUPPORTED
- Notes: —

##### E19 Prompt and acknowledgement key
- Where: exerciseChoice.ts:405, isAcknowledged (411–413), needsPrompt (416–419)
- Formula as coded: key = exercise | machine | status | reason | muscle:state list | pain flag; prompt when not acknowledged and (status ≠ good or a safety line exists).
- Meant to compute: an answered warning is not repeated unless its inputs change.
- Edge cases checked: pain logged later changes the key (tests/part5-review.test.ts:91).
- Source: CLAUDE.md J ("an answered warning is not repeated in the session unless its inputs change").
- Hand-computed example: covered by tests/part5-choice.test.ts:124 (not re-run).
- Verdict: CORRECT
- Notes: —

## 5. Changes made after the audit

(filled in as Part 6 proceeds)
