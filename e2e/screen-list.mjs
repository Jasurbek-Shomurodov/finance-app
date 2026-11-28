// The screens and dialogs the browser tests visit, shared by the screenshot tests (screens.spec.mjs) and the
// accessibility check (accessibility.spec.mjs), so both walk the same list.

/** Every screen by its route, with the drawer word its title starts with. `ready` is a piece of the fixture the
 * loaded screen shows, waited for before the picture. */
export const workspace = [
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
export const signedOut = [
  { name: 'landing', path: '/' },
  { name: 'sign-in', path: '/sign-in' },
];

/** A transaction row opens its details, as on Transactions. */
export const openLunch = page => page.getByRole('row').getByText('E2E Lunch', { exact: true }).first().click();

/** Every dialog by the screen it opens from and the steps that open it. `t` gives the app's wording in the test's
 * language; `role` is the dialog's own role where it is not `dialog`. */
export const dialogs = [
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

