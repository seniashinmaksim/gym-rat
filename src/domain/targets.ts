import type { AppData } from './appdata';
import { addDays, diffDays } from './dates';
import { cv, median, type WeekBucket } from './history';
import { MUSCLE_BY_ID, TRACKED_MUSCLES, muscleName } from './muscles';
import type { ProgressionSeries } from './progression';
import { roundHalf } from './quality';
import type { RecoveryEstimate } from './recovery';
import type { Registry } from './registry';
import type { MuscleId, TargetConfidence } from './types';

export interface LearningState {
  active: boolean;
  startDate: string | null;
  dayNumber: number;
  lengthDays: number;
  daysRemaining: number;
  sessions: number;
  completeWeeks: number;
  extended: boolean;
  endedOn: string | null;
  message: string;
}

export const MIN_LEARNING_SESSIONS = 6;

export function learningState(data: AppData, today: string, weeks: WeekBucket[]): LearningState {
  const { learning } = data.settings;
  const firstWorkout = data.workouts.length ? data.workouts.reduce((m, w) => (w.date < m ? w.date : m), data.workouts[0].date) : null;
  // Learning starts with the earliest workout on record — imported earlier sessions count too — and
  // never later than the stored start date.
  const startDate = learning.startDate && firstWorkout ? (firstWorkout < learning.startDate ? firstWorkout : learning.startDate) : learning.startDate ?? firstWorkout;
  const sessions = startDate ? data.workouts.filter((w) => w.date >= startDate).length : 0;
  const completeWeeks = weeks.filter((w) => w.complete && w.workouts.length > 0).length;
  if (!startDate) {
    return { active: true, startDate: null, dayNumber: 0, lengthDays: learning.lengthDays, daysRemaining: learning.lengthDays, sessions: 0, completeWeeks: 0, extended: false, endedOn: null, message: 'Learning Mode starts with your first logged workout.' };
  }
  const dayNumber = diffDays(today, startDate) + 1;
  const daysRemaining = Math.max(0, learning.lengthDays - dayNumber + 1);
  if (learning.endedOn) {
    return { active: false, startDate, dayNumber, lengthDays: learning.lengthDays, daysRemaining: 0, sessions, completeWeeks, extended: false, endedOn: learning.endedOn, message: `Learning Mode completed on ${learning.endedOn}.` };
  }
  const timeDone = dayNumber > learning.lengthDays;
  const enoughData = sessions >= MIN_LEARNING_SESSIONS && completeWeeks >= 3;
  if (timeDone && enoughData) {
    return { active: false, startDate, dayNumber, lengthDays: learning.lengthDays, daysRemaining: 0, sessions, completeWeeks, extended: false, endedOn: addDays(startDate, learning.lengthDays), message: 'Calibration period complete — individualized targets are active.' };
  }
  const extended = timeDone && !enoughData;
  return {
    active: true, startDate, dayNumber, lengthDays: learning.lengthDays, daysRemaining, sessions, completeWeeks, extended, endedOn: null,
    message: extended
      ? `Learning extended: ${sessions}/${MIN_LEARNING_SESSIONS} sessions and ${completeWeeks}/3 complete training weeks recorded so far.`
      : 'Observing your real training before individualizing targets.',
  };
}

export interface MuscleTarget {
  muscle: MuscleId;
  min: number;
  preferred: number;
  max: number;
  confidence: TargetConfidence;
  provisional: boolean;
  source: 'reference' | 'individualized' | 'manual';
  baseline: number | null;
  rationale: string[];
}

export interface TargetInputs {
  data: AppData;
  weeks: WeekBucket[];
  learning: LearningState;
  progression: ProgressionSeries[];
  recovery: Record<MuscleId, RecoveryEstimate>;
  registry: Registry;
  /** Local date; enables block-aware targets (deload). */
  today?: string;
}

