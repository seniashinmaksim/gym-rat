/**
 * UX audit: mistakes and recovery during a live workout in the training mode (Part 6), on 4 WebKit viewports.
 *  Wrong weight logged → fixed in the set sheet · remove set → Undo · wrong exercise → Change exercise (logged
 *  sets kept) → Undo · remove exercise → Undo (no blocking dialog) · Skip → Undo · Later → Undo · back gesture
 *  closes the top sheet and stays in the workout · Undo tapped after leaving and re-opening the workout ·
 *  reload + unlock resumes with every set · Resume on other screens · Finish by mistake → "Back to workout" ·
 *  tap targets (≥ 44 px high, ≥ 40 px wide) · weigh-in draft / edit / delete → Undo · History delete → Undo.
 *  Landscape: the primary action stays on screen, no bar eats the screen, no overflow.
 *  Rest screen: the top bar (← overview, ⋯) stays tappable once the target is reached (regression, 390 × 664).
 *  Drafts: plan edits and pasted import text survive leaving the screen; rules of thumb vs your data.
 * Dropped with the old card logger: ticking / unticking a prepared set (no prepared rows any more), the current
 * set marker on prepared rows, "typed but not logged" values surviving leave / Lock now (training mode keeps
 * nothing until LOG SET), and the rest-timer bar covering a focused field (no such bar; the rest is its own screen).
 * SYNTHETIC data (tests/sim/dataQuality) restored through the app's own encrypted backup; throwaway passwords.
 * English only.   PHASE=before|after → test-artifacts/ux/<phase>/<project>/
 */
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { createBackup } from '../src/lib/backup';
import { dataQualityHistory, dayAfterLast } from '../tests/sim/dataQuality';
import { audit, createVault, logSet, nextSet, ovMenu, ovRow, pick, restGuard, restoreBackup, toOverview, typeNumber, undoToast, unlock, useLang } from './helpers';

const VAULT_PW = 'synthetic-e2e-vault-07';
const BACKUP_PW = 'synthetic-e2e-backup-07';
const PHASE = process.env.PHASE ?? 'after';
const ROOT = path.join('test-artifacts', 'ux');
const BACKUP = path.join(ROOT, 'synthetic-10.gymrat-backup.json');
const DATA = dataQualityHistory({ sessions: 10 });
const NOW = dayAfterLast(DATA, 3);
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

async function setup(page: Page) {
  await useLang(page, 'en');
  await page.clock.install({ time: NOW });
  await createVault(page, VAULT_PW);
  await restoreBackup(page, BACKUP, BACKUP_PW);
}

/** A fresh live workout at the restored gym; the picker opens by itself. */
async function startWith(page: Page, query: string, name: RegExp) {
  await page.goto('/#/log');
  await page.getByRole('button', { name: /Start session/ }).click();
  await expect(page.getByTestId('train')).toBeVisible();
  await pick(page, query, name);
  await expect(page.getByTestId('train')).toHaveAttribute('data-view', 'set');
}

/** Visible controls of the training screen (sheets excluded) smaller than 44 px high or 40 px wide. */
const smallTargets = (page: Page) => page.evaluate(() => {
  const root = document.querySelector('[data-testid="train"]') as HTMLElement;
  return [...root.querySelectorAll('button, a, input')].filter((el) => {
    const b = el.getBoundingClientRect(); const s = getComputedStyle(el);
    return b.width > 0 && b.height > 0 && s.visibility !== 'hidden' && b.bottom > 0 && b.top < innerHeight && !el.closest('[role="dialog"]');
  }).map((el) => { const b = el.getBoundingClientRect(); return { t: (el.getAttribute('data-testid') ?? el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 30), w: Math.round(b.width), h: Math.round(b.height) }; })
    .filter((x) => x.h < 44 || x.w < 40);
});

