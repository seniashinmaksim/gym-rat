/**
 * Evidence-based weekly volume per muscle (Part 5, E.10). Each muscle's target starts from its OWN baseline
 * and changes only on evidence — never just because it is below a generic reference:
 *
 *   increase +1–2  stalled across comparable sessions AND technique / loads consistent AND effort adequate AND
 *                  recovery good AND volume stable ≥ 3 weeks (last change observed) AND history does not show
 *                  that more volume failed to help
 *   reduce −1–2    repeated decline with adequate effort, consistently worse recovery, technique deteriorating,
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
  /** Median weekly effective sets, earlier 4 weeks vs recent 4 weeks (null when < 2 weeks each). */
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
  const name = muscleName(m);
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
  if (sore.filter((v) => v >= 3).length >= 2) recoveryPoor = `marked ${name.toLowerCase()} soreness reported ${sore.filter((v) => v >= 3).length}× in 2 weeks`;
  else if (sleep.length >= 3 && sleep.reduce((a, b) => a + b, 0) / sleep.length < 6) recoveryPoor = `average sleep ${(sleep.reduce((a, b) => a + b, 0) / sleep.length).toFixed(1)} h in 2 weeks`;
  else if (fat.filter((v) => v >= 4).length >= 2) recoveryPoor = `high fatigue reported ${fat.filter((v) => v >= 4).length}× in 2 weeks`;
  else if (rec.status === 'recovering' && (rec.soreness ?? 0) >= 3) recoveryPoor = 'still recovering with marked soreness';

  // Body circumference (supporting only): change over ~8 weeks, with body weight for context.
  let bodySignal: string | null = null;
  const site = BODY_SITE[m];
  if (site) {
    const ms = data.body.filter((b) => b[site] != null && b.date <= today && diffDays(today, b.date) <= 70).sort((a, b) => a.date.localeCompare(b.date));
    if (ms.length >= 2 && diffDays(ms[ms.length - 1].date, ms[0].date) >= 28) {
      const d = (ms[ms.length - 1][site] as number) - (ms[0][site] as number);
      bodySignal = `${String(site).replace('Cm', '')} ${d >= 0 ? '+' : ''}${d.toFixed(1)} cm over ${Math.round(diffDays(ms[ms.length - 1].date, ms[0].date) / 7)} weeks (context only; body weight also affects it)`;
    }
  }

  const evidence: VolumeEvidence = { baseline, earlierLevel, recentLevel, earlierSlope, recentSlope, stableWeeks, brokenTechniqueShare, medianRir, recoveryPoor, bodySignal };
  const step = baseline < 8 || MUSCLE_BY_ID[m].size === 'small' ? 1 : 2;
  const rationale: string[] = [`Your level: ${baseline} effective sets/week (median of ${usable.length} recent weeks). Targets follow YOUR response, not a generic number (reference ${ref.min}–${ref.max}).`];
  if (bodySignal) rationale.push(`Body: ${bodySignal}.`);
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
      rationale.push(`Already at the lower end (${floor} sets/week) — volume is not cut further; check recovery, technique and loads instead.`);
      return { action: 'hold', preferred: roundHalf(baseline), rationale, evidence };
    }
    return { action, ...(neutral ? { neutral } : {}), preferred: roundHalf(Math.max(1, p)), rationale, evidence };
  };

  // ---- a training break first: nothing is comparable yet (observe; no increase, no decline-based cut)
  const breakWeeks = (inp.recentWeeks ?? []).filter((w) => !w.workouts.length).length;
  if (breakWeeks > 0 && !recoveryPoor && !techniqueBad) return done('observe', baseline, `Back from a training break (${breakWeeks} empty week${breakWeeks === 1 ? '' : 's'} in the last 4) — performance is not comparable yet; volume stays until the response is clear.`);

  // ---- reduce
  if (trend.overall === 'declining' && !effortLow && (stableWeeks >= 2 || moreDidNotHelp)) {
    const to = moreDidNotHelp && earlierLevel != null ? earlierLevel : baseline - step;
    return done('reduce', to, moreDidNotHelp
      ? `Performance is declining since volume rose from ~${earlierLevel} to ~${recentLevel} sets/week, with adequate effort — likely more than you recover from: back to ~${earlierLevel}, then watch the next weeks.`
      : `Performance has declined across comparable sessions with adequate effort — ${step} set${step === 1 ? '' : 's'} less per week, then watch the response.`);
  }
  if (recoveryPoor && trend.overall !== 'progressing') return done('reduce', baseline - step, `Recovery looks consistently worse (${recoveryPoor}) without progress — ${step} set${step === 1 ? '' : 's'} less until it improves.`);
  if (techniqueBad) return done('reduce', baseline - step, `Technique broke down on ${Math.round((brokenTechniqueShare as number) * 100)} % of recent ${name.toLowerCase()} sets — ${step} set${step === 1 ? '' : 's'} less and clean reps before adding anything.`);
  if (moreDidNotHelp && earlierLevel != null) return done('reduce', earlierLevel, `Volume rose from ~${earlierLevel} to ~${recentLevel} sets/week but performance improved less (${recentSlope} vs ${earlierSlope} %/week) — the extra sets seem to add fatigue, not progress: back to ~${earlierLevel}.`);

  // ---- hold
  if (trend.overall === 'declining') return done('observe', baseline, `Performance has dipped, but the volume changed recently (${stableWeeks} / 2 weeks at this level) — observing before cutting.`);
  if (trend.overall === 'progressing') return done('hold', baseline, `Progressing at this volume — keep it (no reason to add sets while it works).`);
  if (trend.overall === 'unknown') return done('hold', baseline, 'Not enough comparable sessions to judge the response yet — volume stays where you train it.', effortAdequate === true);
  if (effortLow) return done('hold', baseline, `Most recent sets stopped ~${medianRir} reps short of failure — take sets closer to failure (RIR 0–3) before adding volume.`);

  // ---- increase (stalled, everything else in order). A flat line over the recent weeks is a stall too:
  // performance has stopped improving across comparable sessions.
  const comparableRecent = trend.series.reduce((n, p) => n + p.sessions.filter((s) => s.representative && rs && s.date >= rs[0] && s.date <= rs[1]).length, 0);
  const flat = trend.overall === 'stable' && recentSlope != null && recentSlope <= 0.25 && comparableRecent >= 4;
  if (trend.overall === 'stalled' || flat) {
    if (stableWeeks < 3) return done('observe', baseline, `Progress has stalled, but the volume changed recently (${stableWeeks} / 3 weeks at this level) — observing the response before changing again.`);
    if (higherFailedBefore) return done('hold', baseline, `Progress has stalled, but earlier weeks at ~${earlierLevel} sets did not progress better than ~${recentLevel} — more volume is unlikely to help; check load, rest and exercise order first.`);
    if (recoveryPoor) return done('hold', baseline, `Progress has stalled but recovery is not good (${recoveryPoor}) — not the time to add sets.`);
    if (effortAdequate !== true || brokenTechniqueShare == null) return done('hold', baseline, 'Progress has stalled, but effort (RIR or how sets felt) is not logged on enough recent sets to tell whether more volume would help — log effort first.');
    return done('increase', baseline + step, `${flat ? 'No improvement over the last weeks' : 'Stalled'} across comparable sessions with consistent technique, adequate effort and good recovery — +${step} set${step === 1 ? '' : 's'}/week as a test; judge it over the next 3–4 weeks.`);
  }
  return done('hold', baseline, 'Performance is stable — volume stays; it changes only when comparable sessions show a stall or decline.', effortAdequate === true && !higherFailedBefore);
}
