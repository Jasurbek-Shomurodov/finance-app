// The live figure beside a holding's value on Investments, and the sums of them the page shows: what a unit-priced
// holding gained since it was bought, and what rentals, businesses and interest-bearing assets bring in a month.
import { earnsIn, interestKinds, unitPricedKinds, type Entry } from './finance';

/** What a unit-priced holding gained since it was bought, in its own currency; null without a purchase cost. */
export const holdingGain = (record: Entry): number | null => unitPricedKinds.includes(record.kind) && record.cost > 0 ? (record.amount - record.cost) * record.quantity : null;

/** Whether an asset counts as monthly income in `month` (YYYY-MM): a rental, business or interest-bearing holding with an
 * estimate, until its term ends. Cash flow's income cards and Investments read the same rule. */
export const earnsMonthly = (entry: Entry, month: string) => ['Business', 'Property', ...interestKinds].includes(entry.kind) && (entry.estimated_monthly_income ?? 0) > 0 && earnsIn(entry, month);

/** A holding as saved and in the display currency, or null there when it has no rate. */
export type PricedHolding = { original: Entry; converted: Entry | null };
/** A figure added over several holdings: `amount` in the display currency, null when one of them has no rate; `count`
 * is how many holdings it adds (0 when none has the figure). */
export type HoldingSum = { amount: number | null; count: number };

function added(holdings: readonly PricedHolding[], figure: (record: Entry) => number | null): HoldingSum {
 let amount: number | null = 0, count = 0;
 for (const { original, converted } of holdings) {
  if (figure(original) === null) continue;
  count += 1;
  const shown = converted && figure(converted);
  amount = amount === null || shown === null || shown === undefined ? null : amount + shown;
 }
 return { amount, count };
}

/** The gains since bought of the holdings that have a purchase cost, added in the display currency. */
export const gainSinceBought = (holdings: readonly PricedHolding[]) => added(holdings, holdingGain);

/** What the earning assets bring in `month`, added in the display currency. */
export const monthlyAssetIncome = (holdings: readonly PricedHolding[], month: string) => added(holdings, record => earnsMonthly(record, month) ? record.estimated_monthly_income ?? 0 : null);
