# Formula analysis — what is solid, what is weak, what to improve (Part 6, owner's request)

Written 2026-11-24, after the formula audit (`docs/FORMULA_AUDIT.md`: 278 formulas, every finding and every
change old → new) and the Part 6 review. **This document changes nothing.** Every proposal below needs the
owner's OK before it is implemented, and then a failing test first.

How to read it:
- **State**: solid = matches its stated basis and has hand-computed tests; acceptable = a stated heuristic that
  behaves sensibly; weak = a known way to give a wrong answer in normal use.
- **Priority**: **P1** = can give a wrong number or a wrong decision in a normal workout, cheap to fix;
  **P2** = wrong in less common cases, or needs a design choice; **P3** = refinement / needs more data first.
- Sources are the verified ids in `src/data/scientific-evidence/` and the rule ids in `rules.ts`
  (each rule records its basis and confidence). Nothing here is cited from memory; where a proposal has no
  source, it says "heuristic".

## 1. Summary

| # | Formula family | State | Biggest weakness | Proposal | Priority |
|---|---|---|---|---|---|
| 1 | Set credit table (RIR → credit) | solid | none in normal use | keep | — |
| 2 | Unknown effort = 0.75 provisional | acceptable | one number for very different sets | let the numbers check carry more of it (done for clear cases in Part 6) | P3 |
| 3 | Effort from the numbers — ramp sets | acceptable (after the review fix) | Epley extrapolated far from the best set's rep count | limit to sets ≥ ~50 % of the best load or ≤ 20 possible reps | P2 |
| 4 | Effort from the numbers — back-off sets without a report | **done 2026-11-24** (owner's OK) | a back-off set could get credit 0 | estimate only at ≤ 60 % of the best load; else provisional | — |
| 5 | Effort from the numbers — next-set rep drop | acceptable (after the review fix) | rest length only checked against 60 s | use the owner's usual rest per exercise | P3 |
| 6 | Automatic warm-up tag | acceptable | same limits as #3 | follows #3 | P2 |
| 7 | Muscle coefficients | acceptable (audited 2026-11-22) | practical estimates, 15 with a plausible range | keep; show the range (already done) | — |
| 8 | Per-session taper (> 11 effective sets ×0.5) | weak basis | one preprint, fixed per muscle size | make it per muscle group or show it only as a note | P3 |
| 9 | Strength index (Epley, RIR-adjusted) | acceptable | rough above ~12 reps; one formula for every exercise | compare like with like by rep zone; per-exercise check | P2 |
| 10 | Index basis (RIR vs reps only) | **weak in practice** | one old session without RIR switches a history to reps-only for good | decide the basis over the trend window, not the whole history | **P1** |
| 11 | Index kinds for weighted pull-ups / dips | weak | "body + belt" and "belt only" alternate with weigh-in timing | carry the last weigh-in forward with an "estimate" label, or always belt-only for trend | P2 |
| 12 | Trend / plateau / decline | acceptable | thresholds (+1 %, −1.5 %, 8 %) are heuristics | check them against the owner's own data once ≥ 6 months exist | P3 |
| 13 | Double progression | solid (after F-3 / F.7) | "top of the range" is judged per set, not per rep zone | keep | — |
| 14 | Pre-load context (order of the session) | acceptable, low confidence | default 1 %/set from few studies; threshold 2 sets is arbitrary | measure the owner's own drop (already used when ≥ 2 sessions per context) | P3 |
| 15 | Prescription: set count | weak (C-4) | the plan and the first re-assessment size sets differently | one allocation routine | P2 |
| 16 | Prescription: reps / RIR targets / rest | acceptable | rest bounds are generic | keep; rest default is now a setting | — |
| 17 | Recovery windows | **weak** (A-14) | only the latest significant session counts | latest expiry over recent sessions | **P1** |
| 18 | Weekly targets / today's share | acceptable | generic references until individual volume has data | keep | — |
| 19 | Individual volume (E.10) | acceptable, low confidence | decisions with few weeks of data | keep the "hold" default; require ≥ 3 weeks (already) | — |
| 20 | Planner / exercise choice | acceptable | several small inconsistencies (C-10 … C-16) | fix the listed ones | P2 |
| 21 | Body weight averages | solid | — | keep | — |
| 22 | Baseline / growth signals | acceptable | partial first week counted as full (B-13) | count only complete weeks | P2 |
| 23 | Failure share (A-17) | **weak** | "100 % to failure" when most sets had RIR 2 | count RIR ≥ 1 as "not failure" | **P1** |

## 2. Per family

### 2.1 Set credit (rule `rir_credit_table`, `failure_no_bonus`)
- **Solid.** RIR 0–3 → 1.0, 4 → 0.6, 5 → 0.3, 6–7 → 0.15, ≥ 8 → 0; failure earns no bonus. The rule's sources
  (refalo2023_failure_meta, robinson2024_proximity_failure, refalo2024_failure_rct) support "similar growth
  close to failure, less stimulus further away"; the exact steps are a stated heuristic and are configurable.
- Modifiers (technique ×0.7, drop segment ×0.5, < 5 reps ×0.8, partial ROM ×0.8) are labelled heuristics with
  low confidence. They are small and visible; no change proposed.

### 2.2 Unknown effort (rule `unknown_effort`, 0.75)
- A set with no answer is credited 0.75 and flagged uncertain. In training mode most sets will have no exact RIR,
  so this number matters more than before Part 6.
- Part 6 already lets the numbers decide in the clear cases (a light ramp set → warm-up; a clear rep drop → hard).
- **Proposal (P3):** after ≥ 12 compared sets (`perception_bias`), show the owner how often their unanswered sets
  look easy or hard by the numbers. Do NOT change 0.75 automatically — one number per owner is not enough data.

### 2.3 Effort from the numbers (rules `warmup_by_reserve`, `perception_check`)
How it works: the best set of the exercise (highest reps-only Epley value) predicts how many reps were possible at a
lighter load: `possible = 30 × (best ÷ load − 1)`; `estimate = possible − reps done` (back-off: minus 1 rep per
set since the best one).

- **Ramp sets — acceptable after the review fix.** A report is overruled only at ≤ 75 % of the best set's load and
  when the estimate is ≥ 5 and ≥ 3 above the report. Weakness: far below the best load the Epley line is
  extrapolated a long way. The rule's own text and sources (reynolds2006_multiple_rm_prediction,
  nuzzo2024_reps_percent_1rm, roberts2025_rtf_equations_crossvalidation) mark rep predictions as rough at high
  rep counts. For a warm-up the error does not matter (credit is 0 either way); it matters only between about
  50 % and 75 % of the best load.
  **Proposal (P2):** treat an estimate above ~20 possible reps as "≥ 5 in reserve" (a band, not a number), so no
  decision depends on the extrapolated value itself.
