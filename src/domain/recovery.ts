import type { AppData } from './appdata';
import { addDays, diffDays, sessionEndVirtualMs, type SessionTimeSource } from './dates';
import { MUSCLE_BY_ID, TRACKED_MUSCLES } from './muscles';
import { L, byLang, num, ruPlural } from '../i18n/core';
import { isFailureSetForFatigue } from './failure';
import { sideFactors } from './quality';
import { resolveCoefficients, type Registry } from './registry';
import type { MuscleId } from './types';
import { computeVolume, sessionMuscleEffective } from './volume';

export type RecoveryStatus = 'likely_recovered' | 'recovering' | 'insufficient_data';

export interface RecoveryEstimate {
  muscle: MuscleId;
  status: RecoveryStatus;
  /** Rough probability-style readiness 0..1 (heuristic, not a biological measurement). */
  readiness: number | null;
  hoursSince: number | null;
  lastStimulusDate: string | null;
  /** Local time (HH:mm) the last significant session ended, and how that time is known. */
  lastStimulusTime: string | null;
  lastStimulusTimeSource: SessionTimeSource | null;
  lastStimulusSets: number;
  windowHours: number | null;
  /** Hours until the window ends (0 when recovered or no data) — whole hours, for display. */
  hoursLeft: number;
  /** The same, not rounded — every decision (the 6 h tolerance) uses this. */
  hoursLeftExact: number;
  recent7dEffective: number;
  recent7dDirect: number;
  recent7dIndirect: number;
  exposures14d: number;
  soreness: number | null;
  /** Hours the owner's reported state adds to any window today (soreness, sleep, fatigue) — used by the forward checks. */
  conditionsExtraH: number;
  factors: string[];
}

export const TIME_SOURCE_LABEL: Record<SessionTimeSource, string> = byLang(() => ({
  last_set: L('when the last set was ticked', 'по отметке последнего подхода'),
  end_time: L('session end time', 'время окончания тренировки'),
  start_plus_duration: L('start time + duration', 'время начала + длительность'),
  start_time: L('start time — no end time recorded', 'время начала — окончание не записано'),
  assumed: L('no time recorded — 18:00 assumed', 'время не записано — принято 18:00'),
}));

/**
 * Exercise ids that are the SAME movement for the "new exercise" (+12 h) rule. Some exercises were
 * split into more specific ids later (e.g. pushdown → bar / rope); switching between members of one
 * family is not a novel stimulus. Deliberately NOT paired: hanging_leg_raise vs
 * hanging_knee_raise_pelvic_curl (different exercises).
 */
export const MOVEMENT_FAMILIES: readonly (readonly string[])[] = [
  ['triceps_pushdown', 'triceps_pushdown_bar', 'triceps_pushdown_rope'],
  ['barbell_curl', 'ez_bar_curl'],
  ['preacher_curl', 'machine_biceps_curl'],
  ['romanian_deadlift', 'dumbbell_romanian_deadlift'],
];

const FAMILY_OF = new Map<string, string>(MOVEMENT_FAMILIES.flatMap((f) => f.map((id) => [id, f[0]] as const)));

/** Canonical movement id for novelty checks (the exercise id itself when it has no family). */
export function movementFamily(exerciseId: string): string {
  return FAMILY_OF.get(exerciseId) ?? exerciseId;
}

export function sameMovement(a: string, b: string): boolean {
  return movementFamily(a) === movementFamily(b);
}

/** Baseline window by the size of the last significant session (effective sets for the muscle). */
/** How far back an earlier session can still hold a muscle: the longest window the rules can give (72 + 12 × 5 + 24 = 156 h), rounded up to a week. */
export const RECOVERY_LOOKBACK_H = 168;
/** A muscle marked "sore" (≥ 3) today is held for at least this long from now, whatever the windows say (a heuristic). */
export const SORE_TODAY_HOLD_H = 12;

export interface WindowInputs {
  /** Effective sets of the session for this muscle. */
  sets: number;
  large: boolean;
  failureSets?: number;
  novel?: boolean;
  soreness?: number | null;
  avgSleep?: number | null;
  maxFatigue?: number | null;
}

/**
 * The recovery window of one session for one muscle — ONE formula for the recovery screen, the next-session checks and
 * the week fit (owner 2026-11-24): base by effective sets; + 12 h large muscle after > 9 sets; + 12 h for ≥ 2 sets to
 * failure (Morán-Navarro 2017, acute); + 12 h exercise new in 3 weeks; soreness ≥ 2 + 12 h, ≥ 3 + 24 h; sleep < 6 h
 * + 12 h; fatigue ≥ 4 + 12 h. All numbers are heuristics (rule recovery_windows).
 */
