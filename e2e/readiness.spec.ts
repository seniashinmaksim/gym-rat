/**
 * First-workout readiness (FIX_PLAN D.1 §12) on every WebKit viewport, against a fresh synthetic vault,
 * through the training mode (Part 6). Asserts behaviour, not just screenshots:
 *  Gym A → incline DB press: 3 sets logged AFTER they are done (WEIGHT / REPS → LOG SET → rest ring, one effort
 *  answer each, given on the set screen before LOG SET: GOOD / HARD / MAX; the rest between sets is measured) → overview → Pec deck: new machine with
 *  a setting and a photo → 2 sets → reload (vault locks) + unlock → resumes in training mode, no duplicate or
 *  missing sets → Finish → summary numbers (sets, warm-ups, tonnage, effective sets per muscle, failure sets,
 *  measured rest) → Week screen updated → History lists it and opens the Workout check → new workout at Gym A:
 *  Pec deck machine pre-selected with its setting and last time's sets.
 * English only (the Russian journey is e2e/train.spec.ts). Screenshots: test-artifacts/readiness/<project>/.
 */
import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { createVault, leaveToOverview, logSet, nextSet, pick, startSession, toOverview, unlock, useLang } from './helpers';

const TEST_VAULT_PASSWORD = 'synthetic-e2e-vault-02'; // throwaway local test vault, never real data
const PNG_1x1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const GOOD = 1, HARD = 2, MAX = 3; // MAX = muscular failure ('not one more')