- **Back-off sets without a report — weak (P1).** Example from the review: 100 × 5, then 60 × 15 with no answer.
  `possible` at 60 = 30 × (116.7 ÷ 60 − 1) = 28.3; estimate = 28.3 − 15 − 1 = 12.3 → credit 0. A set of 15 reps
  after a heavy set may well be a genuine working set; the estimate rests entirely on the long extrapolation.
  **Done 2026-11-24 (owner's OK):** the back-off estimate is used only for a clearly very light set (≤ 60 % of the best load);
  heavier back-off sets without an answer stay provisional (0.75) unless the next-set rule applies. (Original proposal text below.)
  **Proposal:** use the back-off estimate only when the set is far below the best load (as for reported ramp sets);
  otherwise leave the set provisional (0.75, uncertain) unless the next-set rule says something. Test: the 60 × 15
  example must get 0.75, not 0.
- **Next-set rep drop — acceptable.** A drop of ≥ 2 reps at the same load after a rest ≥ 60 s marks the earlier set as
  near the limit, unless the next set itself was reported with ≥ 3 in reserve (review fix). Weakness: 60 s is a
  fixed bound. **Proposal (P3):** use "< 70 % of the owner's usual rest for this exercise" — the same rule the
  rest attribution already uses (`rest_attribution`).

### 2.4 Volume (rules `fractional_coefficients`, `session_taper`)
- Coefficients: audited 2026-11-22 (`exerciseAudit.ts`); uncertain ones show a plausible range. No change.
- **Per-session taper (P3).** Above 11 effective sets for one muscle in one session, further credit is halved. The
  rule's basis is one preprint (low confidence) and the threshold is the same for small and large muscles.
  **Proposal:** keep the number but show it as a note ("above 11 in one session — the extra sets may add less")
  instead of silently changing the weekly total, OR make it configurable per muscle group. Owner's choice.

### 2.5 Strength index (rules `index_scale`, `index_basis`)
- Epley with logged RIR added to reps, per exercise × machine × configuration. An index for that setup, never a 1RM.
- **Epley over the whole rep range (P2).** The estimate is least reliable at high reps (rule text, sources above).
  A history that moves between 6 and 15 reps compares values of different accuracy.
  **Proposal:** for trend and progress %, compare sessions whose top set is in the same rep zone (≤ 8, 9–15, > 15)
  when there are ≥ 3 of them, else all — the same "like with like" pattern as the pre-load context.
- **Index basis — weak in practice (P1).** Since Part 6 the index uses RIR only when EVERY scored session of the
  history has RIR on its top set. Training mode hides the exact RIR behind "More…", so almost every history becomes
  reps-only — and ONE old session without RIR switches a long RIR history to reps-only for good.
  **Proposal:** decide the basis over the sessions inside the trend window (last ≤ 6 sessions, 8 weeks), not the
  whole history. Test: 10 sessions with RIR, one old one without → basis 'rir' once the old one is outside the window.
- **Weighted pull-ups / dips (P2, from audit B-7).** The index is "body + belt" when a weigh-in ≤ 7 days old exists,
  else "belt only". The two are never mixed (correct), but the progress % appears and disappears with the timing
  of weigh-ins. **Proposal:** carry the latest weigh-in forward up to 28 days with an "estimate" label, or show
  the trend on the belt-only index and body + belt only as context. Owner's choice.

### 2.6 Trend, plateau, decline (rules `plateau`, `single_bad_session`, `sustained_decline`)
- Regression slope over ≤ 6 sessions in 8 weeks; one bad latest session is set aside; plateau needs ≥ 4 sessions
  over ≥ 21 days with no new best in the last two. All heuristics, low confidence, clearly labelled.
- **Proposal (P3):** once ≥ 6 months of the owner's data exist, check how often each label later turned out right
  (e.g. "plateau" followed by a new best within 2 sessions). Observational only, like `ruleChecks.ts`.

### 2.7 Double progression (rule `double_progression`)
- **Solid after Part 6.** Increase after every working set at the working load reaches the top of the range in two
  sessions in a row (≤ 56 days apart); one session suffices only when ≥ 2 sets were clearly light and reps did not
  fall. Reps at the top are objective evidence; no effort answer is required (F.7).
- Reduce: technique broke on ≥ 2 sets, or the numbers confirm it, or it repeated. No change proposed.

### 2.8 Pre-load context (rule `preload_context`)
- A session after ≥ 2 fractional sets for the exercise's primary muscle is "pre-loaded"; histories are compared
  within the same context when there are ≥ 3 such sessions, else normalised by 1 % per set (cap 6 %), or by the
  owner's own measured drop when ≥ 2 sessions exist in each context.
- Sources (senna2019_bench_fly_order and the order studies listed in the rule) show that order changes the later
  exercise's reps; the size per set is a low-confidence estimate.
- **Proposal (P3):** none now. The owner's own measured drop replaces the default automatically; the Workout check
  shows which basis was used. Re-check the 2-set threshold when ≥ 10 pre-loaded sessions exist.

### 2.9 Prescription (rules `presc_set_count`, `presc_rep_ranges`, `presc_rir_targets`, `presc_rest`)
- **Set count (P2, audit C-4).** The planner and the first live re-assessment size sets with two different routines
  (example in the audit: squat planned 5 sets, re-assessed to 3 with nothing done). **Proposal:** one allocation
  routine for both, capped by every muscle with a coefficient ≥ 0.75. Needs a design decision.
- Reps, RIR targets and rest: acceptable; the rest default is now a setting (2:30).

### 2.10 Recovery (rule `recovery_windows`)
- Windows by effective sets of the last significant session (24 … 72 h, + 12 h for listed factors). Heuristic, low
  confidence; `ruleChecks.ts` compares it with the owner's performance.
- **Weak (P1, audit A-14).** Only the LATEST significant session counts: 12 sets on Monday + 2 sets on Tuesday →
  the Tuesday window (24 h) decides, so the muscle reads "likely recovered" on Wednesday although Monday's 60 h
  window is still open. **Proposal:** the muscle is held back until the LATEST EXPIRY over all sessions in the last
  4 days. Test: the Monday / Tuesday example above.
- A-15 (the last ticked set is trusted as the session end for 48 h): P3, now rarely relevant because training mode
  stores completion times for every set.

### 2.11 Targets, today's share, individual volume
- Acceptable. Generic references during Learning Mode, then the owner's own baseline, changed only on evidence.
  No change proposed.

### 2.12 Planner and exercise choice (rules `planner_*`, `choice_*`)
- Acceptable. The open items are small and listed in the audit (C-10 … C-16). Proposed order:
  C-15 (an alternative called "without the triceps load" that loads triceps at 0.5 — wording is wrong, **P1-cheap**),
  C-11 (wrong skip reason), C-12 (three "no time" skips counted as avoidance), C-16 (true median), C-14, C-13, C-10.
  C-10 is largely gone with targets instead of planned rows.

### 2.13 Baseline, growth signals, failure profile
- B-13 (P2): the baseline's weekly distribution counts a partial first week as a full week (Sunday start: 3, 6, 6 →
  5.0). **Proposal:** only weeks fully inside the baseline period.
