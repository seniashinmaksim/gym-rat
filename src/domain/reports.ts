import type { Analysis } from './analysis';
import type { AppData } from './appdata';
import { addDays, diffDays, type WeekRange } from './dates';
import { mean, median, type WeekBucket } from './history';
import { TRACKED_MUSCLES, muscleName } from './muscles';
import { exerciseLabel, type Registry } from './registry';
import { adviceFor, buildProgression, type ProgressionSeries } from './progression';
import { failureProfile, type FailureProfile } from './failure';
import type { MuscleId, Workout } from './types';
import { countedSetCount, sideFactors, stripPlanned } from './quality';
import type { MuscleTarget } from './targets';
import type { WeeklySnapshot } from './types';
import { computeVolume } from './volume';

// ---------------------------------------------------------------- Rest analysis

export interface RestStats {
  exerciseId: string;
  avgRestSec: number | null;
  samples: number;
  category: 'compound' | 'isolation';
}

export interface RestBucket {
  label: string;
  samples: number;
  avgRepRetention: number | null; // reps(set n) / reps(set 1), same weight
}

export function restAnalysis(workouts: Workout[], registry: Registry) {
  const byEx = new Map<string, number[]>();
  const betweenExercises: number[] = [];
  const buckets: { label: string; lo: number; hi: number; vals: number[] }[] = [
    { label: '< 90 s', lo: 0, hi: 90, vals: [] },
    { label: '90–150 s', lo: 90, hi: 150, vals: [] },
    { label: '150–240 s', lo: 150, hi: 240, vals: [] },
    { label: '> 240 s', lo: 240, hi: Infinity, vals: [] },
  ];
  for (const w of workouts) {
    for (const ex of w.exercises) {
      const working = ex.sets.filter((s) => s.type === 'working');
      const first = working[0];
      working.slice(1).forEach((s) => {
        if (s.restSecBefore != null && s.restSecBefore > 0) {
          const arr = byEx.get(ex.exerciseId) ?? [];
          arr.push(s.restSecBefore);
          byEx.set(ex.exerciseId, arr);
          if (first?.reps && s.reps != null && first.weightKg === s.weightKg) {
            const b = buckets.find((x) => s.restSecBefore! >= x.lo && s.restSecBefore! < x.hi);
            b?.vals.push(s.reps / first.reps);
          }
        }
      });
      if (ex.restAfterSec != null && ex.restAfterSec > 0) betweenExercises.push(ex.restAfterSec);
    }
  }
  const perExercise: RestStats[] = [...byEx.entries()].map(([id, arr]) => ({
    exerciseId: id,
    avgRestSec: Math.round(mean(arr)),
    samples: arr.length,
    category: registry.get(id)?.category ?? 'compound',
  })).sort((a, b) => b.samples - a.samples);
  const comp = perExercise.filter((p) => p.category === 'compound').flatMap((p) => byEx.get(p.exerciseId)!);
  const iso = perExercise.filter((p) => p.category === 'isolation').flatMap((p) => byEx.get(p.exerciseId)!);
  return {
    perExercise,
    compoundAvg: comp.length ? Math.round(mean(comp)) : null,
    isolationAvg: iso.length ? Math.round(mean(iso)) : null,
    betweenExercisesAvg: betweenExercises.length ? Math.round(mean(betweenExercises)) : null,
    retention: buckets.map<RestBucket>((b) => ({ label: b.label, samples: b.vals.length, avgRepRetention: b.vals.length ? Math.round(mean(b.vals) * 100) / 100 : null })),
  };
}

// ---------------------------------------------------------------- Weekly report