test('mistakes and recovery during a live workout', async ({ page }, info) => {
  test.setTimeout(420_000);
  page.setDefaultTimeout(20_000);
  const P = info.project.name;
  const mobile = P !== 'desktop';
  const train = page.getByTestId('train');
  const chips = page.getByTestId('set-chip');
  const dialogs: string[] = [];
  await setup(page);
  page.on('dialog', (d) => { dialogs.push(d.message()); void d.accept(); });

  await startWith(page, 'pec deck', /^Pec deck/);
  const url = page.url();
  expect(url).toMatch(/#\/log\/.+/);

  // ---- Tap targets on set entry
  expect(await smallTargets(page), 'set entry: every control ≥ 44 px high, ≥ 40 px wide').toEqual([]);
  await shot(page, P, '01-set-entry');

  // ---- Wrong weight logged → fixed in the set sheet
  await logSet(page, '450', '12');
  expect(await smallTargets(page), 'rest: tap targets').toEqual([]);
  await nextSet(page);
  await expect(chips).toHaveCount(1);
  await expect(chips.first()).toContainText('450 × 12');
  await chips.first().click();
  const setSheet = page.getByTestId('set-sheet');
  await expect(setSheet).toBeVisible();
  await typeNumber(setSheet, 'weight-value', '45');
  await page.getByRole('dialog').getByRole('button', { name: /^Done$/ }).click();
  await expect(chips.first()).toContainText('45 × 12');

  // ---- Remove a set → Undo
  await logSet(page, '45', '11'); // same weight: both sets count as working (a lighter first set would become a warm-up)
  await nextSet(page);
  await expect(chips).toHaveCount(2);
  await chips.nth(1).click();
  await page.getByTestId('remove-set').click();
  await expect(chips).toHaveCount(1);
  await shot(page, P, '02-set-removed');
  await undoToast(page).click();
  await expect(chips).toHaveCount(2);

  // ---- Wrong exercise → Change exercise (the logged set is kept) → Undo
  await toOverview(page);
  await page.getByTestId('add-exercise').click();
  await pick(page, 'lateral raise', /^Dumbbell lateral raise/);
  await logSet(page, '10', '15');
  await nextSet(page);
  await page.getByTestId('exercise-menu').click();
  await page.getByRole('dialog').getByRole('button', { name: /^Change exercise$/ }).click();
  await pick(page, 'cable lateral', /^Cable lateral raise/);
  await expect(page.getByTestId('exercise-name')).toHaveText(/cable lateral raise/i);
  await expect(chips, 'performed set kept after Change exercise').toHaveCount(1);
  await expect(chips.first()).toContainText('10 × 15');
  await shot(page, P, '03-exercise-changed');
  await undoToast(page).click();
  await expect(page.getByTestId('exercise-name')).toHaveText(/dumbbell lateral raise/i);
  await expect(chips).toHaveCount(1);

  // ---- Remove an exercise → Undo (no blocking dialog)
  await toOverview(page);
  await expect(page.getByTestId('ov-row')).toHaveCount(2);
  const nDialogs = dialogs.length;
  await (await ovMenu(page, /dumbbell lateral raise/i)).getByTestId('remove-exercise').click();
  await expect(page.getByTestId('ov-row')).toHaveCount(1);
  expect(dialogs.length, 'remove exercise: no blocking confirm dialog').toBe(nDialogs);
  await undoToast(page).click();
  await expect(page.getByTestId('ov-row')).toHaveCount(2);
  await expect(ovRow(page, /dumbbell lateral raise/i)).toContainText(/1( \/ \d+)?$/); // its set came back too

  // ---- Skip → Undo, Later → Undo on a not-started exercise
  await page.getByTestId('add-exercise').click();
  await pick(page, 'leg curl', /^Seated leg curl/);
  await toOverview(page);
  const legc = () => ovRow(page, /seated leg curl/i);
  await (await ovMenu(page, /seated leg curl/i)).getByRole('button', { name: /^Skip$/ }).click();
  await expect(legc()).toHaveAttribute('data-state', 'skipped');
  await undoToast(page).click();
  await expect(legc()).not.toHaveAttribute('data-state', 'skipped');
  await (await ovMenu(page, /seated leg curl/i)).getByRole('button', { name: /^Move up$/ }).click(); // so it is not last
  await page.keyboard.press('Escape');
  await (await ovMenu(page, /seated leg curl/i)).getByRole('button', { name: /^Later/ }).click();
  await expect(page.getByTestId('ov-row').last()).toContainText(/seated leg curl/i);
  await undoToast(page).click();
  await expect(page.getByTestId('ov-row').last()).not.toContainText(/seated leg curl/i);
  await expect(legc()).not.toContainText('later');
  await shot(page, P, '04-overview-after-undos');

  // ---- Back gesture: closes the top sheet, stays in the workout
  await (await ovMenu(page, /pec deck/i));
  await page.goBack();
  await expect(page.getByRole('dialog'), 'back closes the overview sheet').toHaveCount(0);
  expect(page.url(), 'back stays in the workout').toBe(url);
  await expect(train).toHaveAttribute('data-view', 'overview');
  await ovRow(page, /pec deck/i).getByRole('button').first().click();
  await page.getByTestId('exercise-menu').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('dialog'), 'back closes the exercise menu').toHaveCount(0);
  expect(page.url()).toBe(url);
  await expect(train).toHaveAttribute('data-view', 'set');
  await shot(page, P, '05-after-back-gesture');

  // ---- Undo tapped after leaving and re-opening the workout: applied, and it stays saved (review #1)
  await expect(chips).toHaveCount(2);
  await chips.nth(1).click();
  await page.getByTestId('remove-set').click();
  await expect(chips).toHaveCount(1);
  await page.goto('/#/history');
  await page.goto(url);
  await expect(train).toBeVisible();
  await undoToast(page).click();
  await toOverview(page);
  await expect(ovRow(page, /pec deck/i), 'set back after Undo in a re-opened workout').toContainText(/2( \/ \d+)?$/);
  await page.waitForTimeout(800); // a later autosave of the re-opened workout must not drop it again
  await page.goto('/#/history');
  await page.goto(url);
  await toOverview(page);
  await expect(ovRow(page, /pec deck/i), 'and it stays saved').toContainText(/2( \/ \d+)?$/);

  // ---- Reload + unlock → resumes in training mode with every set; Resume offered on other screens
  await page.reload();
  await unlock(page, VAULT_PW);
  await expect(train).toBeVisible({ timeout: 60_000 });
  await toOverview(page);
  await expect(page.getByTestId('ov-row')).toHaveCount(3);
  await expect(ovRow(page, /pec deck/i)).toContainText(/2( \/ \d+)?$/);
  await page.goto('/#/');
  if (mobile) await page.getByRole('link', { name: 'Resume workout in progress' }).click();
  else await page.goto(url);
  await expect(train).toBeVisible();

  // ---- Finish by mistake → Back to workout (the not-started exercise is back too)
  await toOverview(page);
  await page.getByTestId('finish').click();
  await expect(page.getByRole('dialog')).toContainText('Workout saved');
  await shot(page, P, '06-finish-summary');
  await page.getByRole('button', { name: 'Back to workout' }).click();
  await expect(train).toHaveAttribute('data-view', 'overview');
  await expect(page.getByTestId('ov-row')).toHaveCount(3);
  await expect(ovRow(page, /seated leg curl/i)).toBeVisible();

  // ---- Body weight: draft survives a back gesture; weigh-in edit; delete → Undo
  await page.goto('/#/body');
  await page.getByRole('button', { name: /Body weight/ }).first().click();
  await page.getByLabel('Body weight in kg').fill('81.7');
  await page.goBack();
  await expect(page.getByRole('dialog'), 'back closes the weigh-in sheet').toHaveCount(0);
  expect(page.url(), 'back stays on Body').toMatch(/#\/body$/);
  await page.getByRole('button', { name: /Body weight/ }).first().click();
  await expect(page.getByLabel('Body weight in kg'), 'weigh-in draft kept').toHaveValue('81.7');
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  await page.getByRole('tab', { name: 'Log' }).click();
  await page.getByRole('button', { name: /Edit entry/ }).first().click();
  await page.getByRole('dialog').getByLabel('Body weight in kg').fill('81.2');
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('cell', { name: '81.2' }), 'edited value shown').toBeVisible();
  const nd = dialogs.length;
  await page.getByRole('button', { name: 'Delete measurement' }).first().click();
  expect(dialogs.length, 'delete weigh-in: no blocking dialog').toBe(nd);
  await undoToast(page).click();
  await expect(page.getByRole('cell', { name: '81.2' }), 'weigh-in back').toBeVisible();
  await shot(page, P, '07-body-log');

  // ---- History: delete a finished workout → asks first (rare, costly), then offers Undo
  await page.goto('/#/history');
  await page.locator('main button[aria-expanded="false"]').first().click();
  const del = page.locator('main').getByRole('button', { name: /^Delete$/ }).first();
  const nd2 = dialogs.length;
  await del.click();
  expect(dialogs.length).toBe(nd2 + 1);
  await undoToast(page).click();
  await expect(page.getByTestId('toast').filter({ hasText: /deleted/i })).toHaveCount(0);
});

