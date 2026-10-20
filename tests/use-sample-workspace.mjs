import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRenderer } from './helpers/component-tree.mjs';
import { loadTS } from './helpers/load-ts.mjs';

const { demoWorkspace } = loadTS('lib/demo-finance.ts');
// The browser loads a language's dictionary before showing it; here the two the test switches between are added.
const translations = loadTS('lib/translations.ts');
const words = Object.fromEntries(['ru', 'de'].map(code => [code, JSON.parse(fs.readFileSync(`lib/locales/${code}.json`, 'utf8'))]));
for (const [code, dictionary] of Object.entries(words)) translations.addLanguage(code, dictionary);
const sampleNames = loadTS('lib/sample-names.ts', { './translations': translations });
const sampleName = (name, from, to) => from === 'en' && to !== 'en' ? words[to][name] : sampleNames.sampleName(name, from, to);

test('the sample workspace is seeded in the visitor language and reworded on a switch only while it is open', () => {
 const renderer = createRenderer();
 const { useSampleWorkspace } = renderer.load('components/workspace/state/use-sample-workspace.ts', { '@/lib/sample-names': sampleNames });
 let rows = [], api = null;
 const setRows = next => { rows = typeof next === 'function' ? next(rows) : next; };
 const Probe = props => { api = useSampleWorkspace({ ...props, setRows }); return null; };
 const show = props => renderer.render(renderer.react.createElement(Probe, props));
 const named = (items, id) => items.find(item => item.id === id).name;

 show({ demo: false, language: 'ru' });
 const seeded = api.seedSample(demoWorkspace('2026-10-20'));
 rows = seeded.records;
 show({ demo: true, language: 'ru' });
 assert.equal(named(rows, 'demo-checking'), sampleName('Everyday checking', 'en', 'ru'), 'seeded in the visitor language');
 assert.equal(named(api.demoHoldingAccounts, 'demo-brokerage'), sampleName('Brokerage account', 'en', 'ru'));
 assert.equal(named(api.demoPlanning.goals, 'demo-goal-emergency'), sampleName('Emergency fund', 'en', 'ru'));

 show({ demo: true, language: 'de' });
 assert.equal(named(rows, 'demo-checking'), sampleName('Everyday checking', 'en', 'de'), 'a switch rewords the records');
 assert.equal(named(api.demoHoldingAccounts, 'demo-crypto-wallet'), sampleName('Crypto wallet', 'en', 'de'));
 assert.equal(named(api.demoPlanning.goals, 'demo-goal-emergency'), sampleName('Emergency fund', 'en', 'de'));
 assert.equal(named(api.demoPlanning.categories, 'demo-cat-groceries'), sampleName('Groceries', 'en', 'de'));
 assert.equal(api.demoTags.tags[0].name, sampleName('Keep receipt', 'en', 'de'));

 // Signed in (no sample open), a switch leaves the records alone.
 show({ demo: false, language: 'en' });
 assert.equal(named(rows, 'demo-checking'), sampleName('Everyday checking', 'en', 'de'));
 api.clearSample();
 show({ demo: false, language: 'en' });
 assert.deepEqual([api.demoHoldingAccounts, api.demoPlanning.goals, api.demoTags.tags], [[], [], []]);
});