export interface WeeklyReport {
  range: WeekRange;
  sessions: number;
  totalWorkingSets: number;
  rows: { muscle: MuscleId; effective: number; direct: number; indirect: number; min: number; preferred: number; max: number; result: 'met' | 'short' | 'excess' | 'within' }[];
  reached: MuscleId[];
  short: MuscleId[];
  excessive: MuscleId[];
  progressed: { exerciseId: string; scope: string; evidence: string }[];
  declined: { exerciseId: string; scope: string; evidence: string }[];
  recoveryNotes: string[];
  recommendations: string[];
  /** Failure-status profile of the week (descriptive; never implies failure grows more muscle). */
  failure: FailureProfile;
}

export function weeklyReport(bucket: WeekBucket, a: Analysis, data: AppData): WeeklyReport {
  const rows: WeeklyReport['rows'] = [];
  const snap = data.snapshots.find((s) => s.weekStart === bucket.range.start);
  for (const m of TRACKED_MUSCLES) {
    const v = bucket.volume.muscles[m];
    const t = snap?.targets[m] ?? a.targets[m];
    const result = v.effective > t.max ? 'excess' : v.effective >= t.preferred ? 'met' : v.effective < t.min ? 'short' : 'within';
    rows.push({ muscle: m, effective: v.effective, direct: v.directSets, indirect: v.indirectSets, min: t.min, preferred: t.preferred, max: t.max, result });
  }
  const inWeek = (d: string) => d >= bucket.range.start && d <= bucket.range.end;
  const progressed: WeeklyReport['progressed'] = [];
  const declined: WeeklyReport['declined'] = [];
  for (const p of a.progression) {
    const weekSessions = p.sessions.filter((s) => inWeek(s.date));
    if (!weekSessions.length) continue;
    const before = p.sessions.filter((s) => s.date < bucket.range.start && s.index != null);
    const prevBest = before.length ? Math.max(...before.slice(-4).map((s) => s.index as number)) : null;
    const wkBest = Math.max(...weekSessions.map((s) => s.index ?? 0));
    if (prevBest == null) continue;
    const label = exerciseLabel(a.registry.get(p.exerciseId), 'en', p.exerciseId);
    if (wkBest > prevBest * 1.005) progressed.push({ exerciseId: p.exerciseId, scope: p.scopeLabel, evidence: `${label}: index ${wkBest.toFixed(1)} vs recent best ${prevBest.toFixed(1)}` });
    else if (wkBest < prevBest * 0.95) declined.push({ exerciseId: p.exerciseId, scope: p.scopeLabel, evidence: `${label}: index ${wkBest.toFixed(1)} vs recent best ${prevBest.toFixed(1)} (−${(((prevBest - wkBest) / prevBest) * 100).toFixed(0)}%)` });
  }
  const logs = data.daily.filter((d) => inWeek(d.date));
  const recoveryNotes: string[] = [];
  const sleep = logs.map((l) => l.sleepHours).filter((x): x is number => x != null);
  if (sleep.length) recoveryNotes.push(`Average logged sleep ${mean(sleep).toFixed(1)} h over ${sleep.length} night(s).`);
  const fatigue = [...logs.map((l) => l.fatigue), ...bucket.workouts.map((w) => w.wellness?.fatigue)].filter((x): x is number => x != null);
  if (fatigue.length) recoveryNotes.push(`Average fatigue ${mean(fatigue).toFixed(1)}/5.`);
  if (!sleep.length && !fatigue.length) recoveryNotes.push('No sleep or fatigue data logged this week.');
  if (declined.length >= 2) recoveryNotes.push(`${declined.length} exercises performed noticeably below recent bests.`);

  const reached = rows.filter((r) => r.result === 'met' || r.result === 'excess').map((r) => r.muscle);
  const short = rows.filter((r) => r.result === 'short').map((r) => r.muscle);
  const excessive = rows.filter((r) => r.result === 'excess').map((r) => r.muscle);
  const recommendations: string[] = [];
  if (short.length) recommendations.push(`${short.slice(0, 3).map((m) => muscleName(m)).join(', ')} finished below the lower end of their range — give them priority early in the following week (without cramming).`);
  if (excessive.length) recommendations.push(`${excessive.map((m) => muscleName(m)).join(', ')} went past the diminishing-returns range. That isn't harmful, but some of those sets would likely do more for muscles that are short.`);
  if (declined.length >= 2 && fatigue.length && mean(fatigue) >= 3.5) recommendations.push('Several declines alongside high fatigue — keep volume steady rather than adding sets next week.');
  if (bucket.workouts.length === 0) recommendations.push('No sessions this week. Missing volume is not a failure — resume normally rather than compensating with extra sets.');
  if (!recommendations.length) recommendations.push('Volume distribution looked reasonable. Keep progressing loads/reps on your main exercises.');
  const failure = failureProfile({ workouts: stripPlanned(bucket.workouts) }, bucket.range, a.registry);
  return {
    range: bucket.range, sessions: bucket.workouts.length, totalWorkingSets: bucket.volume.totalWorkingSets, rows, reached, short, excessive,
    progressed, declined, recoveryNotes, recommendations, failure,
  };
}

