import { formatCompactMoney, formatNumber } from './format';
import { locales, type Language } from './languages';
import { translate } from './translations';
import type { DemoWorkspace } from './demo-finance';

/** The names the sample workspace starts with. Each is a key in every locale file, so the sample reads in the visitor's
 * language; brands, tickers, company names and the sample household's people keep their own names. */
export const sampleNames = [
 'Everyday checking', 'High-yield savings', '26-week Treasury bill', '13-week Treasury bill', '12-month CD', '10-year Treasury note',
 'Gold bars', 'Silver coins', 'Family SUV', 'Family home', 'Lakeside rental condo', 'Downtown studio', 'Neighborhood café',
 'Candle Co. checking', 'Rentals operating account', 'Watch collection', 'Loan to a friend', 'Family home mortgage', 'Car loan',
 'Credit card balance', 'Monthly salary', 'Freelance design', 'Annual bonus', 'Quarterly dividends', 'Utilities', 'School tuition',
 'Phone & internet', 'Streaming subscriptions', 'Gym membership', 'Home insurance', 'Car insurance', 'Condo HOA fees', 'Property tax',
 'Monthly donation', 'Pay {amount} off the mortgage', 'Emergency fund', 'Reach {amount} net worth', 'Hold {amount} BTC', 'Product sales', 'Supplies',
 'Shipping', 'Platform fees', 'Advertising', 'Cleaning', 'Repairs & maintenance', 'Property management', 'Groceries', 'Household',
 'Etsy payout', 'Farmers market sales', 'Etsy fees', 'Shipping labels', 'Instagram ads', 'Airbnb payout', 'Cleaning service',
 'Handyman repairs', 'Coffee', 'Lunch', 'Pharmacy', 'Fuel', 'Dinner out', 'Kids\' activities', 'Clothing', 'Movie night',
 'Farmers market', 'Car service', 'Gift for a friend', 'Summer trip flights', 'Keep receipt', 'Summer trip', 'Brokerage account',
 'Crypto wallet', 'Hand-poured candles sold online and at markets.',
] as const;

/** The figures inside goal names, written by the shared formatters in each language ("$50K", "50 тыс. $"). */
const figures: Record<string, (locale: string) => string> = {
 'Pay {amount} off the mortgage': locale => formatCompactMoney(50000, 'USD', locale),
 'Reach {amount} net worth': locale => formatCompactMoney(1500000, 'USD', locale),
 'Hold {amount} BTC': locale => formatNumber(1.5, locale),
};
/** A sample name as `language` words it; English is how the backend serves the sample. */
export const sampleWording = (language: Language, key: string) => translate(language, key, figures[key] ? { amount: figures[key](locales[language]) } : {});

const wordings = new Map<Language, Map<string, string>>();
/** Each sample name as `language` words it, back to its key. */
const keysIn = (language: Language) => {
 let found = wordings.get(language);
 if (!found) wordings.set(language, found = new Map(sampleNames.map(key => [sampleWording(language, key), key])));
 return found;
};

/** A name as the sample worded it in `from`, reworded in `to`. A name the visitor typed or changed stays as it is. */
export function sampleName(name: string, from: Language, to: Language) {
 const key = from === to ? undefined : keysIn(from).get(name);
 return key === undefined ? name : sampleWording(to, key);
}

/** Items with their sample names (and sample notes) reworded; an item nothing changed in is kept as it was. */
export function renameSample<T extends { name: string; notes?: string | null }>(items: T[], from: Language, to: Language): T[] {
 return items.map(item => {
  const name = sampleName(item.name, from, to), notes = item.notes ? sampleName(item.notes, from, to) : item.notes;
  return name === item.name && notes === item.notes ? item : { ...item, name, notes };
 });
}

/** The sample workspace reworded from one language to another: records, goals, categories, investment accounts and tags. */
export function sampleInLanguage(sample: DemoWorkspace, from: Language, to: Language): DemoWorkspace {
 return {
  ...sample,
  records: renameSample(sample.records, from, to), goals: renameSample(sample.goals, from, to), categories: renameSample(sample.categories, from, to),
  holdingAccounts: renameSample(sample.holdingAccounts, from, to), tags: { ...sample.tags, tags: renameSample(sample.tags.tags, from, to) },
 };
}
