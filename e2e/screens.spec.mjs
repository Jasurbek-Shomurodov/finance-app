// Screenshot tests of every screen, dialog and loading shimmer: the seeded workspace in light, dark, at phone width and right to left in Arabic,
// compared pixel by pixel with the pictures saved beside this file. A layout jump, a theme break or a block that
// changes size fails here even when every figure is right (e2e/p0.spec.mjs checks the figures). The run stands on one
// fixed day (e2e/fixed-clock.mjs), so dates, overdue counts and charts draw the same every time. Pictures depend on
// the system's fonts, so each platform keeps its own set (-darwin, -linux); after an intended change, refresh them
// as docs/agents/database-and-tests.md says.
import fs from 'node:fs';
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

/** The app's own wording in a variant's language, so a dialog opens by the name a person reads (`{name}` filled in). */
const dictionaries = { ar: JSON.parse(fs.readFileSync('lib/locales/ar.json', 'utf8')) };
const wording = language => (key, params = {}) => Object.entries(params).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, value), (language && dictionaries[language][key]) || key);

/** A transaction row opens its details, as on Transactions. */
const openLunch = page => page.getByRole('listitem').getByText('E2E Lunch', { exact: true }).first().click();

/** Every dialog by the screen it opens from and the steps that open it. `t` gives the app's wording in the test's
 * language; `role` is the dialog's own role where it is not `dialog`. */
const dialogs = [
  { name: 'add-expense', screen: 'transactions', open: async (page, t) => { await page.getByRole('button', { name: t('Add transaction') }).click(); await page.getByRole('menuitem', { name: t('Add expense') }).click(); } },
  { name: 'transaction-details', screen: 'transactions', open: page => openLunch(page) },
  { name: 'edit-expense', screen: 'transactions', open: async (page, t) => { await openLunch(page); await page.getByRole('dialog').getByRole('button', { name: t('Edit {name}', { name: 'E2E Lunch' }), exact: true }).click(); } },
  { name: 'delete-expense', screen: 'transactions', role: 'alertdialog', open: async (page, t) => { await openLunch(page); await page.getByRole('dialog').getByRole('button', { name: t('Delete {name}', { name: 'E2E Lunch' }), exact: true }).click(); } },
  { name: 'add-account', screen: 'accounts', open: (page, t) => page.getByRole('button', { name: t('Add account') }).click() },
  { name: 'transfer', screen: 'accounts', open: (page, t) => page.getByRole('button', { name: t('Transfer money') }).click() },
  { name: 'record-payment', screen: 'recurring', open: (page, t) => page.getByRole('button', { name: t('Record payment'), exact: true }).first().click() },
  { name: 'add-recurring', screen: 'recurring', open: async (page, t) => { await page.getByRole('button', { name: t('Add recurring') }).click(); await page.getByRole('menuitem', { name: t('Recurring bill') }).click(); } },
  { name: 'add-goal', screen: 'goals', open: (page, t) => page.getByRole('button', { name: t('Add goal') }).first().click() },
  { name: 'add-asset', screen: 'investments', open: (page, t) => page.getByRole('button', { name: t('Add asset') }).first().click() },
  { name: 'sell-holding', screen: 'accounts', open: async (page, t) => { await page.getByRole('button', { name: `${t('Account actions')}: AAPL` }).click(); await page.getByRole('menuitem', { name: t('Sell / convert') }).click(); } },
  { name: 'add-loan', screen: 'loans-debts', open: (page, t) => page.getByRole('button', { name: t('Add loan or debt') }).click() },
  { name: 'loan-payment', screen: 'loans-debts', open: (page, t) => page.getByRole('button', { name: `${t('Record payment')}: E2E Car loan` }).click() },
  { name: 'customize-dashboard', screen: 'dashboard', open: (page, t) => page.getByRole('button', { name: t('Customize') }).click() },
  { name: 'search', screen: 'dashboard', open: (page, t) => page.getByRole('button', { name: t('Search') }).click() },
  { name: 'budget-settings', screen: 'budget', open: (page, t) => page.getByRole('button', { name: t('Settings'), exact: true }).click() },
];