/**
 * The short weekly answer (shown first; the full report stays available as details):
 * muscles still behind and how many quality sets they lack, exercises progressing, and the
 * increase / keep / reduce / plateau calls for exercises trained that week.
 */
export interface WeeklySummary {
  behind: { muscle: MuscleId; left: number }[];
  progressing: string[];
  increase: string[];
  keep: string[];
  reduce: string[];
  plateaus: string[];
  /** One short line about failure training this week (null when nothing was trained). */
  failureLine: string | null;
}

export function weeklySummary(report: WeeklyReport, a: Analysis, progression: ProgressionSeries[] = a.progression): WeeklySummary {
  const behind = report.rows
    .filter((r) => r.effective < r.preferred)
    .map((r) => ({ muscle: r.muscle, left: Math.round((r.preferred - r.effective) * 2) / 2 }))
    .filter((r) => r.left > 0)
    .sort((x, y) => y.left - x.left);
  const inWeek = (d: string) => d >= report.range.start && d <= report.range.end;
  const out: WeeklySummary = { behind, progressing: report.progressed.map((p) => `${exerciseLabel(a.registry.get(p.exerciseId), 'en', p.exerciseId)} (${p.scope})`), increase: [], keep: [], reduce: [], plateaus: [], failureLine: report.failure?.line ?? null };
  for (const p of progression) {
    if (!p.sessions.some((s) => inWeek(s.date))) continue;
    const name = `${exerciseLabel(a.registry.get(p.exerciseId), 'en', p.exerciseId)} (${p.scopeLabel})`;
    const adv = adviceFor(p);
    const w = p.next.weight != null ? ` → ${p.next.weight} kg` : '';
    if (adv.kind === 'increase') out.increase.push(name + w);
    else if (adv.kind === 'reduce') out.reduce.push(name + w);
    else if (adv.kind === 'plateau') out.plateaus.push(name);
    else if (adv.kind === 'keep') out.keep.push(name);
  }
  return out;
}

/** Progression as it stood at the end of a given week (so an old week's report shows that week's calls). */
export function progressionAsOf(data: AppData, a: Analysis, end: string): ProgressionSeries[] {
  const ws = stripPlanned(data.workouts.filter((w) => w.date <= end));
  return buildProgression(ws, a.registry, data.equipment, data.exerciseOverrides, data.settings.defaultTargetRir, end, data.settings.quality.useFeelWhenNoRir !== false, data.locations);
}

/** Frozen copy of a finished week, so later target or coefficient changes don't rewrite it. */
export function buildSnapshot(bucket: WeekBucket, targets: Record<MuscleId, MuscleTarget>, data: AppData, createdAt = new Date().toISOString()): WeeklySnapshot {
  const t: WeeklySnapshot['targets'] = {};
  const effective: WeeklySnapshot['effective'] = {};
  for (const m of TRACKED_MUSCLES) {
    const x = targets[m];
    t[m] = { min: x.min, preferred: x.preferred, max: x.max, confidence: x.confidence };
    effective[m] = bucket.volume.muscles[m].effective;
  }
  return {
    id: bucket.range.start,
    weekStart: bucket.range.start,
    weekEnd: bucket.range.end,
    createdAt,
    targets: t,
    effective,
    sessions: bucket.workouts.length,
    coefficientNote: `Quality model RIR credits [${data.settings.quality.rirCredit.join(', ')}], unknown RIR ${data.settings.quality.unknownRirCredit}; ${data.exerciseOverrides.length} coefficient override(s).`,
  };
}

