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
