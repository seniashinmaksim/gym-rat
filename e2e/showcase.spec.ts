/**
 * Showcase (not an assertion suite): what the app looks like after six months of SYNTHETIC training.
 * Restores the 26-week synthetic history, sets the clock to the Tuesday after, and saves full-page screenshots
 * to test-artifacts/showcase/<project>/. Run: npx playwright test e2e/showcase.spec.ts --project=iphone-13
 */
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { generateSixMonths } from '../tests/sim/sixMonth';
import { createBackup } from '../src/lib/backup';

const VAULT_PW = 'synthetic-e2e-vault-06';
const BACKUP_PW = 'synthetic-e2e-backup-06';
const OUT = path.join('test-artifacts', 'showcase');
const BACKUP = path.join(OUT, 'synthetic-26-weeks.gymrat-backup.json');

test.skip(!process.env.SHOWCASE, 'showcase only on demand (SHOWCASE=1)');

test.beforeAll(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const { data } = generateSixMonths();
  fs.writeFileSync(BACKUP, JSON.stringify(await createBackup(data, async () => null, BACKUP_PW)));
});

async function snap(page: Page, project: string, name: string, full = true) {
  const dir = path.join(OUT, project);
  fs.mkdirSync(dir, { recursive: true });
  await page.mouse.move(0, 0);
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(dir, `${name}.png`), fullPage: full });
}

test('six months later', async ({ page }, info) => {
  test.setTimeout(300_000);
  const P = info.project.name;
  await page.clock.install({ time: new Date('2026-11-24T16:00:00Z') });
  page.on('dialog', (d) => void d.accept());
  await page.goto('/');
  await page.getByPlaceholder('Choose a password').fill(VAULT_PW);
  await page.getByPlaceholder('Repeat password').fill(VAULT_PW);
  await page.getByRole('button', { name: /Set password/ }).click();
  await page.getByPlaceholder('Choose a password').waitFor({ state: 'detached', timeout: 60_000 });
  await page.goto('/#/settings');
  await page.locator('input[type=file][accept*=".json"]').setInputFiles(BACKUP);
  await page.getByPlaceholder('Backup password').nth(1).fill(BACKUP_PW);
  await page.getByRole('button', { name: /^Restore$/ }).click();
  await expect(page.getByText(/Restored \d+ workouts/)).toBeVisible({ timeout: 120_000 });
  await page.waitForTimeout(3500); // let the toast go

  await page.goto('/#/');
  await expect(page.getByRole('heading', { name: 'Your next workout' })).toBeVisible();
  await snap(page, P, '01-week-next-workout');
  await page.locator('#row-chest button').first().click();
  await page.locator('#row-chest').scrollIntoViewIfNeeded();
  await snap(page, P, '02-week-chest-detail', false);

  await page.goto('/#/strength');
  await page.waitForTimeout(800);
  await snap(page, P, '03-strength-progress');
  await page.getByPlaceholder('Search exercise or machine').fill('incline dumbbell');
  await page.locator('main .space-y-2 > button').first().click();
  await page.waitForTimeout(800);
  await snap(page, P, '04-incline-press-history');

  await page.goto('/#/reports');
  await page.waitForTimeout(1000);
  await snap(page, P, '05-reports');

  await page.goto('/#/periodization');
  await page.waitForTimeout(1000);
  await snap(page, P, '06-periodization-volume');

  await page.goto('/#/recovery');
  await page.waitForTimeout(800);
  await snap(page, P, '07-recovery');

  await page.goto('/#/body');
  await page.waitForTimeout(800);
  await snap(page, P, '08-body-weight');

  await page.goto('/#/settings');
  await page.getByText('Planner readiness').scrollIntoViewIfNeeded();
  await snap(page, P, '09-planner-readiness', false);

  // Start the proposed workout → live logger with the plan
  await page.goto('/#/');
  await page.getByRole('button', { name: /^Start$/ }).click();
  await expect(page.getByText('Workout in progress')).toBeVisible();
  await snap(page, P, '10-live-workout-from-plan', false);
  // Date / time fields: values centred in their boxes
  await page.goto('/#/history');
  await page.waitForTimeout(500);
  await page.goto('/#/log');
  await expect(page.getByRole('button', { name: /Start session/ })).toBeVisible();
  await snap(page, P, '11-start-session-date-time', false);
  await page.goto('/#/');
  await page.getByRole('button', { name: /^Weight$/ }).first().click();
  await snap(page, P, '12-add-weight-date-time', false);

});