/** The most recent finished week that has workouts but no frozen snapshot yet (auto-saved on the next open). */
export function pendingSnapshot(a: Analysis, data: AppData): WeekBucket | null {
  const last = [...a.weeks].reverse().find((w) => w.complete);
  if (!last || !last.workouts.length) return null;
  return data.snapshots.some((s) => s.weekStart === last.range.start) ? null : last;
}

// ---------------------------------------------------------------- Learning baseline report

export interface BaselineReport {
  period: { start: string; end: string; days: number };
  frequency: { sessions: number; perWeek: number; commonDays: string[] };
  duration: { avgMin: number | null; samples: number };
  exercisesPerSession: number;
  setsPerSession: number;
  rest: ReturnType<typeof restAnalysis>;
  topExercises: { exerciseId: string; sessions: number; sets: number }[];
  inventory: { locations: number; equipment: number; unidentified: number };
  workingWeights: { key: string; exerciseId: string; scope: string; weight: number | null; reps: number | null; rir: number | null; date: string }[];
  repRanges: { exerciseId: string; min: number; max: number; median: number }[];
  effort: { rirKnownPct: number; avgRir: number | null; nearFailurePct: number | null; lowEffortPct: number };
  weeklyDistribution: { muscle: MuscleId; avgEffective: number; directShare: number }[];
  lowDirect: MuscleId[];
  highIndirect: MuscleId[];
  earlyProgress: string[];
  unclear: string[];
  consistency: { weeksWithTraining: number; totalWeeks: number; cvSessions: number | null };
  coOccurrence: { pair: string; count: number }[];
  exerciseVariety: { distinct: number; newInLastHalf: number };
  loadChangesWithinSession: { increase: number; decrease: number; flat: number };
  dataQuality: string[];
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function baselineReport(data: AppData, a: Analysis): BaselineReport | null {
  const start = a.learning.startDate;
  if (!start) return null;
  const end = addDays(start, a.learning.lengthDays - 1) < a.today ? addDays(start, a.learning.lengthDays - 1) : a.today;
  const ws = stripPlanned(data.workouts).filter((w) => w.date >= start && w.date <= end).sort((x, y) => x.date.localeCompare(y.date));
  const days = diffDays(end, start) + 1;
  const reg = a.registry;

  const dowCount = new Array(7).fill(0);
  ws.forEach((w) => dowCount[new Date(`${w.date}T00:00:00Z`).getUTCDay()]++);
  const commonDays = dowCount.map((c, i) => ({ c, d: DOW[i] })).filter((x) => x.c >= Math.max(2, ws.length / 7)).sort((x, y) => y.c - x.c).map((x) => x.d);

  const durations = ws.map((w) => w.durationMin ?? durFromTimes(w.startTime, w.endTime)).filter((x): x is number => x != null && x > 0);

  const exStats = new Map<string, { sessions: number; sets: number; reps: number[] }>();
  let totalSets = 0;
  let rirKnown = 0;
  let rirSum = 0;
  let nearFail = 0;
  let lowEff = 0;
  const lc = { increase: 0, decrease: 0, flat: 0 };
  const pairCount = new Map<string, number>();
  for (const w of ws) {
    const groups = new Set<string>();
    for (const ex of w.exercises) {
      const st = exStats.get(ex.exerciseId) ?? { sessions: 0, sets: 0, reps: [] };
      st.sessions++;
      const working = ex.sets.filter((s) => s.type === 'working');
      const sf = sideFactors(ex.sets);
      st.sets += countedSetCount(ex.sets, ['working']);
      for (const s of working) {
        const k = sf.get(s.id) ?? 1;
        totalSets += k;
        if (s.reps != null) st.reps.push(s.reps);
        const rir = s.rir ?? (s.toFailure ? 0 : null);
        if (rir != null) {
          rirKnown += k;
          rirSum += rir * k;
          if (rir <= 2) nearFail += k;
          if (rir >= 4) lowEff += k;
        }
      }
      exStats.set(ex.exerciseId, st);
      const weights = working.map((s) => s.weightKg).filter((x): x is number => x != null);
      if (weights.length >= 2) {
        const d = weights[weights.length - 1] - weights[0];
        if (d > 0) lc.increase++; else if (d < 0) lc.decrease++; else lc.flat++;
      }
      const def = reg.get(ex.exerciseId);
      if (def) for (const [m, c] of Object.entries(def.contributions)) if ((c ?? 0) >= 0.75) groups.add(m);
    }
    const g = [...groups].sort();
    for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) {
      const k = `${muscleName(g[i] as MuscleId)} + ${muscleName(g[j] as MuscleId)}`;
      pairCount.set(k, (pairCount.get(k) ?? 0) + 1);
    }
  }

