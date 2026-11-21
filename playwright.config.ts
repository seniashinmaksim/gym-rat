/**
 * Dev-only responsive/visual checks (not part of the app build or `npm test`).
 *   PHASE=before|after npx playwright test        (dev server on :5173 must be running: npm run dev)
 * Screenshots + overflow reports go to test-artifacts/<project>/<phase>/ (git-ignored).
 * Uses a fresh browser profile with a synthetic test vault — never the owner's data.
 */
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 240_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:5173', trace: 'off' },
  projects: [
    { name: 'iphone-13', use: { ...devices['iPhone 13'], browserName: 'webkit' } }, // 390 × 844, DPR 3, touch
    { name: 'mobile-375', use: { ...devices['iPhone 13'], browserName: 'webkit', viewport: { width: 375, height: 812 } } },
    { name: 'mobile-430', use: { ...devices['iPhone 13'], browserName: 'webkit', viewport: { width: 430, height: 932 } } },
    { name: 'desktop', use: { ...devices['Desktop Safari'], browserName: 'webkit', viewport: { width: 1280, height: 860 } } },
  ],
});
