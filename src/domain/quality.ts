import { EFFORT_LABEL, FEEL_BY_ID, estimatedRirRange, formatRirRange, hasPain, painAreaLabel, type SetStatus } from './feedback';
import { failureImpliedRir, techniqueWithFailure } from './failure';
import { L, num } from '../i18n/core';
import { creditForRir, crossCheck, type Disagreement, type Objective } from './perception';
import type { QualityModel, Rom, Workout, WorkoutSet } from './types';

export type EffortTier = 'warmup' | 'high_effort' | 'working' | 'low_effort' | 'unknown';

export interface SetQuality {
  /** 0..1 multiplier applied to the muscle coefficient. */
  credit: number;
  tier: EffortTier;
  /** True when effort data is missing or only estimated — the set is kept, but its stimulus is uncertain. */
  uncertain: boolean;
  /** Effort came from the owner's feel (estimated RIR range), not from a logged RIR. */
  estimated?: boolean;
  /**
   * Where the effort credit came from: a logged RIR, the "Fail" chip / to_failure (RIR 0), a recorded
   * muscular failure without RIR (≈ RIR 0), how the set felt (estimate), or nothing (provisional).
   */
  effortSource?: 'rir' | 'to_failure' | 'failure_status' | 'feel' | 'numbers' | 'none';
  /**
   * The reported effort and the logged numbers clearly disagree (Part 6): felt_harder = rated harder than the
   * numbers show, felt_easier = rated easier. The stored answer is never changed.
   */
  disagreement?: Disagreement;
  /** What the numbers of this exercise say about the set (when the caller supplied it). */
  objective?: Objective;
  /** Quality status for display and per-muscle counts (good / easy / compromised / pain / uncertain). */
  status: SetStatus | 'warmup';
  reasons: string[];
}

export interface SetContext {
  /** Exercise-level ROM from the variation (used when the set itself has none). */
  rom?: Rom | null;
  /** Timed exercise (plank, carry) logged as a single "rep": the low-rep rule does not apply. */
  timed?: boolean;
  /**
   * What the logged numbers of the same exercise say about this set (`objectiveForSets`). With it, effort is
   * cross-checked: ramp sets far from failure earn less or nothing, and a report the numbers clearly contradict
   * is credited by the numbers (rules `warmup_by_reserve`, `perception_check`).
   */
  objective?: Objective;
}

/**
 * Transparent set-quality model. Keeps EFFORT separate from MUSCLE PARTICIPATION:
 * this returns only the effort/quality multiplier; muscle coefficients are applied later.
 */
