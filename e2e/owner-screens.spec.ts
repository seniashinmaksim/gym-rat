/**
 * Dev-only screenshot set for the owner's review (Part 6, F.11 step 7): the Week screen and the training mode,
 * in English and Russian, on the iPhone 13 project only. A synthetic 26-week history is restored from an
 * encrypted backup on the lock screen (synthetic data, throwaway password); the browser clock is the last
 * evening of the simulation. Screenshots: test-artifacts/owner-screens/<lang>/.
 *
 *   npx playwright test e2e/owner-screens.spec.ts --project=iphone-13
 */
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { createBackup } from '../src/lib/backup';
import { generateSixMonths } from '../tests/sim/sixMonth';

const PW = 'synthetic-e2e-screens-07';
const OUT = path.join('test-artifacts', 'owner-screens');
const BACKUP = path.join(OUT, 'synthetic-26-weeks.gymrat-backup.json');

const T = {
  en: { choose: 'Choose a password', repeat: 'Repeat password', setPw: /Set password/, start: /Start session/, cont: 'Continue', pec: 'pec deck', pecName: /^Pec deck/ },
  ru: { choose: 'Придумайте пароль', repeat: 'Повторите пароль', setPw: /Задать пароль/, start: /Начать тренировку/, cont: 'Продолжить', pec: 'пек-дек', pecName: /^Пек-дек/ },
};

test.beforeAll(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  if (!fs.existsSync(BACKUP)) {
    const { data } = generateSixMonths();
    fs.writeFileSync(BACKUP, JSON.stringify(await createBackup(data, async () => null, PW)));
  }
});

async function typeNumber(page: Page, testId: string, text: string) {
  await page.getByTestId(testId).first().click();
  const input = page.locator(`input[data-testid="${testId}"]`).first();
  await input.fill(text);
  await input.press('Enter');
}

for (const lang of ['en', 'ru'] as const) {
  test(`owner screens (${lang})`, async ({ page }, info) => {
    test.skip(info.project.name !== 'iphone-13', 'iPhone 13 only');
    test.setTimeout(240_000);
    const t = T[lang];
    const dir = path.join(OUT, lang);
    fs.mkdirSync(dir, { recursive: true });
    const shot = async (name: string, fullPage = false) => { await page.waitForTimeout(350); await page.screenshot({ path: path.join(dir, `${name}.png`), fullPage }); };

    await page.clock.install({ time: new Date('2026-11-22T17:30:00Z') });
    await page.addInitScript((l) => { try { localStorage.setItem('gymrat-lang', l); } catch { /* ignore */ } }, lang);
    await page.goto('/');
    await page.getByPlaceholder(t.choose).fill(PW);
    await page.getByPlaceholder(t.repeat).fill(PW);
    await page.locator('input[type=file]').setInputFiles(BACKUP);
    await page.getByRole('button', { name: t.setPw }).click();
    await page.getByPlaceholder(t.choose).waitFor({ state: 'detached', timeout: 90_000 });

    // ---- Week
    await page.goto('/#/');
    await expect(page.locator('#row-chest')).toBeVisible({ timeout: 30_000 });
    await shot('01-week');
    await page.getByTestId('week-head').scrollIntoViewIfNeeded();
    await shot('02-week-table');
    await shot('03-week-full', true);

    // ---- training mode
    await page.goto('/#/log');
    await page.getByRole('button', { name: t.start }).click();
    const train = page.getByTestId('train');
    await expect(train).toBeVisible();
    await page.locator('[role=dialog] input').first().fill(t.pec);
    await page.locator('[role=dialog] li button').filter({ hasText: t.pecName }).first().click();
    await page.waitForTimeout(300);
    const cc = page.getByTestId('choice-card');
    if (await cc.count()) await cc.getByRole('button', { name: t.cont }).click(); // optional advice card
    await expect(train).toHaveAttribute('data-view', 'set');
    await shot('04-train-set-entry');
    await typeNumber(page, 'reps-value', '12');
    await page.getByTestId('effort-entry').getByRole('button').nth(1).click();
    await shot('04b-train-set-entry-answered');
    await page.getByTestId('log-set').click();
    await expect(train).toHaveAttribute('data-view', 'rest');
    await shot('05-train-rest');
    await page.waitForTimeout(750);
    await page.locator('[data-testid="next-set"], [data-testid="one-more"]').first().click();
    await typeNumber(page, 'reps-value', '11');
    await page.getByTestId('log-set').click();
    await page.waitForTimeout(750);
    await page.locator('[data-testid="next-set"], [data-testid="one-more"]').first().click();
    await shot('06-train-set-entry-with-sets');
    await page.getByTestId('to-overview').click();
    await shot('07-train-overview');
    await page.getByTestId('continue').click();
    await page.getByTestId('exercise-menu').click();
    await page.getByTestId('finish-exercise').click();
    await expect(page.getByTestId('next-chooser')).toBeVisible();
    await shot('08-choose-next');
  });
}
