/**
 * Part 5 journeys on WebKit (iPhone 13, 375, 430, desktop): planner card (mode badge, Replace / Edit / Start),
 * live workout with real-gym controls (Later, Machine busy, Replace, re-check after a set), the exercise-choice
 * badge + card in the picker, and Settings → Planner readiness. Synthetic 26-week history restored through the
 * app's own encrypted backup; throwaway passwords. Screenshots: test-artifacts/part5/<project>/.
 */
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { generateSixMonths } from '../tests/sim/sixMonth';
import { createBackup } from '../src/lib/backup';

const VAULT_PW = 'synthetic-e2e-vault-05';
const BACKUP_PW = 'synthetic-e2e-backup-05';
const OUT = path.join('test-artifacts', 'part5');
const BACKUP = path.join(OUT, 'synthetic-26-weeks.gymrat-backup.json');
const AUDIT = fs.readFileSync('scripts/layout-audit.js', 'utf8');
const overflow: Record<string, number> = {};
const details: Record<string, unknown> = {};

test.beforeAll(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const { data } = generateSixMonths();
  fs.writeFileSync(BACKUP, JSON.stringify(await createBackup(data, async () => null, BACKUP_PW)));
});

async function shot(page: Page, project: string, name: string) {
  const dir = path.join(OUT, project);
  fs.mkdirSync(dir, { recursive: true });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(dir, `${name}.png`), fullPage: false });
  const res = (await page.evaluate(AUDIT)) as { findings: unknown[] };
  overflow[name] = res.findings.length;
  if (res.findings.length) details[name] = res.findings;
}

async function setupAndRestore(page: Page) {
  // Tuesday afternoon after the 26 simulated weeks (last session Sunday evening): muscles recovered, nothing logged this week.
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
}

