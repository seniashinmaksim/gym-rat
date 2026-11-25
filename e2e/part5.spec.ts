/**
 * Part 5 journeys on WebKit (iPhone 13, 375, 430, desktop), now through the training mode (Part 6):
 *  planner card (mode badge, rows "sets × kg × reps", RIR, item open → One set more → Replace) → Start → the
 *  plan arrives as TARGET lines in the training-mode overview (one row per planned item) → real-gym actions in
 *  the overview ⋯ menu: Later (moves to the end, Undo offered), Machine busy (marks the machine, opens the
 *  alternatives sheet with the reason pre-set), Replace (familiar alternative, Undo offered), Up / Down →
 *  order changed in real life: Pec deck done before a not-started incline press → the press is re-assessed
 *  ("Adjusted" note in the overview) → exercise picker: choice dots + the compact choice card (never blocking)
 *  → Settings → Planner readiness.
 * Dropped with the old card logger: planned set rows pre-filled from the prescription and ticking them (✓) —
 * training mode has no prepared rows; a set exists only once it is logged (the target line replaces them).
 * Synthetic 26-week history restored through the app's own encrypted backup; throwaway passwords.
 * English only. Screenshots + layout audit: test-artifacts/part5/<project>/.
 */
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { generateSixMonths } from '../tests/sim/sixMonth';
import { createBackup } from '../src/lib/backup';
import { audit, createVault, logSet, nextSet, ovMenu, pick, restoreBackup, toOverview, undoToast, useLang } from './helpers';

const VAULT_PW = 'synthetic-e2e-vault-05';
const BACKUP_PW = 'synthetic-e2e-backup-05';
const OUT = path.join('test-artifacts', 'part5');
const BACKUP = path.join(OUT, 'synthetic-26-weeks.gymrat-backup.json');
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
  const res = await audit(page);
  overflow[name] = res.findings.length;
  if (res.findings.length) details[name] = res.findings;
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const rowNames = async (page: Page) => (await page.getByTestId('ov-row').locator('span.min-w-0 > span.font-display').allInnerTexts()).map((s) => s.trim().toLowerCase());

