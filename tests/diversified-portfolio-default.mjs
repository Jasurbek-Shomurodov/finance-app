import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadTS } from './helpers/load-ts.mjs';

const { defaultDiversifiedPortfolio, defaultPortfolioFor, diversifiedPortfolioSchema, portfolioAssets, portfolioAssetKey, portfolioAssetCurrency } = loadTS('lib/diversified-portfolio.ts');
const sleeve = (assets, kind) => assets.find(asset => asset.kind === kind);

// languages.md: never preselect a local currency for everyone (CR 2026-10-23, item 25).
test('the portfolio offered before one is saved puts its deposit and cash in the owner’s primary currency at no interest', () => {
 const offered = defaultPortfolioFor('EUR');
 assert.ok(diversifiedPortfolioSchema.safeParse(offered).success);
 assert.deepEqual(offered.assets.map(asset => [asset.kind, asset.currency, asset.rate, asset.weight]), [['crypto', 'USD', 0, 20], ['stock', 'USD', 0, 20], ['deposit', 'EUR', 0, 20], ['business', 'USD', 0, 20], ['cash', 'EUR', 0, 20]]);
 assert.equal(portfolioAssetKey(sleeve(offered.assets, 'deposit'), offered), 'portfolio_deposit', 'saved as listed sleeves, never the legacy deposit');
 assert.equal(sleeve(portfolioAssets(defaultDiversifiedPortfolio, 'GBP'), 'deposit').currency, 'GBP');
 assert.equal(sleeve(defaultPortfolioFor('').assets, 'cash').currency, 'USD', 'no preferred currency yet: dollars, as elsewhere');
 assert.doesNotMatch(fs.readFileSync('components/diversified-portfolio-settings.tsx', 'utf8'), /'UZS'|depositUZS/, 'the editor names no country’s currency');
});

test('a portfolio stored before sleeves were listed keeps its UZS deposit at 21%, so its depositUZS history still reads', () => {
 const legacy = { ...defaultDiversifiedPortfolio, deposit: 40, cash: 0 };
 const deposit = sleeve(portfolioAssets(legacy), 'deposit');
 assert.deepEqual([deposit.currency, deposit.rate, deposit.weight, portfolioAssetKey(deposit, legacy), portfolioAssetCurrency(deposit)], ['UZS', 21, 40, 'depositUZS', 'UZS']);
 assert.equal(sleeve(portfolioAssets(legacy), 'cash').currency, 'USD');
 assert.match(fs.readFileSync('components/investment-comparison-settings.tsx', 'utf8'), /draft\.portfolio\?\?defaultPortfolioFor\(currencies\[0\]\)/);
});
