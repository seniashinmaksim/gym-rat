/**
 * Training mode (Part 6): the whole first-workout journey on a fresh synthetic vault, in English and in
 * Russian, on every WebKit viewport. Asserts behaviour and the design rules (docs/DESIGN.md §5):
 * log AFTER the set, weight pre-filled, any weight can be typed, 2:30 rest ring with −15 / +15, one
 * optional effort tap, automatic warm-up tag, edit / remove with Undo, reload + unlock resumes, exactly
 * one primary action per screen, Finish only in the overview and far from the primary action.
 *
 *   TRAIN_LANG=en|ru (default: both)   PHASE=after
 * Screenshots: test-artifacts/train/<phase>/<project>/<lang>/
 */
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const PW = 'synthetic-e2e-train-06'; // throwaway local test vault, never real data
const PHASE = process.env.PHASE ?? 'after';
const LANGS = (process.env.TRAIN_LANG ? [process.env.TRAIN_LANG] : ['en', 'ru']) as ('en' | 'ru')[];

const T = {
  en: { choose: 'Choose a password', repeat: 'Repeat password', setPw: /Set password/, gym: 'e.g. Gym A', start: /Start session/, pw: 'Password', unlock: /Unlock|Open/, cont: 'Continue', undo: 'Undo', incline: 'incline dumbbell', inclineName: /^Incline dumbbell press/, pec: 'pec deck', pecName: /^Pec deck/, saved: /Workout saved/, back: /Back to workout/, doneBtn: /^Done$/ },
  ru: { choose: 'Придумайте пароль', repeat: 'Повторите пароль', setPw: /Установить пароль/, gym: 'например, Зал А', start: /Начать тренировку/, pw: 'Пароль', unlock: /Разблокировать|Открыть/, cont: 'Продолжить', undo: 'Отменить', incline: 'жим гантелей на наклонной', inclineName: /^Жим гантелей на наклонной/, pec: 'пек-дек', pecName: /^Пек-дек/, saved: /Тренировка сохранена/, back: /Назад к тренировке/, doneBtn: /^Готово$/ },
};

async function continueChoice(page: Page, lang: 'en' | 'ru') {
  await page.waitForTimeout(250);
  const cc = page.getByTestId('choice-card');
  if (await cc.count()) await cc.getByRole('button', { name: T[lang].cont }).click();
}
async function pick(page: Page, lang: 'en' | 'ru', query: string, name: RegExp) {
  await page.locator('[role=dialog] input').first().fill(query);
  await page.locator('[role=dialog] li button').filter({ hasText: name }).first().click();
  await continueChoice(page, lang);
}
async function typeNumber(page: Page, testId: string, text: string) {
  await page.getByTestId(testId).first().click();
  const input = page.locator(`input[data-testid="${testId}"]`).first();
  await input.fill(text);
  await input.press('Enter');
}
/** Continue with the same exercise: NEXT SET, or ONE MORE SET once the target is reached. */
const nextSet = async (page: Page) => { await page.waitForTimeout(750); /* the rest screen ignores taps for 0.7 s (double-tap guard) */ await page.locator('[data-testid="next-set"], [data-testid="one-more"]').first().click(); };
const value = async (page: Page, testId: string) => (await page.getByTestId(testId).first().innerText()).trim();

/** docs/DESIGN.md §5: exactly one primary action; nothing that ends or removes within 24 px of it; no overflow. */
async function designRules(page: Page, label: string) {
  const r = await page.evaluate(() => {
    const vis = (el: Element) => { const b = el.getBoundingClientRect(); const st = getComputedStyle(el); return b.width > 0 && b.height > 0 && st.visibility !== 'hidden' && st.display !== 'none' && b.bottom > 0 && b.top < innerHeight; };
    const root = document.querySelector('[data-testid="train"]') as HTMLElement;
    const dialog = document.querySelector('[role="dialog"]');
    const prim = [...root.querySelectorAll('[data-primary="true"]')].filter(vis);
    const p = prim[0]?.getBoundingClientRect();
    const risky = [...root.querySelectorAll('[data-testid="finish"], [data-testid="remove-set"], [data-testid="remove-exercise"], [data-testid="delete-workout"]')].filter(vis);
    const near = p ? risky.filter((el) => { const b = el.getBoundingClientRect(); const dx = Math.max(0, Math.max(p.left - b.right, b.left - p.right)); const dy = Math.max(0, Math.max(p.top - b.bottom, b.top - p.bottom)); return Math.hypot(dx, dy) < 24; }).length : 0;
    const small = [...root.querySelectorAll('button, a')].filter((el) => vis(el) && !el.closest('[role="dialog"]')).map((el) => { const b = el.getBoundingClientRect(); return { t: (el.getAttribute('data-testid') ?? el.textContent ?? '').trim().slice(0, 24), w: Math.round(b.width), h: Math.round(b.height) }; }).filter((x) => x.h < 44 || x.w < 40);
    return { primary: dialog ? 1 : prim.length, primaryH: p ? Math.round(p.height) : 0, near, small, overflow: document.documentElement.scrollWidth - innerWidth, view: root.dataset.view };
  });
  expect(r.primary, `${label}: exactly one primary action (${r.view})`).toBe(1);
  expect(r.primaryH, `${label}: primary ≥ 56 px`).toBeGreaterThanOrEqual(56);
  expect(r.near, `${label}: nothing destructive within 24 px of the primary action`).toBe(0);
  expect(r.small, `${label}: tap targets`).toEqual([]);
  expect(r.overflow, `${label}: no horizontal overflow`).toBeLessThanOrEqual(0);
}

