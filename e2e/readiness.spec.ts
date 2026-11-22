/**
 * First-workout readiness (FIX_PLAN D.1 §12) on WebKit with iPhone 13 emulation, against a fresh
 * synthetic vault. Asserts behaviour, not just screenshots:
 *  Gym A → incline DB press 3 sets (RIR, failure, rest) → Pec Deck new machine with a photo →
 *  more sets → another exercise → reload + unlock (interrupt) → resume, no duplicate/missing sets →
 *  finish summary → weekly numbers updated → new workout at Gym A: Pec Deck pre-selected with its
 *  settings and history.
 */
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

/** Part 5: picking an exercise may first show the exercise-choice card (advice, never blocking) — answer "Continue". */
async function continueChoice(page: import('@playwright/test').Page) {
  await page.waitForTimeout(250);
  const cc = page.getByTestId('choice-card');
  if (await cc.count()) await cc.getByRole('button', { name: 'Continue' }).click();
}

const TEST_VAULT_PASSWORD = 'synthetic-e2e-vault-02'; // throwaway local test vault, never real data
const PNG_1x1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

test.beforeEach(({}, info) => test.skip(info.project.name !== 'iphone-13', 'readiness runs on the iPhone 13 project'));

async function unlock(page: Page) {
  const f = page.getByPlaceholder('Password', { exact: true });
  await f.waitFor({ timeout: 15_000 });
  {
    await f.fill(TEST_VAULT_PASSWORD);
    await page.getByRole('button', { name: /Unlock|Open/ }).first().click();
    await f.waitFor({ state: 'detached', timeout: 60_000 });
  }
}
const card = (page: Page, name: string) => page.locator('section, .rounded-2xl').filter({ has: page.locator('h3', { hasText: new RegExp(`^${name}$`) }) }).first();
async function logSet(page: Page, name: string, i: number, w: string, r: string, rir: string, failure?: string) {
  const row = card(page, name).locator('[id^="set-"]').nth(i);
  await row.locator('input[aria-label="weight"]').fill(w);
  await row.locator('input[aria-label="reps"]').fill(r);
  await row.getByRole('button', { name: rir, exact: true }).click();
  await row.getByRole('button', { name: 'Complete set' }).click();
  if (failure) await card(page, name).locator('[id^="set-"]').nth(i).getByRole('button', { name: failure, exact: true }).click();
}

