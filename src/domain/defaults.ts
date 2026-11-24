import type { QualityModel, Settings } from './types';

export const DEFAULT_QUALITY: QualityModel = {
  // RIR 0–3 → full credit (Refalo 2023/2024, ACSM 2026: similar hypertrophy across this band).
  // Growth declines non-linearly further from failure (Robinson 2024) but not abruptly to zero:
  // 4 → 0.6, 5 → 0.3, 6–7 → 0.15, 8+ → 0.
  rirCredit: [1, 1, 1, 1, 0.6, 0.3, 0.15, 0.15, 0],
  unknownRirCredit: 0.75,
  dropSetCredit: 0.5,
  // Unspecified partials. Short-length partials look clearly inferior, lengthened partials ≥ full ROM (Wolf 2023, Pedrosa 2022, Kassiano 2023).
  partialRomCredit: 0.8,
  lengthenedPartialCredit: 1,
  compromisedTechniqueCredit: 0.7,
  lowRepThreshold: 5,
  lowRepCredit: 0.8,
  minRepsForCredit: 1,
  // Per-session note (owner's decision 2026-11-24, Part 7 G.1 #1): every set counts (×1). Above ~11 effective sets
  // per muscle in one session the app shows a note only — no PubMed-indexed study of a per-session ceiling exists
  // (the earlier ×0.5 rested on an unindexed preprint). Both numbers stay editable in Settings.
  sessionCreditCap: 11,
  beyondSessionCapCredit: 1,
  // Practical assumption (not a study value): when no RIR was logged, the owner's "how did it feel"
  // maps to an estimated RIR range, and its higher-RIR end (5 for "5+") goes through the RIR table above.
  useFeelWhenNoRir: true,
};

export function defaultSettings(): Settings {
  let tz = 'UTC';
  try {
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    /* keep UTC */
  }
  return {
    formulaRevision: 7,
    id: 'settings',
    timezone: tz,
    weekStartsOn: 1,
    autoLockMinutes: 10,
    theme: 'system',
    exerciseNames: 'both',
    experience: 'intermediate',
    defaultTargetRir: 2,
    significantStimulusSets: 2,
    // Planning cap: never suggest more than this many effective sets for one muscle in one session.
    // (Remmert 2025, preprint: no detectable extra hypertrophy beyond ~11 fractional sets/muscle/session.)
    perSessionSetCap: 10,
    quality: { ...DEFAULT_QUALITY, rirCredit: [...DEFAULT_QUALITY.rirCredit] },
    targetOverrides: {},
    priorities: {},
    learning: { startDate: null, endedOn: null, lengthDays: 30 },
    showOptionalTracking: true,
  };
}

/** Fill any fields missing from older saved settings. */
export function migrateSettings(s: Partial<Settings> | undefined): Settings {
  const d = defaultSettings();
  if (!s) return d;
  const quality = { ...d.quality, ...(s.quality ?? {}) };
  // Part 7 (owner 2026-11-24): the old default taper ×0.5 becomes ×1 once; a value chosen later is kept.
  if ((s.formulaRevision ?? 0) < 7 && quality.beyondSessionCapCredit === 0.5) quality.beyondSessionCapCredit = 1;
  return {
    ...d,
    ...s,
    formulaRevision: 7,
    quality,
    learning: { ...d.learning, ...(s.learning ?? {}) },
    targetOverrides: s.targetOverrides ?? {},
    priorities: s.priorities ?? {},
    id: 'settings',
  };
}
