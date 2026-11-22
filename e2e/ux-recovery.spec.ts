/**
 * UX audit (2026-11-22): mistakes and recovery during a live workout, on 4 WebKit viewports.
 * Wrong weight → fix · tick wrong set → untick · delete set → undo · remove exercise → undo · wrong exercise →
 * change (sets kept) · skip / later → undo · leave mid-entry → come back · reload → resume · vault lock mid-entry ·
 * back gesture inside a sheet · finish → back to workout · weigh-in edit / delete → undo · history delete → undo ·
 * tap targets ≥ 44 px · current set marked · rest timer never covers a focused field · landscape.
 * SYNTHETIC data (tests/sim/dataQuality) restored through the app's own encrypted backup; throwaway passwords.
 *   PHASE=before|after npx playwright test e2e/ux-recovery.spec.ts   → test-artifacts/ux/<phase>/<project>/
 * Assertions are soft: one run lists every gap.
 */
import { expect, test, type Locator, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { createBackup } from '../src/lib/backup';
import { dataQualityHistory, dayAfterLast } from '../tests/sim/dataQuality';

const VAULT_PW = 'synthetic-e2e-vault-07';
const BACKUP_PW = 'synthetic-e2e-backup-07';
const PHASE = process.env.PHASE ?? 'after';
const ROOT = path.join('test-artifacts', 'ux');
const BACKUP = path.join(ROOT, 'synthetic-10.gymrat-backup.json');
const AUDIT = fs.readFileSync('scripts/layout-audit.js', 'utf8');
const DATA = dataQualityHistory({ sessions: 10 });
const NOW = dayAfterLast(DATA, 3);
const metrics: Record<string, unknown> = {};
test.use({ actionTimeout: 15_000 });

test.beforeAll(async () => {
  fs.mkdirSync(ROOT, { recursive: true });
  fs.writeFileSync(BACKUP, JSON.stringify(await createBackup(DATA, async () => null, BACKUP_PW)));
});

async function shot(page: Page, project: string, name: string, full = false) {
  const dir = path.join(ROOT, PHASE, project);
  fs.mkdirSync(dir, { recursive: true });
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(dir, `${name}.png`), fullPage: full });
}

async function unlock(page: Page) {
  await page.getByPlaceholder(/password/i).first().fill(VAULT_PW);
  await page.getByRole('button', { name: /Unlock/ }).click();
  await page.getByRole('button', { name: /Unlock/ }).waitFor({ state: 'detached', timeout: 60_000 });
}

async function setup(page: Page) {
  await page.clock.install({ time: NOW });
  await page.goto('/');
  await page.getByPlaceholder('Choose a password').fill(VAULT_PW);
  await page.getByPlaceholder('Repeat password').fill(VAULT_PW);
  await page.getByRole('button', { name: /Set password/ }).click();
  await page.getByPlaceholder('Choose a password').waitFor({ state: 'detached', timeout: 60_000 });
  await page.goto('/#/settings');
  await page.locator('input[type=file][accept*=".json"]').setInputFiles(BACKUP);
  await page.getByPlaceholder('Backup password').nth(1).fill(BACKUP_PW);
  page.once('dialog', (d) => void d.accept()); // "replace all data?" — the only dialog this journey accepts
  await page.getByRole('button', { name: /^Restore$/ }).click();
  await expect(page.getByText(/Restored \d+ workouts/)).toBeVisible({ timeout: 120_000 });
}

async function addExercise(page: Page, query: string, name: string) {
  await page.getByRole('button', { name: 'Add exercise' }).last().click();
  await page.getByPlaceholder(/Search in English or Russian/).fill(query);
  await page.getByRole('dialog').locator('li button').filter({ has: page.getByText(name, { exact: true }) }).first().click();
  await page.waitForTimeout(250);
  const cc = page.getByTestId('choice-card');
  if (await cc.count()) await cc.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
}

const card = (page: Page, name: string): Locator => page.locator('section').filter({ has: page.getByRole('heading', { name, exact: true, level: 3 }) });
const rows = (c: Locator) => c.locator('[id^="set-"]');
const undoToast = (page: Page) => page.getByTestId('toast').getByRole('button', { name: 'Undo' });

