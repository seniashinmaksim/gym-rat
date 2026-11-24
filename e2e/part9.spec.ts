/**
 * Part 9 — the fit score next to every next-exercise suggestion (FIX_PLAN I.2 #1, #10), on the four WebKit viewports
 * in English and Russian: plan-card replacement options, the training-mode Next exercise chooser and the picker's
 * "Best now". Each list is sorted high → low (suitable → less optimal → not today), the why opens on tap, a NOT TODAY
 * option never shows a number, and the layout audit finds nothing (no overflow, no cut text).
 * A synthetic 26-week history is restored from an encrypted backup (synthetic data, throwaway passwords).
 */
import { expect, test, type Locator, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { createBackup } from '../src/lib/backup';
import { generateSixMonths } from '../tests/sim/sixMonth';
import { audit, createVault, logSet, restGuard, restoreBackup, useLang } from './helpers';

const VAULT_PW = 'synthetic-e2e-vault-09';
const BACKUP_PW = 'synthetic-e2e-backup-09';
const OUT = path.join('test-artifacts', 'part9');
const BACKUP = path.join(OUT, 'synthetic-26-weeks.gymrat-backup.json');

test.beforeAll(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  if (!fs.existsSync(BACKUP)) {
    const { data } = generateSixMonths();
    fs.writeFileSync(BACKUP, JSON.stringify(await createBackup(data, async () => null, BACKUP_PW)));
  }
});

const RANK: Record<string, number> = { suitable: 0, less_optimal: 1, not_today: 2 };
/** Every scored row in `scope`: groups in order, scores high → low inside a group, no number when not today. */
async function expectSorted(scope: Locator) {
  const rows = await scope.getByTestId('opt-row').evaluateAll((els) => els.map((e) => ({ g: e.getAttribute('data-group') ?? '', s: e.getAttribute('data-score') ?? '' })));
  expect(rows.length).toBeGreaterThan(0);
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].g === 'not_today') expect(rows[i].s).toBe('');
    else expect(Number(rows[i].s) % 5).toBe(0);
    if (i === 0) continue;
    expect(RANK[rows[i - 1].g]).toBeLessThanOrEqual(RANK[rows[i].g]);
    if (rows[i - 1].g === rows[i].g && rows[i].s) expect(Number(rows[i - 1].s)).toBeGreaterThanOrEqual(Number(rows[i].s));
  }
  return rows;
}
async function noFindings(page: Page, where: string) {
  const res = await audit(page);
  expect(res.findings, `${where}: ${JSON.stringify(res.findings.slice(0, 3))}`).toEqual([]);
}

for (const lang of ['en', 'ru'] as const) {
  test(`fit score on every suggestion list (${lang})`, async ({ page }, info) => {
    test.setTimeout(300_000);
    const dir = path.join(OUT, lang, info.project.name);
    fs.mkdirSync(dir, { recursive: true });
    const shot = async (name: string) => { await page.waitForTimeout(300); await page.screenshot({ path: path.join(dir, `${name}.png`) }); };
    page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text().slice(0, 400)); });
    page.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0, 400)));
    await useLang(page, lang);
    await page.clock.install({ time: new Date('2026-11-24T16:00:00Z') });
    page.on('dialog', (d) => void d.accept());
    await createVault(page, VAULT_PW, lang);
    await restoreBackup(page, BACKUP, BACKUP_PW, lang);

    // ---- plan card: Replace → options with scores
    await page.goto('/#/');
    const list = page.getByTestId('next-workout-list');
    await expect(list).toBeVisible({ timeout: 30_000 });
    // Open plan items until one offers replacement options (an item may legitimately have none); at least one must.
    const opts = page.getByTestId('replace-options');
    const n = await list.locator('> li').count();
    let found = false;
    for (let k = 0; k < n && !found; k++) {
      const li = list.locator('> li').nth(k);
      await li.locator('button').first().click();
      await li.getByRole('button', { name: lang === 'en' ? 'Replace' : 'Заменить', exact: true }).click();
      await expect(opts).toBeVisible();
      found = (await opts.getByTestId('opt-row').count()) > 0;
      if (!found) await li.locator('button').first().click(); // close it again
    }
    expect(found, 'some plan item offers scored replacement options').toBe(true);
    await expectSorted(opts);
    await opts.getByTestId('opt-score').first().click();
    await expect(opts.getByTestId('opt-why').first()).toBeVisible();
    await expect(opts.getByTestId('opt-why').first()).toContainText(lang === 'en' ? /no difference in growth|nothing is blocked/ : /не разница в росте|ничего не заблокировано/);
    await noFindings(page, 'plan replace options');
    await shot('01-plan-replace');

    // ---- training mode: start the plan, stop the first exercise early → Next exercise chooser with scores
    await page.getByRole('button', { name: lang === 'en' ? 'Start' : 'Начать', exact: true }).click();
    const train = page.getByTestId('train');
    await expect(train).toBeVisible();
    await logSet(page, null, '10', 1);
    await restGuard(page);
    await page.getByTestId('stop-early').click();
    const chooser = page.getByTestId('next-chooser');
    await expect(chooser).toBeVisible();
    const rows = await expectSorted(chooser);
    if (rows[0].g === 'suitable') await expect(chooser.getByTestId('next-choice').first()).toContainText(lang === 'en' ? 'best fit now' : 'лучше всего сейчас');
    await chooser.getByTestId('opt-score').first().click();
    await expect(chooser.getByTestId('opt-why').first()).toBeVisible();
    await noFindings(page, 'next-exercise chooser');
    await shot('02-chooser-why');

    // ---- picker: "Best now"
    await chooser.getByTestId('next-add').click();
    const best = page.getByTestId('best-now');
    await expect(best).toBeVisible();
    await expectSorted(best);
    await best.getByTestId('opt-score').first().click();
    await expect(best.getByTestId('opt-why').first()).toBeVisible();
    await noFindings(page, 'picker best now');
    await shot('03-picker-best-now');
  });
}
