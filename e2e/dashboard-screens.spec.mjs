// Screenshot tests of the Dashboard: the seeded workspace in light, dark, right to left and at phone width, compared
// pixel by pixel with the pictures saved beside this file. A layout jump, a theme break or a block that changes size
// fails here even when every figure is right (e2e/p0.spec.mjs checks the figures). The run stands on one fixed day
// (e2e/fixed-clock.mjs), so dates, overdue counts and charts draw the same every time. Pictures depend on the
// system's fonts, so each platform keeps its own set (-darwin, -linux); after an intended change, refresh them as
// docs/agents/database-and-tests.md says.
import { expect, test } from './test.mjs';
import { settings } from './fixture.mjs';
import { resetDatabase } from './helpers.mjs';

test.beforeEach(async ({ page }) => {
  await resetDatabase();
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
});

/** Opens the Dashboard and waits until its records, charts and fonts are in and nothing is still loading. */
async function openDashboard(page, title = 'Dashboard · Hoggish Finance') {
  await page.goto('/');
  await expect(page).toHaveTitle(title);
  await expect(page.locator('.dashboard-transactions li').filter({ hasText: 'E2E Coffee' })).toHaveCount(1);
  await expect(page.locator('.recharts-surface').first()).toBeVisible();
  await expect(page.locator('[aria-busy="true"], .skeleton')).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForLoadState('networkidle');
}

// The whole page. The drawer is fixed to the window, so below the first screen the picture shows the page behind it.
const shoot = (page, name) => expect(page).toHaveScreenshot(name, { fullPage: true });

test('DASH-SHOT-001 the Dashboard in light', async ({ page }) => {
  await openDashboard(page);
  await shoot(page, 'dashboard-light.png');
});

test('DASH-SHOT-002 the Dashboard in dark', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await openDashboard(page);
  await shoot(page, 'dashboard-dark.png');
});

test('DASH-SHOT-003 the Dashboard at phone width', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openDashboard(page);
  await shoot(page, 'dashboard-phone.png');
});

test('DASH-SHOT-004 the Dashboard right to left, in Arabic', async ({ page }) => {
  // The saved language, as Settings saves it; the database is restored before the next test.
  const saved = await page.request.put('/api/settings', { data: { ...settings, language: 'ar' } });
  expect(saved.ok()).toBe(true);
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await openDashboard(page, /·/);
  await shoot(page, 'dashboard-rtl.png');
});