- **A-17 (P1):** the share of sets taken to failure is computed over sets WITH a failure answer only — 30 sets at
  RIR 2 plus 6 marked "failure" read as 100 %. **Proposal:** a set with a logged RIR ≥ 1 counts as "not to
  failure". Test: that example → 6 / 36 = 17 %.

### 2.14 Smaller open items (owner's decision)
- A-6: bench-angle range differs between the registry (−30…90°) and the importer (−45…90°).
- A-16: a positive angle on `decline_press` is credited as an incline.
- A-18: changing the load mode on a finished workout is not in the audit trail.
- A-19: effort distribution pairs left / right by the first side only.
- A-20: computed end of Learning Mode can be earlier than the date the criteria were met.
- A-21: a tie in the muscle trend summary reads "progressing".
- B-11: fatigue classes in data vs rule text (hack squat, farmer carry).
- B-14: a timed same-day weigh-in tagged "before workout" is rejected when the workout has no start time.

## 3. Proposed order of work (each after the owner's OK)

1. **P1** — ~~#4 back-off estimate~~ (done), #10 index basis over the trend window, #17 recovery latest expiry (A-14),
   #23 failure share (A-17), C-15 wording.
2. **P2** — #3 band above ~20 possible reps, #9 rep-zone comparison, #11 weighted pull-up index, #15 one set-count
   routine (C-4), #22 complete weeks (B-13), C-11 / C-12 / C-14 / C-16, A-6 / A-16 / A-18 / A-19 / A-20 / A-21 / B-11 / B-14.
3. **P3** — #2 unknown-effort feedback, #5 rest relative to usual rest, #8 taper as a note, #12 label accuracy
   check, #14 re-check the pre-load threshold. These need months of the owner's own data first.

## 4. How the owner can check any of this on real data

History → a workout → **Check the numbers** shows, per set, what was reported, what the numbers say and which one
decided the credit; per exercise the share × credit per muscle, the order context, the index and the next decision;
per muscle the sum and what the week counts. A disagreement found there is the best input for the list above — it
becomes a synthetic failing test, never a copy of the owner's data.