/** Per-muscle direct-exercise trend summary. */
export function muscleTrendSummary(m: MuscleId, progression: ProgressionSeries[], registry: Registry) {
  const relevant = progression.filter((p) => (registry.get(p.exerciseId)?.contributions[m] ?? 0) >= 0.75 && p.trend.cls !== 'insufficient_data');
  const c = { progressing: 0, stable: 0, plateau: 0, declining: 0 } as Record<string, number>;
  for (const p of relevant) c[p.trend.cls] = (c[p.trend.cls] ?? 0) + 1;
  const n = relevant.length;
  let overall: 'progressing' | 'stable' | 'stalled' | 'declining' | 'unknown' = 'unknown';
  if (n) {
    if (c.declining > n / 2) overall = 'declining';
    else if (c.progressing >= n / 2) overall = 'progressing';
    else if (c.plateau + c.declining >= n / 2) overall = 'stalled';
    else overall = 'stable';
  }
  return { overall, counts: c, exercises: n, series: relevant };
}

function referenceFor(m: MuscleId, data: AppData) {
  const ref = MUSCLE_BY_ID[m].reference!;
  const exp = data.settings.experience;
  const adj = exp === 'novice' ? -2 : exp === 'advanced' ? 2 : 0;
  let r = { min: Math.max(0, ref.min + Math.min(adj, 0)), preferred: Math.max(2, ref.preferred + adj), max: ref.max + Math.max(adj, 0) };
  const pr = data.settings.priorities[m];
  if (pr === 'high') r = { ...r, preferred: Math.min(r.max, r.preferred + 2) };
  if (pr === 'maintain') r = { min: Math.round(r.min * 0.5), preferred: Math.max(2, Math.round(r.min * 0.75)), max: r.max };
  return r;
}

