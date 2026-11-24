/**
 * Shared helpers for the WebKit e2e specs (not a spec itself). Throwaway synthetic vaults and passwords only.
 * Language: tests pick EN / RU with an init script (localStorage `gymrat-lang`), as e2e/train.spec.ts does.
 */
import { expect, type Locator, type Page } from '@playwright/test';
import fs from 'node:fs';

export type Lang = 'en' | 'ru';

/** EN / RU texts the specs navigate by (kept in one place; the app's own wording). */
export const T = {
  en: {
    choose: 'Choose a password', repeat: 'Repeat password', setPw: /Set password/, pw: 'Password', unlock: /Unlock|Open/,
    gym: 'e.g. Gym A', start: /Start session/, cont: 'Continue', undo: 'Undo', saved: /Workout saved/, back: /Back to workout/, doneBtn: /^Done$/,
    backupPw: 'Backup password', restore: /^Restore$/, restored: /Restored \d+ workouts/, validate: /Validate/, saveAll: /Save all|Save valid/,
    weightBtn: /^Weight$/, bodyLog: 'Log', search: /Search in English or Russian/, newBtn: /^New$/, cancel: /^Cancel$/, save: /^Save$/,
    checkNumbers: /Check the numbers/, nextWorkout: 'Your next workout', trainingCard: /Training mode/,
  },
  ru: {
    choose: 'Придумайте пароль', repeat: 'Повторите пароль', setPw: /Задать пароль/, pw: 'Пароль', unlock: /Разблокировать/,
    gym: 'напр. Зал А', start: /Начать тренировку/, cont: 'Продолжить', undo: 'Отменить', saved: /Тренировка сохранена/, back: /Вернуться к тренировке/, doneBtn: /^Готово$/,
    backupPw: 'Пароль копии', restore: /^Восстановить$/, restored: /Восстановлено: \d+/, validate: /Проверить и просмотреть/, saveAll: /Сохранить/,
    weightBtn: /^Вес$/, bodyLog: 'Журнал', search: /Поиск на русском/, newBtn: /^Новый$/, cancel: /^Отмена$/, save: /^Сохранить$/,
    checkNumbers: /Проверить расчёты/, nextWorkout: 'Следующая тренировка', trainingCard: /Режим тренировки/,
  },
} as const;

/** Every page of this test starts in `lang` (unless the test toggles it later). */
export async function useLang(page: Page, lang: Lang) {
  await page.addInitScript((l) => { try { if (!localStorage.getItem('gymrat-lang')) localStorage.setItem('gymrat-lang', l); } catch { /* ignore */ } }, lang);
}

/** Fresh vault on the first-run screen. */
export async function createVault(page: Page, pw: string, lang: Lang = 'en') {
  const t = T[lang];
  await page.goto('/');
  await page.getByPlaceholder(t.choose).fill(pw);
  await page.getByPlaceholder(t.repeat).fill(pw);
  await page.getByRole('button', { name: t.setPw }).click();
  await page.getByPlaceholder(t.choose).waitFor({ state: 'detached', timeout: 60_000 });
}

export async function unlock(page: Page, pw: string, lang: Lang = 'en') {
  const f = page.getByPlaceholder(T[lang].pw, { exact: true });
  await f.waitFor({ timeout: 20_000 });
  await f.fill(pw);
  await page.getByRole('button', { name: T[lang].unlock }).first().click();
  await f.waitFor({ state: 'detached', timeout: 60_000 });
}

/** Restore a synthetic backup file through Settings (the app's own encrypted restore). */
export async function restoreBackup(page: Page, file: string, pw: string, lang: Lang = 'en') {
  const t = T[lang];
  await page.goto('/#/settings');
  await page.locator('input[type=file][accept*=".json"]').setInputFiles(file);
  await page.getByPlaceholder(t.backupPw).nth(1).fill(pw);
  if (!page.listenerCount('dialog')) page.once('dialog', (d) => void d.accept()); // "replace all data?"
  await page.getByRole('button', { name: t.restore }).click();
  await expect(page.getByText(t.restored)).toBeVisible({ timeout: 120_000 });
}

/** Part 5: picking an exercise may first show the exercise-choice card (advice, never blocking) — answer "Continue". */
export async function continueChoice(page: Page, lang: Lang = 'en') {
  const cc = page.getByTestId('choice-card');
  // Optional by design: the card shows only when the choice deserves a comment. Wait until either it is up or
  // the picker has closed, so a slow render is not mistaken for "no card".
  await expect.poll(async () => (await cc.count()) > 0 || (await page.locator('[role=dialog]').count()) === 0, { timeout: 10_000 }).toBe(true);
  if (await cc.count()) await cc.getByRole('button', { name: T[lang].cont }).click();
  await expect(page.locator('[role=dialog]')).toHaveCount(0);
}

