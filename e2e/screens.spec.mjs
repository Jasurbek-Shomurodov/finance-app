// Screenshot tests of every screen: the seeded workspace in light, dark, at phone width and right to left in Arabic,
// compared pixel by pixel with the pictures saved beside this file. A layout jump, a theme break or a block that
// changes size fails here even when every figure is right (e2e/p0.spec.mjs checks the figures). The run stands on one
// fixed day (e2e/fixed-clock.mjs), so dates, overdue counts and charts draw the same every time. Pictures depend on
// the system's fonts, so each platform keeps its own set (-darwin, -linux); after an intended change, refresh them
// as docs/agents/database-and-tests.md says.
import { expect, test } from './test.mjs';
import { settings } from './fixture.mjs';
import { resetDatabase } from './helpers.mjs';

/** Every screen by its route, with the drawer word its title starts with. `ready` is a piece of the fixture the
 * loaded screen shows, waited for before the picture. */
const workspace = [
  { name: 'dashboard', path: '/', title: 'Dashboard', ready: page => page.locator('.dashboard-transactions li').filter({ hasText: 'E2E Coffee' }) },
  { name: 'assistant', path: '/assistant', title: 'Assistant' },
  { name: 'accounts', path: '/accounts', title: 'Accounts', ready: page => page.getByText('E2E Checking').first() },
  { name: 'transactions', path: '/transactions', title: 'Transactions', ready: page => page.getByText('E2E Lunch').first() },
  { name: 'cash-flow', path: '/income-expenses', title: 'Cash flow' },
  { name: 'reports', path: '/reports', title: 'Reports' },
  { name: 'budget', path: '/budget', title: 'Budget' },
  { name: 'recurring', path: '/upcoming', title: 'Recurring', ready: page => page.getByText('E2E Gym').first() },
  { name: 'goals', path: '/goals', title: 'Goals' },
  { name: 'investments', path: '/assets', title: 'Investments', ready: page => page.getByText('AAPL').first() },
  { name: 'loans-debts', path: '/loans-debts', title: 'Loans & debts', ready: page => page.getByText('E2E Car loan').first() },
  { name: 'recently-deleted', path: '/recently-deleted', title: 'Recently deleted' },
  { name: 'settings', path: '/settings', title: 'Settings' },
];
const signedOut = [
  { name: 'landing', path: '/' },
  { name: 'sign-in', path: '/sign-in' },
];

const variants = [
  { name: 'light', colorScheme: 'light' },
  { name: 'dark', colorScheme: 'dark' },
  { name: 'phone', colorScheme: 'light', viewport: { width: 390, height: 844 } },
  { name: 'rtl', colorScheme: 'light', language: 'ar' },
];

/** Anything still loading: shimmer blocks, skeleton parts and busy regions. */
const loading = '[class*="skeleton"], [data-slot="skeleton"], [aria-busy="true"]';

/** Opens a screen and waits until its records, charts and fonts are in and nothing is still loading. A signed-in
 * account reads its language from Settings; a signed-out visitor's comes from the language selector. */
async function openScreen(page, screen, variant, signedIn) {
  if (variant.language && signedIn) {
    // Saved as Settings saves it; the database is restored before the next test.
    const saved = await page.request.put('/api/settings', { data: { ...settings, language: variant.language } });
    expect(saved.ok()).toBe(true);
  } else if (variant.language) {
    // A visitor's choice in the language selector, which the page keeps in the browser.
    await page.addInitScript(language => localStorage.setItem('hoggish-default-language', language), variant.language);
  }
  await page.goto(screen.path);
  if (variant.language) await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  else if (screen.title) await expect(page).toHaveTitle(`${screen.title} · Hoggish Finance`);
  if (screen.ready) await expect(screen.ready(page)).toBeVisible();
  await expect(page.locator(loading)).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForLoadState('networkidle');
}

/** One test per screen and variant, each comparing the whole page. The drawer is fixed to the window, so below the
 * first screen the picture shows the page behind it. */
function screenTests(screens, signedIn) {
  for (const screen of screens) for (const variant of variants) {
    test(`SHOT ${screen.name} in ${variant.name}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: variant.colorScheme, reducedMotion: 'reduce' });
      if (variant.viewport) await page.setViewportSize(variant.viewport);
      await openScreen(page, screen, variant, signedIn);
      await expect(page).toHaveScreenshot(`${screen.name}-${variant.name}.png`, { fullPage: true });
    });
  }
}

test.beforeEach(async () => { await resetDatabase(); });

test.describe('signed in', () => {
  screenTests(workspace, true);
});

test.describe('signed out', () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  screenTests(signedOut, false);
});