export function assessSet(set: WorkoutSet, m: QualityModel, ctx: SetContext = {}): SetQuality {
  if (set.type === 'warmup') return { credit: 0, tier: 'warmup', uncertain: false, status: 'warmup', reasons: [L('Warm-up set (not counted)', 'Разминочный подход (не засчитывается)')] };

  const reasons: string[] = [];
  let credit: number;
  let tier: EffortTier;
  let uncertain = false;
  let estimated = false;

  // The "Fail" chip means RIR 0 only when technique held: when technique gave out first, the muscle may have had
  // reps left, so effort is unknown — the same as a muscular-failure answer with technical failure.
  const rir = set.rir ?? (set.toFailure && set.technicalFailure !== true ? 0 : null);
  // Muscular failure recorded (technique held) but no RIR → effort treated like RIR 0. This is NOT
  // extra credit: RIR 0–3 all earn the same credit, because failure is not shown to grow more muscle.
  const failRir = rir == null ? failureImpliedRir(set) : null;
  const est = m.useFeelWhenNoRir === false ? null : estimatedRirRange(set);
  let effortSource: SetQuality['effortSource'];
  const chk = m.useNumbersCheck !== false && ctx.objective ? crossCheck(set, ctx.objective, m.useFeelWhenNoRir !== false) : null;
  if (chk?.use === 'numbers' && chk.rir != null) {
    // The numbers decide: a load-based estimate of the reserve (ramp / back-off set), or a rep collapse on the
    // next set. Same credit table as a logged RIR; without a report never above the provisional credit.
    const table = creditForRir(chk.rir, m);
    credit = chk.capAtProvisional ? Math.min(table, m.unknownRirCredit) : table;
    tier = chk.rir >= 4 ? 'low_effort' : chk.capAtProvisional ? 'unknown' : chk.rir <= 1 ? 'high_effort' : 'working';
    uncertain = true;
    estimated = true;
    effortSource = 'numbers';
    const o = ctx.objective as Objective;
    if (o.estRir != null) {
      const capped = chk.capAtProvisional && table > credit;
      reasons.push(L(
        `By the numbers: about ${o.possibleReps} reps were possible at this load (an estimate from the best set of this exercise today, the lower of two standard equations), ${set.reps} done → ≈ ${o.estRir} in reserve → credit ${credit}${capped ? ' (no effort answer: not above the provisional credit)' : ''}`,
        `По цифрам: с этим весом было возможно около ${o.possibleReps} повторений (оценка по лучшему подходу упражнения сегодня, меньшая из двух стандартных формул), сделано ${set.reps} → ≈ ${o.estRir} в запасе → зачёт ${credit}${capped ? ' (без оценки усилия: не выше предварительного зачёта)' : ''}`,
      ));
    } else {
      reasons.push(L(
        `By the numbers: reps fell by 2 or more on the next set at the same load after a normal rest → this set was likely close to the limit (a rule of thumb) → credit ${credit}`,
        `По цифрам: в следующем подходе с тем же весом после обычного отдыха повторений стало меньше на 2 и более → этот подход, вероятно, был близок к пределу (практическое правило) → зачёт ${credit}`,
      ));
    }
    if (chk.disagreement === 'felt_harder') reasons.push(L('You rated it harder than the numbers show — your answer is kept; the credit follows the numbers', 'Вы оценили подход тяжелее, чем показывают цифры — ответ сохранён; зачёт идёт по цифрам'));
    if (chk.disagreement === 'felt_easier') reasons.push(L('You rated it easier than the numbers show — your answer is kept; the credit follows the numbers', 'Вы оценили подход легче, чем показывают цифры — ответ сохранён; зачёт идёт по цифрам'));
  } else if (rir == null && failRir != null) {
    const idx = Math.max(0, Math.min(failRir, m.rirCredit.length - 1));
    credit = m.rirCredit[idx];
    tier = 'high_effort';
    effortSource = 'failure_status';
    reasons.push(L(
      `No RIR logged; muscular failure recorded ≈ RIR 0 (from the failure status) → credit ${credit} (same as RIR 1–3: failure earns no extra credit)`,
      `RIR не записан; отмечен мышечный отказ ≈ RIR 0 (по отметке об отказе) → зачёт ${num(credit)} (как при RIR 1–3: отказ не даёт дополнительного зачёта)`,
    ));
  } else if (rir == null && est) {
    // No RIR logged, but the owner said how it felt: the AVERAGE of the evidence-based RIR table over the
    // estimated range (owner's decision 2026-11-24: EASY 3–4 → (1.0 + 0.6) ÷ 2 = 0.8, so an answer is never
    // worth less than no answer; "5+" → 5). Marked as an estimate. The tier still follows the range's higher end.
    const r = est[1] ?? est[0];
    const at = (x: number) => m.rirCredit[Math.max(0, Math.min(x, m.rirCredit.length - 1))];
    credit = round2((at(est[0]) + at(r)) / 2);
    tier = r <= 1 ? 'high_effort' : r <= 3 ? 'working' : 'low_effort';
    uncertain = true;
    estimated = true;
    effortSource = 'feel';
    reasons.push(L(
      `No RIR logged. Felt "${EFFORT_LABEL[set.effort!]}" ≈ RIR ${formatRirRange(est)} (estimate, not measured) → credit ${credit}`,
      `RIR не записан. Ощущение «${EFFORT_LABEL[set.effort!]}» ≈ RIR ${formatRirRange(est)} (оценка, не измерение) → зачёт ${num(credit)}`,
    ));
  } else if (rir == null) {
    credit = m.unknownRirCredit;
    tier = 'unknown';
    uncertain = true;
    effortSource = 'none';
    reasons.push(L(`Effort unknown (no RIR) → provisional credit ${m.unknownRirCredit}`, `Усилие неизвестно (нет RIR) → предварительный зачёт ${num(m.unknownRirCredit)}`));
    if (set.failure === 'none') reasons.push(L('Stopped before failure (no RIR) — at least 1 rep in reserve, exact effort unknown', 'Остановка до отказа (без RIR) — в запасе не меньше 1 повторения, точное усилие неизвестно'));
    else if (set.failure === 'uncertain') reasons.push(L('Not sure whether failure was reached — effort stays unknown', 'Неясно, был ли отказ — усилие остаётся неизвестным'));
  } else {
    const idx = Math.max(0, Math.min(Math.round(rir), m.rirCredit.length - 1));
    credit = m.rirCredit[idx];
    tier = rir <= 1 ? 'high_effort' : rir <= 3 ? 'working' : 'low_effort';
    effortSource = set.rir != null ? 'rir' : 'to_failure';
    reasons.push(L(`RIR ${rir} → credit ${credit}`, `RIR ${num(rir)} → зачёт ${num(credit)}`));
    if (set.rirSource === 'inferred') {
      uncertain = true;
      reasons.push(L('RIR was inferred, not reported', 'RIR выведен из описания, а не указан прямо'));
    }
  }

  if (set.reps == null) {
    uncertain = true;
    reasons.push(L('Reps not recorded', 'Повторения не записаны'));
  } else if (set.reps < m.minRepsForCredit) {
    credit = 0;
    reasons.push(L('No completed reps', 'Нет выполненных повторений'));
  } else if (set.reps < m.lowRepThreshold && !ctx.timed) {
    credit *= m.lowRepCredit;
    reasons.push(L(`Very low reps (<${m.lowRepThreshold}) ×${m.lowRepCredit}`, `Очень мало повторений (<${m.lowRepThreshold}) ×${num(m.lowRepCredit)}`));
  }

  if (set.type === 'drop') {
    credit *= m.dropSetCredit;
    reasons.push(L(`Drop-set segment ×${m.dropSetCredit}`, `Часть дроп-сета ×${num(m.dropSetCredit)}`));
  }
  const rom = set.rom ?? ctx.rom ?? null;
  if (rom === 'partial') {
    credit *= m.partialRomCredit;
    reasons.push(L(`Partial ROM ×${m.partialRomCredit}`, `Неполная амплитуда ×${num(m.partialRomCredit)}`));
  } else if (rom === 'lengthened_partial') {
    credit *= m.lengthenedPartialCredit;
    reasons.push(L(`Lengthened partials ×${m.lengthenedPartialCredit}`, `Частичные повторения в растянутом положении ×${num(m.lengthenedPartialCredit)}`));
  }
  if (rir != null && set.feel && FEEL_BY_ID[set.feel]?.effort) reasons.push(L(`Feel: ${FEEL_BY_ID[set.feel].title} (logged RIR is used for effort)`, `Ощущение: ${FEEL_BY_ID[set.feel].title} (усилие берётся по записанному RIR)`));
  // Technical failure (technique gave out) counts as compromised technique unless technique was explicitly good.
  const technique = techniqueWithFailure(set);
  if (set.technicalFailure === true) {
    reasons.push(technique === 'good'
      ? L('Technical failure recorded although technique is marked good — please check', 'Отмечен отказ по технике, хотя техника оценена как хорошая — проверьте')
      : L('Technical failure: technique gave out — not a clean muscular-failure set', 'Отказ по технике: подвела техника — это не чистый подход до мышечного отказа'));
  }
  if (technique === 'compromised' || technique === 'failed') {
    credit *= m.compromisedTechniqueCredit;
    reasons.push(L(
      `${technique === 'failed' ? 'Could not complete correctly' : 'Technique compromised'} — less certain the target muscle did the work ×${m.compromisedTechniqueCredit}`,
      `${technique === 'failed' ? 'Не удалось выполнить правильно' : 'Техника нарушена'} — меньше уверенности, что работала целевая мышца ×${num(m.compromisedTechniqueCredit)}`,
    ));
    if (technique === 'failed') uncertain = true;
  } else if (technique === 'slightly_degraded') {
    reasons.push(L('Technique slightly degraded (no reduction)', 'Техника немного хуже (без снижения зачёта)'));
  }
  const pain = hasPain(set);
  if (pain) {
    uncertain = true;
    reasons.push(L(
      `Pain / unusual discomfort${set.pain?.area ? ` (${set.pain.area})` : ''} — kept, but not counted as a high-confidence quality set`,
      `Боль / необычный дискомфорт${set.pain?.area ? ` (${painAreaLabel(set.pain.area)})` : ''} — подход сохранён, но не считается надёжно качественным`,
    ));
  }
  if (set.weightAccuracy === 'too_light' || set.weightAccuracy === 'too_heavy') {
    reasons.push(L('Wrong weight picked by accident — counts for volume by its effort, but is not a progression benchmark', 'Вес взят по ошибке — в объём идёт по усилию, но для оценки прогрессии не используется'));
  }

  const status: SetStatus = pain ? 'pain'
    : technique === 'compromised' || technique === 'failed' ? 'compromised'
    : tier === 'low_effort' ? 'easy'
    : tier === 'unknown' ? 'uncertain'
    : 'good';
  if (chk?.use === 'reported' && chk.disagreement === 'felt_harder') {
    reasons.push(L('Rated at the limit, but the next set at the same load matched it — the numbers suggest a little reserve (credit unchanged)', 'Оценён как предельный, но следующий подход с тем же весом получился не хуже — по цифрам запас был (зачёт не меняется)'));
  }
  return { credit: round2(credit), tier, uncertain, estimated, effortSource, status, reasons, ...(chk?.disagreement ? { disagreement: chk.disagreement } : {}), ...(ctx.objective ? { objective: ctx.objective } : {}) };
}

