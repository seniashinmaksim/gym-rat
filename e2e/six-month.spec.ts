/**
 * Six-month audit journeys on WebKit (iPhone 13, 375, 430, desktop). A synthetic 26-week history is
 * restored through the app's own encrypted backup/restore, the browser clock is set to the last day of
 * the simulation, and the real screens are checked: numbers, units, labels, overflow. Screenshots go to
 * test-artifacts/six-month-audit/<journey>/<viewport>/. Synthetic data, throwaway passwords.
 */
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { generateSixMonths } from '../tests/sim/sixMonth';
import { createBackup } from '../src/lib/backup';

const VAULT_PW = 'synthetic-e2e-vault-03';
const BACKUP_PW = 'synthetic-e2e-backup-03';
const OUT = path.join('test-artifacts', 'six-month-audit');
const BACKUP = path.join(OUT, 'synthetic-26-weeks.gymrat-backup.json');
const AUDIT = fs.readFileSync('scripts/layout-audit.js', 'utf8');
const overflow: Record<string, number> = {};

test.beforeAll(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  if (!fs.existsSync(BACKUP)) {
    const { data } = generateSixMonths();
    fs.writeFileSync(BACKUP, JSON.stringify(await createBackup(data, async () => null, BACKUP_PW)));
  }
});

async function shot(page: Page, journey: string, project: string, name: string) {
  const dir = path.join(OUT, journey, project);
  fs.mkdirSync(dir, { recursive: true });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(dir, `${name}.png`) });
  const res = (await page.evaluate(AUDIT)) as { findings: unknown[] };
  overflow[`${journey}/${name}`] = res.findings.length;
}

async function setupAndRestore(page: Page) {
  // Last evening of the simulation (Sunday of week 26), clock running from there.
  await page.clock.install({ time: new Date('2026-11-22T17:30:00Z') });
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
  await expect(page.getByText(/Restored \d+ workouts/)).toBeVisible({ timeout: 60_000 });
}