export function windowHours(i: WindowInputs): number {
  let w = baseWindowHours(i.sets);
  if (i.large && i.sets > 9) w += 12;
  return w + conditionsExtraH(i) + ((i.failureSets ?? 0) >= 2 ? 12 : 0) + (i.novel ? 12 : 0);
}

/** The additions known from how the owner feels (soreness, sleep, fatigue) — they apply to any session's window. */
export function conditionsExtraH(i: Pick<WindowInputs, 'soreness' | 'avgSleep' | 'maxFatigue'>): number {
  let h = 0;
  if (i.soreness != null && i.soreness >= 3) h += 24;
  else if (i.soreness != null && i.soreness >= 2) h += 12;
  if (i.avgSleep != null && i.avgSleep < 6) h += 12;
  if (i.maxFatigue != null && i.maxFatigue >= 4) h += 12;
  return h;
}

export function baseWindowHours(sets: number): number {
  return sets <= 3 ? 24 : sets <= 6 ? 36 : sets <= 9 ? 48 : sets <= 12 ? 60 : 72;
}

export interface RecoveryOptions {
  /** Ignore sessions dated on/after this day (planning view: "entering today's session"). */
  before?: string;
}

/**
 * Heuristic recovery model. Recovery time scales with the size of the last stimulus and is
 * extended by failure training, exercise novelty, reported soreness, short sleep and high
 * fatigue. Familiar, non-failure work largely recovers within 24–48 h; failure sets add
 * roughly a day (Morán-Navarro 2017); new exercises cause more damage (Damas 2016/2018).
 * Output is guidance, not a claim about the true biological state of the muscle.
 */
