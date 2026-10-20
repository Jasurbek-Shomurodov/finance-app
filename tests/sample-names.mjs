import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadTS } from './helpers/load-ts.mjs';

// The browser loads a language's dictionary before showing it; here every dictionary is added up front.
const translations = loadTS('lib/translations.ts');
for (const file of fs.readdirSync('lib/locales')) translations.addLanguage(file.replace('.json', ''), JSON.parse(fs.readFileSync(`lib/locales/${file}`, 'utf8')));
const { sampleNames, sampleName, sampleWording, renameSample, sampleInLanguage } = loadTS('lib/sample-names.ts', { './translations': translations });
const russian = JSON.parse(fs.readFileSync('lib/locales/ru.json', 'utf8'));
const { demoWorkspace } = loadTS('lib/demo-finance.ts');
const { languageCodes } = loadTS('lib/languages.ts');
const sample = demoWorkspace('2026-10-20');
// Brands, tickers, company names and Latin terms that read the same in every language.
const ownNames = /^(VOO|AAPL|MSFT|NVDA|AMZN|GOOGL|Bitcoin|Ethereum|Solana|401\(k\)|Roth IRA|Coastal Candle Co\.|Lakeside Rentals LLC|Whole Foods|Uber|Costco|Home Depot|Trader Joe's|Amazon|CandleScience|Spotify|Netflix|Daily News digital)$/;

test('every name the sample workspace starts with is translated, or is a brand that keeps its own name', () => {
 const names = [...sample.records, ...sample.goals, ...sample.categories, ...sample.holdingAccounts, ...sample.tags.tags].map(item => item.name);
 const english = sampleNames.map(key => sampleWording('en', key));
 const missing = [...new Set(names)].filter(name => !english.includes(name) && !ownNames.test(name));
 assert.deepEqual(missing, [], 'a new sample name needs an entry in sampleNames and every locale file');
 for (const file of fs.readdirSync('lib/locales')) {
  const dictionary = JSON.parse(fs.readFileSync(`lib/locales/${file}`, 'utf8'));
  for (const name of sampleNames) assert.ok(Object.hasOwn(dictionary, name), `${file}: ${name}`);
 }
 assert.ok(languageCodes.length >= 30);
 assert.ok(english.includes('Pay $50K off the mortgage') && english.includes('Hold 1.5 BTC'), 'figures come from the shared formatters');
 assert.match(sampleWording('ru', 'Reach {amount} net worth'), /1,5\sмлн/, 'in the language own format');
});

test('the sample reads in the visitor language and follows a switch, leaving what the visitor typed alone', () => {
 const inRussian = sampleInLanguage(sample, 'en', 'ru');
 const named = (items, id) => items.find(item => item.id === id).name;
 assert.equal(named(inRussian.records, 'demo-checking'), russian['Everyday checking']);
 assert.notEqual(russian['Everyday checking'], 'Everyday checking');
 assert.equal(named(inRussian.records, 'demo-voo'), 'VOO', 'tickers keep their names');
 assert.notEqual(named(inRussian.goals, 'demo-goal-emergency'), 'Emergency fund');
 assert.notEqual(named(inRussian.categories, 'demo-cat-groceries'), 'Groceries');
 assert.notEqual(named(inRussian.holdingAccounts, 'demo-brokerage'), 'Brokerage account');
 assert.notEqual(inRussian.tags.tags[0].name, 'Keep receipt');
 assert.notEqual(inRussian.records.find(item => item.id === 'demo-biz-candles').notes, sample.records.find(item => item.id === 'demo-biz-candles').notes, 'sample notes too');
 assert.equal(inRussian.occurrences, sample.occurrences);
 // Switching on rewords from the language shown, not from English.
 const german = renameSample(inRussian.records, 'ru', 'de');
 assert.equal(named(german, 'demo-checking'), JSON.parse(fs.readFileSync('lib/locales/de.json', 'utf8'))['Everyday checking']);
 const back = renameSample(german, 'de', 'en');
 assert.deepEqual(back.map(item => [item.name, item.notes]), sample.records.map(item => [item.name, item.notes]), 'a round trip restores every name');
 const typed = { id: 'x', name: 'My own wallet', notes: 'Bought in Tashkent' };
 assert.equal(renameSample([typed], 'en', 'ru')[0], typed, 'an item nothing changed in is the same object');
 assert.equal(sampleName('Everyday checking', 'ru', 'de'), 'Everyday checking', 'an English name shown in Russian was typed by the visitor');
 assert.equal(sampleName('Everyday checking', 'en', 'en'), 'Everyday checking');
});
