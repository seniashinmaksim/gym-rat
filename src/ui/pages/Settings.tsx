import { TrainingCard } from '../train/TrainSettings';
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
import { byLang, getLang, L, locale, ruPlural } from '../../i18n';

const DAYS: string[] = byLang(() => [L('Sunday', 'Воскресенье'), L('Monday', 'Понедельник'), L('Tuesday', 'Вторник'), L('Wednesday', 'Среда'), L('Thursday', 'Четверг'), L('Friday', 'Пятница'), L('Saturday', 'Суббота')]);

export function SettingsPage() {
  const data = useData();
  const s = data.settings;
  const save = (patch: Partial<Settings>) => store.saveSettings(patch).then(() => toast(L('Saved', 'Сохранено'), 'info'));

  return (
    <Page title={L('Settings & backup', 'Настройки и резервная копия')} subtitle={L('All settings are stored inside your encrypted vault.', 'Все настройки хранятся в вашем зашифрованном хранилище.')}>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <SecurityCard />
        <BackupCard />

        <Card>
          <CardTitle hint={L('Weeks run in this timezone. Changing it re-buckets history; nothing is lost.', 'Недели считаются в этом часовом поясе. При смене история распределяется по неделям заново; ничего не теряется.')}>{L('Training calendar', 'Календарь тренировок')}</CardTitle>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={L('Timezone', 'Часовой пояс')}>
              <Select value={s.timezone} onChange={(e) => save({ timezone: e.target.value })}>
                {listTimezones().map((tz) => <option key={tz} value={tz}>{tz}</option>)}
              </Select>
            </Field>
            <Field label={L('Week starts on', 'Начало недели')}>
              <Select value={s.weekStartsOn} onChange={(e) => save({ weekStartsOn: Number(e.target.value) })}>
                {DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
              </Select>
            </Field>
            <Field label={L('Training experience', 'Стаж тренировок')} hint={L('Shifts the provisional reference ranges by about ±2 sets.', 'Сдвигает предварительные ориентиры примерно на ±2 подхода.')}>
              <Select value={s.experience} onChange={(e) => save({ experience: e.target.value as Settings['experience'] })}>
                <option value="novice">{L('Novice (< 1 year)', 'Новичок (< 1 года)')}</option><option value="intermediate">{L('Intermediate', 'Средний')}</option><option value="advanced">{L('Advanced (5+ years)', 'Опытный (5+ лет)')}</option>
              </Select>
            </Field>
            <Field label={L('Default target RIR', 'Целевой RIR по умолчанию')} hint={L('Intended effort for working sets (double progression).', 'Задуманное усилие в рабочих подходах (двойная прогрессия).')}>
              <NumInput value={s.defaultTargetRir} onChange={(v) => v != null && save({ defaultTargetRir: Math.max(0, Math.min(5, v)) })} />
            </Field>
            <Field label={L('Significant stimulus (effective sets)', 'Значимая нагрузка (эффективные подходы)')} hint={L('Minimum sets in one session to count for recovery timing.', 'Минимум подходов за тренировку, с которого отсчитывается восстановление.')}>
              <NumInput value={s.significantStimulusSets} onChange={(v) => v != null && save({ significantStimulusSets: Math.max(0.5, v) })} step={0.5} />
            </Field>
            <Field label={L('Per-session cap per muscle', 'Предел на мышцу за тренировку')} hint={L("Heuristic ceiling used for 'today ≈ N' and 'at risk'.", 'Эвристический потолок для «сегодня ≈ N» и «под угрозой».')}>
              <NumInput value={s.perSessionSetCap} onChange={(v) => v != null && save({ perSessionSetCap: Math.max(2, Math.min(15, Math.round(v))) })} />
            </Field>
          </div>
        </Card>

        <LearningCard />
        <PlannerCard />
        <RuleChecksCard />

        <Card>
          <CardTitle>{L('Display', 'Отображение')}</CardTitle>
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm">{L('Theme', 'Тема')}</span>
              <Segmented value={s.theme} onChange={(v) => save({ theme: v })} options={[{ value: 'system', label: L('System', 'Системная') }, { value: 'dark', label: L('Dark', 'Тёмная') }, { value: 'light', label: L('Light', 'Светлая') }]} /></div>
            <Toggle checked={s.exerciseNames === 'both'} onChange={(v) => save({ exerciseNames: v ? 'both' : 'en' })} label={L('Also show the name in the other language', 'Показывать название и на втором языке')} />
            <Toggle checked={s.showOptionalTracking} onChange={(v) => save({ showOptionalTracking: v })} label={L('Show optional nutrition & supplement tracking', 'Показывать необязательный учёт питания и добавок')} />
          </div>
        </Card>

        <TrainingCard />
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
    if (pw.length < 10) return toast(L('Use at least 10 characters', 'Не меньше 10 символов'), 'bad');
    if (pw !== pw2) return toast(L('New passwords do not match', 'Новые пароли не совпадают'), 'bad');
    setBusy(true);
    try {
      await store.changePassword(oldPw, pw);
      toast(L('Password changed. Older backups keep their own password.', 'Пароль изменён. У старых резервных копий остаётся свой пароль.'));
      setOld(''); setPw(''); setPw2('');
    } catch (e) {
      toast(e instanceof WrongPasswordError ? L('Current password is incorrect', 'Текущий пароль неверен') : (e as Error).message, 'bad');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <CardTitle hint={header ? L(`${header.kdf} · ${header.iterations.toLocaleString(locale())} iterations · AES-256-GCM`, `${header.kdf} · ${header.iterations.toLocaleString(locale())} итераций · AES-256-GCM`) : undefined} right={<Button size="sm" onClick={() => store.lock()}><IconLock size={14} />{L('Lock now', 'Заблокировать')}</Button>}>{L('Security', 'Безопасность')}</CardTitle>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Input type="password" autoComplete="current-password" placeholder={L('Current password', 'Текущий пароль')} value={oldPw} onChange={(e) => setOld(e.target.value)} />
        <Input type="password" autoComplete="new-password" placeholder={L('New password', 'Новый пароль')} value={pw} onChange={(e) => setPw(e.target.value)} />
        <Input type="password" autoComplete="new-password" placeholder={L('Repeat new', 'Повторите новый')} value={pw2} onChange={(e) => setPw2(e.target.value)} />
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-ink-500">{pw ? L(`Strength: ${passwordStrength(pw).hint}`, `Надёжность: ${passwordStrength(pw).hint}`) : header ? L(`Last changed ${new Date(header.passwordChangedAt).toLocaleDateString(locale())}`, `Изменён ${new Date(header.passwordChangedAt).toLocaleDateString(locale())}`) : ''}</span>
        <Button variant="primary" size="sm" onClick={change} disabled={busy || !oldPw || !pw}>{busy ? L('Re-encrypting key…', 'Перешифровка ключа…') : L('Change password', 'Сменить пароль')}</Button>
      </div>
      <div className="mt-4 border-t border-ink-100 pt-4 dark:border-ink-800">
        <Field label={L('Auto-lock after inactivity', 'Автоблокировка при бездействии')} hint={L('The vault also locks when you return to the tab after this long.', 'Хранилище блокируется и тогда, когда вы возвращаетесь на вкладку спустя это время.')}>
          <Select value={data.settings.autoLockMinutes} onChange={(e) => store.saveSettings({ autoLockMinutes: Number(e.target.value) })}>
            {[2, 5, 10, 15, 30, 60].map((m) => <option key={m} value={m}>{L(`${m} minutes`, `${m} мин`)}</option>)}
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
    if (bpw.length < 10) return toast(L('Backup password: at least 10 characters', 'Пароль копии: не меньше 10 символов'), 'bad');
    setBusy('export');
    try {
      const b = await createBackup(data, (id) => store.photoBytes(id), bpw);
      downloadText(`gymrat-${stamp}.gymrat-backup.json`, JSON.stringify(b));
      toast(L('Encrypted backup downloaded', 'Зашифрованная резервная копия скачана'));
      setBpw('');
    } finally {
      setBusy(null);
    }
  };
  const restore = async () => {
    if (!file) return;
    if (!window.confirm(L('Restoring REPLACES all current data in this browser with the backup. Continue?', 'Восстановление ЗАМЕНИТ все текущие данные в этом браузере данными из копии. Продолжить?'))) return;
    setBusy('restore');
    try {
      const { data: d, photos } = await readBackup(await file.text(), rpw);
      await store.replaceAll(d, photos);
      toast(L(`Restored ${d.workouts.length} workouts`, `Восстановлено: ${d.workouts.length} ${ruPlural(d.workouts.length, 'тренировка', 'тренировки', 'тренировок')}`));
      setRpw(''); setFile(null);
    } catch (e) {
      toast(e instanceof WrongPasswordError ? L('Wrong backup password', 'Неверный пароль резервной копии') : (e as Error).message, 'bad');
    } finally {
      setBusy(null);
    }
  };
  const exportJson = () => {
    if (!window.confirm(L('This file is NOT encrypted. Anyone with the file can read your workouts. Continue?', 'Этот файл НЕ зашифрован. Любой, у кого он окажется, сможет прочитать ваши тренировки. Продолжить?'))) return;
    const payload = { schema: IMPORT_SCHEMA_ID, schema_version: IMPORT_SCHEMA_VERSION, workouts: data.workouts.map((w) => workoutToExport(w)) };
    downloadText(`gymrat-workouts-${stamp}.json`, JSON.stringify(payload, null, 2));
  };

  return (
    <Card>
      <CardTitle hint={L('Backups include every workout, setting, machine and photo, encrypted with a password you choose.', 'В резервную копию входят все тренировки, настройки, тренажёры и фото; она шифруется паролем, который вы зададите.')}>{L('Backup & restore', 'Резервная копия и восстановление')}</CardTitle>
      <div className="space-y-3">
        <div className="flex gap-2">
          <Input type="password" autoComplete="new-password" placeholder={L('Backup password', 'Пароль копии')} value={bpw} onChange={(e) => setBpw(e.target.value)} />
          <Button variant="primary" onClick={exportBackup} disabled={!!busy || !bpw}><IconExport size={16} />{busy === 'export' ? L('Encrypting…', 'Шифрование…') : L('Export', 'Экспорт')}</Button>
        </div>
        <div className="rounded-xl bg-ink-50 p-3 dark:bg-ink-950">
          <div className="mb-2 text-xs font-medium text-ink-600 dark:text-ink-300">{L('Restore from backup', 'Восстановить из копии')}</div>
          <label className="flex min-h-[44px] cursor-pointer items-center rounded-xl border border-dashed border-ink-300 bg-white px-3 text-sm text-ink-600 active:bg-ink-100 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-300">
            <input type="file" accept=".json,application/json" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="sr-only" />
            <span className="min-w-0 break-all">{file ? file.name : L('Choose backup file…', 'Выберите файл копии…')}</span>
          </label>
          <div className="mt-2 flex gap-2">
            <Input type="password" placeholder={L('Backup password', 'Пароль копии')} value={rpw} onChange={(e) => setRpw(e.target.value)} />
            <Button onClick={restore} disabled={!!busy || !file || !rpw}><IconImport size={16} />{busy === 'restore' ? L('Restoring…', 'Восстановление…') : L('Restore', 'Восстановить')}</Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-ink-100 pt-3 dark:border-ink-800">
          <span className="text-xs text-ink-500">{L(`Plain JSON (schema ${IMPORT_SCHEMA_VERSION}) for Claude or other tools.`, `Обычный JSON (схема ${IMPORT_SCHEMA_VERSION}) для Claude и других инструментов.`)}</span>
          <Button size="sm" variant="ghost" onClick={exportJson}>{L('Export unencrypted JSON', 'Экспорт JSON без шифрования')}</Button>
        </div>
        <p className="text-[11px] leading-relaxed text-ink-400">{L('Never commit backups or exports to the repository. Keep a copy somewhere private, like an encrypted drive.', 'Никогда не добавляйте резервные копии и экспорт в репозиторий. Храните копию в надёжном месте, например на зашифрованном диске.')}</p>
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
      <CardTitle hint={L('The planner switches modes from data quality, never from the calendar alone.', 'Планировщик меняет режим по качеству данных, а не просто по календарю.')} right={<Badge tone={r.mode === 'full' ? 'good' : r.mode === 'provisional' ? 'info' : 'warn'}>{MODE_LABEL[r.mode]}</Badge>}>{L('Planner readiness', 'Готовность планировщика')}</CardTitle>
      {r.next.length > 0 && <p className="mb-3 text-sm text-ink-700 dark:text-ink-200">{L('Next mode needs:', 'Для следующего режима нужно:')} {r.next.join(' · ')}</p>}
      <ul className="divide-y divide-ink-100 text-sm dark:divide-ink-800" data-testid="readiness-areas">
        {r.areas.map((x) => (
          <li key={x.area} className="flex items-center justify-between gap-3 py-2">
            <span className="min-w-0 flex-1"><span className="block font-medium text-ink-900 dark:text-white">{x.area}</span><span className="block text-xs text-ink-500">{x.detail}</span></span>
            <Badge tone={LEVEL_TONE[x.level]}>{LEVEL_LABEL[x.level]}</Badge>
          </li>
        ))}
      </ul>
      <h3 className="mt-4 text-[11px] font-semibold uppercase tracking-wider text-ink-400">{L('Muscles', 'Мышцы')}</h3>
      <ul className="mt-1 grid grid-cols-1 gap-x-6 sm:grid-cols-2">
        {r.muscles.filter((m) => m.directSessions8w > 0 || m.level !== 'INSUFFICIENT_DATA').map((m) => (
          <li key={m.muscle} className="flex items-center justify-between gap-2 py-1.5 text-sm"><span className="min-w-0 break-words">{muscleName(m.muscle, getLang())}</span><Badge tone={LEVEL_TONE[m.level]}>{LEVEL_LABEL[m.level]}</Badge></li>
        ))}
      </ul>
      <h3 className="mt-4 text-[11px] font-semibold uppercase tracking-wider text-ink-400">{L('Exercises and machines', 'Упражнения и тренажёры')}</h3>
      <ul className="mt-1 divide-y divide-ink-100 dark:divide-ink-800">
        {(all ? keys : keys.slice(0, 6)).map((k) => (
          <li key={k.key} className="flex items-center justify-between gap-2 py-1.5 text-sm">
            <span className="min-w-0 flex-1"><span className="block break-words">{k.label}</span><span className="block text-xs text-ink-500">{L(`${k.comparable} comparable session${k.comparable === 1 ? '' : 's'} in 8 weeks${k.frequent ? ' · regular' : ''}`, `${k.comparable} ${ruPlural(k.comparable, 'сопоставимая тренировка', 'сопоставимые тренировки', 'сопоставимых тренировок')} за 8 недель${k.frequent ? ' · регулярно' : ''}`)}</span></span>
            <Badge tone={LEVEL_TONE[k.level]}>{LEVEL_LABEL[k.level]}</Badge>
          </li>
        ))}
      </ul>
      {keys.length > 6 && <Button size="sm" variant="ghost" className="mt-1" onClick={() => setAll(!all)}>{all ? L('Show fewer', 'Показать меньше') : L(`Show all ${keys.length}`, `Показать все ${keys.length}`)}</Button>}
      {r.dataGaps.length > 0 && <div className="mt-3 text-xs text-ink-500"><span className="font-semibold">{L('Data gaps:', 'Пробелы в данных:')}</span> {r.dataGaps.join(' · ')}</div>}
    </Card>
  );
}

const VERDICT: Record<RuleVerdict, [string, 'good' | 'neutral' | 'warn' | 'info']> = byLang(() => ({
  supports: [L('YOUR DATA AGREE', 'ВАШИ ДАННЫЕ СОГЛАСНЫ'), 'good'], no_clear_difference: [L('NO CLEAR DIFFERENCE', 'ЯВНОЙ РАЗНИЦЫ НЕТ'), 'info'], contradicts: [L('YOUR DATA DISAGREE', 'ВАШИ ДАННЫЕ ПРОТИВ'), 'warn'], insufficient: [L('NOT ENOUGH DATA', 'МАЛО ДАННЫХ'), 'neutral'],
}));

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
      <CardTitle hint={L('Rules of thumb with low-confidence evidence, compared with your own performance. Your data can confirm or question them; the app never changes a rule on its own.', 'Практические правила со слабой доказательной базой в сравнении с вашими собственными результатами. Ваши данные могут подтвердить их или поставить под вопрос; приложение само правила не меняет.')}>{L('Rules of thumb vs your data', 'Практические правила и ваши данные')}</CardTitle>
      <ul className="divide-y divide-ink-100 text-sm dark:divide-ink-800" data-testid="rule-checks">
        {checks.map((c) => (
          <li key={c.id} className="py-2.5">
            <div className="flex items-center justify-between gap-3"><span className="font-medium text-ink-900 dark:text-white">{c.title}</span><Badge tone={VERDICT[c.verdict][1]}>{VERDICT[c.verdict][0]}</Badge></div>
            <p className="mt-0.5 text-xs text-ink-500">{c.rule}</p>
            <p className="mt-1 text-xs leading-relaxed text-ink-700 dark:text-ink-200">{c.text}</p>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] text-ink-500">{L("Performance = each session's index on the same exercise and machine vs the median of your previous three sessions there. Observational: fatigue, sleep and exercise choice also play a part.", 'Результат = индекс каждой тренировки на том же упражнении и тренажёре против медианы трёх предыдущих тренировок там же. Это наблюдение: усталость, сон и выбор упражнений тоже влияют.')}</p>
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
      <CardTitle hint={L('During Learning Mode, targets are provisional reference ranges and no muscle is labelled lagging.', 'В режиме знакомства цели — предварительные ориентиры, и ни одна мышца не помечается как отстающая.')} right={<Badge tone={a.learning.active ? 'warn' : 'good'}>{a.learning.active ? L(`Active · day ${a.learning.dayNumber}`, `Идёт · день ${a.learning.dayNumber}`) : L('Complete', 'Завершён')}</Badge>}>{L('Learning Mode', 'Режим знакомства')}</CardTitle>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={L('Start date', 'Дата начала')} hint={L('Defaults to your first logged workout.', 'По умолчанию — ваша первая записанная тренировка.')}><Input type="date" value={l.startDate ?? ''} onChange={(e) => set({ startDate: e.target.value || null })} /></Field>
        <Field label={L('Length (days)', 'Длительность (дней)')} hint={L('About 30 days. It extends automatically if data is thin.', 'Около 30 дней. Продлевается автоматически, если данных мало.')}><NumInput value={l.lengthDays} onChange={(v) => v && set({ lengthDays: Math.max(14, Math.min(90, Math.round(v))) })} /></Field>
      </div>
      <p className="mt-3 text-xs text-ink-500">{a.learning.message}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {a.learning.active
          ? <Button size="sm" onClick={() => window.confirm(L('End Learning Mode now? Targets will be individualized from the data you have, possibly with low confidence.', 'Завершить режим знакомства сейчас? Цели будут подобраны по уже имеющимся данным — возможно, с низкой уверенностью.')) && set({ endedOn: a.today })}>{L('End now', 'Завершить сейчас')}</Button>
          : <Button size="sm" onClick={() => window.confirm(L('Restart Learning Mode from today?', 'Начать режим знакомства заново с сегодняшнего дня?')) && set({ startDate: a.today, endedOn: null })}>{L('Restart from today', 'Начать заново с сегодня')}</Button>}
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
      <CardTitle hint={L('How much one working set counts, based on effort and execution. Changes recompute ALL history. This is separate from muscle coefficients, which live in the Exercise database.', 'Сколько засчитывается за один рабочий подход — по усилию и исполнению. Изменения пересчитывают ВСЮ историю. Это отдельно от коэффициентов мышц: они находятся в базе упражнений.')}
        right={<Button size="sm" variant="ghost" onClick={() => window.confirm(L('Reset the set-quality model to defaults?', 'Сбросить модель качества подходов к значениям по умолчанию?')) && store.saveSettings({ quality: { ...DEFAULT_QUALITY, rirCredit: [...DEFAULT_QUALITY.rirCredit] } })}>{L('Reset defaults', 'Сбросить')}</Button>}>
        {L('Set-quality model', 'Модель качества подходов')}
      </CardTitle>
      <div className="mb-4">
        <div className="mb-1.5 text-xs font-medium text-ink-600 dark:text-ink-300">{L('Credit by reps in reserve', 'Зачёт по повторам в запасе')}</div>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
          {q.rirCredit.map((c, i) => (
            <Field key={i} label={i === q.rirCredit.length - 1 ? `RIR ${i}+` : `RIR ${i}`}>
              <NumInput value={c} step={0.05} onChange={(v) => v != null && set({ rirCredit: q.rirCredit.map((x, j) => (j === i ? Math.max(0, Math.min(1, v)) : x)) })} />
            </Field>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {row(L('Unknown RIR', 'RIR неизвестен'), 'unknownRirCredit', L('Provisional; flagged uncertain', 'Предварительно; помечается как неточное'))}
        {row(L('Drop-set segment', 'Сегмент дроп-сета'), 'dropSetCredit')}
        {row(L('Partial ROM', 'Неполная амплитуда'), 'partialRomCredit')}
        {row(L('Lengthened partials', 'Частичные в растяжении'), 'lengthenedPartialCredit')}
        {row(L('Compromised technique', 'Нарушенная техника'), 'compromisedTechniqueCredit')}
        {row(L('Low-rep credit', 'Зачёт при малых повт.'), 'lowRepCredit', L(`Applies below ${q.lowRepThreshold} reps`, `Если повторений меньше ${q.lowRepThreshold}`))}
        {row(L('Per-session ceiling', 'Потолок за тренировку'), 'sessionCreditCap', L('Effective sets per muscle in one session before tapering', 'Эффективных подходов на мышцу за тренировку до снижения зачёта'))}
        {row(L('Credit above ceiling', 'Зачёт выше потолка'), 'beyondSessionCapCredit', L('Multiplier for sets past the ceiling', 'Множитель для подходов сверх потолка'))}
      </div>
      <div className="mt-3">
        <Toggle checked={q.useFeelWhenNoRir !== false} onChange={(v) => set({ useFeelWhenNoRir: v })}
          label={<span>{L('Use "how the set felt" when no RIR was logged', 'Учитывать «как ощущался подход», если RIR не записан')} <span className="block text-xs text-ink-500">{L('Estimated RIR range (too easy ≈ 5+, a little easy ≈ 3–4, just right ≈ 1–3, very hard ≈ 0–1); off = such sets get the provisional unknown-RIR credit.', 'Оценка диапазона RIR (слишком легко ≈ 5+, немного легко ≈ 3–4, в самый раз ≈ 1–3, очень тяжело ≈ 0–1); выкл. = такие подходы получают предварительный зачёт как при неизвестном RIR.')}</span></span>} />
      </div>
      <Callout tone="info">{L('Proximity-to-failure research shows similar hypertrophy across roughly 0–3 RIR, with less stimulus further from failure. These numbers are transparent assumptions, not measurements.', 'Исследования близости к отказу показывают сходную гипертрофию примерно при RIR 0–3 и меньший стимул дальше от отказа. Эти числа — открытые допущения, а не измерения.')}</Callout>
    </Card>
  );
}

function DangerCard() {
  const [txt, setTxt] = useState('');
  return (
    <Card className="lg:col-span-2">
      <CardTitle hint={L('Permanently deletes the vault, all workouts and photos from this browser. Export a backup first.', 'Безвозвратно удаляет хранилище, все тренировки и фото из этого браузера. Сначала сделайте резервную копию.')}>{L('Erase all data', 'Стереть все данные')}</CardTitle>
      <div className="flex flex-wrap gap-2">
        <Input className="max-w-[220px]" placeholder={L('Type "ERASE" to confirm', 'Введите «ERASE» для подтверждения')} value={txt} onChange={(e) => setTxt(e.target.value)} />
        <Button variant="danger" disabled={txt !== 'ERASE'} onClick={() => window.confirm(L('This cannot be undone. Erase everything?', 'Это нельзя отменить. Стереть всё?')) && store.eraseEverything()}>{L('Erase everything', 'Стереть всё')}</Button>
      </div>
    </Card>
  );
}