export function estimateRecovery(data: AppData, registry: Registry, nowVirtualMs: number, today: string, opts: RecoveryOptions = {}): Record<MuscleId, RecoveryEstimate> {
  const { quality, significantStimulusSets, timezone } = data.settings;
  // Recovery is counted from when the session ENDED (last ticked set, end time, start + duration,
  // start time, else an assumed 18:00). A session dated today or earlier whose estimated time is
  // still in the future has obviously already happened (it was logged), so it is treated as "now".
  const endCache = new Map<string, { ms: number; source: SessionTimeSource }>();
  const endOf = (w: (typeof data.workouts)[number]) => {
    let e = endCache.get(w.id);
    if (!e) {
      e = sessionEndVirtualMs(w, timezone);
      endCache.set(w.id, e);
    }
    return e;
  };
  const at = (w: (typeof data.workouts)[number]) => {
    const v = endOf(w).ms;
    return w.date <= today && v > nowVirtualMs ? nowVirtualMs : v;
  };
  const pool = opts.before ? data.workouts.filter((w) => w.date < opts.before!) : data.workouts;
  const sorted = [...pool].sort((a, b) => at(b) - at(a));
  const recent7 = data.workouts.filter((w) => diffDays(today, w.date) >= 0 && diffDays(today, w.date) < 7);
  const vol7 = computeVolume(recent7, registry, quality);
  const recent14 = sorted.filter((w) => diffDays(today, w.date) >= 0 && diffDays(today, w.date) < 14);
  // A muscle is "significantly stimulated" by contributions of 0.5 or more only: minor 0.25 credits (grip,
  // bracing) add up over many sets but should not start a recovery hold on a muscle that only stabilised.
  const SIG = { minCoef: 0.5 };
  const perSession14 = recent14.map((w) => sessionMuscleEffective(w, registry, quality, SIG));

  // Subjective inputs from the last 3 days (daily logs + session wellness).
  const since = addDays(today, -2);
  const recentDaily = data.daily.filter((d) => d.date >= since && d.date <= today);
  const recentWell = data.workouts.filter((w) => w.date >= since && w.date <= today && w.wellness).map((w) => w.wellness!);
  const sleepVals = [...recentDaily.map((d) => d.sleepHours), ...recentWell.map((w) => w.sleepHours)].filter((v): v is number => v != null);
  const fatigueVals = [...recentDaily.map((d) => d.fatigue), ...recentWell.map((w) => w.fatigue)].filter((v): v is number => v != null);
  const avgSleep = sleepVals.length ? sleepVals.reduce((a, b) => a + b, 0) / sleepVals.length : null;
  const maxFatigue = fatigueVals.length ? Math.max(...fatigueVals) : null;

  const out = {} as Record<MuscleId, RecoveryEstimate>;
  for (const m of TRACKED_MUSCLES) {
    // Every significant session that could still hold the muscle (Part 7 G.1 #4): the most recent one, and any
    // earlier one inside the longest possible window. A big Monday session is not "over" because a small Tuesday one is.
    type Cand = { date: string; sets: number; workout: (typeof sorted)[number] };
    const cands: Cand[] = [];
    for (const w of sorted) {
      if (at(w) > nowVirtualMs) continue;
      const eff = sessionMuscleEffective(w, registry, quality, SIG)[m] ?? 0;
      if (eff < significantStimulusSets) continue;
      if (cands.length && nowVirtualMs - at(w) > RECOVERY_LOOKBACK_H * 3_600_000) break;
      cands.push({ date: w.date, sets: eff, workout: w });
    }
    const last0 = cands[0] ?? null;
    const soreVals = [
      ...recentDaily.map((d) => d.soreness?.[m]),
      ...recentWell.map((w) => w.soreness?.[m]),
    ].filter((v): v is number => v != null);
    const soreness = soreVals.length ? Math.max(...soreVals) : null;
    const v7 = vol7.muscles[m];
    const exposures14d = perSession14.filter((s) => (s[m] ?? 0) >= significantStimulusSets).length;
    const base = {
      muscle: m,
      recent7dEffective: v7.effective,
      recent7dDirect: v7.directSets,
      recent7dIndirect: v7.indirectSets,
      exposures14d,
      soreness,
      conditionsExtraH: conditionsExtraH({ soreness, avgSleep, maxFatigue }),
    };

    // Soreness reported TODAY is the owner's own signal (owner 2026-11-25: asked for every muscle before training):
    // "sore" (≥ 3) holds the muscle for today whatever the windows say — at least 12 h from now.
    const soreToday = Math.max(0, ...[...data.daily.filter((d) => d.date === today).map((d) => d.soreness?.[m]), ...data.workouts.filter((w) => w.date === today).map((w) => w.wellness?.soreness?.[m])].filter((v): v is number => v != null));
    const soreHold = soreToday >= 3 ? SORE_TODAY_HOLD_H : 0;
    if (!last0 && soreHold) {
      out[m] = {
        ...base, status: 'recovering', readiness: null, hoursSince: null, lastStimulusDate: null, lastStimulusTime: null, lastStimulusTimeSource: null, lastStimulusSets: 0,
        windowHours: null, hoursLeft: soreHold, hoursLeftExact: soreHold,
        factors: [L('You marked it as sore today — better not today.', 'Сегодня вы отметили, что мышца болит, — лучше не сегодня.')],
      };
      continue;
    }
    if (!last0) {
      out[m] = {
        ...base, status: 'insufficient_data', readiness: null, hoursSince: null, lastStimulusDate: null, lastStimulusTime: null, lastStimulusTimeSource: null, lastStimulusSets: 0,
        windowHours: null, hoursLeft: 0, hoursLeftExact: 0,
        factors: [L(`No session with ≥${significantStimulusSets} effective sets for this muscle is recorded.`, `Не записано ни одной тренировки, давшей этой мышце ≥${num(significantStimulusSets)} эффективных подходов.`)],
      };
      continue;
    }

    // The window of one session (its own sets, failure sets, novelty; soreness, sleep and fatigue are today's).
    const assess = (last: Cand) => {
      const factors: string[] = [];
      const endedAt = at(last.workout);
      const src = endOf(last.workout).source;
      const hoursSince = Math.max(0, (nowVirtualMs - endedAt) / 3_600_000);
      const endedHHMM = new Date(endedAt).toISOString().slice(11, 16);
      factors.push(L(`Counted from ${endedHHMM} on ${new Date(endedAt).toISOString().slice(0, 10)} (${TIME_SOURCE_LABEL[src]}) — ${Math.round(hoursSince)} h ago.`,
        `Отсчёт от ${endedHHMM} ${new Date(endedAt).toISOString().slice(0, 10)} (${TIME_SOURCE_LABEL[src]}) — ${Math.round(hoursSince)} ч назад.`));
      let window = baseWindowHours(last.sets);
      factors.push(L(`Last significant stimulus: ${last.sets.toFixed(1)} effective sets → baseline window ~${window} h.`, `Последняя значимая нагрузка: ${num(last.sets, 1)} эффективных подходов → базовое окно ~${window} ч.`));
      if (MUSCLE_BY_ID[m].size === 'large' && last.sets > 9) {
        factors.push(L('Large muscle with a very high-volume session: +12 h.', 'Крупная мышца и очень объёмная тренировка: +12 ч.'));
      }
      // Sets taken to failure slow recovery by roughly a day (Morán-Navarro 2017); unfamiliar
      // exercises cause more damage than familiar ones (repeated-bout effect, Damas 2016/2018).
      // Coefficients of the variation as logged (bench angle, grip, squat depth) — the same ones the volume uses.
      const hitsM = (e: (typeof data.workouts)[number]['exercises'][number], min: number) => {
        const def = registry.get(e.exerciseId);
        return !!def && (resolveCoefficients(def, e.variation).contributions[m] ?? 0) >= min;
      };
      // A left + right pair to failure is one set, not two.
      const failureSets = last.workout.exercises.filter((e) => hitsM(e, 0.5)).reduce((n, e) => {
        const f = sideFactors(e.sets);
        // Fail chip / RIR 0 / muscular failure / technical failure all count as a failure set here.
        return n + e.sets.filter((s) => s.type !== 'warmup' && !s.planned && isFailureSetForFatigue(s)).reduce((a, s) => a + (f.get(s.id) ?? 1), 0);
      }, 0);
      if (failureSets >= 2) {
        factors.push(L(`${failureSets} sets to failure in that session: +12 h.`, `На той тренировке ${num(failureSets)} ${ruPlural(failureSets, 'подход', 'подхода', 'подходов')} до отказа: +12 ч.`));
      }
      const lastDate = last.date;
      // "New" needs at least one PERFORMED working set: a card holding only a warm-up or an unticked planned set
      // did not load the muscle in an unfamiliar way.
      const performedWork = (e: (typeof data.workouts)[number]['exercises'][number]) => e.sets.some((s) => s.type !== 'warmup' && !s.planned);
      const novel = last.workout.exercises.filter((e) => hitsM(e, 0.75) && performedWork(e)).filter((e) =>
        !data.workouts.some((o) => o.date < lastDate && diffDays(lastDate, o.date) <= 21 && o.exercises.some((x) => sameMovement(x.exerciseId, e.exerciseId))));
      if (novel.length && data.workouts.some((o) => o.date < lastDate)) {
        factors.push(L('Exercise new to you in the last 3 weeks (more muscle damage expected): +12 h.', 'Упражнение, новое для вас за последние 3 недели (ожидается больше повреждения мышц): +12 ч.'));
      }
      if (soreness != null && soreness >= 3) {
        factors.push(L(`Reported soreness ${soreness}/4: +24 h.`, `Отмеченная болезненность ${soreness}/4: +24 ч.`));
      } else if (soreness != null && soreness >= 2) {
        factors.push(L(`Reported soreness ${soreness}/4: +12 h.`, `Отмеченная болезненность ${soreness}/4: +12 ч.`));
      }
      if (avgSleep != null && avgSleep < 6) {
        factors.push(L(`Recent sleep ~${avgSleep.toFixed(1)} h (<6 h): +12 h.`, `Сон в последние дни ~${num(avgSleep, 1)} ч (<6 ч): +12 ч.`));
      }
      if (maxFatigue != null && maxFatigue >= 4) {
        factors.push(L(`High reported fatigue (${maxFatigue}/5): +12 h.`, `Высокая отмеченная усталость (${maxFatigue}/5): +12 ч.`));
      }
      // ONE formula for the window (the forward checks and the week fit use it too — owner 2026-11-24).
      window = windowHours({ sets: last.sets, large: MUSCLE_BY_ID[m].size === 'large', failureSets, novel: !!novel.length && data.workouts.some((o) => o.date < lastDate), soreness, avgSleep, maxFatigue });
      return { endedAt, src, hoursSince, endedHHMM, window, factors };
    };
    const all = cands.map((c) => ({ c, a: assess(c) }));
    const open = all.filter((x) => x.a.hoursSince < x.a.window);
    // Still open: the session whose window ends LAST decides; otherwise the most recent one is shown.
    const pick = open.length ? open.reduce((b, x) => (x.a.endedAt + x.a.window * 3_600_000 > b.a.endedAt + b.a.window * 3_600_000 ? x : b)) : all[0];
    const last = pick.c;
    const { src, hoursSince, endedHHMM, window, factors } = pick.a;
    if (pick !== all[0]) factors.unshift(L(`A later session (${all[0].c.date}, ${all[0].c.sets.toFixed(1)} effective sets) needs less recovery; the bigger one on ${last.date} still holds the muscle.`,
      `Более поздняя тренировка (${all[0].c.date}, ${num(all[0].c.sets, 1)} эффективных подходов) требует меньше восстановления; более объёмная ${last.date} ещё держит мышцу.`));
    const readiness = Math.max(0, Math.min(1, hoursSince / window));
    let status: RecoveryStatus = hoursSince >= window ? 'likely_recovered' : 'recovering';
    if (soreness != null && soreness >= 3 && status === 'likely_recovered') {
      status = 'recovering';
      factors.push(L('Still reporting marked soreness — treated as recovering.', 'Всё ещё отмечается выраженная болезненность — считается, что мышца восстанавливается.'));
    }
    if (hoursSince > 240) factors.push(L('More than 10 days since the last significant stimulus.', 'С последней значимой нагрузки прошло больше 10 дней.'));
    if (soreness == null && avgSleep == null) factors.push(L('No soreness/sleep data recently — estimate is based on training load only.', 'Данных о болезненности и сне за последние дни нет — оценка только по тренировочной нагрузке.'));
    out[m] = {
      ...base, status, readiness: Math.round(readiness * 100) / 100, hoursSince: Math.round(hoursSince), lastStimulusDate: last.date,
      lastStimulusTime: endedHHMM, lastStimulusTimeSource: src,
      lastStimulusSets: last.sets, windowHours: window, hoursLeft: status === 'recovering' ? Math.max(soreHold, Math.round(window - hoursSince)) : 0, hoursLeftExact: status === 'recovering' ? Math.max(soreHold, window - hoursSince) : 0, factors,
    };
  }
  return out;
}

