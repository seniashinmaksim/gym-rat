# Scientific method: how Gym Rat's research library was built

The research library lives in `src/data/scientific-evidence/`:

| File | Contents |
|---|---|
| `references.ts` | `REFERENCES`: every accepted study, with DOI, PMID, design, outcome type, population, our own summary, limitations and confidence. `REFERENCE_BY_ID` looks one up by id. |
| `muscles.ts` | `MUSCLE_EVIDENCE`: one entry per tracked muscle (every `MuscleId`), with an evidence level, a short summary, findings with citations, and a limitation note. |
| `exercises.ts` | `EXERCISE_EVIDENCE`: findings about specific exercises in the library (`src/data/exercises.ts`). |
| `general.ts` | `GENERAL_EVIDENCE`: training variables that apply to all muscles (volume, effort, load, rest, frequency, ROM, progression, recovery, deloads, warm-ups, drop sets). |
| `rules.ts` | The rule registry: each numeric adjustment the app makes, with its rationale and the references above that support it. |
| `index.ts` | Re-exports the library files. |

`tests/evidence.test.ts` checks the library's structure on every test run.

`docs/RESEARCH.md` is the earlier evidence brief. It stays as background reading, but **this library supersedes it for citations**: the app and new documentation should cite ids from `REFERENCES`.

## 1. Research happens at development time only

All searching and verification was done while developing the app, on 2026-11-21. The app itself makes **no network calls**. The library is static data compiled into the build, and the Content Security Policy (`connect-src 'self'`) stays as it is. The library contains no personal or training data.

## 2. How sources were chosen

1. **Start from what was already verified.** The repository (`docs/RESEARCH.md`, the Science page and `CLAUDE.md`) was searched first for references verified earlier.
2. **Well-known reviews and landmark trials.** The search started from established systematic reviews and meta-analyses (volume, proximity to failure, load, rest, frequency, range of motion) and well-known long-term training trials.
3. **New studies only through scholarly indexes.** New candidates were found only through **PubMed E-utilities**, **Europe PMC** and **Crossref**. No broad web search was used.
4. **Preference order.** We preferred systematic reviews and meta-analyses, then randomised and longitudinal training trials that measured muscle size (MRI, ultrasound, biopsy), then strength-only trials. Acute EMG, acute damage and protein-synthesis (MPS) studies were kept only where nothing better exists, and they are always marked as indirect.
5. **One agent per muscle group.** Collector agents covered chest, back, shoulders, arms, legs and abs/spine, and another covered general training variables. A separate verifier agent then checked every candidate.

## 3. Acceptance rule

A reference is accepted only if **all** of the following hold:

- its **PMID resolves in PubMed** (esummary/efetch);
- its **DOI resolves in Crossref**, and title, year and journal match the PubMed record. Differences that were checked and explained are noted in the reference's `limitations`: online year vs print year, or a journal's later name;
- the finding is written **in our own words from the abstract** (or an open full text). No text is copied and nothing goes beyond what the source reports.

Every accepted reference carries `verifiedOn: '2026-11-21'`. That date marks the **independent verifier pass**. During that pass the verifier also corrected overstated claims, for example a finding that called EMG results "consistent" when one study disagreed, a muscle a study had not measured, or the authors' interpretation presented as a pooled result.

When several groups cited the same paper (same DOI), the library keeps one record and one id, and all citations point to it. Where the duplicate records disagreed on confidence, the more conservative value was kept. The merged duplicates were Lanza 2024 (bench press muscles), Kassiano 2023 (range of motion review), Varovic 2025 (muscle length) and Pallarés 2021 (range of motion).

## 4. How evidence levels are assigned

Per muscle (`MUSCLE_EVIDENCE[...].evidenceLevel`) and per general topic:

| Level | Meaning |
|---|---|
| `strong` | Several meta-analyses or systematic reviews agree, with supporting trials, including trained people (used only for general training variables such as weekly volume, proximity to failure, load range and frequency). |
| `moderate` | Several long-term trials measuring muscle size, or a meta-analysis, point the same way, but most are small, short or in untrained people. |
| `limited` | One or a few long-term trials, partly clinical or untrained populations, or conflicting results. Exercise ranking rests largely on EMG. |
| `very_limited` | No long-term hypertrophy trial for this muscle or question in healthy lifters. The evidence is EMG, acute, mechanistic or extrapolated. |