/** In the open exercise picker: search and pick the first row whose name matches. */
export async function pick(page: Page, query: string, name: RegExp, lang: Lang = 'en') {
  await page.locator('[role=dialog] input').first().fill(query);
  await page.locator('[role=dialog] li button').filter({ hasText: name }).first().click();
  await continueChoice(page, lang);
}

/** Start a session from /#/log (gym typed if the start screen asks for a new one). */
export async function startSession(page: Page, lang: Lang = 'en', gym?: string) {
  await page.goto('/#/log');
  if (gym) await page.getByPlaceholder(T[lang].gym).fill(gym);
  await page.getByRole('button', { name: T[lang].start }).click();
  await expect(page.getByTestId('train')).toBeVisible();
}

/** Tap the big number and type a value (comma or dot). `page` may be a sheet locator. */
export async function typeNumber(page: Page | Locator, testId: string, text: string) {
  await page.getByTestId(testId).first().click();
  const input = page.locator(`input[data-testid="${testId}"]`).first();
  await input.fill(text);
  await input.press('Enter');
}

/** The rest screen ignores taps for 0.7 s (double-tap guard). */
export const restGuard = (page: Page) => page.waitForTimeout(750);

/** Continue with the same exercise: NEXT SET, or ONE MORE SET once the target is reached. */
export async function nextSet(page: Page) {
  await restGuard(page);
  await page.locator('[data-testid="next-set"], [data-testid="one-more"]').first().click();
  await expect(page.getByTestId('train')).toHaveAttribute('data-view', 'set');
}

/**
 * Log one set in training mode: WEIGHT / REPS, the optional effort answer (`effort` = index in
 * EASY / GOOD / HARD / MAX, answered on the set screen before LOG SET), LOG SET. Leaves the app on the rest screen.
 */
export async function logSet(page: Page, weight: string | null, reps: string, effort?: 0 | 1 | 2 | 3) {
  await expect(page.getByTestId('train')).toHaveAttribute('data-view', 'set');
  if (weight != null) await typeNumber(page, 'weight-value', weight);
  await typeNumber(page, 'reps-value', reps);
  if (effort != null) {
    const b = page.getByTestId('effort-entry').getByRole('button').nth(effort);
    await b.click();
    await expect(b).toHaveAttribute('aria-pressed', 'true');
  }
  await page.getByTestId('log-set').click();
  await expect(page.getByTestId('train')).toHaveAttribute('data-view', 'rest');
}

/**
 * Leave the current exercise from the rest screen and land in the overview: NEXT EXERCISE / "Enough" open the
 * next-exercise chooser when nothing planned is left (then "Overview"); with another planned exercise open, the
 * primary NEXT EXERCISE goes straight to it (then the top bar's back button).
 */
export async function leaveToOverview(page: Page) {
  await restGuard(page);
  await page.locator('[data-testid="next-exercise"], [data-testid="stop-early"]').first().click();
  const chooser = page.getByTestId('next-chooser');
  await expect.poll(async () => (await chooser.count()) > 0 || (await page.getByTestId('train').getAttribute('data-view')) === 'set').toBe(true);
  if (await chooser.count()) await page.getByTestId('next-overview').click();
  await toOverview(page);
}

/** From set entry / rest: open the overview with the top bar's ← button. */
export async function toOverview(page: Page) {
  const train = page.getByTestId('train');
  if ((await train.getAttribute('data-view')) !== 'overview') await page.getByTestId('to-overview').click();
  await expect(train).toHaveAttribute('data-view', 'overview');
}

/** Overview row of an exercise (by visible name). */
export const ovRow = (page: Page, name: RegExp | string) => page.getByTestId('ov-row').filter({ hasText: name });

/** Open the ⋯ menu of an overview row. */
export async function ovMenu(page: Page, name: RegExp | string) {
  await ovRow(page, name).first().getByTestId('ov-menu').click();
  await expect(page.getByTestId('ov-actions')).toBeVisible();
  return page.getByTestId('ov-actions');
}

export const undoToast = (page: Page, lang: Lang = 'en') => page.getByTestId('toast').getByRole('button', { name: T[lang].undo });

export const AUDIT = fs.readFileSync('scripts/layout-audit.js', 'utf8');
export type Finding = { el: string; box: string; dx: number; why: string };
export const audit = async (page: Page) => (await page.evaluate(AUDIT)) as { findings: Finding[] };