  const weeks = a.weeks.filter((w) => w.range.end >= start && w.range.start <= end);
  const fullWeeks = weeks.filter((w) => w.complete);
  const distRows = TRACKED_MUSCLES.map((m) => {
    const eff = fullWeeks.map((w) => w.volume.muscles[m].effective);
    const dir = fullWeeks.reduce((s, w) => s + w.volume.muscles[m].effectiveDirect, 0);
    const tot = fullWeeks.reduce((s, w) => s + w.volume.muscles[m].effective, 0);
    return { muscle: m, avgEffective: Math.round(mean(eff) * 10) / 10, directShare: tot ? Math.round((dir / tot) * 100) / 100 : 0 };
  });
  const allVol = computeVolume(ws, reg, data.settings.quality);
  const lowDirect = TRACKED_MUSCLES.filter((m) => allVol.muscles[m].directSets <= Math.max(1, fullWeeks.length));
  const highIndirect = TRACKED_MUSCLES.filter((m) => allVol.muscles[m].effectiveIndirect >= 4 && allVol.muscles[m].effectiveIndirect > allVol.muscles[m].effectiveDirect);

  const series = a.progression.filter((p) => p.sessions.some((s) => s.date >= start && s.date <= end));
  const earlyProgress = series.filter((p) => p.trend.cls === 'progressing').map((p) => `${exerciseLabel(reg.get(p.exerciseId), 'en', p.exerciseId)} (${p.scopeLabel}): ${p.trend.evidence}`);
  const unclear = series.filter((p) => p.trend.cls !== 'progressing').map((p) => `${exerciseLabel(reg.get(p.exerciseId), 'en', p.exerciseId)} (${p.scopeLabel}): ${p.trend.cls.replace('_', ' ')}`);

  const halfway = addDays(start, Math.floor(days / 2));
  const firstHalf = new Set(ws.filter((w) => w.date < halfway).flatMap((w) => w.exercises.map((e) => e.exerciseId)));
  const newLate = new Set(ws.filter((w) => w.date >= halfway).flatMap((w) => w.exercises.map((e) => e.exerciseId)).filter((id) => !firstHalf.has(id)));

