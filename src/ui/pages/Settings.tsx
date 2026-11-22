import { useMemo, useState } from 'react';
import { LEVEL_LABEL, MODE_LABEL, readinessReport, type ReadinessLevel } from '../../domain/readiness';
import { muscleName } from '../../domain/muscles';
import { ruleChecks, type RuleVerdict } from '../../domain/ruleChecks';
import { DEFAULT_QUALITY } from '../../domain/defaults';
import { listTimezones } from '../../domain/dates';
import { IMPORT_SCHEMA_ID, IMPORT_SCHEMA_VERSION, workoutToExport } from '../../domain/importer';
import type { QualityModel, Settings } from '../../domain/types';
import { createBackup, downloadText, readBackup } from '../../lib/backup';
import { passwordStrength, WrongPasswordError } from '../../lib/crypto';
import { store, useData } from '../../lib/store';
import { IconExport, IconImport, IconLock } from '../components/icons';
import { Badge, Button, Callout, Card, CardTitle, Field, Input, NumInput, Page, Segmented, Select, toast, Toggle } from '../components/ui';
import { useAnalysis } from '../hooks';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function SettingsPage() {
  const data = useData();
  const s = data.settings;
  const save = (patch: Partial<Settings>) => store.saveSettings(patch).then(() => toast('Saved', 'info'));

  return (
    <Page title="Settings & backup" subtitle="All settings are stored inside your encrypted vault.">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <SecurityCard />
        <BackupCard />

        <Card>
          <CardTitle hint="Weeks run in this timezone. Changing it re-buckets history; nothing is lost.">Training calendar</CardTitle>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Timezone">
              <Select value={s.timezone} onChange={(e) => save({ timezone: e.target.value })}>
                {listTimezones().map((tz) => <option key={tz} value={tz}>{tz}</option>)}
              </Select>
            </Field>
            <Field label="Week starts on">
              <Select value={s.weekStartsOn} onChange={(e) => save({ weekStartsOn: Number(e.target.value) })}>
                {DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
              </Select>
            </Field>
            <Field label="Training experience" hint="Shifts the provisional reference ranges by about ±2 sets.">
              <Select value={s.experience} onChange={(e) => save({ experience: e.target.value as Settings['experience'] })}>
                <option value="novice">Novice (&lt; 1 year)</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced (5+ years)</option>
              </Select>
            </Field>
            <Field label="Default target RIR" hint="Intended effort for working sets (double progression).">
              <NumInput value={s.defaultTargetRir} onChange={(v) => v != null && save({ defaultTargetRir: Math.max(0, Math.min(5, v)) })} />
            </Field>
            <Field label="Significant stimulus (effective sets)" hint="Minimum sets in one session to count for recovery timing.">
              <NumInput value={s.significantStimulusSets} onChange={(v) => v != null && save({ significantStimulusSets: Math.max(0.5, v) })} step={0.5} />
            </Field>
            <Field label="Per-session cap per muscle" hint="Heuristic ceiling used for 'today ≈ N' and 'at risk'.">
              <NumInput value={s.perSessionSetCap} onChange={(v) => v != null && save({ perSessionSetCap: Math.max(2, Math.min(15, Math.round(v))) })} />
            </Field>
          </div>
        </Card>

        <LearningCard />
        <PlannerCard />
        <RuleChecksCard />

        <Card>
          <CardTitle>Display</CardTitle>
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm">Theme</span>
              <Segmented value={s.theme} onChange={(v) => save({ theme: v })} options={[{ value: 'system', label: 'System' }, { value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }]} /></div>
            <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm">Exercise & muscle names</span>
              <Segmented value={s.exerciseNames} onChange={(v) => save({ exerciseNames: v })} options={[{ value: 'en', label: 'English' }, { value: 'ru', label: 'Русский' }, { value: 'both', label: 'Both' }]} /></div>
            <Toggle checked={s.showOptionalTracking} onChange={(v) => save({ showOptionalTracking: v })} label="Show optional nutrition & supplement tracking" />
          </div>
        </Card>

        <QualityCard />
        <DangerCard />
      </div>
    </Page>
  );
}

function SecurityCard() {
  const data = useData();
  const header = store.getHeader();
  const [oldPw, setOld] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const change = async () => {
    if (pw.length < 10) return toast('Use at least 10 characters', 'bad');
    if (pw !== pw2) return toast('New passwords do not match', 'bad');
    setBusy(true);
    try {
      await store.changePassword(oldPw, pw);
      toast('Password changed. Older backups keep their own password.');
      setOld(''); setPw(''); setPw2('');
    } catch (e) {
      toast(e instanceof WrongPasswordError ? 'Current password is incorrect' : (e as Error).message, 'bad');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <CardTitle hint={header ? `${header.kdf} · ${header.iterations.toLocaleString()} iterations · AES-256-GCM` : undefined} right={<Button size="sm" onClick={() => store.lock()}><IconLock size={14} />Lock now</Button>}>Security</CardTitle>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Input type="password" autoComplete="current-password" placeholder="Current password" value={oldPw} onChange={(e) => setOld(e.target.value)} />
        <Input type="password" autoComplete="new-password" placeholder="New password" value={pw} onChange={(e) => setPw(e.target.value)} />
        <Input type="password" autoComplete="new-password" placeholder="Repeat new" value={pw2} onChange={(e) => setPw2(e.target.value)} />
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-ink-500">{pw ? `Strength: ${passwordStrength(pw).hint}` : header ? `Last changed ${new Date(header.passwordChangedAt).toLocaleDateString()}` : ''}</span>
        <Button variant="primary" size="sm" onClick={change} disabled={busy || !oldPw || !pw}>{busy ? 'Re-encrypting key…' : 'Change password'}</Button>
      </div>
      <div className="mt-4 border-t border-ink-100 pt-4 dark:border-ink-800">
        <Field label="Auto-lock after inactivity" hint="The vault also locks when you return to the tab after this long.">
          <Select value={data.settings.autoLockMinutes} onChange={(e) => store.saveSettings({ autoLockMinutes: Number(e.target.value) })}>
            {[2, 5, 10, 15, 30, 60].map((m) => <option key={m} value={m}>{m} minutes</option>)}
          </Select>
        </Field>
      </div>
    </Card>
  );
}

function BackupCard() {
  const data = useData();
  const [bpw, setBpw] = useState('');
  const [rpw, setRpw] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const stamp = new Date().toISOString().slice(0, 10);

  const exportBackup = async () => {
    if (bpw.length < 10) return toast('Backup password: at least 10 characters', 'bad');
    setBusy('export');
    try {
      const b = await createBackup(data, (id) => store.photoBytes(id), bpw);
      downloadText(`gymrat-${stamp}.gymrat-backup.json`, JSON.stringify(b));
      toast('Encrypted backup downloaded');
      setBpw('');
    } finally {
      setBusy(null);
    }
  };
  const restore = async () => {
    if (!file) return;
    if (!window.confirm('Restoring REPLACES all current data in this browser with the backup. Continue?')) return;
    setBusy('restore');
    try {
      const { data: d, photos } = await readBackup(await file.text(), rpw);
      await store.replaceAll(d, photos);
      toast(`Restored ${d.workouts.length} workouts`);
      setRpw(''); setFile(null);
    } catch (e) {
      toast(e instanceof WrongPasswordError ? 'Wrong backup password' : (e as Error).message, 'bad');
    } finally {
      setBusy(null);
    }
  };
  const exportJson = () => {
    if (!window.confirm('This file is NOT encrypted. Anyone with the file can read your workouts. Continue?')) return;
    const payload = { schema: IMPORT_SCHEMA_ID, schema_version: IMPORT_SCHEMA_VERSION, workouts: data.workouts.map((w) => workoutToExport(w)) };
    downloadText(`gymrat-workouts-${stamp}.json`, JSON.stringify(payload, null, 2));
  };

  return (
    <Card>
      <CardTitle hint="Backups include every workout, setting, machine and photo, encrypted with a password you choose.">Backup & restore</CardTitle>
      <div className="space-y-3">
        <div className="flex gap-2">
          <Input type="password" autoComplete="new-password" placeholder="Backup password" value={bpw} onChange={(e) => setBpw(e.target.value)} />
          <Button variant="primary" onClick={exportBackup} disabled={!!busy || !bpw}><IconExport size={16} />{busy === 'export' ? 'Encrypting…' : 'Export'}</Button>
        </div>
        <div className="rounded-xl bg-ink-50 p-3 dark:bg-ink-950">
          <div className="mb-2 text-xs font-medium text-ink-600 dark:text-ink-300">Restore from backup</div>
          <label className="flex min-h-[44px] cursor-pointer items-center rounded-xl border border-dashed border-ink-300 bg-white px-3 text-sm text-ink-600 active:bg-ink-100 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-300">
            <input type="file" accept=".json,application/json" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="sr-only" />
            <span className="truncate">{file ? file.name : 'Choose backup file…'}</span>
          </label>
          <div className="mt-2 flex gap-2">
            <Input type="password" placeholder="Backup password" value={rpw} onChange={(e) => setRpw(e.target.value)} />
            <Button onClick={restore} disabled={!!busy || !file || !rpw}><IconImport size={16} />{busy === 'restore' ? 'Restoring…' : 'Restore'}</Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-ink-100 pt-3 dark:border-ink-800">
          <span className="text-xs text-ink-500">Plain JSON (schema {IMPORT_SCHEMA_VERSION}) for Claude or other tools.</span>
          <Button size="sm" variant="ghost" onClick={exportJson}>Export unencrypted JSON</Button>
        </div>
        <p className="text-[11px] leading-relaxed text-ink-400">Never commit backups or exports to the repository. Keep a copy somewhere private, like an encrypted drive.</p>
      </div>
    </Card>
  );
}

const LEVEL_TONE: Record<ReadinessLevel, 'neutral' | 'warn' | 'info' | 'good'> = { INSUFFICIENT_DATA: 'neutral', DEVELOPING: 'warn', SUFFICIENT: 'info', WELL_CALIBRATED: 'good' };

/** Settings → Planner: readiness in plain words (no scores). */
function PlannerCard() {
  const data = useData();
  const a = useAnalysis();
  const r = useMemo(() => readinessReport(data, a), [data, a]);
  const [all, setAll] = useState(false);
  const keys = [...r.keys].sort((x, y) => Number(y.frequent) - Number(x.frequent) || y.comparable - x.comparable);
  return (
    <Card className="lg:col-span-2">
      <CardTitle hint="The planner switches modes from data quality, never from the calendar alone." right={<Badge tone={r.mode === 'full' ? 'good' : r.mode === 'provisional' ? 'info' : 'warn'}>{MODE_LABEL[r.mode]}</Badge>}>Planner readiness</CardTitle>
      {r.next.length > 0 && <p className="mb-3 text-sm text-ink-700 dark:text-ink-200">Next mode needs: {r.next.join(' · ')}</p>}
      <ul className="divide-y divide-ink-100 text-sm dark:divide-ink-800" data-testid="readiness-areas">
        {r.areas.map((x) => (
          <li key={x.area} className="flex items-center justify-between gap-3 py-2">
            <span className="min-w-0 flex-1"><span className="block font-medium text-ink-900 dark:text-white">{x.area}</span><span className="block text-xs text-ink-500">{x.detail}</span></span>
            <Badge tone={LEVEL_TONE[x.level]}>{LEVEL_LABEL[x.level]}</Badge>
          </li>
        ))}
      </ul>
      <h3 className="mt-4 text-[11px] font-semibold uppercase tracking-wider text-ink-400">Muscles</h3>
      <ul className="mt-1 grid grid-cols-1 gap-x-6 sm:grid-cols-2">
        {r.muscles.filter((m) => m.directSessions8w > 0 || m.level !== 'INSUFFICIENT_DATA').map((m) => (
          <li key={m.muscle} className="flex items-center justify-between gap-2 py-1.5 text-sm"><span className="truncate">{muscleName(m.muscle)}</span><Badge tone={LEVEL_TONE[m.level]}>{LEVEL_LABEL[m.level]}</Badge></li>
        ))}
      </ul>
      <h3 className="mt-4 text-[11px] font-semibold uppercase tracking-wider text-ink-400">Exercises and machines</h3>
      <ul className="mt-1 divide-y divide-ink-100 dark:divide-ink-800">
        {(all ? keys : keys.slice(0, 6)).map((k) => (
          <li key={k.key} className="flex items-center justify-between gap-2 py-1.5 text-sm">
            <span className="min-w-0 flex-1"><span className="block truncate">{k.label}</span><span className="block text-xs text-ink-500">{k.comparable} comparable session{k.comparable === 1 ? '' : 's'} in 8 weeks{k.frequent ? ' · regular' : ''}</span></span>
            <Badge tone={LEVEL_TONE[k.level]}>{LEVEL_LABEL[k.level]}</Badge>
          </li>
        ))}
      </ul>
      {keys.length > 6 && <Button size="sm" variant="ghost" className="mt-1" onClick={() => setAll(!all)}>{all ? 'Show fewer' : `Show all ${keys.length}`}</Button>}
      {r.dataGaps.length > 0 && <div className="mt-3 text-xs text-ink-500"><span className="font-semibold">Data gaps:</span> {r.dataGaps.join(' · ')}</div>}
    </Card>
  );
}

const VERDICT: Record<RuleVerdict, [string, 'good' | 'neutral' | 'warn' | 'info']> = {
  supports: ['YOUR DATA AGREE', 'good'], no_clear_difference: ['NO CLEAR DIFFERENCE', 'info'], contradicts: ['YOUR DATA DISAGREE', 'warn'], insufficient: ['NOT ENOUGH DATA', 'neutral'],
};

/**
 * The app's rules of thumb (recovery windows, exercise order) checked against the owner's own logged performance.
 * Observational only — shown, never applied automatically.
 */
function RuleChecksCard() {
  const data = useData();
  const a = useAnalysis();
  const checks = useMemo(() => ruleChecks(data, a.registry, a.progression), [data, a]);
  return (
    <Card className="lg:col-span-2">
      <CardTitle hint="Rules of thumb with low-confidence evidence, compared with your own performance. Your data can confirm or question them; the app never changes a rule on its own.">Rules of thumb vs your data</CardTitle>
      <ul className="divide-y divide-ink-100 text-sm dark:divide-ink-800" data-testid="rule-checks">
        {checks.map((c) => (
          <li key={c.id} className="py-2.5">
            <div className="flex items-center justify-between gap-3"><span className="font-medium text-ink-900 dark:text-white">{c.title}</span><Badge tone={VERDICT[c.verdict][1]}>{VERDICT[c.verdict][0]}</Badge></div>
            <p className="mt-0.5 text-xs text-ink-500">{c.rule}</p>
            <p className="mt-1 text-xs leading-relaxed text-ink-700 dark:text-ink-200">{c.text}</p>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] text-ink-500">Performance = each session's index on the same exercise and machine vs the median of your previous three sessions there. Observational: fatigue, sleep and exercise choice also play a part.</p>
    </Card>
  );
}

function LearningCard() {
  const data = useData();
  const a = useAnalysis();
  const l = data.settings.learning;
  const set = (patch: Partial<Settings['learning']>) => store.saveSettings({ learning: { ...l, ...patch } });
  return (
    <Card>
      <CardTitle hint="During Learning Mode, targets are provisional reference ranges and no muscle is labelled lagging." right={<Badge tone={a.learning.active ? 'warn' : 'good'}>{a.learning.active ? `Active · day ${a.learning.dayNumber}` : 'Complete'}</Badge>}>Learning Mode</CardTitle>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Start date" hint="Defaults to your first logged workout."><Input type="date" value={l.startDate ?? ''} onChange={(e) => set({ startDate: e.target.value || null })} /></Field>
        <Field label="Length (days)" hint="About 30 days. It extends automatically if data is thin."><NumInput value={l.lengthDays} onChange={(v) => v && set({ lengthDays: Math.max(14, Math.min(90, Math.round(v))) })} /></Field>
      </div>
      <p className="mt-3 text-xs text-ink-500">{a.learning.message}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {a.learning.active
          ? <Button size="sm" onClick={() => window.confirm('End Learning Mode now? Targets will be individualized from the data you have, possibly with low confidence.') && set({ endedOn: a.today })}>End now</Button>
          : <Button size="sm" onClick={() => window.confirm('Restart Learning Mode from today?') && set({ startDate: a.today, endedOn: null })}>Restart from today</Button>}
      </div>
    </Card>
  );
}

function QualityCard() {
  const data = useData();
  const q = data.settings.quality;
  const set = (patch: Partial<QualityModel>) => store.saveSettings({ quality: { ...q, ...patch } });
  const row = (label: string, k: keyof QualityModel, hint?: string) => (
    <Field label={label} hint={hint}>
      <NumInput value={q[k] as number} step={0.05} onChange={(v) => v != null && set({ [k]: Math.max(0, Math.min(k === 'lowRepThreshold' || k === 'minRepsForCredit' || k === 'sessionCreditCap' ? 50 : 1, v)) } as Partial<QualityModel>)} />
    </Field>
  );
  return (
    <Card className="lg:col-span-2">
      <CardTitle hint="How much one working set counts, based on effort and execution. Changes recompute ALL history. This is separate from muscle coefficients, which live in the Exercise database."
        right={<Button size="sm" variant="ghost" onClick={() => window.confirm('Reset the set-quality model to defaults?') && store.saveSettings({ quality: { ...DEFAULT_QUALITY, rirCredit: [...DEFAULT_QUALITY.rirCredit] } })}>Reset defaults</Button>}>
        Set-quality model
      </CardTitle>
      <div className="mb-4">
        <div className="mb-1.5 text-xs font-medium text-ink-600 dark:text-ink-300">Credit by reps in reserve</div>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
          {q.rirCredit.map((c, i) => (
            <Field key={i} label={i === q.rirCredit.length - 1 ? `RIR ${i}+` : `RIR ${i}`}>
              <NumInput value={c} step={0.05} onChange={(v) => v != null && set({ rirCredit: q.rirCredit.map((x, j) => (j === i ? Math.max(0, Math.min(1, v)) : x)) })} />
            </Field>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {row('Unknown RIR', 'unknownRirCredit', 'Provisional; flagged uncertain')}
        {row('Drop-set segment', 'dropSetCredit')}
        {row('Partial ROM', 'partialRomCredit')}
        {row('Lengthened partials', 'lengthenedPartialCredit')}
        {row('Compromised technique', 'compromisedTechniqueCredit')}
        {row('Low-rep credit', 'lowRepCredit', `Applies below ${q.lowRepThreshold} reps`)}
        {row('Per-session ceiling', 'sessionCreditCap', 'Effective sets per muscle in one session before tapering')}
        {row('Credit above ceiling', 'beyondSessionCapCredit', 'Multiplier for sets past the ceiling')}
      </div>
      <div className="mt-3">
        <Toggle checked={q.useFeelWhenNoRir !== false} onChange={(v) => set({ useFeelWhenNoRir: v })}
          label={<span>Use "how the set felt" when no RIR was logged <span className="block text-xs text-ink-500">Estimated RIR range (too easy ≈ 5+, a little easy ≈ 3–4, just right ≈ 1–3, very hard ≈ 0–1); off = such sets get the provisional unknown-RIR credit.</span></span>} />
      </div>
      <Callout tone="info">Proximity-to-failure research shows similar hypertrophy across roughly 0–3 RIR, with less stimulus further from failure. These numbers are transparent assumptions, not measurements.</Callout>
    </Card>
  );
}

function DangerCard() {
  const [txt, setTxt] = useState('');
  return (
    <Card className="lg:col-span-2">
      <CardTitle hint="Permanently deletes the vault, all workouts and photos from this browser. Export a backup first.">Erase all data</CardTitle>
      <div className="flex flex-wrap gap-2">
        <Input className="max-w-[220px]" placeholder='Type "ERASE" to confirm' value={txt} onChange={(e) => setTxt(e.target.value)} />
        <Button variant="danger" disabled={txt !== 'ERASE'} onClick={() => window.confirm('This cannot be undone. Erase everything?') && store.eraseEverything()}>Erase everything</Button>
      </div>
    </Card>
  );
}