Each reference also carries its own `confidence` (`high` / `moderate` / `low`) for how well that single study answers its own question (design, sample size, measurement method).

**Muscles with limited or very limited evidence** (the app must label them as such): upper chest (limited), lower chest (very limited, indirect only), lats (limited), upper back (very limited, indirect only), traps (limited), front delts (limited), side delts (limited), rear delts (very limited, indirect only), forearms (very limited), calves (limited), abs (very limited), spinal erectors (very limited), adductors (limited). Chest, biceps, triceps, quads, hamstrings and glutes have moderate evidence.

## 5. Indirect-evidence rule

Acute surface EMG, acute swelling, muscle damage and muscle protein synthesis are **not** hypertrophy. Acute EMG amplitude in particular has not been validated as a predictor of long-term growth (Vigotsky 2022). Therefore:

- each reference has an `outcome`. References with outcome `emg_activation` or `acute_mps_or_damage` may only be cited by findings marked `indirect: true`. The test suite enforces this;
- when a finding combined long-term size data with EMG data, it was split into a direct part (citing only the training studies) and an indirect part (citing the EMG studies). No new claims were added in the split;
- findings that rest on strength-only data, extrapolation from a related exercise, or no study at all are also marked indirect;
- the app may use indirect findings to explain *why* a coefficient was chosen. It must not present them as proven growth differences. Coefficients that rest on them are labelled practical estimates or assumptions.

## 6. Rejected and excluded candidates

The verifier formally rejected no candidate that the collectors submitted. Three sources came up during the work and were deliberately **not** included:

| Candidate | Reason |
|---|---|
| Remmert et al. 2025, per-session volume meta-regression (SportRxiv preprint, DOI 10.51224/SRXIV.537) | Preprint without a PMID, so it fails the acceptance rule. The app's ~11 fractional sets per-session taper that it inspired is labelled an assumption. |
| Wilson 2025 (muscle warming and maximal force) | Excluded by the collector. A claim based on it was removed from the warm-up finding. |
| Longitudinal Pilates MRI study of the abdominal muscles (PMID 22357302) | Noticed during verification but not verified or added. It is not a loaded crunch study in lifters, so the "no trial in young trained lifters" statements stand. |

## 7. Limitations

- Most long-term trials are small (often 10–40 people), short (5–12 weeks) and in untrained or recreationally active people. Results may not transfer to trained lifters.
- Many outcomes are ultrasound thickness at one or a few sites, not whole-muscle volume.
- Several recent papers (2025–2026) have not been replicated.
- Findings come from abstracts. Where a full text was paywalled, details beyond the abstract were not re-verified, and the reference says so.
- Back, rear-delt, forearm, abdominal and spinal-erector evidence is largely EMG. Coefficients for these muscles are practical estimates.
- Regional (upper/lower chest, proximal/distal) effects are reported as emphasis. They are never counted as extra volume.

## 8. How to add a new reference

1. Find it through PubMed E-utilities, Europe PMC or Crossref, preferring systematic reviews and meta-analyses. Do not use a general web search.
2. Confirm that its **PMID resolves in PubMed** and that its **DOI resolves in Crossref** with matching title, year and journal. Note any explained mismatch in `limitations`.
3. Add an entry to `REFERENCES` in `references.ts` with a unique `id` (`firstauthorYEAR_topic`), the DOI, the PMID, the PubMed `url`, `design`, `outcome`, `population`, a short `finding` in your own words, `muscles`, `limitations`, `confidence` and the date you verified it (update the `verifiedOn` type if it differs).
4. If the outcome is `emg_activation` or `acute_mps_or_damage`, cite it only from findings with `indirect: true`.
5. Cite it from `muscles.ts`, `exercises.ts`, `general.ts` or `rules.ts`. Use only exercise ids that exist in `src/data/exercises.ts`. If it changes a muscle's overall picture, update that muscle's `evidenceLevel`, `summary` and `limitation`.
6. Run `npm test` (including `tests/evidence.test.ts`) and `npm run typecheck`.
7. Never add personal training data, and never let the app fetch references at runtime.
