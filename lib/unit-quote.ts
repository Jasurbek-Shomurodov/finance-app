import type { Entry } from './finance';
import { convertAmount, instrumentFor, instrumentKey, marketRates, quotedUnitPrice, type MarketData } from './market';

/** What a holding's quote depends on: another instrument, currency or metal grade is another quote. */
export const quoteKey = (entry: Pick<Entry, 'id' | 'kind' | 'name' | 'currency' | 'metal' | 'metal_unit' | 'metal_purity'>) =>
 JSON.stringify([entry.id, entry.kind, entry.name, entry.currency, entry.metal, entry.metal_unit, entry.metal_purity]);

/** The current price of one unit of `target` in its own currency, read from a market reply. Throws the reason, as an
 * English key, when the reply holds no usable quote or no rate to the holding's currency. A converted quote keeps a
 * unit quote's eight decimals, never the tail of the division. */
export function unitQuote(target: Entry, data: MarketData): number {
 const instrument = instrumentFor(target);
 if (!instrument) throw Error('Price unavailable. Saved price is shown.');
 const price = quotedUnitPrice(target, data.quotes[instrumentKey(instrument)]);
 if (price === null) throw Error(data.errors[instrumentKey(instrument)] || 'Price unavailable. Saved price is shown.');
 const amount = convertAmount(price, 'USD', target.currency, marketRates(data));
 if (amount === null) throw Error('Exchange rate unavailable.');
 return Math.round(amount * 1e8) / 1e8;
}
