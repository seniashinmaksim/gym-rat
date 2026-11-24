/**
 * Showcase (not an assertion suite): what the app looks like after six months of SYNTHETIC training, in English
 * and Russian. Restores the 26-week synthetic history, sets the clock to the Tuesday after, and saves screenshots
 * of the main screens and of the training mode (the proposed workout started: set entry, rest, overview, the
 * next-exercise chooser from the exercise menu, summary) to test-artifacts/showcase/<project>/<lang>/.
 *   SHOWCASE=1 [SHOWCASE_LANG=en|ru] npx playwright test e2e/showcase.spec.ts --project=iphone-13
 */
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { generateSixMonths } from '../tests/sim/sixMonth';
import { createBackup } from '../src/lib/backup';
import { createVault, logSet, nextSet, restGuard, restoreBackup, T, toOverview, useLang, type Lang } from './helpers';

const VAULT_PW = 'synthetic-e2e-vault-06';
const BACKUP_PW = 'synthetic-e2e-backup-06';
const OUT = path.join('test-artifacts', 'showcase');
const BACKUP = path.join(OUT, 'synthetic-26-weeks.gymrat-backup.json');
const LANGS = (process.env.SHOWCASE_LANG ? [process.env.SHOWCASE_LANG] : ['en', 'ru']) as Lang[];
const S = {
  en: { search: 'Search exercise or machine', start: /^Start$/, planner: 'Planner readiness' },
  ru: { search: 'Поиск упражнения или тренажёра', start: /^Начать$/, planner: 'Готовность планировщика' },
};

test.skip(!process.env.SHOWCASE, 'showcase only on demand (SHOWCASE=1)');

test.beforeAll(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const { data } = generateSixMonths();
  fs.writeFileSync(BACKUP, JSON.stringify(await createBackup(data, async () => null, BACKUP_PW)));
});

for (const lang of LANGS) {
  test(`six months later (${lang})`, async ({ page }, info) => {
    test.setTimeout(300_000);
    const t = T[lang];
    const s = S[lang];
    const dir = path.join(OUT, info.project.name, lang);
    fs.mkdirSync(dir, { recursive: true });
    const snap = async (name: string, full = true) => {
      await page.mouse.move(0, 0);
      await page.waitForTimeout(700);
      await page.screenshot({ path: path.join(dir, `${name}.png`), fullPage: full });
    };
    await useLang(page, lang);
    await page.clock.install({ time: new Date('2026-11-24T16:00:00Z') });
    page.on('dialog', (d) => void d.accept());
    await createVault(page, VAULT_PW, lang);
    await restoreBackup(page, BACKUP, BACKUP_PW, lang);
    await page.waitForTimeout(3500); // let the toast go

    await page.goto('/#/');
    await expect(page.getByRole('heading', { name: t.nextWorkout })).toBeVisible();
    await snap('01-week-next-workout');
    await page.locator('#row-chest button').first().click();
    await page.locator('#row-chest').scrollIntoViewIfNeeded();
    await snap('02-week-chest-detail', false);

    await page.goto('/#/strength');
    await page.waitForTimeout(800);
    await snap('03-strength-progress');
    await page.getByPlaceholder(s.search).fill('incline dumbbell');
    await page.locator('main .space-y-2 > button').first().click();
    await page.waitForTimeout(800);
    await snap('04-incline-press-history');

    for (const [n, route] of [['05-reports', '/reports'], ['06-periodization-volume', '/periodization'], ['07-recovery', '/recovery'], ['08-body-weight', '/body']]) {
      await page.goto(`/#${route}`);
      await page.waitForTimeout(1000);
      await snap(n);
    }
    await page.goto('/#/settings');
    await page.getByText(s.planner).scrollIntoViewIfNeeded();
    await snap('09-planner-readiness', false);
    await page.getByTestId('training-settings').scrollIntoViewIfNeeded();
    await snap('09b-settings-training-mode', false);

    // History → Workout check of the last session
    await page.goto('/#/history');
    await page.locator('main button[aria-expanded="false"]').first().click();
    await page.getByTestId('open-check').first().click();
    await expect(page.getByTestId('workout-check')).toBeVisible();
    await snap('10-workout-check');

    // Start the proposed workout → training mode
    await page.goto('/#/');
    await page.getByRole('button', { name: s.start }).click();
    const train = page.getByTestId('train');
    await expect(train).toBeVisible();
    if ((await train.getAttribute('data-view')) !== 'set') await page.getByTestId('continue').click();
    await expect(train).toHaveAttribute('data-view', 'set');
    await snap('11-train-set-entry', false);
    await logSet(page, null, '10', 1); // weight pre-filled from the plan
    await snap('12-train-rest', false);
    await nextSet(page);
    await snap('13-train-set-entry-with-set', false);
    await toOverview(page);
    await snap('14-train-overview', false);
    await page.getByTestId('ov-row').first().getByRole('button').first().click();
    await logSet(page, null, '10', 2);
    await restGuard(page);
    await page.getByTestId('exercise-menu').click();
    await page.getByTestId('finish-exercise').click();
    await expect(page.getByTestId('next-chooser')).toBeVisible();
    await snap('15-train-choose-next', false);
    await page.getByTestId('next-overview').click();
    await page.getByTestId('finish').click();
    await expect(page.getByRole('dialog')).toContainText(t.saved);
    await snap('16-train-summary', false);
    await page.getByRole('dialog').getByRole('button', { name: t.doneBtn }).click();
    await page.goto('/#/log');
    await expect(page.getByRole('button', { name: t.start })).toBeVisible();
    await snap('17-start-session-date-time', false);
    await page.goto('/#/');
    await page.getByRole('button', { name: t.weightBtn }).first().click();
    await snap('18-add-weight-date-time', false);
  });
}