test('first gym session works end to end', async ({ page }) => {
  test.setTimeout(240_000);
  const out = path.join('test-artifacts', 'readiness');
  fs.mkdirSync(out, { recursive: true });
  const shot = (n: string) => page.screenshot({ path: path.join(out, `${n}.png`) });

  // 1) First run, Start workout, create Gym A
  await page.goto('/');
  await page.getByPlaceholder('Choose a password').fill(TEST_VAULT_PASSWORD);
  await page.getByPlaceholder('Repeat password').fill(TEST_VAULT_PASSWORD);
  await page.getByRole('button', { name: /Set password/ }).click();
  await page.getByPlaceholder('Choose a password').waitFor({ state: 'detached', timeout: 60_000 });
  await page.goto('/#/log');
  await page.getByPlaceholder('e.g. Gym A').fill('Gym A');
  await page.getByRole('button', { name: /Start session/ }).click();
  await expect(page.getByText('Workout in progress')).toBeVisible();

  // 2) Incline DB press with dumbbells, 3 sets with RIR / failure; actual rest recorded
  await page.getByRole('button', { name: /^Add exercise$/ }).click();
  await page.locator('[role=dialog] input').first().fill('incline dumbbell');
  await page.locator('[role=dialog] button', { hasText: /^Incline dumbbell press/ }).first().click();
  await continueChoice(page);
  await logSet(page, 'Incline dumbbell press', 0, '22.5', '12', '2', 'Stopped before');
  await expect(page.locator('.fixed', { hasText: /REST/i })).toBeVisible(); // timer started automatically
  await page.waitForTimeout(40_500); // ≥ rest + time under load so a rest is measured
  await card(page, 'Incline dumbbell press').getByRole('button', { name: /^Set$/ }).click().catch(() => undefined);
  await logSet(page, 'Incline dumbbell press', 1, '22.5', '10', '1');
  await card(page, 'Incline dumbbell press').getByRole('button', { name: /^Set$/ }).click().catch(() => undefined);
  await logSet(page, 'Incline dumbbell press', 2, '22.5', '9', '0', 'Failure');
  const rest = await card(page, 'Incline dumbbell press').locator('[id^="set-"]').nth(1).locator('input[aria-label^="Rest"]').inputValue();
  expect(Number(rest)).toBeGreaterThan(0);
  await shot('01-incline-3-sets');
  await card(page, 'Incline dumbbell press').getByRole('button', { name: /^Next exercise$/ }).click();

  // 3) Pec Deck: new machine with a photo at Gym A
  await page.locator('[role=dialog] input').first().fill('pec deck');
  await page.locator('[role=dialog] button', { hasText: /^Pec deck/ }).first().click();
  await continueChoice(page);
  await card(page, 'Pec deck').getByRole('button', { name: /Which machine/ }).click();
  await page.locator('[role=dialog]').getByRole('button', { name: /^New$/ }).click();
  const form = page.locator('[role=dialog]');
  await form.locator('input').first().fill('Pec deck (Gym A)');
  await form.getByRole('button', { name: /Add setting/ }).click();
  await form.getByPlaceholder('Setting').fill('seat');
  await form.getByPlaceholder('Value').fill('4');
  await form.locator('input[type=file]:not([capture])').setInputFiles({ name: 'machine.png', mimeType: 'image/png', buffer: PNG_1x1 });
  await expect(form.getByAltText('Selected photo 1')).toBeVisible(); // preview
  await shot('02-new-machine-with-photo');
  await form.getByRole('button', { name: /^Save$/ }).click();
  await expect(card(page, 'Pec deck')).toContainText('Pec deck (Gym A)');
  await expect(card(page, 'Pec deck')).toContainText('seat 4');
  await logSet(page, 'Pec deck', 0, '45', '12', '2');
  await card(page, 'Pec deck').getByRole('button', { name: /^Set$/ }).click().catch(() => undefined);
  await logSet(page, 'Pec deck', 1, '45', '11', '1');

  // 4) Interrupt: reload (vault locks) → unlock → resume; nothing duplicated or missing
  await page.reload(); // the hash route (#/log/…) survives the reload; a second goto would reload and lock again
  await unlock(page);
  await page.waitForTimeout(800);
  await shot('03a-after-unlock');
  await expect(page.getByText('Workout in progress')).toBeVisible();
  const done = async (name: string) => card(page, name).locator('button[aria-label="Set completed"]').count();
  // Incline was closed with "Next exercise": its collapsed row lists exactly the 3 logged sets.
  const inclineRow = page.getByRole('button', { name: /1\. Incline dumbbell press/ });
  await expect(inclineRow).toContainText('22.5×12@2 · 22.5×10@1 · 22.5×9@0');
  await expect(inclineRow).toContainText('3 sets');
  await inclineRow.click(); // reopen
  await expect(card(page, 'Incline dumbbell press').locator('button[aria-label="Set completed"]')).toHaveCount(3);
  expect(await done('Pec deck')).toBe(2);
  expect(await page.locator('button[aria-label="Set completed"]').count()).toBe(5); // nothing duplicated or lost
  await shot('03-resumed-after-reload');

  // 5) Finish → summary
  await page.getByRole('button', { name: /^Finish$/ }).click();
  const sum = page.locator('[role=dialog]', { hasText: 'Workout saved' });
  await expect(sum).toBeVisible();
  const sumText = (await sum.textContent()) ?? '';
  expect(sumText).toMatch(/Exercises\s*2/i);
  expect(sumText).toMatch(/Sets\s*5/i); // 3 incline + 2 pec deck
  expect(sumText).toMatch(/Warm-ups\s*0/i);
  // Independent: 22.5×(12+10+9) + 45×(12+11) = 697.5 + 1035 = 1732.5 → "1,733 kg"
  expect(sumText).toMatch(/Tonnage\s*1,733 kg/i);
  // Chest 3×1 + 2×1 = 5 · front delts 3×0.5 + 2×0.25 = 2 · triceps 3×0.5 = 1.5 (pec deck: no triceps)
  expect(sumText).toMatch(/Chest\+5(?!\.)/);
  expect(sumText).toMatch(/Front delts\+2(?!\.)/);
  expect(sumText).toMatch(/Triceps\+1\.5/);
  expect(sumText).toMatch(/Failure sets 1/);
  await shot('04-summary');
  await sum.getByRole('button', { name: 'Done' }).click();

  // 6) Weekly numbers updated immediately
  await expect(page.locator('#row-chest')).toBeVisible();
  const chestDone = await page.locator('#row-chest').innerText();
  expect(chestDone).toMatch(/[1-9][\d.]* \/ /);
  await shot('05-week-updated');

  // 7) Back at Gym A: Pec Deck machine pre-selected with settings and history
  await page.goto('/#/log');
  await expect(page.locator('main select').first()).toHaveValue(/gym/);
  await page.getByRole('button', { name: /Start session/ }).click();
  await page.getByRole('button', { name: /^Add exercise$/ }).click();
  await page.locator('[role=dialog] input').first().fill('pec deck');
  await page.locator('[role=dialog] button', { hasText: /^Pec deck/ }).first().click();
  await continueChoice(page);
  await expect(card(page, 'Pec deck')).toContainText('Pec deck (Gym A)');
  await expect(card(page, 'Pec deck')).toContainText('seat 4');
  await card(page, 'Pec deck').getByRole('button', { name: /^Why$/ }).click().catch(() => undefined);
  await expect(card(page, 'Pec deck')).toContainText(/45×12|45 kg/);
  await card(page, 'Pec deck').getByRole('button', { name: /Pec deck \(Gym A\)/ }).click();
  await expect(page.locator('[role=dialog]')).toContainText('Pec deck (Gym A)'); // in the gym's dropdown
  await shot('06-return-to-gym-a');
});