  const perWeekSessions = weeks.map((w) => w.workouts.length);
  const dq: string[] = [];
  const rirPct = totalSets ? Math.round((rirKnown / totalSets) * 100) : 0;
  if (rirPct < 70) dq.push(`RIR recorded on ${rirPct}% of working sets — effort-adjusted volume is uncertain for the rest.`);
  const restSamples = ws.flatMap((w) => w.exercises.flatMap((e) => e.sets.slice(1))).filter((s) => s.restSecBefore != null).length;
  if (restSamples < totalSets * 0.3) dq.push('Few rest intervals recorded — rest-vs-performance findings are tentative.');
  const unknownEq = ws.flatMap((w) => w.exercises).filter((e) => !e.equipmentId && ['machine', 'cable', 'plate_loaded', 'smith'].includes(reg.get(e.exerciseId)?.equipmentKind ?? '')).length;
  if (unknownEq) dq.push(`${unknownEq} machine/cable exercise entries have no identified equipment instance.`);
  const uncertainLoc = ws.filter((w) => !w.locationId || w.locationConfidence === 'uncertain' || w.locationConfidence === 'unknown').length;
  if (uncertainLoc) dq.push(`${uncertainLoc} session(s) have an unknown or uncertain gym.`);
  if (!durations.length) dq.push('No session durations recorded.');
  dq.push('One month of data describes training BEHAVIOUR. It cannot show which muscles grow faster or slower.');

  const latestByKey = a.progression.filter((p) => p.current).map((p) => ({
    key: p.key, exerciseId: p.exerciseId, scope: p.scopeLabel, weight: p.current!.topWeight, reps: p.current!.topReps, rir: p.current!.topRir, date: p.current!.date,
  }));

  return {
    period: { start, end, days },
    frequency: { sessions: ws.length, perWeek: Math.round((ws.length / days) * 7 * 10) / 10, commonDays },
    duration: { avgMin: durations.length ? Math.round(mean(durations)) : null, samples: durations.length },
    exercisesPerSession: ws.length ? Math.round(mean(ws.map((w) => w.exercises.length)) * 10) / 10 : 0,
    setsPerSession: ws.length ? Math.round((totalSets / ws.length) * 10) / 10 : 0,
    rest: restAnalysis(ws, reg),
    topExercises: [...exStats.entries()].map(([id, s]) => ({ exerciseId: id, sessions: s.sessions, sets: s.sets })).sort((x, y) => y.sessions - x.sessions || y.sets - x.sets).slice(0, 12),
    inventory: { locations: data.locations.length, equipment: data.equipment.length, unidentified: data.equipment.filter((e) => !e.identified).length },
    workingWeights: latestByKey,
    repRanges: [...exStats.entries()].filter(([, s]) => s.reps.length).map(([id, s]) => ({ exerciseId: id, min: Math.min(...s.reps), max: Math.max(...s.reps), median: median(s.reps) })),
    effort: {
      rirKnownPct: rirPct,
      avgRir: rirKnown ? Math.round((rirSum / rirKnown) * 10) / 10 : null,
      nearFailurePct: rirKnown ? Math.round((nearFail / rirKnown) * 100) : null,
      lowEffortPct: rirKnown ? Math.round((lowEff / rirKnown) * 100) : 0,
    },
    weeklyDistribution: distRows,
    lowDirect,
    highIndirect,
    earlyProgress,
    unclear,
    consistency: {
      weeksWithTraining: weeks.filter((w) => w.workouts.length).length,
      totalWeeks: weeks.length,
      cvSessions: perWeekSessions.length >= 2 ? Math.round((Math.sqrt(mean(perWeekSessions.map((x) => (x - mean(perWeekSessions)) ** 2))) / (mean(perWeekSessions) || 1)) * 100) / 100 : null,
    },
    coOccurrence: [...pairCount.entries()].map(([pair, count]) => ({ pair, count })).sort((x, y) => y.count - x.count).slice(0, 8),
    exerciseVariety: { distinct: exStats.size, newInLastHalf: newLate.size },
    loadChangesWithinSession: lc,
    dataQuality: dq,
  };
}

function durFromTimes(s?: string | null, e?: string | null): number | null {
  if (!s || !e) return null;
  const [sh, sm] = s.split(':').map(Number);
  const [eh, em] = e.split(':').map(Number);
  let d = eh * 60 + em - (sh * 60 + sm);
  if (d < 0) d += 1440;
  return d;
}