/** A set counts only once it has been performed (planned/pre-filled sets are ignored). */
export function isCounted(s: WorkoutSet): boolean {
  return !s.planned;
}

/** Copy of the workouts with planned (not yet performed) sets removed. */
export function stripPlanned(workouts: Workout[]): Workout[] {
  return workouts.map((w) => (w.exercises.some((e) => e.sets.some((s) => s.planned))
    ? { ...w, exercises: w.exercises.map((e) => ({ ...e, sets: e.sets.filter(isCounted) })) }
    : w));
}

/**
 * How much each set of ONE exercise entry counts as a "set" (1 normally).
 * Unilateral sets logged per side are paired in order within the same set type: the i-th left
 * and the i-th right set together make ONE set (0.5 each, so the pair's credit is the average
 * of the two sides). A side without a partner counts as a full set. 3 L + 3 R = 3 sets, never 6.
 */
export function sideFactors(sets: WorkoutSet[]): Map<string, number> {
  const out = new Map<string, number>();
  const byType = new Map<string, { left: string[]; right: string[] }>();
  for (const s of sets) {
    out.set(s.id, 1);
    if (!s.side || !isCounted(s) || s.type === 'warmup') continue;
    const g = byType.get(s.type) ?? { left: [], right: [] };
    g[s.side].push(s.id);
    byType.set(s.type, g);
  }
  for (const g of byType.values()) {
    const pairs = Math.min(g.left.length, g.right.length);
    for (let i = 0; i < pairs; i++) {
      out.set(g.left[i], 0.5);
      out.set(g.right[i], 0.5);
    }
  }
  return out;
}