test('first gym session works end to end (training mode)', async ({ page }, info) => {
  test.setTimeout(240_000);
  page.setDefaultTimeout(20_000);
  const out = path.join('test-artifacts', 'readiness', info.project.name);
  fs.mkdirSync(out, { recursive: true });
  const shot = (n: string) => page.screenshot({ path: path.join(out, `${n}.png`) });
  const train = page.getByTestId('train');
  await useLang(page, 'en');
  // A controllable clock (time still flows): the rest between sets is fast-forwarded instead of waited for.
  await page.clock.install();

  // 1) First run, Start workout, create Gym A → training mode opens with the exercise picker
  await createVault(page, TEST_VAULT_PASSWORD);
  await startSession(page, 'en', 'Gym A');

  // 2) Incline DB press, 3 sets logged after they were done; one effort tap each; rest measured
  await pick(page, 'incline dumbbell', /^Incline dumbbell press/);
  await expect(page.getByTestId('exercise-name')).toHaveText(/incline dumbbell press/i);
  await expect(page.getByTestId('set-chip')).toHaveCount(0); // nothing prepared
  await logSet(page, '22.5', '12', GOOD);
  await expect(page.getByTestId('rest-digits')).toHaveText(/^2:[0-3]\d$/); // the rest timer started by itself
  await expect(page.getByTestId('rest-screen')).toContainText('Good'); // the answer is on the logged set
  await page.clock.fastForward(60_000); // ≥ rest + time under load so a rest is measured
  await nextSet(page);
  await logSet(page, '22.5', '10', HARD);
  await page.clock.fastForward(60_000);
  await nextSet(page);
  await logSet(page, '22.5', '9', MAX);
  await shot('01-incline-3-sets-rest');
  // Nothing planned is left: the next-exercise chooser opens; "Overview" closes it.
  await leaveToOverview(page);
  await expect(page.getByTestId('ov-row')).toHaveCount(1);
  await expect(page.getByTestId('ov-row').first()).toHaveAttribute('data-state', 'done');

  // 3) Pec deck: new machine with a setting and a photo at Gym A
  await page.getByTestId('add-exercise').click();
  await pick(page, 'pec deck', /^Pec deck/);
  await expect(train).toHaveAttribute('data-view', 'set');
  await page.getByTestId('machine-line').click();
  await page.locator('[role=dialog]').getByRole('button', { name: /^New$/ }).click();
  const form = page.locator('[role=dialog]').last();
  await form.locator('input').first().fill('Pec deck (Gym A)');
  await form.getByRole('button', { name: /Add setting/ }).click();
  await form.getByPlaceholder('Setting').fill('seat');
  await form.getByPlaceholder('Value').fill('4');
  await form.locator('input[type=file]:not([capture])').setInputFiles({ name: 'machine.png', mimeType: 'image/png', buffer: PNG_1x1 });
  await expect(form.getByAltText('Selected photo 1')).toBeVisible(); // preview
  await shot('02-new-machine-with-photo');
  await form.getByRole('button', { name: /^Save$/ }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByTestId('machine-line')).toContainText('Pec deck (Gym A)');
  await expect(page.getByTestId('machine-line')).toContainText('seat 4');
  await logSet(page, '45', '12', GOOD);
  await page.clock.fastForward(60_000);
  await nextSet(page);
  await logSet(page, '45', '11', HARD);

  // 4) Interrupt: reload (vault locks) → unlock → resumes in training mode; nothing duplicated or missing
  await page.waitForTimeout(600); // let the last write land
  await page.reload(); // the hash route (#/log/…) survives the reload
  await unlock(page, TEST_VAULT_PASSWORD);
  await expect(train).toBeVisible({ timeout: 60_000 });
  await shot('03a-after-unlock');
  await toOverview(page);
  await expect(page.getByTestId('ov-row')).toHaveCount(2);
  await expect(train.getByText(/^5 sets$/)).toBeVisible(); // top bar: 3 + 2 working sets
  // Each exercise holds exactly its own logged sets.
  await page.getByTestId('ov-row').nth(0).getByRole('button').first().click();
  await expect(page.getByTestId('set-chip')).toHaveCount(3);
  await expect(page.getByTestId('set-chips')).toContainText('22.5 × 12');
  await toOverview(page);
  await page.getByTestId('ov-row').nth(1).getByRole('button').first().click();
  await expect(page.getByTestId('set-chip')).toHaveCount(2);
  await shot('03-resumed-after-reload');
  await toOverview(page);

  // 5) Finish → summary
  await page.getByTestId('finish').click();
  const sum = page.locator('[role=dialog]', { hasText: 'Workout saved' });
  await expect(sum).toBeVisible();
  const sumText = (await sum.textContent()) ?? '';
  expect(sumText).toMatch(/Exercises\s*2/i);
  expect(sumText).toMatch(/Sets\s*5/i); // 3 incline + 2 pec deck
  expect(sumText).toMatch(/Warm-ups\s*0/i); // same weight throughout: nothing tagged as a warm-up
  // Independent: 22.5×(12+10+9) + 45×(12+11) = 697.5 + 1035 = 1732.5
  expect(sumText).toMatch(/Tonnage\s*1,73[23](\.5)? kg/i);
  expect(sumText).toMatch(/Avg rest\s*\d+:\d\d/i); // measured from the completion times
  // Every set has an effort answer (GOOD / HARD / MAX → full credit):
  // chest 3×1 + 2×1 = 5 · front delts 3×0.5 + 2×0.25 = 2 · triceps 3×0.5 = 1.5 (pec deck: no triceps)
  expect(sumText).toMatch(/Chest\+5(?![.\d])/);
  expect(sumText).toMatch(/Front delts\+2(?![.\d])/);
  expect(sumText).toMatch(/Triceps\+1\.5/);
  expect(sumText).toMatch(/Failure sets 1/); // the MAX answer
  await shot('04-summary');
  await sum.getByRole('button', { name: 'Done' }).click();
  await expect(train).toHaveCount(0);

  // 6) Weekly numbers updated immediately
  await expect(page.locator('#row-chest')).toBeVisible();
  expect(await page.locator('#row-chest').innerText()).toMatch(/[1-9][\d.]* \/ /);
  await shot('05-week-updated');

  // 7) History lists the workout; the Workout check opens from it
  await page.goto('/#/history');
  await page.locator('main button[aria-expanded="false"]').first().click();
  await expect(page.locator('main')).toContainText('Incline dumbbell press');
  await expect(page.locator('main')).toContainText('Pec deck');
  await page.getByTestId('open-check').first().click();
  await expect(page.getByTestId('workout-check')).toBeVisible();
  await expect(page.getByTestId('check-set')).toHaveCount(5);
  await shot('06-workout-check');

  // 8) Back at Gym A: Pec deck machine pre-selected with its setting and last time's sets
  await page.goto('/#/log');
  await expect(page.locator('main select').first()).toHaveValue(/.+/); // Gym A remembered
  await expect(page.locator('main select').first().locator('option:checked')).toHaveText('Gym A');
  await page.getByRole('button', { name: /Start session/ }).click();
  await expect(train).toBeVisible();
  await pick(page, 'pec deck', /^Pec deck/);
  await expect(page.getByTestId('machine-line')).toContainText('Pec deck (Gym A)');
  await expect(page.getByTestId('machine-line')).toContainText('seat 4');
  await expect(page.getByTestId('last-time')).toContainText('45 × 12 · 11');
  await page.getByTestId('machine-line').click();
  await expect(page.locator('[role=dialog]')).toContainText('Pec deck (Gym A)'); // in this gym's list
  await shot('07-return-to-gym-a');
});
