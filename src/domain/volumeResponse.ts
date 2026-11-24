/**
 * Evidence-based weekly volume per muscle (Part 5, E.10). Each muscle's target starts from its OWN baseline
 * and changes only on evidence — never just because it is below a generic reference:
 *
 *   increase +1–2  stalled across comparable sessions AND technique / loads consistent AND effort adequate AND
 *                  recovery good AND volume stable ≥ 3 weeks (last change observed) AND history does not show
 *                  that more volume failed to help
 *   reduce −1–2    repeated decline with KNOWN, adequate effort (unknown or low effort → hold with that reason), consistently worse recovery, technique deteriorating,
 *                  or a recent volume increase with no better performance (more fatigue, no benefit) → back to
 *                  the earlier productive level
 *   hold           progressing (keep what works), insufficient evidence, effort too low, or observing a change
 *
 * Inputs are the owner's own weekly effective sets, the performance index of the muscle's direct exercises
 * (same index kind only), technique / effort of those sets, soreness / sleep / fatigue logs and, as supporting
 * context only, body circumferences. All thresholds are practical heuristics (rule `volume_individual`).
 */
import type { AppData } from './appdata';
import { addDays, diffDays } from './dates';
import { L, getLang, num, ruPlural } from '../i18n/core';
import { median, type WeekBucket } from './history';
import { MUSCLE_BY_ID, muscleName } from './muscles';
import type { ProgressionSeries } from './progression';
import { roundHalf } from './quality';
import type { RecoveryEstimate } from './recovery';
import type { Registry } from './registry';
import type { BodyMeasurement, MuscleId } from './types';
import type { muscleTrendSummary } from './targets';

export type VolumeAction = 'increase' | 'reduce' | 'hold' | 'observe';

export interface VolumeEvidence {
  baseline: number;
  /**
   * Median weekly effective sets: the recent 4 usable weeks vs the usable weeks before them (null when < 2 weeks
   * each). The caller passes the last 6 usable weeks, so "earlier" is 2 weeks, not 4.
   */
  earlierLevel: number | null;
  recentLevel: number | null;
  /** Median performance change per week (%), same windows, of the muscle's direct exercises. */
  earlierSlope: number | null;
  recentSlope: number | null;
  /** Weeks the volume has stayed near the baseline (most recent first, max 6). */
  stableWeeks: number;
  brokenTechniqueShare: number | null;
  medianRir: number | null;
  recoveryPoor: string | null;
  bodySignal: string | null;
}

export interface VolumeDecision {
  action: VolumeAction;
  /** A neutral hold (stable / unknown, effort adequate, no break, no failed-volume history): a priority may add a little. */
  neutral?: boolean;
  preferred: number;
  rationale: string[];
  evidence: VolumeEvidence;
}

/** Body circumference that reflects a muscle (supporting context only). */
const BODY_SITE: Partial<Record<MuscleId, keyof BodyMeasurement>> = {
  biceps: 'armsCm', triceps: 'armsCm', chest: 'chestCm', side_delts: 'shouldersCm', quads: 'thighsCm', hamstrings: 'thighsCm', calves: 'calvesCm',
};

const WINDOW = 4;

/** A number (or "—") for a Russian sentence: decimal comma. */
const nn = (x: number | null): string => (x == null ? '—' : num(x));
const ruSets = (n: number): string => ruPlural(n, 'подход', 'подхода', 'подходов');
/** Body site of a circumference field, as shown in the context line. */
const SITE_RU: Record<string, string> = { armsCm: 'руки', chestCm: 'грудь', shouldersCm: 'плечи', thighsCm: 'бёдра', calvesCm: 'икры' };

function slopePerWeek(series: ProgressionSeries[], from: string, to: string): number | null {
  const per: number[] = [];
  for (const p of series) {
    const ss = p.sessions.filter((s) => s.representative && s.indexRaw != null && s.date >= from && s.date <= to);
    if (ss.length < 2) continue;
    const kind = ss[ss.length - 1].indexKind;
    const same = ss.filter((s) => s.indexKind === kind);
    if (same.length < 2) continue;
    const a = same[0];
    const b = same[same.length - 1];
    const weeks = Math.max(1, diffDays(b.date, a.date) / 7);
    per.push((((b.indexRaw as number) / (a.indexRaw as number)) - 1) * 100 / weeks);
  }
  return per.length ? Math.round(median(per) * 100) / 100 : null;
}

