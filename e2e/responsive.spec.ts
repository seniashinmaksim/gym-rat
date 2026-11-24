/**
 * Responsive / overlay audit on WebKit (iPhone 13, 375, 430, desktop), in English AND Russian. For every screen
 * and every opened control it saves a screenshot and runs scripts/layout-audit.js (elements outside their card,
 * page-level horizontal scroll, clipped / cut-off text). Screens: first-run password, import review, the 12 main
 * routes, opened library / strength / history states, body-weight sheet, start workout, then the TRAINING MODE
 * (exercise picker, set entry, setup sheet, machine picker + new-machine form, step sheet, rest screen, set sheet,
 * overview, ⋯ actions sheet, replace sheet, session details, workout menu, pull-up setup, finish summary), the
 * Workout check (History → "Check the numbers") and Settings → Training mode, Body log form, Reports week select.
 * Synthetic data only (e2e/fixtures/synthetic-import.json), fresh browser profile, throwaway password.
 *   AUDIT_LANG=en|ru (default: both)   PHASE=before|after
 * Output: test-artifacts/<project>/<phase>/<lang>/ (screenshots + report.json).
 */
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { audit, logSet, nextSet, pick, T, toOverview, useLang, type Finding, type Lang } from './helpers';

const PHASE = process.env.PHASE ?? 'after';
const LANGS = (process.env.AUDIT_LANG ? [process.env.AUDIT_LANG] : ['en', 'ru']) as Lang[];
const DATA = fs.readFileSync('e2e/fixtures/synthetic-import.json', 'utf8');
const TEST_VAULT_PASSWORD = 'synthetic-e2e-vault-01'; // throwaway local test vault, never real data

/** Screen texts used only here. */
const R = {
  en: { incline: /^Incline dumbbell press/, pullup: /^Pull-up(?!s)/, setupForm: /^Setup and form$/, changeMachine: /^Change machine$/, replace: /^Replace$/, exercises: /exercise/ },
  ru: { incline: /^Жим гантелей на наклонной/, pullup: /^Подтягивания(?! в)/, setupForm: /^Настройка и техника$/, changeMachine: /^Сменить тренажёр$/, replace: /^Заменить$/, exercises: /упражн/ },
};

