import { useState, type FormEvent } from 'react';
import { passwordStrength, WrongPasswordError } from '../../lib/crypto';
import { readBackup } from '../../lib/backup';
import { store, useStore } from '../../lib/store';
import { IconLock } from '../components/icons';
import { Button, Callout, cx, Input } from '../components/ui';
import { Brand, LangToggle } from '../Layout';
import { L } from '../../i18n';

export function LockScreen() {
  const { status, error } = useStore();
  const isNew = status === 'new';
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const strength = passwordStrength(pw);

  if (status === 'loading') return <Shell><div className="h-24 animate-pulse rounded-2xl bg-ink-200/50 dark:bg-ink-800/50" /></Shell>;
  if (status === 'unsupported') return <Shell><Callout tone="bad" title={L('Storage unavailable', 'Хранилище недоступно')}>{error ?? L('This browser cannot store encrypted data.', 'Этот браузер не может хранить зашифрованные данные.')} {L('Try a normal (non-private) window in a current browser.', 'Попробуйте обычное (не приватное) окно в современном браузере.')}</Callout></Shell>;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (isNew) {
      if (pw.length < 10) return setErr(L('Use at least 10 characters. A short passphrase of 4+ words is ideal.', 'Нужно не меньше 10 символов. Лучше всего — фраза из 4 и более слов.'));
      if (pw !== pw2) return setErr(L('Passwords do not match.', 'Пароли не совпадают.'));
    }
    setBusy(true);
    try {
      if (isNew) {
        await store.setup(pw);
        if (restoreFile) {
          const { data, photos } = await readBackup(await restoreFile.text(), pw);
          await store.replaceAll(data, photos);
        }
      } else {
        await store.unlock(pw);
      }
    } catch (ex) {
      setErr(ex instanceof WrongPasswordError ? (isNew ? L('The backup password must match the new password here. Restore with a different password from Settings after setup.', 'Пароль резервной копии должен совпадать с новым паролем. Копию с другим паролем можно восстановить позже в настройках.') : L('Incorrect password.', 'Неверный пароль.')) : (ex as Error).message);
      if (isNew && restoreFile) await store.eraseEverything();
    } finally {
      setBusy(false);
      setPw('');
      setPw2('');
    }
  };

  return (
    <Shell>
      <form onSubmit={submit} className="space-y-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent-500/15 text-accent-600 dark:text-accent-400"><IconLock size={22} /></span>
          <div>
            <h1 className="text-lg font-semibold text-ink-900 dark:text-white">{isNew ? L('Set your password', 'Задайте пароль') : L('Unlock', 'Разблокировать')}</h1>
            <p className="text-xs text-ink-500 dark:text-ink-400">{isNew ? L('First time on this device: choose the password you will use to open Gym Rat. Your data is encrypted with it.', 'Первый запуск на этом устройстве: придумайте пароль для входа в Gym Rat. Им шифруются ваши данные.') : L('Your training data is encrypted on this device.', 'Данные тренировок зашифрованы на этом устройстве.')}</p>
          </div>
        </div>
        <Input type="password" autoComplete={isNew ? 'new-password' : 'current-password'} placeholder={isNew ? L('Choose a password', 'Придумайте пароль') : L('Password', 'Пароль')} value={pw} onChange={(e) => setPw(e.target.value)} autoFocus className="h-12 text-base" />
        {isNew && (
          <>
            <div className="flex items-center gap-2">
              <div className="flex flex-1 gap-1">{[0, 1, 2, 3].map((i) => <div key={i} className={cx('h-1.5 flex-1 rounded-full', i < strength.score ? ['bg-rose-500', 'bg-amber-500', 'bg-sky-500', 'bg-emerald-500'][strength.score - 1] : 'bg-ink-200 dark:bg-ink-800')} />)}</div>
              <span className="w-16 text-right text-[11px] text-ink-500">{pw ? strength.hint : ''}</span>
            </div>
            <Input type="password" autoComplete="new-password" placeholder={L('Repeat password', 'Повторите пароль')} value={pw2} onChange={(e) => setPw2(e.target.value)} className="h-12 text-base" />
            <Callout tone="warn">{L('There is no password recovery. If you forget it, the data cannot be decrypted by anyone, including you. Keep encrypted backups.', 'Пароль восстановить нельзя. Если его забыть, данные не сможет расшифровать никто, включая вас. Храните зашифрованные резервные копии.')}</Callout>
            <div className="text-xs text-ink-500">
              <span className="mb-1.5 block font-medium">{L("Optional: restore an encrypted backup (use the backup's password)", 'Необязательно: восстановить зашифрованную копию (введите пароль этой копии)')}</span>
              <label className="flex min-h-[44px] cursor-pointer items-center gap-2 rounded-xl border border-dashed border-ink-300 px-3 text-sm text-ink-600 active:bg-ink-50 dark:border-ink-700 dark:text-ink-300 dark:active:bg-ink-800">
                <input type="file" accept=".json,application/json" onChange={(e) => setRestoreFile(e.target.files?.[0] ?? null)} className="sr-only" />
                <span className="min-w-0 break-all">{restoreFile ? restoreFile.name : L('Choose backup file…', 'Выбрать файл копии…')}</span>
                {restoreFile && <button type="button" onClick={(e) => { e.preventDefault(); setRestoreFile(null); }} className="ml-auto h-9 shrink-0 rounded-lg px-2 text-xs text-ink-500">{L('Clear', 'Убрать')}</button>}
              </label>
            </div>
          </>
        )}
        {err && <p className="text-sm text-rose-600 dark:text-rose-400">{err}</p>}
        <Button type="submit" variant="primary" size="lg" className="w-full" disabled={busy || !pw}>
          {busy ? (isNew ? L('Setting up…', 'Настройка…') : L('Unlocking…', 'Разблокировка…')) : isNew ? L('Set password & open', 'Задать пароль и открыть') : L('Unlock', 'Разблокировать')}
        </Button>
      </form>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-ink-50 to-ink-100 px-4 dark:from-ink-950 dark:to-ink-900">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-between"><span className="w-11" /><Brand /><LangToggle save={false} className="flex h-11 w-11 items-center justify-center rounded-xl text-ink-500 active:bg-ink-200 dark:active:bg-ink-800" /></div>
        <div className="rounded-3xl border border-ink-200 bg-white p-6 shadow-xl shadow-ink-900/5 dark:border-ink-800 dark:bg-ink-900 dark:shadow-none">{children}</div>
        <p className="mt-4 text-center text-[11px] leading-relaxed text-ink-400">AES-256-GCM · PBKDF2-SHA-256 (600k) · {L('data never leaves this browser', 'данные не покидают этот браузер')}</p>
      </div>
    </div>
  );
}
