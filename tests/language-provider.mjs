import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as jsx from 'react/jsx-runtime';

import {loadTS as load} from './helpers/load-ts.mjs';
const i18n = load('lib/i18n.ts');
// The provider and the test share one copy of the browser's dictionaries.
const translations = load('lib/translations.ts');
// The provider starts in the language the server rendered for this request.
const visitor = { useVisitor: () => ({ signedOut: true, language: 'en' }) };

test('language changes propagate to page, category, date locale, and back to English', async () => {
  let language = 'en';
  const provider = load('components/language-provider.tsx', {
    react: { ...React, useState: () => [language, next => { language = next; }], useEffect: () => {} },
    'react/jsx-runtime': jsx,
    '@/lib/translations': translations, '@/components/visitor-context': visitor,
  });
  let setter;
  function Page() {
    const { t, locale } = provider.useLanguage();
    setter = provider.useLanguage().setLanguage;
    return React.createElement('main', { lang: locale },
      t('Assets & investments'), '|', t('Business'), '|', t('Add record'));
  }
  function render() {
    return renderToStaticMarkup(provider.LanguageProvider({ children: React.createElement(Page) }));
  }
  render();
  for (const lang of ['uz', 'ru', 'ar', 'ja', 'es-MX', 'en']) {
    setter(lang);
    await new Promise(resolve => setTimeout(resolve));
    const html = render();
        assert.ok(html.includes(`lang="${i18n.locales[lang]}"`));
    for (const key of ['Assets & investments', 'Business', 'Add record']) {
      const escaped = renderToStaticMarkup(React.createElement('span', null, i18n.translate(lang, key))).slice(6, -7);
      assert.ok(html.includes(escaped), `${lang}: ${key}`);
      if (lang !== 'en') assert.notEqual(i18n.translate(lang, key), key);
    }
  }
});

test('missing provider cannot silently leave the page in English', () => {
  const provider = load('components/language-provider.tsx', {
    react: React, 'react/jsx-runtime': jsx, '@/lib/translations': translations,
  });
  function Orphan() { provider.useLanguage(); return null; }
  assert.throws(() => renderToStaticMarkup(React.createElement(Orphan)), /within LanguageProvider/);
});

test('the browser language picks the first supported language, with English as the fallback', () => {
  assert.equal(i18n.detectLanguage(['ru-RU', 'en-US']), 'ru');
  assert.equal(i18n.detectLanguage(['uz-Cyrl-UZ']), 'uz');
  assert.equal(i18n.detectLanguage(['es-MX']), 'es-MX');
  assert.equal(i18n.detectLanguage(['es-419']), 'es-MX');
  assert.equal(i18n.detectLanguage(['es-ES']), 'es');
  assert.equal(i18n.detectLanguage(['pt-PT']), 'pt');
  assert.equal(i18n.detectLanguage(['zh-TW']), 'zh');
  assert.equal(i18n.detectLanguage(['fr-CA', 'en']), 'fr');
  assert.equal(i18n.detectLanguage(['hi-IN']), 'hi');
  assert.equal(i18n.detectLanguage(['ur']), 'ur');
  assert.equal(i18n.detectLanguage(['bn-BD']), 'bn');
  assert.equal(i18n.detectLanguage(['th']), 'th');
  assert.equal(i18n.detectLanguage(['vi-VN']), 'vi');
  assert.equal(i18n.detectLanguage(['ar-SA']), 'ar');
  assert.equal(i18n.detectLanguage(['ja', 'ko']), 'ja');
  assert.equal(i18n.detectLanguage(['de-DE', 'uz', 'ru']), 'de');
  assert.equal(i18n.detectLanguage(['fi-FI', 'uz', 'ru']), 'uz');
  assert.equal(i18n.detectLanguage(['tr-TR']), 'tr');
  assert.equal(i18n.detectLanguage(['fil-PH']), 'fil');
  assert.equal(i18n.detectLanguage(['he-IL']), 'he');
  assert.equal(i18n.detectLanguage(['pl', 'en']), 'pl');
  assert.equal(i18n.detectLanguage(['fi-FI', 'sv']), 'en');
  assert.equal(i18n.detectLanguage(['EN-gb']), 'en');
  assert.equal(i18n.detectLanguage(['fi-FI', 'sv']), 'en');
  assert.equal(i18n.detectLanguage([]), 'en');
  assert.equal(i18n.detectLanguage(undefined), 'en');
});