/** One test per dialog and variant: the screen loads, the dialog opens the way a person opens it, and the window is
 * compared with the dialog standing over its screen. */
function dialogTests() {
  for (const dialog of dialogs) for (const variant of variants) {
    test(`SHOT dialog ${dialog.name} in ${variant.name}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: variant.colorScheme, reducedMotion: 'reduce' });
      if (variant.viewport) await page.setViewportSize(variant.viewport);
      await openScreen(page, workspace.find(screen => screen.name === dialog.screen), variant, true);
      await dialog.open(page, wording(variant.language));
      await expect(page.getByRole(dialog.role ?? 'dialog').last()).toBeVisible();
      // A dialog opened from a menu waits for the menu to finish closing.
      await expect(page.getByRole('menu')).toHaveCount(0);
      await expect(page.locator(loading)).toHaveCount(0);
      await page.evaluate(() => document.fonts.ready);
      // Behind an open dialog a heading can land a fraction of a pixel apart from one run to the next (seen on
      // Accounts in Arabic, 172 pixels of edge shading); a real change to a dialog moves far more than this.
      await expect(page).toHaveScreenshot(`dialog-${dialog.name}-${variant.name}.png`, { maxDiffPixels: 250 });
    });
  }
}

/** Requests the session needs before any screen draws; everything else is a screen's own data. */
const sessionRequests = /\/api\/(auth|settings|household|workspace-preferences|database-status)(\?|$)/;

/** One test per screen for each loading shimmer, in light and at phone width (dark and Arabic only recolour or mirror
 * the same blocks). `data`: a fresh visit whose records never arrive, so the screen keeps its own skeleton. `drawer`:
 * a drawer tap whose route never arrives, so the shimmer from `screenSkeletons` stays. Each is compared with a saved
 * picture, and beside the loaded screen's picture of the same name it shows whether the blocks line up (the
 * shimmer-follows-the-screen rule in docs/agents/interface.md). */
function shimmerTests() {
  for (const screen of workspace) for (const variant of variants.filter(row => row.name === 'light' || row.name === 'phone')) {
    // The Assistant and Settings read no records of their own, so they have no data shimmer.
    if (!['assistant', 'settings'].includes(screen.name)) test(`SHOT shimmer data ${screen.name} in ${variant.name}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: variant.colorScheme, reducedMotion: 'reduce' });
      if (variant.viewport) await page.setViewportSize(variant.viewport);
      // Held, never answered: the test ends with them still waiting.
      await page.route('**/api/**', route => sessionRequests.test(route.request().url()) ? route.continue() : undefined);
      await page.goto(screen.path);
      await expect(page).toHaveTitle(`${screen.title} · Hoggish Finance`);
      await expect(page.locator(loading).first()).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await expect(page).toHaveScreenshot(`shimmer-data-${screen.name}-${variant.name}.png`, { fullPage: true });
    });
    // Settings opens from the account button, not a drawer link.
    if (screen.name !== 'settings') test(`SHOT shimmer drawer ${screen.name} in ${variant.name}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: variant.colorScheme, reducedMotion: 'reduce' });
      if (variant.viewport) await page.setViewportSize(variant.viewport);
      await openScreen(page, screen.name === 'dashboard' ? workspace.find(row => row.name === 'settings') : workspace[0], variant, true);
      await page.route(url => url.pathname === screen.path && url.searchParams.has('_rsc'), () => {});
      if (variant.viewport) await page.getByRole('button', { name: 'Toggle Sidebar' }).click();
      await page.getByRole('navigation').getByRole('link', { name: new RegExp(`^${screen.title.replace('&', '\\&')}`) }).click();
      await expect(page.locator('.topbar[data-pending]')).toBeVisible();
      await expect(page.locator(loading).first()).toBeVisible();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(page).toHaveScreenshot(`shimmer-drawer-${screen.name}-${variant.name}.png`, { fullPage: true });
    });
  }
}

test.beforeEach(async () => { await resetDatabase(); });

test.describe('signed in', () => {
  screenTests(workspace, true);
  dialogTests();
  shimmerTests();
});

test.describe('signed out', () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  screenTests(signedOut, false);
});
