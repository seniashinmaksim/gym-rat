import type { AppData } from './appdata';
import { addDays, diffDays } from './dates';
import { cv, median, type WeekBucket } from './history';
import { L, getLang, num, ruPlural } from '../i18n/core';
import { MUSCLE_BY_ID, TRACKED_MUSCLES, muscleName } from './muscles';
import type { ProgressionSeries } from './progression';
import { roundHalf } from './quality';
import type { RecoveryEstimate } from './recovery';
import type { Registry } from './registry';
import type { MuscleId, TargetConfidence } from './types';
import { volumeDecision, type VolumeAction, type VolumeEvidence } from './volumeResponse';

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
  // A stored start date wins (Settings → Start date, "Restart from today"); without one, Learning starts with
  // the earliest workout on record.
  const startDate = learning.startDate ?? firstWorkout;
  const sessions = startDate ? data.workouts.filter((w) => w.date >= startDate).length : 0;
  const completeWeeks = weeks.filter((w) => w.complete && w.workouts.length > 0).length;
  if (!startDate) {
    return { active: true, startDate: null, dayNumber: 0, lengthDays: learning.lengthDays, daysRemaining: learning.lengthDays, sessions: 0, completeWeeks: 0, extended: false, endedOn: null, message: L('Learning Mode starts with your first logged workout.', 'Режим знакомства начнётся с первой записанной тренировки.') };
  }
  const dayNumber = diffDays(today, startDate) + 1;
  const daysRemaining = Math.max(0, learning.lengthDays - dayNumber + 1);
  if (learning.endedOn) {
    return { active: false, startDate, dayNumber, lengthDays: learning.lengthDays, daysRemaining: 0, sessions, completeWeeks, extended: false, endedOn: learning.endedOn, message: L(`Learning Mode completed on ${learning.endedOn}.`, `Режим знакомства завершён ${learning.endedOn}.`) };
  }
  const timeDone = dayNumber > learning.lengthDays;
  const enoughData = sessions >= MIN_LEARNING_SESSIONS && completeWeeks >= 3;
  if (timeDone && enoughData) {
    return { active: false, startDate, dayNumber, lengthDays: learning.lengthDays, daysRemaining: 0, sessions, completeWeeks, extended: false, endedOn: addDays(startDate, learning.lengthDays), message: L('Calibration period complete — individualized targets are active.', 'Период калибровки завершён — действуют индивидуальные цели.') };
  }
  const extended = timeDone && !enoughData;
  return {
    active: true, startDate, dayNumber, lengthDays: learning.lengthDays, daysRemaining, sessions, completeWeeks, extended, endedOn: null,
    message: extended
      ? L(`Learning extended: ${sessions}/${MIN_LEARNING_SESSIONS} sessions and ${completeWeeks}/3 complete training weeks recorded so far.`,
        `Режим знакомства продлён: пока записано ${sessions}/${MIN_LEARNING_SESSIONS} тренировок и ${completeWeeks}/3 полных тренировочных недель.`)
      : L('Observing your real training before individualizing targets.', 'Наблюдаем за вашими реальными тренировками, прежде чем подбирать индивидуальные цели.'),
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
  /** E.10: what the individual volume logic decided (absent while provisional / manual). */
  volumeAction?: VolumeAction;
  evidence?: VolumeEvidence;
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
    const name = muscleName(m, getLang());
    const override = data.settings.targetOverrides[m];
    const series = usable.map((w) => w.volume.muscles[m].effective);
    const baseline = series.length ? roundHalf(median(series)) : null;
    const trend = muscleTrendSummary(m, progression, registry);
    const rec = recovery[m];

    // Confidence scoring (transparent).
    let score = 0;
    const conf: string[] = [];
    if (usable.length >= 6) { score += 2; conf.push(L('6+ weeks of data', '6+ недель данных')); } else if (usable.length >= 3) { score += 1; conf.push(L(`${usable.length} weeks of data`, `${usable.length} ${ruPlural(usable.length, 'неделя', 'недели', 'недель')} данных`)); } else conf.push(L(`only ${usable.length} complete week(s) of data`, `только ${usable.length} ${ruPlural(usable.length, 'полная неделя', 'полные недели', 'полных недель')} данных`));
    if (rirRatio >= 0.7) { score += 1; conf.push(L(`RIR recorded on ${Math.round(rirRatio * 100)}% of sets`, `RIR записан в ${Math.round(rirRatio * 100)}% подходов`)); } else conf.push(L(`RIR recorded on only ${Math.round(rirRatio * 100)}% of sets`, `RIR записан только в ${Math.round(rirRatio * 100)}% подходов`));
    if (trend.overall !== 'unknown') { score += 1; conf.push(L(`progression evidence from ${trend.exercises} exercise(s)`, `данные о прогрессии по ${trend.exercises} ${ruPlural(trend.exercises, 'упражнению', 'упражнениям', 'упражнениям')}`)); } else conf.push(L('no progression evidence yet', 'данных о прогрессии пока нет'));
    if (series.length >= 3 && cv(series) < 0.35) { score += 1; conf.push(L('consistent weekly volume', 'стабильный недельный объём')); }
    let confidence: TargetConfidence = score >= 4 ? 'high' : score >= 2 ? 'moderate' : 'low';

    if (override) {
      out[m] = { muscle: m, min: override.min, preferred: override.preferred, max: override.max, confidence, provisional: false, source: 'manual', baseline,
        rationale: [L(`Manually set target${override.note ? ` (${override.note})` : ''}.`, `Цель задана вручную${override.note ? ` (${override.note})` : ''}.`), L(`Data confidence: ${conf.join(', ')}.`, `Уверенность в данных: ${conf.join(', ')}.`)] };
      continue;
    }

    if (learning.active || baseline == null) {
      out[m] = {
        muscle: m, ...ref, confidence: 'low', provisional: true, source: 'reference', baseline,
        rationale: [
          L(`Provisional reference range ${ref.min}–${ref.max} (preferred ${ref.preferred}) effective sets/week, based on the volume dose-response literature and ${name.toLowerCase()}-specific indirect work.`,
            `Предварительный ориентир ${num(ref.min)}–${num(ref.max)} (предпочтительно ${num(ref.preferred)}) эффективных подходов в неделю — по исследованиям зависимости результата от объёма и с учётом косвенной нагрузки на эту мышцу (${name.toLowerCase()}).`),
          learning.active
            ? L('Learning Mode: your personal baseline is still being measured, so this is not a quota.', 'Режим знакомства: ваш личный базовый уровень ещё измеряется, поэтому это не норма, которую нужно выполнить.')
            : L('Not enough complete weeks to individualize.', 'Полных недель пока мало для индивидуальной цели.'),
          MUSCLE_BY_ID[m].referenceNote,
        ],
      };
      continue;
    }

    // E.10: each muscle's volume follows ITS OWN response — never raised just to reach a generic reference.
    const decision = volumeDecision({ m, data, usable, recentWeeks: weeks.filter((w) => w.complete).slice(-4), baseline, trend, rec, registry, today: inp.today ?? usable[usable.length - 1].range.end, ref });
    const rationale = [...decision.rationale];
    let preferred = decision.preferred;
    // The owner's explicit priority (not a generic number) allows a gradual +1–2 while nothing argues against it.
    // Only on a NEUTRAL hold (stable / unknown, effort adequate, no break, nothing argues against it), capped at the
    // upper end of the reference range — never on top of a muscle that is progressing or after a failed increase.
    if (data.settings.priorities[m] === 'high' && decision.neutral && !decision.evidence.recoveryPoor && decision.evidence.stableWeeks >= 3 && baseline < ref.max) {
      const step = baseline < 8 ? 1 : 2;
      preferred = Math.min(ref.max, baseline + step);
      rationale.push(L(`Marked high priority: +${step} set${step === 1 ? '' : 's'}/week (gradual), judged over the next weeks.`, `Отмечен высокий приоритет: +${step} ${ruPlural(step, 'подход', 'подхода', 'подходов')} в неделю (постепенно), оценка — по следующим неделям.`));
    }
    // "Maintain" never raises a muscle: an evidence-based increase is not applied (reductions still are).
    let action = decision.action;
    if (data.settings.priorities[m] === 'maintain' && action === 'increase') {
      action = 'hold';
      preferred = baseline;
      rationale.push(L('Marked "maintain": the volume is not raised — it stays at your level.', 'Отмечено «поддерживать»: объём не повышается — остаётся на вашем уровне.'));
    }
    preferred = roundHalf(preferred);
    const min = roundHalf(Math.max(0, Math.min(preferred, preferred * 0.75)));
    const max = roundHalf(Math.max(ref.max, preferred + 4));
    if (data.settings.priorities[m]) rationale.push(L(`Priority: ${data.settings.priorities[m]}.`, `Приоритет: ${({ high: 'высокий', normal: 'обычный', maintain: 'поддерживать' } as Record<string, string>)[data.settings.priorities[m] as string] ?? data.settings.priorities[m]}.`));
    if (usable.length < 3) confidence = 'low';
    rationale.push(L(`Confidence ${confidence}: ${conf.join(', ')}.`, `Уверенность ${({ low: 'низкая', moderate: 'средняя', high: 'высокая' } as Record<string, string>)[confidence] ?? confidence}: ${conf.join(', ')}.`));
    out[m] = { muscle: m, min, preferred, max, confidence, provisional: false, source: 'individualized', baseline, rationale, volumeAction: action, evidence: decision.evidence };
  }
  if (deload) {
    // Deload = reduced volume (≈ half the sets) with moderate effort, not full rest (Bell 2023 consensus;
    // a full week off did not reduce hypertrophy in Coleman 2024).
    for (const m of TRACKED_MUSCLES) {
      const t = out[m];
      out[m] = {
        ...t, min: roundHalf(t.min * 0.5), preferred: roundHalf(t.preferred * 0.5), max: roundHalf(t.max * 0.5),
        rationale: [...t.rationale, L(`Deload block "${deload.name}" is active: targets are halved. Keep loads moderate and stop sets ~3–4 reps short of failure.`, `Идёт блок разгрузки «${deload.name}»: цели уменьшены вдвое. Держите умеренные веса и заканчивайте подходы за ~3–4 повторения до отказа.`)],
      };
    }
  }
  return out;
}
