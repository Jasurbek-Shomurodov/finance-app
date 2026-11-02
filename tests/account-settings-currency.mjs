import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { createRenderer, hostModule } from './helpers/component-tree.mjs';

// Saving Settings keeps the display currency chosen in the top bar while it is still preferred (CR 2026-10-23, item 50).
const r = createRenderer();
const { useAccountSettings } = r.load('components/workspace/state/use-account-settings.ts', {
 '@/components/language-provider': { useLanguage: () => ({ language: 'en', setDefaultLanguage() {}, setLanguage() {} }) },
 '@/lib/fonts': { applyFont() {}, resolveFont: font => font }, '@/lib/api-client': hostModule(),
});
let settings;
// The hook's latest value reaches the test through a prop, as a parent would read it.
const Probe = ({ report }) => { report(useAccountSettings(null, true)); return null; };
const preferences = (currencies, extra = {}) => ({ language: 'en', font: 'inter', currencies, onboarded: true, ...extra });

test('a saved preference keeps the current display currency; only a currency that was removed falls back to the primary', () => {
 r.mount(React.createElement(Probe, { report: value => { settings = value; } }));
 settings.applyPreferences(preferences(['USD', 'EUR'])); r.update();
 assert.equal(settings.currency, 'USD');
 settings.setCurrency('EUR'); r.update();
 // Editing "Your name" saves the same currencies again: the top bar stays in euros.
 settings.applyPreferences(preferences(['USD', 'EUR'], { display_name: 'Sam' })); r.update();
 assert.equal(settings.currency, 'EUR');
 // Making the euro primary keeps it too.
 settings.applyPreferences(preferences(['EUR', 'USD'])); r.update();
 assert.equal(settings.currency, 'EUR');
 // Removing it falls back to the new primary.
 settings.applyPreferences(preferences(['GBP', 'USD'])); r.update();
 assert.equal(settings.currency, 'GBP');
 settings.resetSettings(); r.update();
 assert.equal(settings.currency, 'USD');
});

// CONC-010: the reply arrives with loading false, and the screen must not mount until it has been applied, or the form
// keeps the defaults and the first change saves them over the account's language and currencies.
const loadedSettings = reply => {
 const local = createRenderer(), seen = [];
 let resource = { data: null, loading: true, error: '' }, settings;
 const { useAccountSettings: hook } = local.load('components/workspace/state/use-account-settings.ts', {
  '@/components/language-provider': { useLanguage: () => ({ language: 'en', setDefaultLanguage() {}, setLanguage() {} }) },
  '@/lib/fonts': { applyFont() {}, resolveFont: font => font }, '@/lib/api-client': hostModule(),
  '@/hooks/use-owner-resource': { useSessionResource: (url, enabled) => enabled ? resource : { data: null, loading: false, error: '' } },
 });
 const Panel = local.react.memo(({ initial }) => { const [draft] = local.react.useState(initial); seen.push(draft); return null; });
 const Shell = ({ user, demo }) => { settings = hook(user, demo); return settings.settingsLoading ? null : local.react.createElement(Panel, { initial: settings.preferencesData }); };
 return { mount: props => local.mount(local.react.createElement(Shell, props)), arrive: async () => { resource = reply; local.update(); for (let i = 0; i < 3; i++) { await new Promise(resolve => setTimeout(resolve, 0)); local.update(); } }, seen, settings: () => settings, local };
};

test('a screen mounted on a resolved settings read starts from the saved settings, never the defaults', async () => {
 const saved = preferences(['UZS', 'USD'], { language: 'ru', font: 'onest', display_name: 'Sam' });
 const page = loadedSettings({ data: saved, loading: false, error: '' });
 page.mount({ user: 'me@example.com', demo: false });
 assert.deepEqual(page.seen, [], 'nothing mounts while the read is under way');
 await page.arrive();
 assert.ok(page.seen.length > 0);
 assert.ok(page.seen.every(draft => draft.currencies[0] === 'UZS' && draft.language === 'ru'), 'the first render of the form holds the saved row');
 assert.equal(page.settings().currency, 'UZS');
});

test('a failed settings read and the sample workspace do not wait for preferences that never come', async () => {
 const failed = loadedSettings({ data: null, loading: false, error: 'Could not load settings.' });
 failed.mount({ user: 'me@example.com', demo: false });
 await failed.arrive();
 assert.equal(failed.settings().settingsLoading, false);
 assert.equal(failed.settings().settingsError, 'Could not load settings.');
 const sample = loadedSettings({ data: null, loading: true, error: '' });
 sample.mount({ user: null, demo: true });
 assert.equal(sample.settings().settingsLoading, false, 'the sample workspace reads no settings');
 sample.settings().applyPreferences(preferences(['EUR'])); sample.local.update();
 assert.equal(sample.settings().currency, 'EUR');
});

test('signing out forgets the display currency, so the next account opens on its own primary', () => {
 r.mount(React.createElement(Probe, { report: value => { settings = value; } }));
 settings.applyPreferences(preferences(['USD', 'EUR'])); r.update();
 settings.resetSettings(); r.update();
 settings.applyPreferences(preferences(['UZS', 'USD'])); r.update();
 assert.equal(settings.currency, 'UZS', 'still USD when "already applied" survived the sign-out');
});