export function volumeDecision(inp: {
  m: MuscleId;
  data: AppData;
  usable: WeekBucket[];
  /** The last 4 COMPLETE calendar weeks, empty ones included (a training break shows up here). */
  recentWeeks?: WeekBucket[];
  baseline: number;
  trend: ReturnType<typeof muscleTrendSummary>;
  rec: RecoveryEstimate;
  registry: Registry;
  today: string;
  ref: { min: number; preferred: number; max: number };
}): VolumeDecision {
  const { m, data, usable, baseline, trend, rec, today, ref } = inp;
  const name = muscleName(m, getLang());
  const weeks = usable.slice(-2 * WINDOW);
  const recent = weeks.slice(-WINDOW);
  const earlier = weeks.slice(0, Math.max(0, weeks.length - WINDOW));
  const lv = (ws: WeekBucket[]) => (ws.length >= 2 ? roundHalf(median(ws.map((w) => w.volume.muscles[m].effective))) : null);
  const earlierLevel = lv(earlier);
  const recentLevel = lv(recent);
  const span = (ws: WeekBucket[]) => (ws.length ? [ws[0].range.start, ws[ws.length - 1].range.end] as const : null);
  const es = span(earlier);
  const rs = span(recent);
  const earlierSlope = es ? slopePerWeek(trend.series, es[0], es[1]) : null;
  const recentSlope = rs ? slopePerWeek(trend.series, rs[0], rs[1]) : null;

  let stableWeeks = 0;
  for (const w of [...usable].reverse().slice(0, 6)) {
    const v = w.volume.muscles[m].effective;
    if (Math.abs(v - baseline) <= Math.max(1.5, baseline * 0.15)) stableWeeks++;
    else break;
  }

  // Technique and effort on the direct exercises in the last 3 weeks.
  const since = addDays(today, -21);
  let sets = 0;
  let broken = 0;
  const rirs: number[] = [];
  let effortRated = 0;
  let effortAdequateSets = 0;
  for (const p of trend.series) for (const s of p.sessions) {
    if (s.date < since) continue;
    for (const x of s.sets) {
      sets++;
      if (x.technique === 'compromised' || x.technique === 'failed' || x.technicalFailure) broken++;
      if (x.rir != null) rirs.push(x.rir);
      // Effort from RIR, else from how the set felt (an estimate): adequate = within ~3 reps of failure.
      const adequate = x.rir != null ? x.rir <= 3
        : x.effort ? ['appropriate', 'hard', 'near_max'].includes(x.effort)
          : x.feel ? ['just_right', 'hard_good', 'too_heavy_form'].includes(x.feel) : null;
      if (adequate != null) { effortRated++; if (adequate) effortAdequateSets++; }
    }
  }
  /** Effort is KNOWN and adequate on most recent direct sets (null = not enough effort information). */
  const effortAdequate: boolean | null = sets > 0 && effortRated >= Math.max(3, sets * 0.5) ? effortAdequateSets / effortRated >= 0.6 : null;
  const brokenTechniqueShare = sets >= 4 ? broken / sets : null;
  const medianRir = rirs.length >= Math.max(3, sets * 0.5) ? median(rirs) : null;

  // Recovery over the last 14 days: soreness ≥ 3 twice, average sleep < 6 h, fatigue ≥ 4 twice.
  const from14 = addDays(today, -13);
  const daily = data.daily.filter((d) => d.date >= from14 && d.date <= today);
  const well = data.workouts.filter((w) => w.date >= from14 && w.date <= today && w.wellness).map((w) => w.wellness!);
  const sore = [...daily.map((d) => d.soreness?.[m]), ...well.map((w) => w.soreness?.[m])].filter((v): v is number => v != null);
  const sleep = [...daily.map((d) => d.sleepHours), ...well.map((w) => w.sleepHours)].filter((v): v is number => v != null);
  const fat = [...daily.map((d) => d.fatigue), ...well.map((w) => w.fatigue)].filter((v): v is number => v != null);
  let recoveryPoor: string | null = null;
  if (sore.filter((v) => v >= 3).length >= 2) recoveryPoor = L(`marked ${name.toLowerCase()} soreness reported ${sore.filter((v) => v >= 3).length}× in 2 weeks`, `выраженная болезненность (${name.toLowerCase()}) отмечена ${sore.filter((v) => v >= 3).length}× за 2 недели`);
  else if (sleep.length >= 3 && sleep.reduce((a, b) => a + b, 0) / sleep.length < 6) recoveryPoor = L(`average sleep ${(sleep.reduce((a, b) => a + b, 0) / sleep.length).toFixed(1)} h in 2 weeks`, `средний сон ${num(sleep.reduce((a, b) => a + b, 0) / sleep.length, 1)} ч за 2 недели`);
  else if (fat.filter((v) => v >= 4).length >= 2) recoveryPoor = L(`high fatigue reported ${fat.filter((v) => v >= 4).length}× in 2 weeks`, `высокая усталость отмечена ${fat.filter((v) => v >= 4).length}× за 2 недели`);
  else if (rec.status === 'recovering' && (rec.soreness ?? 0) >= 3) recoveryPoor = L('still recovering with marked soreness', 'ещё восстанавливается, болезненность выраженная');

  // Body circumference (supporting only): change over ~8 weeks, with body weight for context.
  let bodySignal: string | null = null;
  const site = BODY_SITE[m];
  if (site) {
    const ms = data.body.filter((b) => b[site] != null && b.date <= today && diffDays(today, b.date) <= 70).sort((a, b) => a.date.localeCompare(b.date));
    if (ms.length >= 2 && diffDays(ms[ms.length - 1].date, ms[0].date) >= 28) {
      const d = (ms[ms.length - 1][site] as number) - (ms[0][site] as number);
      bodySignal = L(`${String(site).replace('Cm', '')} ${d >= 0 ? '+' : ''}${d.toFixed(1)} cm over ${Math.round(diffDays(ms[ms.length - 1].date, ms[0].date) / 7)} weeks (context only; body weight also affects it)`,
        `${SITE_RU[String(site)] ?? String(site).replace('Cm', '')} ${d >= 0 ? '+' : ''}${num(d, 1)} см за ${Math.round(diffDays(ms[ms.length - 1].date, ms[0].date) / 7)} нед. (только контекст; на обхват влияет и вес тела)`);
    }
  }

  const evidence: VolumeEvidence = { baseline, earlierLevel, recentLevel, earlierSlope, recentSlope, stableWeeks, brokenTechniqueShare, medianRir, recoveryPoor, bodySignal };
  const step = baseline < 8 || MUSCLE_BY_ID[m].size === 'small' ? 1 : 2;
  const rationale: string[] = [L(`Your level: ${baseline} effective sets/week (median of ${usable.length} recent weeks). Targets follow YOUR response, not a generic number (reference ${ref.min}–${ref.max}).`,
    `Ваш уровень: ${num(baseline)} эффективных подходов в неделю (медиана за ${usable.length} ${ruPlural(usable.length, 'последнюю неделю', 'последние недели', 'последних недель')}). Цели следуют ВАШЕЙ реакции, а не общей цифре (ориентир ${num(ref.min)}–${num(ref.max)}).`)];
  if (bodySignal) rationale.push(L(`Body: ${bodySignal}.`, `Тело: ${bodySignal}.`));
  const techniqueBad = brokenTechniqueShare != null && brokenTechniqueShare >= 0.25;
  const effortLow = medianRir != null && medianRir >= 4;
  const moreDidNotHelp = earlierLevel != null && recentLevel != null && recentLevel >= earlierLevel + 1.5
    && earlierSlope != null && recentSlope != null && recentSlope < earlierSlope - 0.5 && trend.overall !== 'progressing';
  const higherFailedBefore = earlierLevel != null && recentLevel != null && earlierLevel >= recentLevel + 1.5
    && earlierSlope != null && recentSlope != null && earlierSlope <= recentSlope;

  const done = (action: VolumeAction, preferred: number, why: string, neutral = false): VolumeDecision => {
    rationale.push(why);
    // Reductions stop at the lower end of the reference range (or the current level if already below):
    // a persistent decline is a reason to check recovery and technique, not to cut volume indefinitely.
    const floor = Math.max(1, Math.min(baseline, ref.min));
    const p = action === 'reduce' ? Math.max(floor, preferred) : preferred;
    if (action === 'reduce' && p >= baseline) {
      rationale.push(L(`Already at the lower end (${floor} sets/week) — volume is not cut further; check recovery, technique and loads instead.`, `Уже на нижней границе (${num(floor)} подх./нед.) — объём дальше не снижается; вместо этого проверьте восстановление, технику и веса.`));
      return { action: 'hold', preferred: roundHalf(baseline), rationale, evidence };
    }
    return { action, ...(neutral ? { neutral } : {}), preferred: roundHalf(Math.max(1, p)), rationale, evidence };
  };

  // ---- a training break first: nothing is comparable yet (observe; no increase, no decline-based cut)
  const breakWeeks = (inp.recentWeeks ?? []).filter((w) => !w.workouts.length).length;
  if (breakWeeks > 0 && !recoveryPoor && !techniqueBad) return done('observe', baseline, L(`Back from a training break (${breakWeeks} empty week${breakWeeks === 1 ? '' : 's'} in the last 4) — performance is not comparable yet; volume stays until the response is clear.`,
    `Возвращение после перерыва (${breakWeeks} ${ruPlural(breakWeeks, 'пустая неделя', 'пустые недели', 'пустых недель')} за последние 4) — результаты пока несопоставимы; объём остаётся, пока реакция не станет ясной.`));

  // ---- reduce
  // A decline cuts volume only when effort is KNOWN and adequate: with unknown or low effort the decline may
  // simply come from sets that were too easy (or cannot be judged), and fewer sets would not fix that.
  const effortOk = effortAdequate === true && !effortLow;
  if (trend.overall === 'declining' && effortOk && (stableWeeks >= 2 || moreDidNotHelp)) {
    const to = moreDidNotHelp && earlierLevel != null ? earlierLevel : baseline - step;
    return done('reduce', to, moreDidNotHelp
      ? L(`Performance is declining since volume rose from ~${earlierLevel} to ~${recentLevel} sets/week, with adequate effort — likely more than you recover from: back to ~${earlierLevel}, then watch the next weeks.`,
        `Результаты снижаются с тех пор, как объём вырос с ~${nn(earlierLevel)} до ~${nn(recentLevel)} подходов в неделю, при достаточном усилии — вероятно, это больше, чем вы успеваете восстановить: возвращаемся к ~${nn(earlierLevel)}, затем наблюдаем следующие недели.`)
      : L(`Performance has declined across comparable sessions with adequate effort — ${step} set${step === 1 ? '' : 's'} less per week, then watch the response.`,
        `Результаты снизились в сопоставимых тренировках при достаточном усилии — на ${step} ${ruSets(step)} в неделю меньше, затем наблюдаем за реакцией.`));
  }
  if (recoveryPoor && trend.overall !== 'progressing') return done('reduce', baseline - step, L(`Recovery looks consistently worse (${recoveryPoor}) without progress — ${step} set${step === 1 ? '' : 's'} less until it improves.`,
    `Восстановление стабильно хуже (${recoveryPoor}), прогресса нет — на ${step} ${ruSets(step)} меньше, пока оно не улучшится.`));
  if (techniqueBad) return done('reduce', baseline - step, L(`Technique broke down on ${Math.round((brokenTechniqueShare as number) * 100)} % of recent ${name.toLowerCase()} sets — ${step} set${step === 1 ? '' : 's'} less and clean reps before adding anything.`,
    `Техника нарушалась в ${Math.round((brokenTechniqueShare as number) * 100)} % недавних подходов (${name.toLowerCase()}) — на ${step} ${ruSets(step)} меньше и чистые повторения, прежде чем что-то добавлять.`));
  if (moreDidNotHelp && earlierLevel != null) return done('reduce', earlierLevel, L(`Volume rose from ~${earlierLevel} to ~${recentLevel} sets/week but performance improved less (${recentSlope} vs ${earlierSlope} %/week) — the extra sets seem to add fatigue, not progress: back to ~${earlierLevel}.`,
    `Объём вырос с ~${nn(earlierLevel)} до ~${nn(recentLevel)} подходов в неделю, но результаты росли медленнее (${nn(recentSlope)} против ${nn(earlierSlope)} %/нед.) — дополнительные подходы, похоже, добавляют усталость, а не прогресс: возвращаемся к ~${nn(earlierLevel)}.`));

  // ---- hold
  if (trend.overall === 'declining' && (effortLow || effortAdequate === false)) {
    return done('hold', baseline, L(
      'Performance has declined, but most recent sets stopped well short of failure — take sets closer to failure (RIR 0–3) first; the volume stays.',
      'Результаты снизились, но большинство недавних подходов заканчивались далеко от отказа — сначала доводите подходы ближе к отказу (RIR 0–3); объём остаётся.',
    ));
  }
  if (trend.overall === 'declining' && effortAdequate == null) {
    return done('hold', baseline, L(
      'Performance has declined, but effort (RIR or how sets felt) is not recorded on enough recent sets to tell whether the volume is the reason — the volume stays; record effort first.',
      'Результаты снизились, но усилие (RIR или ощущение от подхода) записано слишком редко, чтобы понять, в объёме ли причина — объём остаётся; сначала записывайте усилие.',
    ));
  }
  if (trend.overall === 'declining') return done('observe', baseline, L(`Performance has dipped, but the volume changed recently (${stableWeeks} / 2 weeks at this level) — observing before cutting.`,
    `Результаты просели, но объём недавно менялся (${stableWeeks} / 2 недели на этом уровне) — наблюдаем, прежде чем снижать.`));
  if (trend.overall === 'progressing') return done('hold', baseline, L(`Progressing at this volume — keep it (no reason to add sets while it works).`, 'При этом объёме есть прогресс — оставьте его (нет причин добавлять подходы, пока он работает).'));
  if (trend.overall === 'unknown') return done('hold', baseline, L('Not enough comparable sessions to judge the response yet — volume stays where you train it.', 'Сопоставимых тренировок пока мало, чтобы судить о реакции — объём остаётся таким, с каким вы тренируетесь.'), effortAdequate === true);
  if (effortLow) return done('hold', baseline, L(`Most recent sets stopped ~${medianRir} reps short of failure — take sets closer to failure (RIR 0–3) before adding volume.`,
    `Большинство недавних подходов заканчивались примерно за ${nn(medianRir)} повт. до отказа — сначала доводите подходы ближе к отказу (RIR 0–3), а потом добавляйте объём.`));

  // ---- increase (stalled, everything else in order). A flat line over the recent weeks is a stall too:
  // performance has stopped improving across comparable sessions.
  const comparableRecent = trend.series.reduce((n, p) => n + p.sessions.filter((s) => s.representative && rs && s.date >= rs[0] && s.date <= rs[1]).length, 0);
  const flat = trend.overall === 'stable' && recentSlope != null && recentSlope <= 0.25 && comparableRecent >= 4;
  if (trend.overall === 'stalled' || flat) {
    if (stableWeeks < 3) return done('observe', baseline, L(`Progress has stalled, but the volume changed recently (${stableWeeks} / 3 weeks at this level) — observing the response before changing again.`,
      `Прогресс остановился, но объём недавно менялся (${stableWeeks} / 3 недели на этом уровне) — наблюдаем за реакцией, прежде чем менять снова.`));
    if (higherFailedBefore) return done('hold', baseline, L(`Progress has stalled, but earlier weeks at ~${earlierLevel} sets did not progress better than ~${recentLevel} — more volume is unlikely to help; check load, rest and exercise order first.`,
      `Прогресс остановился, но прежние недели на ~${nn(earlierLevel)} подходах не дали лучшего прогресса, чем ~${nn(recentLevel)} — больший объём вряд ли поможет; сначала проверьте вес, отдых и порядок упражнений.`));
    if (recoveryPoor) return done('hold', baseline, L(`Progress has stalled but recovery is not good (${recoveryPoor}) — not the time to add sets.`, `Прогресс остановился, но восстановление неважное (${recoveryPoor}) — сейчас не время добавлять подходы.`));
    if (effortAdequate !== true || brokenTechniqueShare == null) return done('hold', baseline, L('Progress has stalled, but effort (RIR or how sets felt) is not logged on enough recent sets to tell whether more volume would help — log effort first.',
      'Прогресс остановился, но усилие (RIR или ощущение от подхода) записано слишком редко, чтобы понять, поможет ли больший объём — сначала записывайте усилие.'));
    return done('increase', baseline + step, L(`${flat ? 'No improvement over the last weeks' : 'Stalled'} across comparable sessions with consistent technique, adequate effort and good recovery — +${step} set${step === 1 ? '' : 's'}/week as a test; judge it over the next 3–4 weeks.`,
      `${flat ? 'Нет улучшения за последние недели' : 'Застой'} в сопоставимых тренировках при стабильной технике, достаточном усилии и хорошем восстановлении — +${step} ${ruSets(step)} в неделю на пробу; оцените через 3–4 недели.`));
  }
  return done('hold', baseline, L('Performance is stable — volume stays; it changes only when comparable sessions show a stall or decline.', 'Результаты стабильны — объём остаётся; он меняется, только когда сопоставимые тренировки показывают застой или снижение.'), effortAdequate === true && !higherFailedBefore);
}