export function computeTargets(inp: TargetInputs): Record<MuscleId, MuscleTarget> {
  const { data, weeks, learning, progression, recovery, registry } = inp;
  const out = {} as Record<MuscleId, MuscleTarget>;
  const usable = weeks.filter((w) => w.complete && w.workouts.length > 0).slice(-6);

  // Data-quality inputs shared across muscles.
  let setsWithRir = 0;
  let workingSets = 0;
  for (const wk of usable) for (const w of wk.workouts) for (const e of w.exercises) for (const s of e.sets) {
    if (s.type === 'warmup') continue;
    workingSets++;
    if (s.rir != null || s.toFailure) setsWithRir++;
  }
  const rirRatio = workingSets ? setsWithRir / workingSets : 0;

  const today = inp.today ?? null;
  const deload = today ? data.blocks.find((b) => b.kind === 'deload' && b.startDate <= today && (!b.endDate || b.endDate >= today)) : undefined;

  for (const m of TRACKED_MUSCLES) {
    const ref = referenceFor(m, data);
    const name = muscleName(m);
    const override = data.settings.targetOverrides[m];
    const series = usable.map((w) => w.volume.muscles[m].effective);
    const baseline = series.length ? roundHalf(median(series)) : null;
    const trend = muscleTrendSummary(m, progression, registry);
    const rec = recovery[m];

    // Confidence scoring (transparent).
    let score = 0;
    const conf: string[] = [];
    if (usable.length >= 6) { score += 2; conf.push('6+ weeks of data'); } else if (usable.length >= 3) { score += 1; conf.push(`${usable.length} weeks of data`); } else conf.push(`only ${usable.length} complete week(s) of data`);
    if (rirRatio >= 0.7) { score += 1; conf.push(`RIR recorded on ${Math.round(rirRatio * 100)}% of sets`); } else conf.push(`RIR recorded on only ${Math.round(rirRatio * 100)}% of sets`);
    if (trend.overall !== 'unknown') { score += 1; conf.push(`progression evidence from ${trend.exercises} exercise(s)`); } else conf.push('no progression evidence yet');
    if (series.length >= 3 && cv(series) < 0.35) { score += 1; conf.push('consistent weekly volume'); }
    let confidence: TargetConfidence = score >= 4 ? 'high' : score >= 2 ? 'moderate' : 'low';

    if (override) {
      out[m] = { muscle: m, min: override.min, preferred: override.preferred, max: override.max, confidence, provisional: false, source: 'manual', baseline,
        rationale: [`Manually set target${override.note ? ` (${override.note})` : ''}.`, `Data confidence: ${conf.join(', ')}.`] };
      continue;
    }

    if (learning.active || baseline == null) {
      out[m] = {
        muscle: m, ...ref, confidence: 'low', provisional: true, source: 'reference', baseline,
        rationale: [
          `Provisional reference range ${ref.min}–${ref.max} (preferred ${ref.preferred}) effective sets/week, based on the volume dose-response literature and ${name.toLowerCase()}-specific indirect work.`,
          learning.active ? 'Learning Mode: your personal baseline is still being measured, so this is not a quota.' : 'Not enough complete weeks to individualize.',
          MUSCLE_BY_ID[m].referenceNote,
        ],
      };
      continue;
    }

    const rationale: string[] = [`Your baseline (median of ${usable.length} recent weeks): ${baseline} effective sets/week.`];
    let preferred: number;
    const poorRecovery = rec.status === 'recovering' && (rec.soreness ?? 0) >= 3;
    if (baseline < ref.min) {
      preferred = Math.min(ref.preferred, baseline + Math.max(2, baseline * 0.25));
      rationale.push(`Below the evidence-informed reference minimum (${ref.min}). Increase gradually (≈ +2 sets or +25%) rather than jumping straight to ${ref.preferred}.`);
    } else if (baseline <= ref.max) {
      if (trend.overall === 'progressing') {
        preferred = baseline;
        rationale.push('Direct exercises are progressing at this volume — keep what is working.');
      } else if (trend.overall === 'stalled' && !poorRecovery) {
        preferred = Math.min(ref.max, baseline + 2);
        rationale.push('Progress has stalled with no sign of poor recovery — a modest +2 sets is a reasonable test.');
      } else if (trend.overall === 'declining') {
        preferred = poorRecovery ? Math.max(ref.min, baseline - 2) : baseline;
        rationale.push(poorRecovery ? 'Performance is declining with recovery warning signs — reduce slightly.' : 'Performance is declining — hold volume and check sleep, rest periods and exercise order before adding sets.');
      } else {
        preferred = (baseline + ref.preferred) / 2;
        rationale.push('Progress is not yet clear — target moves halfway toward the reference preferred value.');
      }
    } else {
      if (trend.overall === 'progressing' && !poorRecovery) {
        preferred = Math.min(baseline, ref.max + 4);
        rationale.push(`Above the typical range (${ref.max}) but still progressing and recovering — no reason to cut, though returns diminish at high volumes.`);
      } else {
        preferred = ref.max;
        rationale.push(`Above the typical range (${ref.max}) without clear progress — reducing toward ${ref.max} is unlikely to cost growth (diminishing returns).`);
      }
    }
    preferred = roundHalf(preferred);
    const min = roundHalf(Math.max(0, Math.min(preferred, preferred * 0.75)));
    const max = roundHalf(Math.max(ref.max, preferred + 4));
    if (data.settings.priorities[m]) rationale.push(`Priority: ${data.settings.priorities[m]}.`);
    rationale.push(`Confidence ${confidence}: ${conf.join(', ')}.`);
    if (usable.length < 3) confidence = 'low';
    out[m] = { muscle: m, min, preferred, max, confidence, provisional: false, source: 'individualized', baseline, rationale };
  }
  if (deload) {
    // Deload = reduced volume (≈ half the sets) with moderate effort, not full rest (Bell 2023 consensus;
    // a full week off did not reduce hypertrophy in Coleman 2024).
    for (const m of TRACKED_MUSCLES) {
      const t = out[m];
      out[m] = {
        ...t, min: roundHalf(t.min * 0.5), preferred: roundHalf(t.preferred * 0.5), max: roundHalf(t.max * 0.5),
        rationale: [...t.rationale, `Deload block "${deload.name}" is active: targets are halved. Keep loads moderate and stop sets ~3–4 reps short of failure.`],
      };
    }
  }
  return out;
}