/**
 * What is already known TODAY that lengthens a muscle's window beyond the base (owner 2026-11-24: one window everywhere):
 * ≥ 2 sets to failure on it today (any session today, sides paired) → + 12 h; an exercise on it (≥ 0.75) new in 3 weeks
 * among today's exercises or `candidates` → + 12 h. The owner's state (soreness, sleep, fatigue) is added by the caller
 * from `RecoveryEstimate.conditionsExtraH`.
 */
export function todayExtraH(data: AppData, registry: Registry, m: MuscleId, today: string, candidates: string[] = []): number {
  const todays = data.workouts.filter((w) => w.date === today);
  const hits = (exerciseId: string, variation: Parameters<typeof resolveCoefficients>[1], min: number) => {
    const def = registry.get(exerciseId);
    return !!def && (resolveCoefficients(def, variation).contributions[m] ?? 0) >= min;
  };
  let failure = 0;
  for (const w of todays) for (const e of w.exercises) {
    if (!hits(e.exerciseId, e.variation, 0.5)) continue;
    const f = sideFactors(e.sets);
    failure += e.sets.filter((x) => x.type !== 'warmup' && !x.planned && isFailureSetForFatigue(x)).reduce((a, x) => a + (f.get(x.id) ?? 1), 0);
  }
  const before = data.workouts.filter((o) => o.date < today);
  const isNew = (id: string) => before.length > 0 && !before.some((o) => diffDays(today, o.date) <= 21 && o.exercises.some((x) => sameMovement(x.exerciseId, id)));
  const ids = [...todays.flatMap((w) => w.exercises.filter((e) => e.sets.some((x) => x.type !== 'warmup' && !x.planned) && hits(e.exerciseId, e.variation, 0.75)).map((e) => e.exerciseId)),
    ...candidates.filter((id) => hits(id, undefined, 0.75))];
  return (failure >= 2 ? 12 : 0) + (ids.some(isNew) ? 12 : 0);
}

/** A session this recent can still be felt: its muscles are offered in the "anything still sore?" question. */
export const SORENESS_ASK_DAYS = 4;

/** Muscles with a significant session on one of the last 4 days before today, the most recent (then the biggest) first. */
export function sorenessCandidates(recovery: Record<MuscleId, RecoveryEstimate>, today: string, max = 8): MuscleId[] {
  return (Object.values(recovery) as RecoveryEstimate[])
    .filter((r) => r.lastStimulusDate != null && r.lastStimulusDate < today && diffDays(today, r.lastStimulusDate) <= SORENESS_ASK_DAYS)
    .sort((x, y) => (y.lastStimulusDate as string).localeCompare(x.lastStimulusDate as string) || y.lastStimulusSets - x.lastStimulusSets)
    .slice(0, max).map((r) => r.muscle);
}
