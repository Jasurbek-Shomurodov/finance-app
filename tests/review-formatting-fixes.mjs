import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// Source-level checks for the small formatting and copy fixes of the 2026-10-23 code review (items 52, 56, 59 and the transaction row's comment).
const read = file => fs.readFileSync(file, 'utf8');
const en = JSON.parse(read('lib/locales/en.json'));

test('percentages are written by formatPercent, never a number with a literal % after it', () => {
 for (const file of ['components/planning/goal-forecast.tsx', 'components/planning/investment-goal-plan.tsx', 'components/investment-comparison.tsx', 'components/investment-comparison-settings.tsx', 'components/diversified-portfolio-settings.tsx']) {
  const source = read(file);
  assert.doesNotMatch(source, /\{\w+\}%'/, file + ' passes a percentage placeholder followed by %');
  assert.match(source, /formatPercent\(/, file);
 }
 for (const key of ['{percent} of target', '{percent} complete', '{currency} deposit · {rate}', 'Total allocation: {total}']) assert.ok(key in en, key);
 for (const key of ['{percent}% of target', '{percent}% complete', '{currency} deposit · {rate}%', 'Total allocation: {total}%']) assert.ok(!(key in en), key + ' is gone');
});

test('the onboarding step counter and goal horizons pass numbers through formatNumber', () => {
 const source = read('components/onboarding-screen.tsx');
 assert.match(source, /current: formatNumber\(step \+ 1, locale, 0\), total: formatNumber\(onboardingSteps\.length, locale, 0\)/);
 assert.match(source, /'In \{years\} years', \{ years: formatNumber\(years, locale, 0\) \}/);
});

test('the variable income hint says the rough guess is counted in forecasts, in every language', () => {
 const key = 'A rough guess for your own reference. Forecasts count it as estimated income.';
 assert.ok(read('components/income-sources-panel.tsx').includes(`t('${key}')`));
 assert.ok(!('A rough guess for your own reference. It is not added to forecasts.' in en));
 for (const file of fs.readdirSync('lib/locales')) assert.equal(typeof JSON.parse(read('lib/locales/' + file))[key], 'string', file);
});

test('the transaction row’s amount comment matches what it shows: the whole payment, with the mortgage split under it', () => {
 const source = read('components/transactions/transaction-row.tsx');
 assert.doesNotMatch(source, /a mortgage payment shows its interest/);
 assert.match(source, /A mortgage payment shows the whole\n \* payment; `MortgageSplit` under it/);
});
