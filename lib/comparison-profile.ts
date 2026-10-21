import type { DiversifiedPortfolio } from './diversified-portfolio';
import { assetKinds, type Entry } from './finance';
import { paletteColor, paletteColors, type PaletteColor } from './business';
import { categoryColor } from './category-colors';
/** Every kind of holding can be compared with a benchmark: the assets of lib/finance.ts. */
export const investmentKinds = assetKinds;
export const benchmarkKeys = ['BTC','SPY','HYG','BIL','depositUZS','depositUSD','CUSTOM','PORTFOLIO'] as const;
export type BenchmarkKey = typeof benchmarkKeys[number] | `STOCK:${string}`;
/** A colour the owner chose for a benchmark line, by benchmark key: a palette name or a `#rrggbb` colour. A benchmark
 * without one keeps its default colour. */
export type BenchmarkColors = Partial<Record<string, PaletteColor | string>>;
export const customColorPattern = /^#[0-9a-fA-F]{6}$/;
/** Ready-made colours offered beside the palette for benchmark lines. */
export const benchmarkPresetColors = ['#0ea5e9','#06b6d4','#10b981','#84cc16','#eab308','#a16207','#f43f5e','#d946ef','#1e40af','#64748b'] as const;
export type ComparisonPreferences = { benchmarks: BenchmarkKey[]; custom_symbol: string; portfolio?: DiversifiedPortfolio | null; colors?: BenchmarkColors };
export type BaselineHolding = { id: string; kind: typeof investmentKinds[number]; currency: string; balance: number };
export type ComparisonBaseline = { starting_amount: number; currency: string; capital_as_of: string; holdings: BaselineHolding[] };
export type ComparisonProfile = { owner_id?: string; activity: { started_at: string; source:'first_visit'|'earliest_record' }; preferences: ComparisonPreferences; baseline: ComparisonBaseline | null; tracking_start: string | null };
export const defaultComparisonPreferences: ComparisonPreferences = { benchmarks:['BTC','SPY','depositUSD'],custom_symbol:'' };

/** Cash is an investment only when it was opted in or sits in an investment account; a plain bank account or wallet is not. */
export const isInvestmentRecord = (record:Entry) => record.kind==='Cash' ? record.is_investment===true||!!record.holding_account_id : (investmentKinds as readonly string[]).includes(record.kind);

const defaultBenchmarkHues:Record<string,string>={BTC:'Crypto',SPY:'Stock',HYG:'Property',BIL:'Treasury bill',depositUZS:'Deposit',depositUSD:'Cash',CUSTOM:'Business',PORTFOLIO:'Money lent'};
/** A benchmark's own colour, used until the owner picks another: a stock benchmark takes the stable colour of its key. */
export const defaultBenchmarkColor=(key:string)=>categoryColor(Object.hasOwn(defaultBenchmarkHues,key)?defaultBenchmarkHues[key]:key);
/** The colour a benchmark line is drawn in: the one chosen for it in Settings, else its default. */
export function benchmarkColor(key:string,colors:BenchmarkColors|undefined,fallback=defaultBenchmarkColor(key)){
 const chosen=colors&&Object.hasOwn(colors,key)?colors[key]:undefined;
 if(chosen&&customColorPattern.test(chosen))return chosen;
 return chosen&&(paletteColors as string[]).includes(chosen)?paletteColor(chosen):fallback;
}