test('landscape: the primary action stays on screen', async ({ page }, info) => {
  test.skip(info.project.name === 'desktop', 'phones only');
  test.setTimeout(240_000);
  const P = info.project.name;
  await setup(page);
  await startWith(page, 'pec deck', /^Pec deck/);
  await logSet(page, '45', '12');
  const vp = page.viewportSize()!;
  await page.setViewportSize({ width: vp.height, height: vp.width });
  await page.waitForTimeout(500);
  for (const view of ['rest', 'set'] as const) {
    if (view === 'set') await nextSet(page);
    await expect(page.getByTestId('train')).toHaveAttribute('data-view', view);
    await expect(page.locator('[data-primary="true"]').first(), `${view}: primary action on screen`).toBeInViewport({ ratio: 1 });
    // Nothing fixed / sticky (other than the full-screen training layer itself) eats the screen.
    const covered = await page.evaluate(() => {
      let px = 0;
      for (const el of Array.from(document.querySelectorAll('[data-testid="train"] *'))) {
        const s = getComputedStyle(el);
        if (s.position !== 'fixed' && s.position !== 'sticky') continue;
        const r = el.getBoundingClientRect();
        if (r.height > 0 && r.width > window.innerWidth * 0.5) px += Math.min(r.height, window.innerHeight);
      }
      return px / window.innerHeight;
    });
    expect(covered, `${view}: bars cover < 45 % of a landscape screen`).toBeLessThan(0.45);
    expect((await audit(page)).findings, `${view}: no layout overflow in landscape`).toEqual([]);
    await shot(page, P, `08-landscape-${view}`);
  }
});