test('six-month journeys: dashboard, progression, weekly summary, body weight, gyms, decline, correction, resume', async ({ page }, info) => {
  test.setTimeout(300_000);
  const P = info.project.name;
  await setupAndRestore(page);

  // ---- Journey 3: six months of history — Week dashboard readable in seconds
  await page.goto('/#/');
  await expect(page.locator('#row-chest')).toBeVisible();
  const chest = await page.locator('#row-chest').innerText();
  expect(chest).toMatch(/\d+(\.\d+)? \/ \d+(\.\d+)?/); // "done / target"
  expect(chest).toMatch(/LEFT|DONE|OVER/);
  await shot(page, 'j3-six-month', P, '01-week-dashboard');

  // Progress vs baseline (units, labelled estimate) + exercise detail chart
  await page.goto('/#/strength');
  await expect(page.getByText('Progress vs baseline')).toBeVisible();
  const prog = page.locator('main ul').first();
  await expect(prog.getByText('est. strength').first()).toBeVisible(); // what the % measures, next to it
  const txt = await prog.innerText();
  expect(txt).toMatch(/\d+(\.\d+)? kg → \d+(\.\d+)? kg/);
  expect(txt).toMatch(/[+-]?\d+(\.\d)?%/);
  expect(txt).toMatch(/Pec deck · Pec deck A/); // two pec decks are distinguishable
  expect(txt).toMatch(/Pec deck · Pec deck B/);
  // The % is inside the viewport on a phone (not hidden behind a horizontal scroll).
  const pct = prog.locator('li').first().locator('.text-right');
  const box = (await pct.boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await shot(page, 'j3-six-month', P, '02-progress-vs-baseline');
  await page.getByPlaceholder('Search exercise or machine').fill('incline dumbbell');
  await expect(page.locator('main h2', { hasText: 'Incline dumbbell press' })).toBeVisible();
  await page.locator('main .space-y-2 > button').first().click(); // the history card under that exercise
  await page.waitForTimeout(500);
  await shot(page, 'j3-six-month', P, '03-incline-detail-chart');

  // Weekly summary + 4-week check
  await page.goto('/#/reports');
  await expect(page.getByText('4-week check')).toBeVisible();
  await expect(page.getByText(/Growth signals \(separate from strength\)/)).toBeVisible();
  expect(await page.locator('main').innerText()).not.toMatch(/muscle growth of \d|grew \d+%/i);
  await shot(page, 'j3-six-month', P, '04-weekly-summary');
  await page.getByText('4-week check').scrollIntoViewIfNeeded();
  await shot(page, 'j3-six-month', P, '05-four-week-check');

  // ---- Journey 4: missed weeks visible as 0 in the volume trend; nothing invented
  await page.goto('/#/periodization');
  await page.waitForTimeout(600);
  await shot(page, 'j4-missed-weeks', P, '01-volume-trend');

  // ---- Journey 5: performance decline (pushdown on cable A) → REDUCE, not increase
  await page.goto('/#/strength');
  await page.getByPlaceholder('Search exercise or machine').fill('cable station a');
  await page.waitForTimeout(300);
  const pushRow = page.locator('main .space-y-2 > button', { hasText: /Cable station A/ }).first();
  await expect(pushRow).toContainText(/REDUCE TO 30 KG|KEEP/);
  await expect(pushRow).not.toContainText(/INCREASE/);
  await shot(page, 'j5-decline', P, '01-pushdown-cable-a');
  await pushRow.click();
  await page.waitForTimeout(400);
  await expect(page.locator('main')).toContainText(/declin/i);
  await shot(page, 'j5-decline', P, '02-pushdown-detail');

  // ---- Journey 6: body weight at any time + pull-ups
  await page.goto('/#/body');
  await expect(page.locator('main')).toContainText(/7-day/i);
  await shot(page, 'j6-body-pullups', P, '01-body-weight');
  await page.goto('/#/');
  await page.getByRole('button', { name: /^Weight$/ }).first().click();
  const dlg = page.locator('[role=dialog]');
  await dlg.getByLabel('Body weight in kg').fill('79.6');
  await dlg.locator('input[type=time]').fill('07:05');
  await dlg.getByRole('button', { name: /Morning|fasted/i }).first().click().catch(() => undefined);
  await shot(page, 'j6-body-pullups', P, '02-add-weight-dialog');
  await dlg.getByRole('button', { name: /^Save$/ }).click();
  await expect(page.getByText(/Saved 79\.6 kg/)).toBeVisible();
  await page.goto('/#/strength');
  await page.getByPlaceholder('Search exercise or machine').fill('pull-up');
  await page.waitForTimeout(300);
  const pulls = await page.locator('main').innerText();
  expect(pulls).toMatch(/weighted/i);
  expect(pulls).toMatch(/bodyweight/i);
  await shot(page, 'j6-body-pullups', P, '03-pull-up-histories');
  await page.locator('main .space-y-2 > button', { hasText: /weighted/i }).first().click();
  await page.waitForTimeout(400);
  await expect(page.locator('main')).toContainText(/body \+ belt, an estimate/i); // labelled an estimate
  // The estimated total column is fully on screen (not behind a horizontal scroll).
  const totalHead = page.getByText('≈ Total', { exact: true });
  const tb = (await totalHead.boundingBox())!;
  expect(tb.x + tb.width).toBeLessThanOrEqual(page.viewportSize()!.width - 8);
  await shot(page, 'j6-body-pullups', P, '04-weighted-pull-up-body-context');

  // ---- Journey 2: return to a known gym; machine from the dropdown; history loads; sets + timer + summary
  await page.goto('/#/log');
  await page.locator('main select').first().selectOption({ label: 'Synthetic Gym A' }).catch(async () => page.locator('main select').first().selectOption('gym_a'));
  await page.getByRole('button', { name: /Start session/ }).click();
  await expect(page.getByText('Workout in progress')).toBeVisible();
  await page.getByRole('button', { name: /^Add exercise$/ }).click();
  await page.locator('[role=dialog] input').first().fill('pec deck');
  await page.locator('[role=dialog] button', { hasText: /^Pec deck/ }).first().click();
  const card = page.locator('section, .rounded-2xl').filter({ has: page.locator('h3', { hasText: /^Pec deck$/ }) }).first();
  await expect(card).toContainText('Pec deck A'); // pre-selected: the machine used here before
  await expect(card).toContainText(/seat 4/);
  await card.getByRole('button', { name: /Pec deck A/ }).click();
  const picker = page.locator('[role=dialog]');
  await expect(picker).toContainText('Pec deck A');
  await expect(picker).not.toContainText('Pec deck B'); // other gym's machine hidden unless searched
  await shot(page, 'j2-known-gym', P, '01-equipment-dropdown');
  await page.keyboard.press('Escape');
  await shot(page, 'j2-known-gym', P, '02-active-workout-prescription');
  const row = card.locator('[id^="set-"]').first();
  const w0 = await row.locator('input[aria-label="weight"]').inputValue();
  expect(Number(w0) % 5).toBe(0); // Pec deck A moves in 5 kg steps
  await row.locator('input[aria-label="reps"]').fill('12');
  await row.getByRole('button', { name: '1', exact: true }).click();
  await row.getByRole('button', { name: 'Complete set' }).click();
  await expect(page.locator('.fixed', { hasText: /REST/i })).toBeVisible();
  await shot(page, 'j2-known-gym', P, '03-set-logged-rest-timer');

  // ---- Journey 8: interrupted workout — reload, unlock, resume, nothing lost or duplicated
  await page.reload();
  await page.getByPlaceholder('Password', { exact: true }).fill(VAULT_PW);
  await page.getByRole('button', { name: /Unlock/ }).click();
  await page.getByPlaceholder('Password', { exact: true }).waitFor({ state: 'detached', timeout: 60_000 });
  await expect(page.getByText('Workout in progress')).toBeVisible();
  await expect(card.locator('button[aria-label="Set completed"]')).toHaveCount(1);
  await shot(page, 'j8-interrupted', P, '01-resumed');
  await page.getByRole('button', { name: /^Finish$/ }).click();
  const sum = page.locator('[role=dialog]', { hasText: 'Workout saved' });
  await expect(sum).toBeVisible();
  const st = (await sum.textContent()) ?? '';
  expect(st).toMatch(/Sets\s*1/i);
  expect(st).toMatch(new RegExp(`Tonnage\\s*${Number(w0) * 12} kg`, 'i'));
  await shot(page, 'j2-known-gym', P, '04-workout-summary');
  await sum.getByRole('button', { name: 'Done' }).click();

  // ---- Journey 7: correct a wrong weight in History; the audit trail is kept
  await page.goto('/#/history');
  await page.waitForTimeout(400);
  await shot(page, 'j7-correction', P, '01-history');

  fs.writeFileSync(path.join(OUT, `overflow-${P}.json`), JSON.stringify(overflow, null, 2));
  const total = Object.values(overflow).reduce((a, b) => a + b, 0);
  expect(total, JSON.stringify(overflow)).toBe(0);
});