test('mistakes and recovery during a live workout', async ({ page }, info) => {
  test.setTimeout(420_000);
  const P = info.project.name;
  const mobile = P !== 'desktop';
  const dialogs: string[] = [];
  await setup(page);
  page.on('dialog', (d) => { dialogs.push(d.message()); void d.accept(); });

  // ---- Start a session, add pec deck (planned sets from the prescription)
  await page.goto('/#/log');
  await page.getByRole('button', { name: /Start session/ }).click();
  await expect(page.getByRole('heading', { name: 'Workout in progress' })).toBeVisible();
  await addExercise(page, 'pec deck', 'Pec deck');
  const pec = card(page, 'Pec deck');
  const n0 = await rows(pec).count();
  expect(n0).toBeGreaterThanOrEqual(2);

  // ---- Tap targets in the live card (set rows, real-gym controls, card footer)
  const small = await pec.evaluate((el) => {
    const out: { label: string; w: number; h: number }[] = [];
    const primary = ['Next exercise', 'Done', 'Skip', 'Later', 'Replace', 'Machine busy', 'Change exercise', 'Remove exercise', 'Move exercise up', 'Move exercise down'];
    const all = [
      ...Array.from(el.querySelectorAll('[id^="set-"] button, [id^="set-"] input')),
      ...Array.from(el.querySelectorAll('button')).filter((b) => primary.includes((b.getAttribute('aria-label') || (b as HTMLElement).innerText).trim())),
    ];
    for (const b of Array.from(new Set(all))) {
      const r = b.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const label = (b.getAttribute('aria-label') || (b as HTMLElement).innerText || (b as HTMLInputElement).placeholder || b.tagName).trim().slice(0, 30);
      out.push({ label, w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 });
    }
    return out;
  });
  // 375 px: the set row cannot fit six 44 px RIR chips + ✓ or 44 px stepper buttons with a readable value —
  // documented exception (≥ 40 px there); 390 px (iPhone 13), 430 px and desktop must reach 44.
  const MIN = P === 'mobile-375' ? 40 : 44;
  const tooSmall = small.filter((x) => x.w < MIN - 0.5 || x.h < MIN - 0.5);
  metrics[`${P}:tapTargets`] = { total: small.length, tooSmall };
  fs.writeFileSync(path.join(ROOT, `metrics-${PHASE}-${P}.json`), JSON.stringify(metrics, null, 2));
  if (mobile) expect.soft(tooSmall, 'live card: every control ≥ 44 × 44 px').toEqual([]);
  await shot(page, P, '01-live-card');

  // ---- The set to do next is marked
  await expect.soft(rows(pec).first(), 'current set is marked').toHaveAttribute('data-current', 'true');

  // ---- Wrong weight → fix
  const w1 = rows(pec).first().getByLabel('weight', { exact: true });
  await w1.fill('450');
  await rows(pec).first().getByRole('button', { name: 'Complete set' }).click();
  await expect(rows(pec).first().getByRole('button', { name: 'Set completed' })).toBeVisible();
  await w1.fill('45');
  await expect(w1).toHaveValue('45');

  // ---- Tick the wrong set → untick
  await rows(pec).nth(1).getByRole('button', { name: 'Complete set' }).click();
  await page.waitForTimeout(1700); // past the double-tap guard
  await rows(pec).nth(1).getByRole('button', { name: 'Set completed' }).click();
  await expect.soft(rows(pec).nth(1).getByRole('button', { name: 'Complete set' }), 'unticked').toBeVisible();

  // ---- Delete a set → undo
  const before = await rows(pec).count();
  await rows(pec).last().getByRole('button', { name: 'Remove' }).click();
  await expect(rows(pec)).toHaveCount(before - 1);
  await shot(page, P, '02-set-removed');
  await expect.soft(undoToast(page), 'Undo after removing a set').toBeVisible();
  if (await undoToast(page).count()) {
    await undoToast(page).click();
    await expect.soft(rows(pec), 'set back after Undo').toHaveCount(before);
  }

  // ---- Wrong exercise → change it (performed sets kept)
  await addExercise(page, 'lateral raise', 'Dumbbell lateral raise');
  const lat = card(page, 'Dumbbell lateral raise');
  await rows(lat).first().getByRole('button', { name: 'Complete set' }).click();
  const change = lat.getByRole('button', { name: 'Change exercise' });
  await expect.soft(change, 'a card can change its exercise').toBeVisible();
  if (await change.count()) {
    await change.click();
    await page.getByPlaceholder(/Search in English or Russian/).fill('cable lateral');
    await page.getByRole('dialog').locator('li button').filter({ has: page.getByText('Cable lateral raise', { exact: true }) }).first().click();
    const cab = card(page, 'Cable lateral raise');
    await expect.soft(cab, 'changed exercise shown').toBeVisible();
    await expect.soft(cab.getByRole('button', { name: 'Set completed' }), 'its performed set kept').toHaveCount(1);
    await shot(page, P, '03-exercise-changed');
  }

  // ---- Remove an exercise → undo (no blocking dialog)
  const exName = (await card(page, 'Cable lateral raise').count()) ? 'Cable lateral raise' : 'Dumbbell lateral raise';
  const nDialogs = dialogs.length;
  await card(page, exName).getByRole('button', { name: 'Remove exercise' }).click();
  await expect.soft(page.getByRole('heading', { name: exName, exact: true }), 'exercise removed').toHaveCount(0);
  expect.soft(dialogs.length, 'remove exercise: no blocking confirm dialog').toBe(nDialogs);
  await expect.soft(undoToast(page), 'Undo after removing an exercise').toBeVisible();
  if (await undoToast(page).count()) {
    await undoToast(page).click();
    await expect.soft(card(page, exName).getByRole('button', { name: 'Set completed' }), 'exercise and its set back').toHaveCount(1);
  }

  // ---- Skip / Later on a not-started exercise → undo
  await addExercise(page, 'leg curl', 'Seated leg curl');
  const legc = card(page, 'Seated leg curl');
  await legc.getByRole('button', { name: 'Skip', exact: true }).click();
  await expect.soft(undoToast(page), 'Undo after Skip').toBeVisible();
  if (await undoToast(page).count()) {
    await undoToast(page).click();
    await expect.soft(card(page, 'Seated leg curl').getByRole('button', { name: 'Skip', exact: true }), 'skip undone (card open again)').toBeVisible();
  } else {
    await shot(page, P, '03b-skipped-no-undo');
    await page.getByRole('button', { name: /Seated leg curl/ }).click(); // old way back: reopen the collapsed card
  }
  const later = card(page, 'Seated leg curl').getByRole('button', { name: 'Later', exact: true });
  await expect.soft(later, 'Later offered again after undoing Skip').toBeVisible();
  if (await later.count()) {
    await later.click();
    await expect.soft(undoToast(page), 'Undo after Later').toBeVisible();
    if (await undoToast(page).count()) await undoToast(page).click();
    await expect.soft(card(page, 'Seated leg curl').getByText(/Later — postponed/), 'Later undone').toHaveCount(0);
  }

  // ---- Back gesture inside a sheet: closes the sheet, stays in the workout
  const url = page.url();
  await page.getByRole('button', { name: 'Add exercise' }).last().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.goBack();
  await page.waitForTimeout(400);
  await shot(page, P, '03c-after-back-gesture');
  await expect.soft(page.getByRole('dialog'), 'back closes the sheet').toHaveCount(0);
  expect.soft(page.url(), 'back stays in the workout').toBe(url);
  await expect.soft(page.getByRole('heading', { name: 'Workout in progress' })).toBeVisible();
  if (page.url() !== url) await page.goto(url);

  // ---- Leave mid-entry → come back (typed value kept)
  await rows(pec).nth(1).getByLabel('reps', { exact: true }).fill('13');
  await page.goto('/#/history');
  await page.goto(url);
  await expect.soft(card(page, 'Pec deck').locator('[id^="set-"]').nth(1).getByLabel('reps', { exact: true }), 'typed reps survive leaving').toHaveValue('13');

  // ---- Vault lock right after typing → unlock → value kept
  await rows(card(page, 'Pec deck')).nth(1).getByLabel('reps', { exact: true }).fill('14');
  await page.getByRole('button', { name: /Lock now/ }).first().click();
  await unlock(page);
  if (page.url() !== url) await page.goto(url); // the same URL again would be a full reload (= locked again)
  await expect.soft(rows(card(page, 'Pec deck')).nth(1).getByLabel('reps', { exact: true }), 'typed reps survive Lock now').toHaveValue('14');

  // ---- Reload → resume from the + button
  await rows(card(page, 'Pec deck')).nth(1).getByLabel('reps', { exact: true }).fill('12');
  await page.waitForTimeout(600);
  await page.reload();
  await unlock(page);
  await page.goto('/#/');
  if (mobile) await page.getByRole('link', { name: 'Resume workout in progress' }).click();
  else await page.goto(url);
  await expect(page.getByRole('heading', { name: 'Workout in progress' })).toBeVisible();
  await expect.soft(rows(card(page, 'Pec deck')).nth(1).getByLabel('reps', { exact: true }), 'reload keeps the value').toHaveValue('12');
  await expect.soft(rows(card(page, 'Pec deck')).first().getByLabel('weight', { exact: true }), 'corrected weight kept').toHaveValue('45');

  // ---- Rest timer never covers the field being edited
  if (mobile) {
    await rows(card(page, 'Pec deck')).nth(1).getByRole('button', { name: 'Complete set' }).click();
    const timer = page.getByTestId('rest-timer');
    await expect.soft(timer, 'rest timer shown').toBeVisible();
    const target = rows(card(page, 'Seated leg curl')).first().getByLabel('reps', { exact: true });
    // Put the field right behind the timer, then focus it as a tap would.
    await target.evaluate((el) => { const r = el.getBoundingClientRect(); window.scrollBy(0, r.top - (window.innerHeight - 120)); });
    await target.focus();
    await page.waitForTimeout(400);
    if (await timer.count()) {
      const tb = await timer.boundingBox();
      const fb = await target.boundingBox();
      expect.soft(fb && tb ? fb.y + fb.height <= tb.y + 1 : false, 'focused field above the rest timer').toBe(true);
    }
    await shot(page, P, '04-focus-above-timer');
  }

  // ---- Undo tapped after leaving and re-opening the workout: the re-opened editor applies it (review #1)
  {
    const pc = card(page, 'Pec deck');
    const nRows = await rows(pc).count();
    await rows(pc).first().getByRole('button', { name: 'Remove' }).click();
    await expect(rows(card(page, 'Pec deck'))).toHaveCount(nRows - 1);
    await page.goto('/#/history');
    await page.goto(url);
    await undoToast(page).click();
    await expect.soft(rows(card(page, 'Pec deck')), 'set back after Undo in a re-opened editor').toHaveCount(nRows);
    await page.waitForTimeout(800); // a later autosave of the re-opened editor must not drop it again
    await page.goto('/#/history');
    await page.goto(url);
    await expect.soft(rows(card(page, 'Pec deck')), 'and it stays saved').toHaveCount(nRows);
  }

  // ---- Finish by mistake → back to the workout
  await page.getByRole('button', { name: /^Finish$/ }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await shot(page, P, '05-finish-summary');
  const back = page.getByRole('button', { name: 'Back to workout' });
  await expect.soft(back, 'summary offers Back to workout').toBeVisible();
  if (await back.count()) {
    await back.click();
    await expect.soft(page.getByRole('heading', { name: 'Workout in progress' }), 'live again').toBeVisible();
    await expect.soft(card(page, 'Seated leg curl'), 'unticked planned exercise is back').toBeVisible();
  } else await page.getByRole('dialog').getByRole('button', { name: 'Done' }).click();

  // ---- Body weight: draft survives a back gesture; weigh-in edit; delete → undo
  await page.goto('/#/body');
  await page.getByRole('button', { name: /Body weight/ }).first().click();
  await page.getByLabel('Body weight in kg').fill('81.7');
  await page.goBack();
  await page.waitForTimeout(300);
  await expect.soft(page.getByRole('dialog'), 'back closes the weigh-in sheet').toHaveCount(0);
  if (await page.getByRole('dialog').count()) await page.getByRole('button', { name: 'Close' }).click();
  expect.soft(page.url(), 'back stays on Body').toMatch(/#\/body$/);
  await page.getByRole('button', { name: /Body weight/ }).first().click();
  await expect.soft(page.getByLabel('Body weight in kg'), 'weigh-in draft kept').toHaveValue('81.7');
  await page.getByLabel('Body weight in kg').fill('81.7');
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  await page.getByRole('tab', { name: 'Log' }).click();
  const edit = page.getByRole('button', { name: /Edit entry/ }).first();
  await expect.soft(edit, 'a weigh-in can be edited').toBeVisible();
  if (await edit.count()) {
    await edit.click();
    await page.getByRole('dialog').getByLabel('Body weight in kg').fill('81.2');
    await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
    await expect.soft(page.getByRole('cell', { name: '81.2' }), 'edited value shown').toBeVisible();
  }
  const nd = dialogs.length;
  await page.getByRole('button', { name: 'Delete measurement' }).first().click();
  expect.soft(dialogs.length, 'delete weigh-in: no blocking dialog').toBe(nd);
  await expect.soft(undoToast(page), 'Undo after deleting a weigh-in').toBeVisible();
  if (await undoToast(page).count()) {
    await undoToast(page).click();
    await expect.soft(page.getByRole('cell', { name: /81\.[27]/ }), 'weigh-in back').toBeVisible();
  }
  await shot(page, P, '06-body-log');

  // ---- History: delete a workout → undo
  await page.goto('/#/history');
  const wRows = page.locator('main').getByRole('button', { name: /^Delete$/ });
  await page.locator('main button[aria-expanded="false"]').first().click();
  if (await wRows.count()) {
    const nd2 = dialogs.length;
    await wRows.first().click();
    expect.soft(dialogs.length, 'delete a whole workout: asks first (rare, costly), then offers Undo').toBe(nd2 + 1);
    await expect.soft(undoToast(page), 'Undo after deleting a workout').toBeVisible();
    if (await undoToast(page).count()) await undoToast(page).click();
  }
  metrics[`${P}:dialogs`] = dialogs;
  fs.writeFileSync(path.join(ROOT, `metrics-${PHASE}-${P}.json`), JSON.stringify(metrics, null, 2));
});

test('landscape: content keeps most of the screen', async ({ page }, info) => {
  test.skip(info.project.name === 'desktop', 'phones only');
  test.setTimeout(240_000);
  const P = info.project.name;
  await setup(page);
  await page.goto('/#/log');
  await page.getByRole('button', { name: /Start session/ }).click();
  await addExercise(page, 'pec deck', 'Pec deck');
  await rows(card(page, 'Pec deck')).first().getByRole('button', { name: 'Complete set' }).click();
  const vp = page.viewportSize()!;
  await page.setViewportSize({ width: vp.height, height: vp.width });
  await page.waitForTimeout(500);
  const covered = await page.evaluate(() => {
    let px = 0;
    for (const el of Array.from(document.querySelectorAll('body *'))) {
      const s = getComputedStyle(el);
      if (s.position !== 'fixed' && s.position !== 'sticky') continue;
      if (el.parentElement && ['fixed', 'sticky'].includes(getComputedStyle(el.parentElement).position)) continue;
      const r = el.getBoundingClientRect();
      if (r.height > 0 && r.width > window.innerWidth * 0.5 && r.height < window.innerHeight) px += Math.min(r.height, window.innerHeight);
    }
    return { px, h: window.innerHeight };
  });
  metrics[`${P}:landscape`] = covered;
  fs.writeFileSync(path.join(ROOT, `metrics-${PHASE}-${P}-landscape.json`), JSON.stringify(covered));
  expect.soft(covered.px / covered.h, 'bars cover < 45 % of a landscape screen').toBeLessThan(0.45);
  const res = (await page.evaluate(AUDIT)) as { findings: unknown[] };
  expect.soft(res.findings, 'no layout overflow in landscape').toEqual([]);
  await shot(page, P, '07-landscape');
});

test('plan edits, import draft and rule checks', async ({ page }, info) => {
  test.setTimeout(240_000);
  const P = info.project.name;
  await setup(page);

  // ---- Plan card: skip an item → it can be brought back; the change survives leaving the screen
  await page.goto('/#/');
  const list = page.getByTestId('next-workout-list');
  await expect(list.locator('> li').first()).toBeVisible();
  const n0 = await list.locator('> li').count();
  await list.locator('> li').first().locator('button').first().click();
  await list.getByRole('button', { name: /^Skip$/ }).click();
  await expect(list.locator('> li')).toHaveCount(n0 - 1);
  await page.goto('/#/history');
  await page.goto('/#/');
  await expect.soft(page.getByTestId('next-workout-list').locator('> li'), 'skip kept after leaving').toHaveCount(n0 - 1);
  const back = page.getByTestId('plan-changes').getByRole('button', { name: /^Bring back/ });
  await expect.soft(back, 'skipped item can be brought back').toBeVisible();
  await shot(page, P, '08-plan-changes');
  if (await back.count()) {
    await back.first().click();
    await expect.soft(page.getByTestId('next-workout-list').locator('> li'), 'item back').toHaveCount(n0);
  }

  // ---- Import: pasted text survives leaving the screen
  await page.goto('/#/import');
  const ta = page.locator('textarea').first();
  await ta.fill('{"schema": "synthetic draft"');
  await page.waitForTimeout(500);
  await page.goto('/#/history');
  await page.goto('/#/import');
  await expect.soft(page.locator('textarea').first(), 'import text kept').toHaveValue('{"schema": "synthetic draft"');

  // ---- Settings: rules of thumb checked against the owner's own data
  await page.goto('/#/settings');
  await expect.soft(page.getByTestId('rule-checks').locator('li'), 'two rule checks shown').toHaveCount(2);
  await page.getByText('Rules of thumb vs your data').scrollIntoViewIfNeeded();
  await shot(page, P, '09-rule-checks');
});