// ---------------------------------------------------------------- Periodization / deload

export interface DeloadAssessment {
  recommend: boolean;
  score: number;
  indicators: { label: string; present: boolean; detail: string }[];
  summary: string;
}

export function assessDeload(data: AppData, a: Analysis): DeloadAssessment {
  const indicators: DeloadAssessment['indicators'] = [];
  const recent = a.progression.filter((p) => p.trend.cls !== 'insufficient_data' && p.current && diffDays(a.today, p.current.date) <= 21);
  const declining = recent.filter((p) => p.trend.cls === 'declining');
  indicators.push({ label: 'Multiple exercises declining', present: declining.length >= 2 && declining.length >= recent.length * 0.3, detail: `${declining.length} of ${recent.length} active exercises show a declining trend.` });

  // Effort creep: same/lower performance with lower RIR (sets feel harder).
  let creep = 0;
  for (const p of recent) {
    const s = p.sessions.slice(-4);
    if (s.length < 3) continue;
    const r0 = s[0].avgRir;
    const r1 = s[s.length - 1].avgRir;
    if (r0 != null && r1 != null && r1 < r0 - 0.9 && (s[s.length - 1].index ?? 0) <= (s[0].index ?? 0)) creep++;
  }
  indicators.push({ label: 'Same performance feels harder', present: creep >= 2, detail: `${creep} exercise(s) show falling RIR without better performance.` });

  const since14 = addDays(a.today, -13);
  const fat = [...data.daily.filter((d) => d.date >= since14).map((d) => d.fatigue), ...data.workouts.filter((w) => w.date >= since14).map((w) => w.wellness?.fatigue)].filter((x): x is number => x != null);
  indicators.push({ label: 'Elevated fatigue', present: fat.length >= 3 && mean(fat) >= 3.5, detail: fat.length ? `Average fatigue ${mean(fat).toFixed(1)}/5 over ${fat.length} entries (14 days).` : 'No fatigue data in the last 14 days.' });

  const sleep = [...data.daily.filter((d) => d.date >= since14).map((d) => d.sleepHours), ...data.workouts.filter((w) => w.date >= since14).map((w) => w.wellness?.sleepHours)].filter((x): x is number => x != null);
  indicators.push({ label: 'Short sleep', present: sleep.length >= 3 && mean(sleep) < 6.5, detail: sleep.length ? `Average sleep ${mean(sleep).toFixed(1)} h.` : 'No sleep data in the last 14 days.' });

  const sore = data.daily.filter((d) => d.date >= since14).flatMap((d) => Object.values(d.soreness ?? {})).filter((x): x is number => x != null);
  indicators.push({ label: 'Persistent soreness', present: sore.filter((x) => x >= 3).length >= 4, detail: `${sore.filter((x) => x >= 3).length} high-soreness entries in 14 days.` });

  const lastTwo = a.weeks.filter((w) => w.complete).slice(-2);
  const overMax = TRACKED_MUSCLES.filter((m) => lastTwo.length === 2 && lastTwo.every((w) => w.volume.muscles[m].effective > a.targets[m].max)).length;
  indicators.push({ label: 'Volume above range for 2+ weeks', present: overMax >= 3, detail: `${overMax} muscle(s) above their upper bound in each of the last 2 weeks.` });

  const block = currentBlock(data, a.today);
  const blockWeeks = block ? Math.floor(diffDays(a.today, block.startDate) / 7) + 1 : null;
  const stalled = recent.filter((p) => p.trend.cls === 'plateau' || p.trend.cls === 'declining').length;
  indicators.push({ label: 'Long block with stalling', present: blockWeeks != null && blockWeeks >= 6 && stalled >= recent.length * 0.5 && recent.length >= 3, detail: blockWeeks != null ? `Current block week ${blockWeeks}; ${stalled}/${recent.length} exercises stalled or declining.` : 'No active training block.' });

  const score = indicators.filter((i) => i.present).length;
  const recommend = score >= 3;
  const summary = recommend
    ? `${score} independent fatigue indicators are present. A deload (≈ 1 week at ~50% of sets, loads kept moderate, RIR 3–4) may help performance rebound.`
    : score > 0
      ? `${score} indicator(s) present — not enough to recommend a deload. Monitor; deloads are suggested only when several signs coincide.`
      : 'No meaningful fatigue indicators. No deload is needed.';
  return { recommend, score, indicators, summary };
}