for (const lang of LANGS) {
  test(`training mode journey (${lang})`, async ({ page }, info) => {
    test.setTimeout(300_000);
    page.setDefaultTimeout(20_000);
    const t = T[lang];
    const out = path.join('test-artifacts', 'train', PHASE, info.project.name, lang);
    fs.mkdirSync(out, { recursive: true });
    const shot = (n: string) => page.screenshot({ path: path.join(out, `${n}.png`) });
    await page.addInitScript((l) => { try { if (!localStorage.getItem('gymrat-lang')) localStorage.setItem('gymrat-lang', l); } catch { /* ignore */ } }, lang);

    // ---- fresh vault, start a workout
    await page.goto('/');
    await page.getByPlaceholder(t.choose).fill(PW);
    await page.getByPlaceholder(t.repeat).fill(PW);
    await page.getByRole('button', { name: t.setPw }).click();
    await page.getByPlaceholder(t.choose).waitFor({ state: 'detached', timeout: 60_000 });
    await page.goto('/#/log');
    await page.getByPlaceholder(t.gym).fill('Gym A');
    await page.getByRole('button', { name: t.start }).click();
    const train = page.getByTestId('train');
    await expect(train).toBeVisible();

    // ---- first exercise: nothing is prepared, the clock has not started
    await pick(page, lang, t.incline, t.inclineName);
    await expect(train).toHaveAttribute('data-view', 'set');
    await expect(page.getByTestId('set-chip')).toHaveCount(0);
    await expect(page.getByTestId('workout-clock')).toHaveAttribute('data-running', 'false');
    await expect(page.getByTestId('log-set')).toBeVisible();
    await designRules(page, 'empty set entry');
    await shot('01-set-entry-empty');

    // ---- any weight can be typed (comma), nothing is snapped
    await typeNumber(page, 'weight-value', '12,5');
    expect(await value(page, 'weight-value')).toBe(lang === 'ru' ? '12,5' : '12.5');
    await typeNumber(page, 'reps-value', '10');
    await page.getByTestId('log-set').click();

    // ---- rest: big ring, 2:30, −15 / +15
    await expect(train).toHaveAttribute('data-view', 'rest');
    await expect(page.getByTestId('workout-clock')).toHaveAttribute('data-running', 'true');
    const digits = page.getByTestId('rest-digits');
    await expect(digits).toHaveText(/^2:(2\d|30)$/);
    const ring = await page.getByTestId('rest-ring').boundingBox();
    const vp = page.viewportSize()!;
    expect(ring!.width).toBeGreaterThanOrEqual(Math.min(vp.width * 0.6, vp.height * 0.4));
    expect(Math.abs(ring!.x + ring!.width / 2 - vp.width / 2)).toBeLessThanOrEqual(vp.width > 900 ? vp.width / 2 : 12); // centred on phones
    const fontPx = await digits.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(fontPx).toBeGreaterThanOrEqual(72);
    await page.getByTestId('rest-plus').click();
    await expect(digits).toHaveText(/^2:(3\d|4\d)$/);
    await page.getByTestId('rest-minus').click();
    await page.getByTestId('rest-minus').click();
    await expect(digits).toHaveText(/^2:(0\d|1\d)$/); // 2:15 for this exercise from now on
    await designRules(page, 'rest');
    await shot('02-rest');
    // one optional effort tap; the timer never waits for it
    await page.getByTestId('effort-row').getByRole('button').nth(1).click();
    await expect(page.getByTestId('effort-row').getByRole('button').nth(1)).toHaveAttribute('aria-pressed', 'true');
    await nextSet(page);

    // ---- next set: weight pre-filled from the last set; a heavier set makes the first one a warm-up
    await expect(train).toHaveAttribute('data-view', 'set');
    expect(await value(page, 'weight-value')).toBe(lang === 'ru' ? '12,5' : '12.5');
    await expect(page.getByTestId('rest-pill')).toBeVisible();
    await typeNumber(page, 'weight-value', '22.5');
    await typeNumber(page, 'reps-value', '12');
    await page.getByTestId('log-set').click();
    await expect(digits).toHaveText(/^2:(0\d|1\d)$/); // the −15 stuck
    await nextSet(page);
    await expect(page.getByTestId('set-chip')).toHaveCount(2);
    await expect(page.getByTestId('set-chip').first()).toHaveAttribute('data-type', 'warmup'); // 12.5 × 10 before 22.5 × 12
    await expect(page.getByTestId('set-chip').nth(1)).toHaveAttribute('data-type', 'working');
    expect(await value(page, 'weight-value')).toBe(lang === 'ru' ? '22,5' : '22.5');

    // ---- the stepper follows the chosen step (remembered for the gym's dumbbells)
    await page.getByTestId('step-chip').click();
    await page.getByTestId('step-choices').getByRole('button').nth(4).click(); // 2.5 kg
    await page.getByTestId('weight-minus').first().click(); // −2.5
    expect(await value(page, 'weight-value')).toBe('20');
    await page.getByTestId('weight-plus').first().click(); // +2.5
    expect(await value(page, 'weight-value')).toBe(lang === 'ru' ? '22,5' : '22.5');
    await typeNumber(page, 'reps-value', '10');
    await page.getByTestId('log-set').click();
    await nextSet(page);
    await expect(page.getByTestId('set-chip')).toHaveCount(3);
    await designRules(page, 'set entry with sets');
    await shot('03-set-entry');

    // ---- a double tap on LOG SET does not create a second set
    await typeNumber(page, 'reps-value', '9');
    await page.getByTestId('log-set').dblclick();
    await expect(train).toHaveAttribute('data-view', 'rest'); // the second tap neither logged again nor skipped the rest
    await nextSet(page);
    await expect(page.getByTestId('set-chip')).toHaveCount(4);

    // ---- edit a logged set, remove it, Undo
    await page.getByTestId('set-chip').nth(3).click();
    await page.getByTestId('remove-set').click();
    await expect(page.getByTestId('set-chip')).toHaveCount(3);
    await page.getByTestId('toast').getByRole('button', { name: t.undo }).click();
    await expect(page.getByTestId('set-chip')).toHaveCount(4);

    // ---- reload + unlock: the workout resumes in training mode with every set
    await page.reload();
    await page.getByPlaceholder(t.pw, { exact: true }).fill(PW);
    await page.getByRole('button', { name: t.unlock }).first().click();
    await expect(train).toBeVisible({ timeout: 60_000 });
    if ((await train.getAttribute('data-view')) === 'rest') await nextSet(page);
    if ((await train.getAttribute('data-view')) === 'overview') await page.getByTestId('ov-row').first().getByRole('button').first().click();
    await expect(page.getByTestId('set-chip')).toHaveCount(4);

    // ---- overview: second exercise, Finish only here and far from the primary action
    await page.getByTestId('to-overview').click();
    await expect(train).toHaveAttribute('data-view', 'overview');
    await expect(page.getByTestId('ov-row')).toHaveCount(1);
    await designRules(page, 'overview');
    await shot('04-overview');
    await page.getByTestId('add-exercise').click();
    await pick(page, lang, t.pec, t.pecName);
    await expect(train).toHaveAttribute('data-view', 'set');
    await expect(page.getByTestId('finish')).toHaveCount(0); // never on the set-entry screen
    await typeNumber(page, 'weight-value', '45');
    await typeNumber(page, 'reps-value', '12');
    await page.getByTestId('log-set').click();
    await expect(page.getByTestId('finish')).toHaveCount(0); // never on the rest screen
    await shot('05-rest-second-exercise');

    // ---- landscape keeps the primary action on screen
    if (info.project.name !== 'desktop') {
      const v = page.viewportSize()!;
      await page.setViewportSize({ width: v.height, height: v.width });
      await expect(page.locator('[data-primary="true"]')).toBeInViewport();
      await shot('06-landscape-rest');
      await nextSet(page);
      await expect(page.getByTestId('log-set')).toBeInViewport();
      await shot('07-landscape-set');
      await page.setViewportSize(v);
    } else await nextSet(page);

    // ---- finish → summary → back to workout → finish
    await page.getByTestId('to-overview').click();
    await page.getByTestId('finish').click();
    await expect(page.getByRole('dialog')).toContainText(t.saved);
    await shot('08-summary');
    await page.getByRole('button', { name: t.back }).click();
    await expect(train).toHaveAttribute('data-view', 'overview');
    await expect(page.getByTestId('ov-row')).toHaveCount(2);
    await page.getByTestId('finish').click();
    await page.getByRole('dialog').getByRole('button', { name: t.doneBtn }).click();
    await expect(train).toHaveCount(0);
  });
}
