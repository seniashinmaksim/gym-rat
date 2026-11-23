import { useMemo, useState, type ReactNode } from 'react';
import { formatDate, formatDuration } from '../../domain/dates';
import type { WeekBucket } from '../../domain/history';
import { TRACKED_MUSCLES } from '../../domain/muscles';
import { baselineReport, buildSnapshot, weeklyReport, weeklySummary, progressionAsOf, type WeeklyReport } from '../../domain/reports';
import type { MuscleId } from '../../domain/types';
import type { FailureProfile } from '../../domain/failure';
import { hypertrophyAssessment, periodStats, strengthProgress, type HypertrophyIndicator, type HypertrophyStatus, type PeriodStats } from '../../domain/baseline';
import { computeVolume, qualitySetTotal } from '../../domain/volume';
import { effortDistribution, weekTotals } from '../../domain/effort';
import { addDays } from '../../domain/dates';
import type { Workout } from '../../domain/types';
import { L } from '../../i18n/core';
import { store, useData } from '../../lib/store';
import { IconAlert, IconCheck, IconChevronDown, IconInfo } from '../components/icons';
import { Badge, Button, Callout, Card, CardTitle, Empty, Page, Segmented, Select, Stat, Table, Td, Why, cx, fmt, toast } from '../components/ui';
import { useAnalysis, useNames } from '../hooks';

type Tab = 'weekly' | 'baseline';

export function ReportsPage() {
  const [tab, setTab] = useState<Tab>('weekly');
  return (
    <Page
      title="Reports"
      subtitle="Automatic weekly summaries and the 30-day personal baseline."
      actions={<Segmented<Tab> value={tab} onChange={setTab} options={[{ value: 'weekly', label: 'Weekly' }, { value: 'baseline', label: '30-day baseline' }]} />}
    >
      {tab === 'weekly' ? <WeeklyTab /> : <BaselineTab />}
    </Page>
  );
}

// ================================================================ Weekly

const RESULT: Record<WeeklyReport['rows'][number]['result'], { label: string; tone: 'good' | 'info' | 'warn' | 'violet' }> = {
  met: { label: 'Target met', tone: 'good' },
  within: { label: 'Within range', tone: 'info' },
  short: { label: 'Below range', tone: 'warn' },
  excess: { label: 'Above range', tone: 'violet' },
};