export function currentBlock(data: AppData, today: string) {
  return [...data.blocks].filter((b) => b.startDate <= today && (!b.endDate || b.endDate >= today)).sort((x, y) => y.startDate.localeCompare(x.startDate))[0] ?? null;
}

// ---------------------------------------------------------------- Body tracking

export function weeklyWeightAverages(data: AppData, weekStartsOn: number) {
  const map = new Map<string, number[]>();
  for (const b of data.body) {
    if (b.weightKg == null) continue;
    const d = new Date(`${b.date}T00:00:00Z`).getUTCDay();
    const start = addDays(b.date, -((d - weekStartsOn + 7) % 7));
    const arr = map.get(start) ?? [];
    arr.push(b.weightKg);
    map.set(start, arr);
  }
  return [...map.entries()].sort(([x], [y]) => x.localeCompare(y)).map(([week, arr]) => ({ week, avg: Math.round(mean(arr) * 10) / 10, n: arr.length }));
}

export function monthlyBodyReport(data: AppData, today: string) {
  const sorted = [...data.body].sort((x, y) => x.date.localeCompare(y.date));
  const last30 = sorted.filter((b) => diffDays(today, b.date) < 30);
  const prev30 = sorted.filter((b) => diffDays(today, b.date) >= 30 && diffDays(today, b.date) < 60);
  const fields = ['weightKg', 'waistCm', 'chestCm', 'shouldersCm', 'armsCm', 'forearmsCm', 'thighsCm', 'calvesCm'] as const;
  const rows = fields.map((f) => {
    const a = last30.map((b) => b[f]).filter((x): x is number => x != null);
    const b = prev30.map((m) => m[f]).filter((x): x is number => x != null);
    return { field: f, current: a.length ? Math.round(mean(a) * 10) / 10 : null, previous: b.length ? Math.round(mean(b) * 10) / 10 : null };
  });
  const notes: string[] = [
    'Body-weight changes over days to weeks are dominated by water, glycogen and gut content; use weekly averages.',
    'Neither body weight nor circumference can measure muscle mass precisely. Trends across months are more meaningful than single readings.',
  ];
  const w = rows.find((r) => r.field === 'weightKg')!;
  const waist = rows.find((r) => r.field === 'waistCm')!;
  if (w.current != null && w.previous != null && waist.current != null && waist.previous != null) {
    const dw = w.current - w.previous;
    const dwaist = waist.current - waist.previous;
    if (dw > 0.3 && dwaist <= 0.5) notes.push('Weight up with a roughly stable waist — consistent with (but not proof of) lean-mass gain.');
    else if (dw > 0.3 && dwaist > 1) notes.push('Weight and waist both rising — some of the gain is likely fat; consider a smaller surplus if that is not intended.');
    else if (dw < -0.3) notes.push('Weight trending down — a calorie deficit makes muscle gain harder for most trained lifters.');
  }
  return { rows, notes };
}

export function volumeTrend(weeks: WeekBucket[], n = 12) {
  return weeks.slice(-n).map((w) => {
    const row: Record<string, number | string> = { week: w.range.start.slice(5), sessions: w.workouts.length, total: Math.round(TRACKED_MUSCLES.reduce((s, m) => s + w.volume.muscles[m].effective, 0) * 10) / 10 };
    for (const m of TRACKED_MUSCLES) row[m] = w.volume.muscles[m].effective;
    return row;
  });
}

