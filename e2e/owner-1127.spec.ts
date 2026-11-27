/**
 * Owner's session 2026-11-27, in the browser (WebKit): the Week screen's muscle bars and groups; warm-ups offered
 * before the first working set; "undo set" on the rest screen and "back to rest" after Next set; the Free barbell /
 * Smith switch and the bar line; the bench angle asked when an incline exercise is picked.
 * SYNTHETIC data (tests/sim/dataQuality) restored through the app's own encrypted backup; throwaway passwords.
 */
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { createBackup } from '../src/lib/backup';
import { dataQualityHistory, dayAfterLast } from '../tests/sim/dataQuality';
import { createVault, nextSet, pick, restGuard, restoreBackup, toOverview, typeNumber, useLang } from './helpers';

const VAULT_PW = 'synthetic-e2e-vault-11';
const BACKUP_PW = 'synthetic-e2e-backup-11';
const ROOT = path.join('test-artifacts', 'owner-1127');
const BACKUP = path.join(ROOT, 'synthetic-10.gymrat-backup.json');
const DATA = dataQualityHistory({ sessions: 10 });
const NOW = dayAfterLast(DATA, 3);

test.beforeAll(async () => {
  fs.mkdirSync(ROOT, { recursive: true });
  fs.writeFileSync(BACKUP, JSON.stringify(await createBackup(DATA, async () => null, BACKUP_PW)));
});

const shot = (page: Page, name: string) => page.screenshot({ path: path.join(ROOT, `${name}.png`) });

test('owner 2026-11-27: bars, warm-ups, undo, Smith switch, bench angle', async ({ page }) => {
  test.setTimeout(300_000);
  page.setDefaultTimeout(20_000);
  await useLang(page, 'en');
  await page.clock.install({ time: NOW });
  await createVault(page, VAULT_PW);
  await restoreBackup(page, BACKUP, BACKUP_PW);

  // ---- Week screen: one key, grouped rows, bars without the old orange / blue / violet meaning
  await page.goto('/#/');
  await expect(page.getByTestId('volume-legend')).toBeVisible();
  expect(await page.locator('[data-testid^="week-group-"]').count()).toBeGreaterThan(0);
  expect(await page.locator('[data-testid="volume-bar"] .bg-amber-500, [data-testid="volume-bar"] .bg-sky-500, [data-testid="volume-bar"] .bg-violet-500').count()).toBe(0);
  await shot(page, 'week');
  await page.getByTestId('volume-legend').scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(ROOT, 'week-muscles.png') });

  // ---- Back squat: Free barbell by default, 20 kg bar assumed, warm-ups first
  await page.goto('/#/log');
  await page.getByRole('button', { name: /Start session/ }).click();
  const train = page.getByTestId('train');
  await expect(train).toBeVisible();
  await pick(page, 'back squat', /^Back squat/);
  await expect(train).toHaveAttribute('data-view', 'set');
  await expect(page.getByTestId('bar-free')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('bar-line')).toContainText('= bar 20 kg +');
  const warm = page.getByTestId('warmup-line');
  await expect(warm).toContainText(/Warm-up 1 of \d/);
  await shot(page, 'squat-warmup');
  await page.getByTestId('log-set').click();
  await expect(train).toHaveAttribute('data-view', 'set'); // a warm-up stays on the set screen
  await expect(page.locator('[data-testid="set-chip"][data-type="warmup"]')).toHaveCount(1);
  await expect(warm).toContainText(/Warm-up 2 of \d/);
  await page.getByTestId('skip-warmup').click();
  await expect(warm).toHaveCount(0);
  await expect(page.getByTestId('weight-source')).toBeVisible();

  // ---- a working set, then "undo set" on the rest screen: back to the set screen with the set gone
  await typeNumber(page, 'reps-value', '8');
  await page.waitForTimeout(1600); // a real person changes plates: LOG SET within 1.5 s of the last set is a double tap
  await page.getByTestId('log-set').click();
  await expect(train).toHaveAttribute('data-view', 'rest');
  await page.getByTestId('undo-set').click();
  await expect(train).toHaveAttribute('data-view', 'set');
  await expect(page.getByTestId('set-chip')).toHaveCount(1);

  // ---- Next set by mistake: "Back to rest" returns to the timer
  await page.getByTestId('log-set').click();
  await expect(train).toHaveAttribute('data-view', 'rest');
  await nextSet(page);
  await expect(page.getByTestId('rest-pill')).toHaveAttribute('data-ended', 'true');
  await page.getByTestId('rest-pill').click();
  await expect(train).toHaveAttribute('data-view', 'rest');
  await restGuard(page);
  await nextSet(page);

  // ---- Smith machine: the squat becomes the Smith squat, the logged sets stay
  await page.getByTestId('bar-smith').click();
  await expect(page.getByTestId('exercise-name')).toContainText(/Smith machine squat/i);
  await expect(page.getByTestId('bar-smith')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('set-chip')).toHaveCount(2);
  await shot(page, 'smith');

  // ---- Incline press: the angle is asked when it is picked (last time's 30° pre-selected); 45° is shown on the set screen
  await toOverview(page);
  await page.getByRole('button', { name: /Add exercise/ }).first().click();
  await page.locator('[role=dialog] input').first().fill('incline dumbbell');
  await page.locator('[role=dialog] li button').filter({ hasText: /^Incline dumbbell press/ }).first().click();
  const cc = page.getByTestId('choice-card');
  const fw = page.getByTestId('forward-keep');
  const angle = page.getByTestId('angle-choices');
  await expect.poll(async () => (await angle.count()) > 0 || (await cc.count()) > 0 || (await fw.count()) > 0).toBe(true);
  if (await cc.count()) await cc.getByRole('button', { name: 'Continue' }).click();
  else if (await fw.count()) await fw.first().click();
  await expect(angle).toBeVisible();
  await expect(angle.getByRole('button', { name: '30°' })).toHaveAttribute('aria-pressed', 'true');
  await shot(page, 'angle');
  await angle.getByRole('button', { name: '45°' }).click();
  await expect(train).toHaveAttribute('data-view', 'set');
  await expect(page.getByTestId('angle-line')).toContainText('45°');
});
