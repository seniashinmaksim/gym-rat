/**
 * Responsive / overlay audit on WebKit (iPhone 13 emulation and others). For every screen and every
 * opened control it saves a screenshot and runs scripts/layout-audit.js (elements outside their card,
 * page-level horizontal scroll, clipped content). Synthetic data only, fresh browser profile.
 */
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const PHASE = process.env.PHASE ?? 'after';
const AUDIT = fs.readFileSync('scripts/layout-audit.js', 'utf8');
const DATA = fs.readFileSync('e2e/fixtures/synthetic-import.json', 'utf8');
const TEST_VAULT_PASSWORD = 'synthetic-e2e-vault-01'; // throwaway local test vault, never real data

type Finding = { el: string; box: string; dx: number; why: string };
const report: Record<string, { findings: Finding[]; smallTargets: string[] }> = {};

async function snap(page: Page, out: string, name: string) {
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(out, `${name}.png`) });
  const res = (await page.evaluate(AUDIT)) as { findings: Finding[] };
  // Touch targets: visible buttons/links/inputs smaller than 32 px in either direction (44 px is ideal).
  const small = await page.evaluate(() => [...document.querySelectorAll('button, a, input, select, [role=button]')]
    .filter((e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && (r.height < 32 || r.width < 32) && !(e as HTMLInputElement).hidden; })
    .map((e) => `${e.tagName.toLowerCase()} "${((e as HTMLElement).innerText || e.getAttribute('aria-label') || (e as HTMLInputElement).placeholder || '').trim().slice(0, 30)}" ${Math.round(e.getBoundingClientRect().width)}×${Math.round(e.getBoundingClientRect().height)}`)
    .slice(0, 15));
  report[name] = { findings: res.findings, smallTargets: small };
}

const click = (page: Page, re: RegExp) => page.getByRole('button', { name: re }).first().click();

test('every screen and control stays inside its boundaries', async ({ page }, info) => {
  const out = path.join('test-artifacts', info.project.name, PHASE);
  fs.mkdirSync(out, { recursive: true });

  // Fresh vault (first-run "Set your password" screen).
  await page.goto('/');
  await page.getByPlaceholder('Choose a password').fill(TEST_VAULT_PASSWORD);
  await page.getByPlaceholder('Repeat password').fill(TEST_VAULT_PASSWORD);
  await snap(page, out, '00-setup-password');
  await click(page, /Set password/);
  await page.getByPlaceholder('Choose a password').waitFor({ state: 'detached', timeout: 60_000 });

  // Synthetic history via Import.
  await page.goto('/#/import');
  await page.locator('textarea').fill(DATA);
  await click(page, /Validate/);
  await snap(page, out, '01-import-review');
  await click(page, /Save all/);
  await page.waitForTimeout(1500);

  for (const [i, r] of ['/', '/history', '/strength', '/reports', '/body', '/equipment', '/exercises', '/science', '/settings', '/recovery', '/muscles', '/periodization'].entries()) {
    await page.goto(`/#${r}`);
    await page.waitForTimeout(500);
    await snap(page, out, `1${String(i).padStart(2, '0')}-route${r.replace(/\//g, '-') || '-week'}`);
  }

  // Opened states on the library pages.
  await page.goto('/#/exercises');
  await page.evaluate(() => document.querySelector('main .grid button')?.scrollIntoView({ block: 'center' }));
  await snap(page, out, '106b-exercise-cards');
  await page.locator('main .grid button').first().click();
  await snap(page, out, '15-exercise-detail-modal');
  await page.keyboard.press('Escape');
  await page.goto('/#/strength');
  await page.waitForTimeout(400);
  await page.locator('main button', { hasText: /kg|reps|BW/ }).first().click().catch(() => undefined);
  await page.waitForTimeout(400);
  await snap(page, out, '16-strength-detail');
  await page.goto('/#/history');
  await page.waitForTimeout(400);
  await page.locator('main button', { hasText: /exercise/ }).first().click().catch(() => undefined);
  await snap(page, out, '17-history-expanded');

  // Body weight sheet with date + time inputs.
  await page.goto('/#/');
  await page.getByRole('button', { name: /^Weight$/ }).first().click().catch(() => undefined);
  await snap(page, out, '20-add-body-weight');
  await page.locator('[role=dialog] input[type=time]').first().click().catch(() => undefined);
  await snap(page, out, '21-add-body-weight-time-focused');
  await page.keyboard.press('Escape');

  // Start workout: new gym, date/time fields.
  await page.goto('/#/log');
  await page.waitForTimeout(400);
  await page.locator('main select').first().selectOption('__new').catch(() => undefined);
  await page.getByPlaceholder('e.g. Gym A').fill('Synthetic Gym A').catch(() => undefined);
  await snap(page, out, '30-start-workout');
  await click(page, /Start session/);
  await page.waitForTimeout(800);

  // Exercise picker → incline DB press.
  await click(page, /^Add exercise$/);
  await snap(page, out, '31-exercise-picker');
  await page.locator('[role=dialog] input').first().fill('incline dumbbell');
  await page.locator('[role=dialog] button', { hasText: /^Incline dumbbell press/ }).first().click();
  await page.waitForTimeout(600);
  await snap(page, out, '32-exercise-card');
  await click(page, /^Setup/);
  await snap(page, out, '33-setup-open');

  // Machine picker + new equipment form (selects, photo buttons).
  await page.getByRole('button', { name: /Free weights|Which machine/ }).first().click();
  await snap(page, out, '34-equipment-picker');
  await click(page, /^New$/);
  await snap(page, out, '35-new-equipment-form');
  await page.locator('[role=dialog]').getByRole('button', { name: /^Cancel$/ }).click();

  // Log a set → timer + failure + feel rows.
  const row = page.locator('[id^="set-"]').first();
  await row.locator('input[aria-label="weight"]').fill('22.5');
  await row.locator('input[aria-label="reps"]').fill('10');
  await row.getByRole('button', { name: '2', exact: true }).click();
  await row.getByRole('button', { name: 'Complete set' }).click();
  await page.waitForTimeout(500);
  await snap(page, out, '36-after-set-timer');

  // Pull-ups: loading + grip chips.
  await click(page, /^Add exercise$/);
  await page.locator('[role=dialog] input').first().fill('pull-up');
  await page.locator('[role=dialog] button', { hasText: /^Pull-up/ }).first().click();
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: /^Setup/ }).last().click();
  await snap(page, out, '37-pullup-setup');

  // Session details (time inputs) + finish summary.
  await page.getByRole('button', { name: /Session details/ }).click().catch(() => undefined);
  await snap(page, out, '38-session-details');
  await click(page, /^Finish$/);
  await page.waitForTimeout(900);
  await snap(page, out, '39-finish-summary');

  // Body log form (date + time) and reports week select.
  await page.goto('/#/body');
  await page.getByRole('tab', { name: 'Log' }).click().catch(() => undefined);
  await snap(page, out, '40-body-log-form');
  await page.goto('/#/reports');
  await page.locator('main select').first().focus().catch(() => undefined);
  await snap(page, out, '41-reports-week-select');

  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  const total = Object.values(report).reduce((n, r) => n + r.findings.length, 0);
  console.log(`[${info.project.name}/${PHASE}] overflow findings: ${total} in ${Object.keys(report).length} states`);
  if (PHASE === 'after') expect(total, JSON.stringify(Object.fromEntries(Object.entries(report).filter(([, r]) => r.findings.length)), null, 1)).toBe(0);
});
