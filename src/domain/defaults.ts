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
  // Remmert 2025 (preprint): no detectable extra hypertrophy beyond ~11 fractional sets per muscle
  // per session. Sets past that still count, at half credit (tapered, not zeroed).
  sessionCreditCap: 11,
  beyondSessionCapCredit: 0.5,
};

export function defaultSettings(): Settings {
  let tz = 'UTC';
  try {
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    /* keep UTC */
  }
  return {
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
  return {
    ...d,
    ...s,
    quality: { ...d.quality, ...(s.quality ?? {}) },
    learning: { ...d.learning, ...(s.learning ?? {}) },
    targetOverrides: s.targetOverrides ?? {},
    priorities: s.priorities ?? {},
    id: 'settings',
  };
}