test('rest screen: the top bar stays tappable once the target is reached', async ({ page }, info) => {
  // Regression: on the 390 × 664 iPhone 13 viewport the ring (then 52vh) made the rest column taller than the
  // screen; the centred ring overlapped the top bar (← overview and ⋯ could not be tapped), hid the set line and
  // pushed −15 / +15 onto "HOW WAS IT?". Fixed in the app (ring now ≤ 36vh) while this suite was rewritten.
  test.setTimeout(240_000);
  await setup(page);
  await startWith(page, 'pec deck', /^Pec deck/);
  for (let i = 0; i < 8; i++) {
    if (i) await nextSet(page);
    await logSet(page, '45', '12');
    if (await page.getByTestId('one-more').count()) break;
  }
  await expect(page.getByTestId('one-more'), 'target reached').toBeVisible();
  await restGuard(page);
  const blocked = await page.evaluate(() => ['to-overview', 'exercise-menu'].filter((id) => {
    const el = document.querySelector(`[data-testid="${id}"]`) as HTMLElement;
    const b = el.getBoundingClientRect();
    const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
    return !hit || !el.contains(hit);
  }));
  await shot(page, info.project.name, '09-rest-target-reached');
  expect(blocked, 'top-bar buttons receive taps on the rest screen').toEqual([]);
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
  await expect(page.getByTestId('next-workout-list').locator('> li'), 'skip kept after leaving').toHaveCount(n0 - 1);
  const back = page.getByTestId('plan-changes').getByRole('button', { name: /^Bring back/ });
  await expect(back, 'skipped item can be brought back').toBeVisible();
  await shot(page, P, '10-plan-changes');
  await back.first().click();
  await expect(page.getByTestId('next-workout-list').locator('> li'), 'item back').toHaveCount(n0);

  // ---- Import: pasted text survives leaving the screen
  await page.goto('/#/import');
  await page.locator('textarea').first().fill('{"schema": "synthetic draft"');
  await page.waitForTimeout(500);
  await page.goto('/#/history');
  await page.goto('/#/import');
  await expect(page.locator('textarea').first(), 'import text kept').toHaveValue('{"schema": "synthetic draft"');

  // ---- Settings: rules of thumb checked against the owner's own data
  await page.goto('/#/settings');
  await expect(page.getByTestId('rule-checks').locator('li'), 'two rule checks shown').toHaveCount(2);
  await page.getByText('Rules of thumb vs your data').scrollIntoViewIfNeeded();
  await shot(page, P, '11-rule-checks');
});
