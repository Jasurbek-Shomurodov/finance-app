import { z } from 'zod';

const legacyAllocationKinds = ['crypto','stock','deposit','business','cash'] as const;
export const allocationKinds = [...legacyAllocationKinds,'property','custom'] as const;
const portfolioAssetSchema = z.object({
 id:z.string().regex(/^[a-zA-Z0-9_-]{1,50}$/),
 kind:z.enum(allocationKinds),
 currency:z.string().regex(/^[A-Z]{3}$/).optional(),
 name:z.string().trim().max(100).default(''),
 weight:z.number().finite().min(0).max(100),
 symbol:z.string().regex(/^$|^[A-Z][A-Z0-9.-]{0,14}$/).default(''),
 rate:z.number().finite().min(0).max(1000).default(0),
}).refine(asset=>!['stock','crypto'].includes(asset.kind)||!!asset.symbol).refine(asset=>asset.kind!=='crypto'||/^[A-Z][A-Z0-9]{0,14}$/.test(asset.symbol));
export type PortfolioAsset = z.infer<typeof portfolioAssetSchema>;
export const diversifiedPortfolioSchema = z.object({
 assets:z.array(portfolioAssetSchema).min(1).max(20).refine(assets=>new Set(assets.map(asset=>asset.id)).size===assets.length).optional(),
 crypto: z.number().finite().min(0).max(100),
 stock: z.number().finite().min(0).max(100),
 deposit: z.number().finite().min(0).max(100),
 business: z.number().finite().min(0).max(100),
 cash: z.number().finite().min(0).max(100),
 cryptoSymbol: z.string().regex(/^[A-Z][A-Z0-9]{0,14}$/),
 stockSymbol: z.string().regex(/^[A-Z][A-Z0-9.-]{0,14}$/),
 businessRate: z.number().finite().min(0).max(1000),
}).refine(value => Math.abs((value.assets?value.assets.reduce((sum,asset)=>sum+asset.weight,0):legacyAllocationKinds.reduce((sum,key)=>sum+value[key],0))-100)<1e-8);
export type DiversifiedPortfolio = z.infer<typeof diversifiedPortfolioSchema>;
export const defaultDiversifiedPortfolio: DiversifiedPortfolio = {crypto:20,stock:20,deposit:20,business:20,cash:20,cryptoSymbol:'BTC',stockSymbol:'SPY',businessRate:0};

/** The portfolio's sleeves. A row saved before sleeves were listed (`assets` missing) keeps its one deposit as it was
 * stored, in UZS at 21%, so the history under `depositUZS` still reads. With `currency`, the owner's primary currency, the
 * same five sleeves are built fresh: deposit and cash in that currency, the deposit at no interest until a rate is entered. */
export function portfolioAssets(portfolio:DiversifiedPortfolio,currency?:string):PortfolioAsset[] {
 const local=(kind:typeof legacyAllocationKinds[number])=>currency&&(kind==='deposit'||kind==='cash')?currency:kind==='deposit'?'UZS':'USD';
 return portfolio.assets??legacyAllocationKinds.map(kind=>({id:kind,kind,name:'',weight:portfolio[kind],symbol:kind==='stock'?portfolio.stockSymbol:kind==='crypto'?portfolio.cryptoSymbol:'',currency:local(kind),rate:kind==='business'?portfolio.businessRate:kind==='deposit'&&!currency?21:0}));
}
/** The mix offered before any portfolio is saved: five equal sleeves listed as assets, in the owner's primary `currency`
 * (languages.md: never preselect a local currency for everyone). Saving it stores these sleeves, never the legacy deposit. */
export function defaultPortfolioFor(currency:string):DiversifiedPortfolio {
 return {...defaultDiversifiedPortfolio,assets:portfolioAssets(defaultDiversifiedPortfolio,currency||'USD')};
}
export function portfolioAssetKey(asset:PortfolioAsset,portfolio:DiversifiedPortfolio) {
 return portfolio.assets?'portfolio_'+asset.id:({crypto:'portfolioCrypto',stock:'portfolioStock',business:'portfolioBusiness',cash:'portfolioCash',deposit:'depositUZS',property:'portfolioProperty',custom:'portfolioCustom'} as const)[asset.kind];
}

/** Market-priced portfolio assets and the key their price history is stored under. */
export function portfolioQuotes(portfolio:DiversifiedPortfolio) {
 return portfolioAssets(portfolio).filter(asset=>['stock','crypto'].includes(asset.kind)&&!!asset.symbol&&asset.weight>0).map(asset=>({key:portfolioAssetKey(asset,portfolio),symbol:asset.symbol}));
}

export function portfolioAssetCurrency(asset:PortfolioAsset){return asset.currency??(asset.kind==='deposit'?'UZS':'USD');}