for (const lang of LANGS) {
  test(`every screen and control stays inside its boundaries (${lang})`, async ({ page }, info) => {
    test.setTimeout(300_000);
    page.setDefaultTimeout(20_000);
    const t = T[lang];
    const r = R[lang];
    const out = path.join('test-artifacts', info.project.name, PHASE, lang);
    fs.mkdirSync(out, { recursive: true });
    const report: Record<string, { findings: Finding[]; smallTargets: string[] }> = {};
    const train = page.getByTestId('train');

    async function snap(name: string) {
      await page.waitForTimeout(250);
      await page.screenshot({ path: path.join(out, `${name}.png`) });
      const res = await audit(page);
      // Touch targets (reported, not asserted here): visible controls smaller than 32 px in either direction.
      const small = await page.evaluate(() => [...document.querySelectorAll('button, a, input, select, [role=button]')]
        .filter((e) => { const b = e.getBoundingClientRect(); const s = getComputedStyle(e); return b.width > 0 && b.height > 0 && s.visibility !== 'hidden' && (b.height < 32 || b.width < 32) && !(e as HTMLInputElement).hidden; })
        .map((e) => `${e.tagName.toLowerCase()} "${((e as HTMLElement).innerText || e.getAttribute('aria-label') || (e as HTMLInputElement).placeholder || '').trim().slice(0, 30)}" ${Math.round(e.getBoundingClientRect().width)}×${Math.round(e.getBoundingClientRect().height)}`)
        .slice(0, 15));
      report[name] = { findings: res.findings, smallTargets: small };
    }
    const sheetButton = (name: RegExp) => page.getByRole('dialog').getByRole('button', { name }).first();
    const closeSheet = async () => { await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0); };

    await useLang(page, lang);
    // Fresh vault (first-run "Set your password" screen).
    await page.goto('/');
    await page.getByPlaceholder(t.choose).fill(TEST_VAULT_PASSWORD);
    await page.getByPlaceholder(t.repeat).fill(TEST_VAULT_PASSWORD);
    await snap('00-setup-password');
    await page.getByRole('button', { name: t.setPw }).click();
    await page.getByPlaceholder(t.choose).waitFor({ state: 'detached', timeout: 60_000 });

    // Synthetic history via Import.
    await page.goto('/#/import');
    await page.locator('textarea').fill(DATA);
    await page.getByRole('button', { name: t.validate }).first().click();
    await snap('01-import-review');
    await page.getByRole('button', { name: t.saveAll }).last().click();
    await page.waitForTimeout(1500);

    for (const [i, route] of ['/', '/history', '/strength', '/reports', '/body', '/equipment', '/exercises', '/science', '/settings', '/recovery', '/muscles', '/periodization'].entries()) {
      await page.goto(`/#${route}`);
      await page.waitForTimeout(500);
      await snap(`1${String(i).padStart(2, '0')}-route${route.replace(/\//g, '-') || '-week'}`);
    }

    // Opened states on the library pages.
    await page.goto('/#/exercises');
    await page.evaluate(() => document.querySelector('main button.group')?.scrollIntoView({ block: 'center' }));
    await snap('106b-exercise-cards');
    await page.locator('main button.group').first().click();
    await snap('15-exercise-detail-modal');
    await page.keyboard.press('Escape');
    await page.goto('/#/strength');
    await page.waitForTimeout(400);
    await page.locator('main .space-y-2 > button').first().click();
    await page.waitForTimeout(400);
    await snap('16-strength-detail');
    await page.goto('/#/history');
    await page.waitForTimeout(400);
    await page.locator('main button[aria-expanded="false"]').first().click();
    await snap('17-history-expanded');

    // Workout check, reached from History → "Check the numbers".
    await page.getByTestId('open-check').first().click();
    await expect(page.getByTestId('workout-check')).toBeVisible();
    await snap('18-workout-check');
    await page.getByTestId('check-set').first().getByRole('button').first().click();
    await expect(page.getByTestId('check-set-detail').first()).toBeVisible();
    await snap('18b-workout-check-detail');

    // Settings → Training mode card.
    await page.goto('/#/settings');
    await page.getByTestId('training-settings').scrollIntoViewIfNeeded();
    await snap('19-settings-training-mode');

    // Body weight sheet with date + time inputs.
    await page.goto('/#/');
    await page.getByRole('button', { name: t.weightBtn }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await snap('20-add-body-weight');
    await page.locator('[role=dialog] input[type=time]').first().click();
    await snap('21-add-body-weight-time-focused');
    await page.keyboard.press('Escape');

    // Start workout: new gym, date/time fields.
    await page.goto('/#/log');
    await page.waitForTimeout(400);
    // Optional: the select is only there once a gym exists; the import above may or may not have created one.
    if (await page.locator('main select').count()) await page.locator('main select').first().selectOption('__new');
    await page.getByPlaceholder(t.gym).fill('Synthetic Gym A');
    await snap('30-start-workout');
    await page.getByRole('button', { name: t.start }).click();
    await expect(train).toBeVisible();

    // Training mode: the picker opens by itself on an empty workout.
    await expect(page.getByRole('dialog')).toBeVisible();
    await snap('31-exercise-picker');
    await pick(page, 'incline dumbbell', r.incline, lang);
    await expect(train).toHaveAttribute('data-view', 'set');
    await snap('32-set-entry-empty');
    await page.getByTestId('exercise-menu').click();
    await snap('33-exercise-menu');
    await sheetButton(r.setupForm).click();
    await snap('33b-setup-sheet');
    await closeSheet();

    // Machine picker + new equipment form (selects, photo buttons).
    await page.getByTestId('exercise-menu').click();
    await sheetButton(r.changeMachine).click();
    await snap('34-equipment-picker');
    await sheetButton(t.newBtn).click();
    await snap('35-new-equipment-form');
    await page.getByRole('dialog').last().getByRole('button', { name: t.cancel }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // Step sheet, one set → rest screen → set entry with a chip → set sheet.
    await page.getByTestId('step-chip').click();
    await snap('36-step-sheet');
    await closeSheet();
    await logSet(page, '22.5', '10', 1);
    await snap('37-rest');
    await nextSet(page);
    await snap('38-set-entry-with-set');
    // Why (only shown when a target line exists for this exercise).
    if (await page.getByTestId('why').count()) { await page.getByTestId('why').click(); await snap('38b-why-sheet'); await closeSheet(); }
    await page.getByTestId('set-chip').first().click();
    await expect(page.getByTestId('set-sheet')).toBeVisible();
    await snap('39-set-sheet');
    await closeSheet();

    // Pull-ups: loading + grip chips in the setup sheet.
    await toOverview(page);
    await page.getByTestId('add-exercise').click();
    await pick(page, 'pull-up', r.pullup, lang);
    await page.getByTestId('exercise-menu').click();
    await sheetButton(r.setupForm).click();
    await snap('40-pullup-setup');
    await closeSheet();

    // Overview, ⋯ actions, replace sheet, session details, workout menu.
    await toOverview(page);
    await snap('41-overview');
    await page.getByTestId('ov-row').last().getByTestId('ov-menu').click();
    await expect(page.getByTestId('ov-actions')).toBeVisible();
    await snap('42-overview-actions');
    await page.getByTestId('ov-actions').getByRole('button', { name: r.replace }).click();
    await expect(page.getByTestId('replace-sheet')).toBeVisible();
    await snap('43-replace-sheet');
    await closeSheet();
    await page.getByTestId('session-details').click();
    await page.getByTestId('session-details').scrollIntoViewIfNeeded();
    await snap('44-session-details');
    await page.getByTestId('workout-menu').click();
    await snap('45-workout-menu');
    await closeSheet();
    await page.getByTestId('finish').click();
    await expect(page.getByRole('dialog')).toContainText(t.saved);
    await snap('46-finish-summary');
    await page.getByRole('dialog').getByRole('button', { name: t.doneBtn }).click();

    // Body log form (date + time) and reports week select.
    await page.goto('/#/body');
    await page.getByRole('tab', { name: t.bodyLog }).click();
    await snap('50-body-log-form');
    await page.goto('/#/reports');
    await page.locator('main select').first().focus().catch(() => undefined);
    await snap('51-reports-week-select');

    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
    const total = Object.values(report).reduce((n, x) => n + x.findings.length, 0);
    console.log(`[${info.project.name}/${PHASE}/${lang}] layout findings: ${total} in ${Object.keys(report).length} states`);
    if (PHASE === 'after') expect(total, JSON.stringify(Object.fromEntries(Object.entries(report).filter(([, x]) => x.findings.length)), null, 1)).toBe(0);
  });
}