test('part 5: planner card → start → real-gym controls → choice assistant → readiness', async ({ page }, info) => {
  test.setTimeout(300_000);
  const P = info.project.name;
  await setupAndRestore(page);

  // ---- 1. Dashboard: YOUR NEXT WORKOUT (adaptive after 26 well-logged weeks)
  await page.goto('/#/');
  const card = page.locator('section, div').filter({ has: page.getByRole('heading', { name: 'Your next workout' }) }).last();
  await expect(page.getByRole('heading', { name: 'Your next workout' })).toBeVisible();
  await expect(page.getByText('ADAPTIVE', { exact: true })).toBeVisible();
  const list = page.getByTestId('next-workout-list');
  await expect(list.locator('> li')).not.toHaveCount(0);
  const n0 = await list.locator('> li').count();
  expect(n0).toBeGreaterThanOrEqual(3);
  const firstRow = await list.locator('> li').first().innerText();
  expect(firstRow).toMatch(/\d+ × (\d+(\.\d+)? kg|BW|\? kg) × \d+/); // sets × kg × reps
  expect(firstRow).toMatch(/RIR \d–\d/);
  await page.getByRole('heading', { name: 'Your next workout' }).scrollIntoViewIfNeeded();
  await shot(page, P, '01-next-workout-card');

  // Open an item: why + edit + replace
  await list.locator('> li').nth(1).locator('button').first().click();
  await page.getByRole('button', { name: 'One set more' }).click();
  await page.getByRole('button', { name: /^Replace$/ }).click();
  await expect(page.getByTestId('replace-options')).toBeVisible();
  await shot(page, P, '02-item-open-replace');
  const opts = page.getByTestId('replace-options').locator('button');
  const replaced = (await opts.count()) > 0;
  if (replaced) await opts.first().click();
  details.replacedInCard = replaced;

  // Start → live workout with planned sets carrying the prescription
  await page.getByRole('button', { name: /^Start$/ }).click();
  await expect(page.getByText('Workout in progress')).toBeVisible();
  await shot(page, P, '03-live-from-plan');
  const cards = page.locator('main [data-testid="pending-actions"]');
  await expect(cards.first()).toBeVisible();
  const nCards = await cards.count();
  expect(nCards).toBe(n0);
  const firstName = await page.locator('main h3').first().innerText();

  // ---- 2. Later: the first exercise moves to the end, nothing lost
  await cards.first().getByRole('button', { name: /^Later$/ }).click();
  await expect(page.locator('main h3').last()).toHaveText(firstName);
  await expect(page.getByText(/Later — postponed/)).toBeVisible();
  await shot(page, P, '04-later-moved-to-end');

  // ---- 3. Machine busy (on the first card that has a machine) → alternatives with available equipment
  const busyBtn = page.getByRole('button', { name: 'Machine busy' }).first();
  if (await busyBtn.count()) {
    await busyBtn.click();
    await expect(page.getByTestId('replace-sheet')).toBeVisible();
    await expect(page.getByText(/Machine busy: pick an alternative/)).toBeVisible();
    await page.getByText(/Machine busy: pick an alternative/).scrollIntoViewIfNeeded();
    await shot(page, P, '05-machine-busy-alternatives');
    details.busyUsed = true;
  }

  // ---- 4. Do a set on whatever is first now (any order) → remaining exercises are re-checked
  const first = page.locator('main [id^="set-"]').first();
  await first.scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: 'Complete set' }).first().click();
  await page.waitForTimeout(600);
  await shot(page, P, '06-after-first-set');
  details.adjustedNotes = await page.getByTestId('adjusted-note').count();

  // ---- 5. Picker: choice dots + compact card (never blocking)
  await page.getByRole('button', { name: /Add exercise/ }).click();
  const dlg = page.locator('[role=dialog]');
  await expect(dlg.locator('[role=img]').first()).toBeVisible();
  await shot(page, P, '07-picker-badges');
  await dlg.getByPlaceholder(/Search in English or Russian/).fill('straight bar');
  await dlg.getByRole('button', { name: /Triceps pushdown \(straight bar\)/ }).first().click();
  const choice = page.getByTestId('choice-card');
  if (await choice.count()) {
    await expect(choice.getByRole('button', { name: 'Continue' })).toBeVisible();
    await shot(page, P, '08-choice-card');
    await choice.getByRole('button', { name: 'Continue' }).click();
    details.choiceCard = true;
  } else details.choiceCard = false;
  await expect(page.locator('main h3', { hasText: 'Triceps pushdown (straight bar)' }).last()).toBeVisible();

  // ---- 5b. Order changed in real life: Pec deck done BEFORE the planned incline press → the press is re-prescribed
  const incline = page.locator('main [data-testid="pending-actions"]').locator('xpath=ancestor::div[contains(@class,"rounded-2xl")][1]').filter({ has: page.locator('h3', { hasText: 'Incline dumbbell press' }) });
  if (await page.locator('main h3', { hasText: /^Incline dumbbell press$/ }).count()) {
    await page.getByRole('button', { name: /Add exercise/ }).click();
    await page.locator('[role=dialog]').getByPlaceholder(/Search in English or Russian/).fill('pec deck');
    await page.locator('[role=dialog]').getByRole('button', { name: /(^|\s)Pec deck Пек/ }).first().click();
    if (await page.getByTestId('choice-card').count()) await page.getByTestId('choice-card').getByRole('button', { name: 'Continue' }).click();
    const pec = page.locator('main h3', { hasText: /^Pec deck$/ }).last().locator('xpath=ancestor::*[.//button[@aria-label="Complete set"]][1]');
    for (let i = 0; i < 6; i++) {
      const b = pec.getByRole('button', { name: 'Complete set' });
      if (!(await b.count())) break;
      await b.first().click();
      await page.waitForTimeout(400);
    }
    await expect(page.getByTestId('adjusted-note').first()).toBeVisible({ timeout: 5000 });
    await page.getByTestId('adjusted-note').first().scrollIntoViewIfNeeded();
    details.adjustedNotes = await page.getByTestId('adjusted-note').count();
    details.adjustedText = await page.getByTestId('adjusted-note').first().innerText();
    await shot(page, P, '08b-reassessed-after-order-change');
  }
  void incline;

  // ---- 6. Settings → Planner readiness
  await page.goto('/#/settings');
  await expect(page.getByText('Planner readiness')).toBeVisible();
  await page.getByText('Planner readiness').scrollIntoViewIfNeeded();
  await expect(page.getByTestId('readiness-areas').locator('li')).toHaveCount(7);
  await shot(page, P, '09-settings-planner');

  fs.writeFileSync(path.join(OUT, `overflow-${P}.json`), JSON.stringify({ overflow, details }, null, 2));
  const total = Object.values(overflow).reduce((a, b) => a + b, 0);
  expect(total, JSON.stringify(details)).toBe(0);
});