function WeeklyTab() {
  const data = useData();
  const a = useAnalysis();
  const names = useNames();
  const weeks = useMemo(() => [...a.weeks].reverse(), [a.weeks]);
  const defaultWeek = (weeks.find((w) => w.complete) ?? weeks[0])?.range.start ?? null;
  const [weekStart, setWeekStart] = useState<string | null>(defaultWeek);
  const [details, setDetails] = useState(false);
  const bucket: WeekBucket | undefined = weeks.find((w) => w.range.start === (weekStart ?? defaultWeek));
  const report = useMemo(() => (bucket ? weeklyReport(bucket, a, data) : null), [bucket, a, data]);

  if (!bucket || !report) {
    return <Empty title="No weeks recorded yet">Weekly reports are generated automatically once you log workouts.</Empty>;
  }

  const snapshot = data.snapshots.find((s) => s.weekStart === bucket.range.start);
  const saveSnapshot = async () => {
    await store.saveSnapshot(buildSnapshot(bucket, a.targets, data));
    toast('Week snapshot saved');
  };

  const name = (m: MuscleId) => names.muscle(m);
  const listOrDash = (ms: MuscleId[]) => (ms.length ? ms.map(name).join(', ') : '—');

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Select value={bucket.range.start} onChange={(e) => setWeekStart(e.target.value)} className="w-full sm:w-auto sm:min-w-[240px]">
          {weeks.map((w) => (
            <option key={w.range.start} value={w.range.start}>
              {formatDate(w.range.start, { day: 'numeric', month: 'short' })} – {formatDate(w.range.end, { day: 'numeric', month: 'short', year: 'numeric' })}
              {w.complete ? '' : ' (in progress)'} · {w.workouts.length} sessions
            </option>
          ))}
        </Select>
        {!bucket.complete && <Badge tone="info">Week in progress — numbers are partial</Badge>}
        {snapshot ? (
          <Badge tone="good"><IconCheck size={12} /> Targets frozen {formatDate(snapshot.createdAt.slice(0, 10), { day: 'numeric', month: 'short' })}</Badge>
        ) : (
          bucket.complete && <Button size="sm" onClick={saveSnapshot}>Save snapshot</Button>
        )}
      </div>
      {!snapshot && bucket.complete && (
        <p className="-mt-2 text-xs text-ink-500">Finished weeks are frozen automatically the next time you open the app. A snapshot freezes this week's targets so later target or coefficient changes don't rewrite how this week is judged. Raw sets are always kept; volume itself is recomputed from them.</p>
      )}

      <WeekSummaryCard report={report} complete={bucket.complete} />
      <FourWeekCheck />

      <button type="button" onClick={() => setDetails(!details)} aria-expanded={details} className="flex min-h-[44px] items-center gap-1.5 text-sm font-medium text-ink-600 dark:text-ink-300">
        Full report <IconChevronDown size={14} className={cx('transition', details && 'rotate-180')} />
      </button>
      {details && (<>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Sessions" value={report.sessions} />
        <Stat label="Working sets" value={report.totalWorkingSets} sub="raw, all muscles" />
        <Stat label="Targets reached" value={`${report.reached.length}/${TRACKED_MUSCLES.length}`} tone={report.reached.length >= TRACKED_MUSCLES.length / 2 ? 'good' : undefined} />
        <Stat label="Below range" value={report.short.length} tone={report.short.length ? 'warn' : 'good'} sub={report.excessive.length ? `${report.excessive.length} above range` : undefined} />
      </div>

      {report.sessions === 0 && (
        <Callout tone="info" icon={<IconInfo size={16} />}>No sessions this week. Missing volume is not a training failure — recovery, schedule and life take priority sometimes.</Callout>
      )}

      <Card>
        <CardTitle hint={snapshot ? 'Judged against the targets frozen in the snapshot.' : 'Judged against current targets (no snapshot for this week).'}>Volume by muscle</CardTitle>
        <Table head={['Muscle', 'Effective', 'Direct sets', 'Indirect sets', 'Range (min–pref–max)', 'Result']} dense>
          {report.rows.map((r) => (
            <tr key={r.muscle}>
              <Td right={false} className="font-medium text-ink-800 dark:text-ink-100">{name(r.muscle)}</Td>
              <Td className="font-semibold">{fmt(r.effective)}</Td>
              <Td>{r.direct}</Td>
              <Td>{r.indirect}</Td>
              <Td className="text-ink-500">{fmt(r.min)}–{fmt(r.preferred)}–{fmt(r.max)}</Td>
              <Td><Badge tone={RESULT[r.result].tone}>{RESULT[r.result].label}</Badge></Td>
            </tr>
          ))}
        </Table>
        <p className="mt-2 text-[11px] text-ink-500">Effective = Σ (muscle coefficient × set-quality credit). Direct/indirect columns are raw set counts, before any adjustment.</p>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <ListCard title="Reached target" tone="good" body={listOrDash(report.reached)} />
        <ListCard title="Fell short (below lower end)" tone="warn" body={listOrDash(report.short)} />
        <ListCard title="Above upper bound" tone="violet" body={listOrDash(report.excessive)} />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardTitle hint="Week best vs best of the previous 4 sessions on the same equipment.">Strength changes</CardTitle>
          {report.progressed.length === 0 && report.declined.length === 0 ? (
            <p className="text-sm text-ink-500">No clear changes this week (or not enough prior sessions to compare).</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {report.progressed.map((p) => (
                <li key={p.exerciseId + p.scope} className="flex gap-2"><Badge tone="good">↑</Badge><span><span className="text-ink-800 dark:text-ink-100">{p.evidence}</span> <span className="text-xs text-ink-500">· {p.scope}</span></span></li>
              ))}
              {report.declined.map((p) => (
                <li key={p.exerciseId + p.scope} className="flex gap-2"><Badge tone="bad">↓</Badge><span><span className="text-ink-800 dark:text-ink-100">{p.evidence}</span> <span className="text-xs text-ink-500">· {p.scope}</span></span></li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardTitle hint="From daily check-ins and session wellness.">Recovery observations</CardTitle>
          <ul className="list-disc space-y-1 pl-4 text-sm text-ink-700 dark:text-ink-200">
            {report.recoveryNotes.map((n, i) => <li key={i}>{n}</li>)}
          </ul>
        </Card>
      </div>

      <Card>
        <CardTitle hint="Suggestions, not obligations — consistent progress and recovery beat hitting numbers.">For the upcoming week</CardTitle>
        <ul className="space-y-2 text-sm">
          {report.recommendations.map((r, i) => (
            <li key={i} className="flex gap-2.5"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent-500" /><span className="text-ink-800 dark:text-ink-100">{r}</span></li>
          ))}
        </ul>
        <div className="mt-3">
          <Why>
            <p>"Below range" means effective sets finished under the lower end of the target range; "above range" means over the upper bound, where returns diminish and fatigue grows.</p>
            <p>Declines are flagged when the week's best performance index is more than 5% under the recent best on the same machine.</p>
          </Why>
        </div>
      </Card>
      {report.failure && report.failure.totals.recorded > 0 && <FailureCard f={report.failure} />}
      </>)}
    </div>
  );
}

/** The short, actionable answer for the week. */
function WeekSummaryCard({ report, complete }: { report: WeeklyReport; complete: boolean }) {
  const a = useAnalysis();
  const names = useNames();
  const data = useData();
  const asOf = useMemo(() => (report.range.end >= a.today ? a.progression : progressionAsOf(data, a, report.range.end)), [report.range.end, a, data]);
  const s = weeklySummary(report, a, asOf);
  const Row = ({ q, children }: { q: string; children: ReactNode }) => (
    <div className="border-t border-ink-100 py-2.5 first:border-t-0 first:pt-0 dark:border-ink-800">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">{q}</div>
      <div className="mt-0.5 text-sm text-ink-800 dark:text-ink-100">{children}</div>
    </div>
  );
  const list = (xs: string[], empty: string) => (xs.length ? xs.join(' · ') : <span className="text-ink-500">{empty}</span>);
  // Each set once, weighted by quality — never more than the working sets (no cross-muscle double counting).
  const effSum = (ws: Workout[]) => qualitySetTotal(ws, a.registry, data.settings.quality);
  const cur = weekTotals(data.workouts, report.range, effSum);
  const prev = weekTotals(data.workouts, { start: addDays(report.range.start, -7), end: addDays(report.range.end, -7) }, effSum);
  const tr = (k: string, x: string, y: string) => <tr><Td right={false} className="font-medium">{k}</Td><Td className="font-semibold">{x}</Td><Td>{y}</Td></tr>;
  return (
    <Card>
      <div className="mb-3"><Table dense head={['', 'This week', 'Last week']}>
        {tr('Workouts', String(cur.workouts), String(prev.workouts))}
        {tr('Working sets', String(cur.workingSets), String(prev.workingSets))}
        {tr('Quality sets', fmt(cur.effective), fmt(prev.effective))}
        {tr('Avg RIR', cur.avgRir != null ? fmt(cur.avgRir) : '—', prev.avgRir != null ? fmt(prev.avgRir) : '—')}
        {tr('Tonnage', `${cur.tonnageKg.toLocaleString()} kg`, `${prev.tonnageKg.toLocaleString()} kg`)}
      </Table></div>
      <Row q={complete ? 'Behind target (quality sets short)' : 'Still behind (quality sets left)'}>
        {s.behind.length ? s.behind.map((b) => `${names.muscle(b.muscle)} ${fmt(b.left)}`).join(' · ') : <span className="text-emerald-600 dark:text-emerald-400">All muscles at target.</span>}
      </Row>
      <Row q="Progressing">{list(s.progressing, 'No clear new bests this week.')}</Row>
      <Row q="Increase weight">{list(s.increase, 'None yet.')}</Row>
      <Row q="Keep or reduce">{s.reduce.length ? <><b className="font-semibold text-amber-700 dark:text-amber-300">Reduce:</b> {s.reduce.join(' · ')}{s.keep.length ? ' · ' : ''}</> : null}{s.keep.length ? <>Keep: {s.keep.join(' · ')}</> : !s.reduce.length ? <span className="text-ink-500">—</span> : null}</Row>
      <Row q="Possible plateaus">{list(s.plateaus, 'None detected.')}</Row>
      {s.failureLine && <Row q="Failure">{s.failureLine}</Row>}
    </Card>
  );
}

function ListCard({ title, body, tone }: { title: string; body: string; tone: 'good' | 'warn' | 'violet' }) {
  const dot = { good: 'bg-emerald-500', warn: 'bg-amber-500', violet: 'bg-violet-500' }[tone];
  return (
    <Card>
      <div className="mb-1.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink-500"><span className={cx('h-2 w-2 rounded-full', dot)} />{title}</div>
      <div className="text-sm text-ink-800 dark:text-ink-100">{body}</div>
    </Card>
  );
}

// ================================================================ Baseline

function BaselineTab() {
  const data = useData();
  const a = useAnalysis();
  const names = useNames();
  const r = useMemo(() => baselineReport(data, a), [data, a]);
  const eqName = useMemo(() => new Map(data.equipment.map((e) => [e.id, e.name])), [data.equipment]);

  if (!r) return <Empty title="Baseline not started">Learning Mode starts with your first logged workout. The baseline report fills in over ~30 days.</Empty>;

  const ex = (id: string) => names.ex(a.registry.get(id), id);
  const L = a.learning;

  return (
    <div className="space-y-5">
      {L.active ? (
        <Callout tone="warn" icon={<IconAlert size={16} />} title={`Preliminary — day ${Math.max(1, L.dayNumber)} of ${L.lengthDays}`}>
          {L.message} Sections fill in as data accumulates; targets remain provisional until calibration completes.
        </Callout>
      ) : (
        <Callout tone="good" icon={<IconCheck size={16} />} title="Calibration complete">{L.message}</Callout>
      )}

      <p className="text-xs text-ink-500">Period {formatDate(r.period.start, { day: 'numeric', month: 'short', year: 'numeric' })} – {formatDate(r.period.end, { day: 'numeric', month: 'short', year: 'numeric' })} ({r.period.days} days)</p>

      <Section n={1} title="Training frequency">
        <div className="grid grid-cols-3 gap-2">
          <Mini label="Sessions" value={r.frequency.sessions} />
          <Mini label="Per week" value={fmt(r.frequency.perWeek)} />
          <Mini label="Usual days" value={r.frequency.commonDays.length ? r.frequency.commonDays.join(', ') : '—'} />
        </div>
        <p className="mt-2 text-xs text-ink-500">{r.exercisesPerSession} exercises and {r.setsPerSession} working sets per session on average. Muscles most often trained together: {r.coOccurrence.length ? r.coOccurrence.slice(0, 4).map((c) => `${c.pair} (${c.count}×)`).join('; ') : '—'}.</p>
      </Section>

      <Section n={2} title="Workout duration">
        <p className="text-sm text-ink-800 dark:text-ink-100">{r.duration.avgMin != null ? <>Average <b>{r.duration.avgMin} min</b> across {r.duration.samples} session(s) with recorded times.</> : 'No durations recorded — add start/end times or use the live logger.'}</p>
      </Section>

      <Section n={3} title="Rest intervals">
        <div className="grid grid-cols-3 gap-2">
          <Mini label="Compound avg" value={formatDuration(r.rest.compoundAvg)} />
          <Mini label="Isolation avg" value={formatDuration(r.rest.isolationAvg)} />
          <Mini label="Between exercises" value={formatDuration(r.rest.betweenExercisesAvg)} />
        </div>
        {r.rest.perExercise.length > 0 && (
          <div className="mt-3">
            <Table head={['Exercise', 'Type', 'Avg rest', 'Samples']} dense>
              {r.rest.perExercise.slice(0, 10).map((p) => (
                <tr key={p.exerciseId}><Td right={false}>{ex(p.exerciseId)}</Td><Td className="capitalize">{p.category}</Td><Td>{formatDuration(p.avgRestSec)}</Td><Td>{p.samples}</Td></tr>
              ))}
            </Table>
          </div>
        )}
        <div className="mt-3">
          <div className="mb-1.5 text-xs font-semibold text-ink-700 dark:text-ink-200">Rep retention vs rest (same weight, set n ÷ set 1)</div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {r.rest.retention.map((b) => (
              <div key={b.label} className="rounded-xl bg-ink-50 p-2.5 dark:bg-ink-950">
                <div className="text-[11px] text-ink-500">{b.label}</div>
                <div className="text-base font-semibold tabular-nums text-ink-900 dark:text-white">{b.avgRepRetention != null ? `${Math.round(b.avgRepRetention * 100)}%` : '—'}</div>
                <div className="text-[10px] text-ink-400">{b.samples} sample{b.samples === 1 ? '' : 's'}</div>
              </div>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-ink-500">Observational only — fatigue, exercise order and RIR also affect later sets.</p>
        </div>
      </Section>

      <Section n={4} title="Most frequent exercises">
        {r.topExercises.length ? (
          <Table head={['Exercise', 'Sessions', 'Working sets']} dense>
            {r.topExercises.map((t) => <tr key={t.exerciseId}><Td right={false}>{ex(t.exerciseId)}</Td><Td>{t.sessions}</Td><Td>{t.sets}</Td></tr>)}
          </Table>
        ) : <NoData />}
        <p className="mt-2 text-xs text-ink-500">{r.exerciseVariety.distinct} distinct exercises; {r.exerciseVariety.newInLastHalf} first appeared in the second half of the period.</p>
      </Section>

      <Section n={5} title="Equipment & gym inventory">
        <div className="grid grid-cols-3 gap-2">
          <Mini label="Gyms" value={r.inventory.locations} />
          <Mini label="Equipment" value={r.inventory.equipment} />
          <Mini label="Unidentified" value={r.inventory.unidentified} />
        </div>
      </Section>

      <Section n={6} title="Current working weights" hint="Latest top set per exercise × equipment. Not comparable across machines.">
        {r.workingWeights.length ? (
          <Table head={['Exercise', 'Equipment', 'Top set', 'Date']} dense>
            {r.workingWeights.map((w) => (
              <tr key={w.key}>
                <Td right={false}>{ex(w.exerciseId)}</Td>
                <Td className="text-ink-500">{w.key.split('::')[1] && eqName.get(w.key.split('::')[1]) ? eqName.get(w.key.split('::')[1]) : w.scope}</Td>
                <Td>{w.weight != null ? `${fmt(w.weight, 2)} kg` : 'BW'} × {w.reps ?? '?'}{w.rir != null ? ` @${w.rir}` : ''}</Td>
                <Td>{formatDate(w.date, { day: 'numeric', month: 'short' })}</Td>
              </tr>
            ))}
          </Table>
        ) : <NoData />}
      </Section>

      <Section n={7} title="Typical repetition ranges">
        {r.repRanges.length ? (
          <Table head={['Exercise', 'Min', 'Median', 'Max']} dense>
            {r.repRanges.map((x) => <tr key={x.exerciseId}><Td right={false}>{ex(x.exerciseId)}</Td><Td>{x.min}</Td><Td>{fmt(x.median)}</Td><Td>{x.max}</Td></tr>)}
          </Table>
        ) : <NoData />}
      </Section>

      <Section n={8} title="Estimated effort">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Mini label="RIR recorded" value={`${r.effort.rirKnownPct}%`} />
          <Mini label="Average RIR" value={fmt(r.effort.avgRir)} />
          <Mini label="Sets at RIR ≤ 2" value={r.effort.nearFailurePct != null ? `${r.effort.nearFailurePct}%` : '—'} />
          <Mini label="Sets at RIR ≥ 4" value={`${r.effort.lowEffortPct}%`} />
        </div>
        <p className="mt-2 text-xs text-ink-500">Within-session load changes: {r.loadChangesWithinSession.increase} ramped up, {r.loadChangesWithinSession.decrease} dropped, {r.loadChangesWithinSession.flat} straight sets.</p>
      </Section>

      <Section n={9} title="Weekly volume distribution" hint="Average effective sets per complete week; direct share = part from exercises where the muscle is the primary target.">
        <Table head={['Muscle', 'Avg effective / week', 'Direct share']} dense>
          {[...r.weeklyDistribution].sort((x, y) => y.avgEffective - x.avgEffective).map((d) => (
            <tr key={d.muscle}>
              <Td right={false}>{names.muscle(d.muscle)}</Td>
              <Td className="font-semibold">{fmt(d.avgEffective)}</Td>
              <Td>
                <div className="ml-auto flex w-28 items-center gap-2">
                  <div className="h-1.5 flex-1 rounded-full bg-ink-100 dark:bg-ink-800"><div className="h-full rounded-full bg-accent-500" style={{ width: `${Math.round(d.directShare * 100)}%` }} /></div>
                  <span className="w-8 text-right">{Math.round(d.directShare * 100)}%</span>
                </div>
              </Td>
            </tr>
          ))}
        </Table>
      </Section>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Section n={10} title="Little direct work">
          <MuscleList ms={r.lowDirect} names={names} empty="Every muscle received some direct work." />
        </Section>
        <Section n={11} title="Mostly indirect work">
          <MuscleList ms={r.highIndirect} names={names} empty="No muscle relies mainly on indirect work." />
        </Section>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Section n={12} title="Early progression">
          {r.earlyProgress.length ? <ul className="space-y-1.5 text-xs text-ink-700 dark:text-ink-200">{r.earlyProgress.map((e, i) => <li key={i}>{e}</li>)}</ul> : <NoData text="No exercise shows a clear upward trend yet." />}
        </Section>
        <Section n={13} title="Progress not yet clear">
          {r.unclear.length ? <ul className="space-y-1 text-xs text-ink-700 dark:text-ink-200">{r.unclear.map((e, i) => <li key={i}>{e}</li>)}</ul> : <NoData text="—" />}
        </Section>
      </div>

      <Section n={14} title="Training consistency">
        <div className="grid grid-cols-3 gap-2">
          <Mini label="Weeks trained" value={`${r.consistency.weeksWithTraining}/${r.consistency.totalWeeks}`} />
          <Mini label="Sessions/week variability" value={r.consistency.cvSessions != null ? `${Math.round(r.consistency.cvSessions * 100)}%` : '—'} />
          <Mini label="Complete weeks" value={L.completeWeeks} />
        </div>
        <p className="mt-2 text-[11px] text-ink-500">Variability is the coefficient of variation of sessions per week; lower = more consistent.</p>
      </Section>

      <Section n={15} title="Data quality & remaining uncertainties">
        <ul className="space-y-1.5 text-sm">
          {r.dataQuality.map((d, i) => (
            <li key={i} className="flex gap-2"><IconAlert size={14} className="mt-0.5 shrink-0 text-amber-500" /><span className="text-ink-700 dark:text-ink-200">{d}</span></li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

function Section({ n, title, hint, children }: { n: number; title: string; hint?: string; children: ReactNode }) {
  return (
    <Card>
      <div className="mb-3 flex items-start gap-3">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-accent-500/15 text-xs font-semibold tabular-nums text-accent-600 dark:text-accent-400">{n}</span>
        <div>
          <h2 className="text-[15px] font-semibold text-ink-900 dark:text-white">{title}</h2>
          {hint && <p className="mt-0.5 text-xs text-ink-500 dark:text-ink-400">{hint}</p>}
        </div>
      </div>
      {children}
    </Card>
  );
}

function Mini({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-xl bg-ink-50 p-2.5 dark:bg-ink-950">
      <div className="text-[10px] font-medium uppercase tracking-wide text-ink-500">{label}</div>
      <div className="mt-0.5 truncate text-base font-semibold tabular-nums text-ink-900 dark:text-white">{value}</div>
    </div>
  );
}

function MuscleList({ ms, names, empty }: { ms: MuscleId[]; names: ReturnType<typeof useNames>; empty: string }) {
  if (!ms.length) return <p className="text-sm text-ink-500">{empty}</p>;
  return <div className="flex flex-wrap gap-1.5">{ms.map((m) => <Badge key={m} tone="warn">{names.muscle(m)}</Badge>)}</div>;
}

function NoData({ text = 'Not enough data yet.' }: { text?: string }) {
  return <p className="text-sm text-ink-500">{text}</p>;
}

/** How often sets reached failure, per exercise and muscle — descriptive only (failure is not required for growth). */
function FailureCard({ f }: { f: FailureProfile }) {
  const a = useAnalysis();
  const names = useNames();
  const pct = (x: number | null) => (x == null ? '—' : `${Math.round(x * 100)}%`);
  return (
    <Card>
      <CardTitle hint="Only sets with a failure answer (or an older “to failure” note) are counted. Training to failure is not required — stopping 1–3 reps short grows muscle similarly.">Failure &amp; effort</CardTitle>
      <ul className="mb-3 space-y-1.5 text-sm">
        {f.flags.map((x) => <li key={x.id}><b className="font-medium text-ink-800 dark:text-ink-100">{x.text}</b> <span className="text-xs text-ink-500">{x.why}</span></li>)}
      </ul>
      <Table head={['Exercise', 'Recorded', 'Failure', 'Stopped before', 'Form broke']} dense>
        {f.exercises.filter((r) => r.recorded > 0).map((r) => (
          <tr key={r.exerciseId}>
            <Td right={false}>{names.ex(a.registry.get(r.exerciseId), r.exerciseId)}</Td>
            <Td>{r.recorded}/{r.workingSets}</Td>
            <Td>{r.muscular} ({pct(r.shareAtFailure)})</Td>
            <Td>{r.none}</Td>
            <Td>{r.technical}</Td>
          </tr>
        ))}
      </Table>
      <p className="mt-2 text-xs text-ink-500">By muscle: {f.muscles.filter((m) => m.recorded > 0).map((m) => `${names.muscle(m.muscle)} ${pct(m.shareAtFailure)}`).join(' · ') || '—'}</p>
    </Card>
  );
}

const STATUS_TEXT: Record<HypertrophyStatus, string> = {
  establishing_baseline: 'BASELINE — weeks 1–4', get too_early() { return L('TOO EARLY — first check after 8 weeks', 'РАНО — первая проверка через 8 недель'); }, consistent_positive_signals: 'CONSISTENT POSITIVE SIGNALS',
  mixed_signals: 'MIXED SIGNALS', no_clear_signals: 'NO CLEAR SIGNALS', insufficient_data: 'MORE DATA NEEDED',
};
const IND_LABEL: Record<HypertrophyIndicator['id'], string> = { strength: 'Strength', volume: 'Weekly volume', consistency: 'Sessions', effort: 'Effort logged', body_weight: 'Body weight', circumference: 'Waist', photos: 'Photos' };

/** Last 4 weeks vs the 4 before vs the first 4 (baseline) — numbers only, plus the separate growth-signal status. */
function FourWeekCheck() {
  const a = useAnalysis();
  const data = useData();
  const v = useMemo(() => {
    const eff = (ws: Workout[]) => Object.fromEntries(Object.entries(computeVolume(ws, a.registry, data.settings.quality).muscles).map(([m, x]) => [m, x.effective]));
    const start = a.learning.startDate;
    if (!start || !data.workouts.length) return null;
    const q = (ws: Workout[]) => qualitySetTotal(ws, a.registry, data.settings.quality);
    const opts = { today: a.today, quality: q };
    const cur = periodStats(data, addDays(a.today, -27), a.today, eff, opts);
    const prev = periodStats(data, addDays(a.today, -55), addDays(a.today, -28), eff, opts);
    const base = periodStats(data, start, addDays(start, 27), eff, opts);
    const progress = a.progression.map((p) => strengthProgress(p, a.today));
    const targetPerWeek = a.muscles.reduce((t, m) => t + m.target.preferred, 0);
    // Effort logged over the same 4 weeks (not just this week, not summed across muscles).
    const ed = effortDistribution(data.workouts, { start: addDays(a.today, -27), end: a.today });
    const assess = hypertrophyAssessment({ data, today: a.today, startDate: start, progress, current: cur, previous: prev.sessions ? prev : null, targetPerWeek, effortKnownShare: ed.total ? 1 - ed.unknown / ed.total : null });
    return { cur, prev, base, assess, ok: progress.filter((p) => p.status === 'ok') };
  }, [a, data]);
  if (!v) return null;
  const row = (k: string, f: (p: PeriodStats) => string) => <tr><Td right={false} className="font-medium">{k}</Td><Td>{f(v.base)}</Td><Td>{f(v.prev)}</Td><Td className="font-semibold">{f(v.cur)}</Td></tr>;
  const n = (x: number | null, u = '') => (x == null ? '—' : `${fmt(x)}${u}`);
  return (
    <Card padded={false}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 pt-3 sm:px-5">
        <span className="text-sm font-semibold">4-week check</span>
        <span className="text-[10px] uppercase tracking-wider text-ink-400">week {v.assess.week}{v.assess.nextCheck ? ` · next ${formatDate(v.assess.nextCheck, { day: 'numeric', month: 'short' })}` : ''}</span>
      </div>
      <Table dense head={['', 'Baseline', 'Prev 4 wk', 'Last 4 wk']}>
        {row('Sessions / wk', (p) => n(p.sessionsPerWeek))}
        {row('Quality sets / wk', (p) => n(p.qualitySetsPerWeek))}
        {row('Body 7-day', (p) => n(p.bodyWeight7d, ' kg'))}
        {row('Waist', (p) => n(p.waistCm, ' cm'))}
      </Table>
      <div className="px-4 pb-3 pt-2 sm:px-5">
        <div className="text-[11px] uppercase tracking-wider text-ink-400">Growth signals (separate from strength)</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-2"><b className="text-sm">{STATUS_TEXT[v.assess.status]}</b><Badge tone="neutral">{v.assess.confidence} confidence</Badge></div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {v.assess.indicators.map((i) => <Badge key={i.id} tone={i.signal === 'positive' ? 'good' : i.signal === 'negative' ? 'warn' : 'neutral'}>{IND_LABEL[i.id]} {i.value}</Badge>)}
        </div>
        <Why label="How"><p>{L(
          'Indirect indicators only — strength trend on each machine, quality sets, sessions, logged effort, 7-day body weight, waist and photos — never a measurement of muscle. Weeks 1–4 build the baseline; after 8 weeks the indicators are combined; then every 4 weeks. Nothing changes your targets automatically.',
          'Только косвенные признаки — тренд силы на каждом тренажёре, качественные подходы, тренировки, записанное усилие, вес тела за 7 дней, талия и фото — это не измерение мышц. Недели 1–4 задают базовый уровень; через 8 недель признаки оцениваются вместе; затем каждые 4 недели. Цели автоматически не меняются.',
        )}</p></Why>
      </div>
    </Card>
  );
}