/**
 * Ends left/right logging without changing the set count: the i-th left and i-th right set
 * become ONE set (the left one is kept, its partner removed); unpaired sides just lose the tag.
 */
export function mergeSides(sets: WorkoutSet[]): WorkoutSet[] {
  const f = sideFactors(sets);
  return sets.filter((s) => !(s.side === 'right' && f.get(s.id) === 0.5))
    .map((s) => { if (!s.side) return s; const { side: _s, ...rest } = s; void _s; return rest; });
}

/** Number of working-or-drop sets in an exercise entry after left/right pairing (warm-ups and planned sets excluded). */
export function countedSetCount(sets: WorkoutSet[], types: WorkoutSet['type'][] = ['working', 'drop']): number {
  const f = sideFactors(sets);
  return sets.filter((s) => isCounted(s) && types.includes(s.type)).reduce((a, s) => a + (f.get(s.id) ?? 1), 0);
}

/**
 * Applies the per-session ceiling: effective volume for one muscle above `cap` in a single
 * session is multiplied by `beyond`. Returns the credited amount for this set.
 */
export function taperBeyondCap(runningBefore: number, eff: number, cap: number, beyond: number): number {
  if (!(cap > 0) || runningBefore + eff <= cap) return eff;
  if (runningBefore >= cap) return eff * beyond;
  const under = cap - runningBefore;
  return under + (eff - under) * beyond;
}

/**
 * Half-up rounding that does not depend on floating-point noise or summation order: 0.75 × 0.7
 * (= 0.5249999999999999 in binary) and 0.455 vs 0.45499999999999996 round the way the decimal value
 * does. The nudge (1e-9 of a step) is far below any real difference between set credits.
 */
const stable = (n: number, steps: number) => Math.round(n * steps + Math.sign(n) * 1e-9) / steps;

export function round2(n: number): number {
  return stable(n, 100);
}

export function round1(n: number): number {
  return stable(n, 10);
}

export function roundHalf(n: number): number {
  return stable(n, 2);
}

/**
 * Is the set at index `i` the second half of a left/right pair? True when more sets of the other side
 * than of its own side came before it (same set type) — the same pairing rule as `sideFactors`.
 * The gap before a second side is not rest between sets.
 */
export function isSecondSide(sets: WorkoutSet[], i: number): boolean {
  const s = sets[i];
  if (!s?.side) return false;
  const earlier = sets.slice(0, i).filter((o) => o.type === s.type && o.side);
  return earlier.filter((o) => o.side !== s.side).length > earlier.filter((o) => o.side === s.side).length;
}
