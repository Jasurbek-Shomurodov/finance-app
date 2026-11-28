// Accessibility check of every screen, the signed-out pages and every dialog, in light and dark: axe-core's WCAG 2.1
// A and AA rules, run in the page. A screen that breaks one (a contrast below 4.5:1, a label on an element that
// cannot have one, a list with a button for an item) fails here with the rule and the element named.
import fs from 'node:fs';
import { expect, test } from './test.mjs';
import { resetDatabase } from './helpers.mjs';
import { dialogs, signedOut, workspace } from './screen-list.mjs';

const axe = fs.readFileSync('node_modules/axe-core/axe.min.js', 'utf8');
const loading = '[class*="skeleton"], [data-slot="skeleton"], [aria-busy="true"]';
const schemes = ['light', 'dark'];

/** The rules a page breaks, each with the first elements that break it. */
async function violations(page) {
  // Contrast is read from the colours on screen: a dialog fading in, or a menu fading out, is checked once it has finished.
  await page.waitForFunction(() => document.getAnimations().every(animation => animation.playState !== 'running'));
  await page.addScriptTag({ content: axe });
  return page.evaluate(async () => (await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] })).violations
    .map(rule => `${rule.id}: ${rule.nodes.slice(0, 3).map(node => `${node.target.join(' ')} (${(node.failureSummary ?? '').split('\n')[1]?.trim().slice(0, 110)})`).join(', ')}`));
}

async function open(page, screen, scheme) {
  await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
  await page.goto(screen.path);
  if (screen.ready) await expect(screen.ready(page)).toBeVisible();
  await expect(page.locator(loading)).toHaveCount(0);
  await page.waitForLoadState('networkidle');
}

test.beforeEach(async () => { await resetDatabase(); });

test.describe('signed in', () => {
  for (const screen of workspace) for (const scheme of schemes) test(`A11Y ${screen.name} in ${scheme}`, async ({ page }) => {
    await open(page, screen, scheme);
    expect(await violations(page)).toEqual([]);
  });
  // Each Settings section opens by its address.
  for (const section of ['telegram', 'security', 'household', 'categories', 'tags', 'rules', 'businesses', 'benchmarks', 'data-tools']) for (const scheme of schemes) test(`A11Y settings ${section} in ${scheme}`, async ({ page }) => {
    await open(page, { path: '/settings#' + section }, scheme);
    expect(await violations(page)).toEqual([]);
  });
  for (const dialog of dialogs) for (const scheme of schemes) test(`A11Y dialog ${dialog.name} in ${scheme}`, async ({ page }) => {
    await open(page, workspace.find(screen => screen.name === dialog.screen), scheme);
    await dialog.open(page, (key, params = {}) => Object.entries(params).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, value), key));
    await expect(page.getByRole(dialog.role ?? 'dialog').last()).toBeVisible();
    await expect(page.getByRole('menu')).toHaveCount(0);
    await expect(page.locator(loading)).toHaveCount(0);
    expect(await violations(page)).toEqual([]);
  });
});

test.describe('signed out', () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  for (const screen of signedOut) for (const scheme of schemes) test(`A11Y ${screen.name} in ${scheme}`, async ({ page }) => {
    await open(page, screen, scheme);
    expect(await violations(page)).toEqual([]);
  });
});