test('a saved default wins over the browser, and the browser is never written as a default', async () => {
  const run = async (saved, languages) => {
    const effects = [], updates = [], stored = [];
    const provider = load('components/language-provider.tsx', {
      react: { ...React, useState: () => ['en', next => updates.push(next)], useEffect: effect => effects.push(effect) },
      'react/jsx-runtime': jsx,
      '@/lib/translations': translations, '@/components/visitor-context': visitor,
    });
    const previous = { localStorage: globalThis.localStorage, window: globalThis.window, queueMicrotask: globalThis.queueMicrotask };
    const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    globalThis.localStorage = { getItem: () => saved, setItem: (key, value) => stored.push([key, value]) };
    globalThis.window = { addEventListener() {}, removeEventListener() {} };
    globalThis.queueMicrotask = callback => callback();
    Object.defineProperty(globalThis, 'navigator', { value: { languages, language: languages[0] }, configurable: true });
    try { provider.LanguageProvider({ children: null }); effects[0](); }
    finally {
      Object.assign(globalThis, previous);
      if (navigatorDescriptor) Object.defineProperty(globalThis, 'navigator', navigatorDescriptor); else delete globalThis.navigator;
    }
    // A language not loaded yet switches once its dictionary arrives.
    await new Promise(resolve => setTimeout(resolve));
    return { updates, stored };
  };
  assert.deepEqual((await run(null, ['ru-RU'])).updates, ['ru']);
  assert.deepEqual((await run(null, ['uz'])).updates, ['uz']);
  assert.deepEqual((await run(null, ['de'])).updates, ['de']);
  assert.deepEqual((await run(null, ['fi'])).updates, []);
  assert.deepEqual((await run('ru', ['en-US'])).updates, ['ru']);
  assert.deepEqual((await run('uz', ['ru-RU'])).updates, ['uz']);
  // A saved value this version does not offer is ignored, so the browser decides.
  assert.deepEqual((await run('xx', ['ru-RU'])).updates, ['ru']);
  assert.deepEqual((await run(null, ['ru-RU'])).stored, []);
});

test('the browser bundles English only and shows another language once its dictionary has arrived', async () => {
  const fresh = load('lib/translations.ts');
  assert.equal(fresh.languageLoaded('en'), true);
  assert.equal(fresh.languageLoaded('ru'), false);
  // Until Russian arrives it reads in English, never as a raw key or an empty string.
  assert.equal(fresh.translate('ru', 'Add record'), i18n.translate('en', 'Add record'));
  await fresh.loadLanguage('ru');
  assert.equal(fresh.translate('ru', 'Add record'), i18n.translate('ru', 'Add record'));
  // Mexican Spanish reads the Spanish file.
  await fresh.loadLanguage('es-MX');
  assert.equal(fresh.languageLoaded('es'), true);
  assert.equal(fresh.translate('es-MX', 'Add record'), i18n.translate('es', 'Add record'));
});

test('the dictionary the server sends with the page makes the first render that language', () => {
  const fresh = load('lib/translations.ts');
  const provider = load('components/language-provider.tsx', {
    react: React, 'react/jsx-runtime': jsx, '@/lib/translations': fresh,
    '@/components/visitor-context': { useVisitor: () => ({ signedOut: true, language: 'de', dictionary: i18n.dictionaries.de }) },
  });
  function Page() { return React.createElement('p', null, provider.useLanguage().t('Add record')); }
  const html = renderToStaticMarkup(React.createElement(provider.LanguageProvider, null, React.createElement(Page)));
  assert.ok(html.includes(i18n.translate('de', 'Add record')));
  assert.equal(fresh.languageLoaded('de'), true);
});

test('a slow dictionary never overrides a later choice', async () => {
  const shown = [];
  let finish;
  const slow = { ...translations, languageLoaded: language => language === 'en', loadLanguage: () => new Promise(resolve => { finish = resolve; }) };
  const provider = load('components/language-provider.tsx', {
    react: { ...React, useState: initial => [initial, next => shown.push(next)], useEffect: () => {} },
    'react/jsx-runtime': jsx, '@/lib/translations': slow, '@/components/visitor-context': visitor,
  });
  let setter;
  function Page() { setter = provider.useLanguage().setLanguage; return null; }
  renderToStaticMarkup(provider.LanguageProvider({ children: React.createElement(Page) }));
  setter('ja');
  setter('en');
  finish();
  await new Promise(resolve => setTimeout(resolve));
  assert.deepEqual(shown, ['en']);
});

test('browser code never imports every dictionary', async () => {
  const { clientImportsOf } = await import('./helpers/client-imports.mjs');
  const reached = clientImportsOf('lib/i18n.ts');
  assert.deepEqual(reached, [], `browser code imports lib/i18n.ts (all thirty languages); use lib/languages and lib/translations:\n${reached.join('\n')}`);
});