test('part 5: planner card → start → overview real-gym actions → re-assessment → choice assistant → readiness', async ({ page }, info) => {
  test.setTimeout(300_000);
  page.setDefaultTimeout(20_000);
  const P = info.project.name;
  const train = page.getByTestId('train');
  await useLang(page, 'en');
  // Tuesday afternoon after the 26 simulated weeks (last session Sunday evening): muscles recovered, nothing logged this week.
  await page.clock.install({ time: new Date('2026-11-24T16:00:00Z') });
  page.on('dialog', (d) => void d.accept());
  await createVault(page, VAULT_PW);
  await restoreBackup(page, BACKUP, BACKUP_PW);

  // ---- 1. Dashboard: YOUR NEXT WORKOUT (adaptive after 26 well-logged weeks)
  await page.goto('/#/');
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

  // Open an item: edit + replace inside the card
  await list.locator('> li').nth(1).locator('button').first().click();
  await page.getByRole('button', { name: 'One set more' }).click();
  await page.getByRole('button', { name: /^Replace$/ }).click();
  await expect(page.getByTestId('replace-options')).toBeVisible();
  await shot(page, P, '02-item-open-replace');
  const opts = page.getByTestId('replace-options').locator('button');
  // Optional: whether a familiar alternative exists depends on the synthetic history; both outcomes are valid.
  details.replacedInCard = (await opts.count()) > 0;
  if (details.replacedInCard) await opts.first().click();

  // ---- 2. Start → training mode; the plan arrives as target lines (no prepared set rows)
  await page.getByRole('button', { name: /^Start$/ }).click();
  await expect(train).toBeVisible();
  await expect(page.getByTestId('set-chip')).toHaveCount(0);
  await toOverview(page);
  await expect(page.getByTestId('ov-row')).toHaveCount(n0);
  await expect(page.getByTestId('ov-row').first()).toContainText(/\d+ \S+ × .*\d/); // "3 sets × 40 kg × 8–12 reps"
  await shot(page, P, '03-overview-from-plan');
  const names0 = await rowNames(page);

  // ---- 3. Later: the first exercise moves to the end, nothing lost, Undo offered
  await (await ovMenu(page, new RegExp(esc(names0[0]), 'i'))).getByRole('button', { name: /^Later/ }).click();
  await expect(page.getByTestId('ov-row')).toHaveCount(n0);
  expect((await rowNames(page)).at(-1)).toBe(names0[0]);
  await expect(page.getByTestId('ov-row').last()).toContainText('later');
  await expect(undoToast(page)).toBeVisible();
  await shot(page, P, '04-later-moved-to-end');

  // ---- 4. Machine busy: on the first exercise that has a machine → alternatives sheet (reason pre-set)
  let busyName: string | null = null;
  for (const n of await rowNames(page)) {
    const menu = await ovMenu(page, new RegExp(esc(n), 'i'));
    const b = menu.getByRole('button', { name: /^Machine busy$/ });
    if (await b.count()) { await b.click(); busyName = n; break; }
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('ov-actions')).toHaveCount(0);
  }
  expect(busyName, 'the synthetic plan has at least one machine exercise').not.toBeNull();
  const sheet = page.getByTestId('replace-sheet');
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'Machine busy' })).toHaveAttribute('aria-pressed', 'true');
  const alts = sheet.locator('button.flex-col');
  details.busyAlternatives = await alts.count();
  if (!(await alts.count())) await expect(sheet).toContainText(/No familiar alternative/);
  await shot(page, P, '05-machine-busy-alternatives');
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  await expect(page.getByTestId('ov-row').filter({ hasText: new RegExp(esc(busyName as string), 'i') }).first()).toContainText('machine busy');

  // ---- 5. Replace a not-started exercise with a familiar alternative (Undo offered)
  const target = (await rowNames(page)).find((n) => n !== busyName) as string;
  await (await ovMenu(page, new RegExp(esc(target), 'i'))).getByRole('button', { name: /^Replace$/ }).click();
  await expect(sheet).toBeVisible();
  const ropts = sheet.locator('button.flex-col');
  details.replaceOptions = await ropts.count();
  if (await ropts.count()) {
    await ropts.first().click();
    await expect(undoToast(page)).toBeVisible();
    expect(await rowNames(page)).not.toContain(target);
  } else {
    // No familiar alternative here: the sheet says so and offers "Do it later instead".
    await expect(sheet).toContainText(/No familiar alternative/);
    await page.keyboard.press('Escape');
  }
  await expect(page.getByTestId('ov-row')).toHaveCount(n0);
  await shot(page, P, '06-replaced');

  // ---- 6. Up / Down
  const before = await rowNames(page);
  const up = await ovMenu(page, new RegExp(esc(before[1]), 'i'));
  await up.getByRole('button', { name: 'Move up' }).click();
  await page.keyboard.press('Escape');
  expect((await rowNames(page)).slice(0, 2)).toEqual([before[1], before[0]]);
  const down = await ovMenu(page, new RegExp(esc(before[1]), 'i'));
  await down.getByRole('button', { name: 'Move down' }).click();
  await page.keyboard.press('Escape');
  expect(await rowNames(page)).toEqual(before);

  // ---- 7. Order changed in real life: Pec deck done BEFORE a not-started incline press → the press is re-assessed
  if (!(await rowNames(page)).includes('incline dumbbell press')) {
    await page.getByTestId('add-exercise').click();
    await pick(page, 'incline dumbbell', /^Incline dumbbell press/);
    await toOverview(page);
  }
  await page.getByTestId('add-exercise').click();
  await pick(page, 'pec deck', /^Pec deck/);
  await expect(train).toHaveAttribute('data-view', 'set');
  for (let i = 0; i < 3; i++) {
    if (i) await nextSet(page);
    await logSet(page, null, '12', 1); // weight pre-filled from last time on this machine
  }
  await toOverview(page);
  const note = page.getByTestId('ov-row').filter({ hasText: /incline dumbbell press/i }).getByTestId('adjusted-note');
  await expect(note).toBeVisible({ timeout: 5000 });
  details.adjustedText = await note.innerText();
  await note.scrollIntoViewIfNeeded();
  await shot(page, P, '07-reassessed-after-order-change');

  // ---- 8. Picker: choice dots + compact card (never blocking)
  await page.getByTestId('add-exercise').click();
  const dlg = page.locator('[role=dialog]');
  await expect(dlg.locator('[role=img]').first()).toBeVisible();
  await shot(page, P, '08-picker-badges');
  await dlg.getByPlaceholder(/Search in English or Russian/).fill('straight bar');
  await dlg.getByRole('button', { name: /Triceps pushdown \(straight bar\)/ }).first().click();
  const choice = page.getByTestId('choice-card');
  await page.waitForTimeout(400);
  // Optional by design: the card appears only when the choice deserves a comment.
  details.choiceCard = (await choice.count()) > 0;
  if (details.choiceCard) {
    await expect(choice.getByRole('button', { name: 'Continue' })).toBeVisible();
    await shot(page, P, '09-choice-card');
    await choice.getByRole('button', { name: 'Continue' }).click();
  }
  await expect(train).toHaveAttribute('data-view', 'set');
  await expect(page.getByTestId('exercise-name')).toHaveText(/triceps pushdown \(straight bar\)/i);

  // ---- 9. Settings → Planner readiness (leave training mode: the workout stays open)
  await page.goto('/#/settings');
  await expect(page.getByText('Planner readiness')).toBeVisible();
  await page.getByText('Planner readiness').scrollIntoViewIfNeeded();
  await expect(page.getByTestId('readiness-areas').locator('li')).toHaveCount(7);
  await shot(page, P, '10-settings-planner');

  fs.writeFileSync(path.join(OUT, `overflow-${P}.json`), JSON.stringify({ overflow, details }, null, 2));
  const total = Object.values(overflow).reduce((a, b) => a + b, 0);
  expect(total, JSON.stringify(details)).toBe(0);
});
