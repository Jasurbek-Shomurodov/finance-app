"use client";
import { showSaved } from '@/lib/feedback';
import { InfoHint } from '@/components/presentation-foundation/info-hint';
import { Trash2, SlidersHorizontal } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { DiversifiedPortfolioSettings } from '@/components/diversified-portfolio-settings';
import { defaultPortfolioFor, diversifiedPortfolioSchema, portfolioAssets } from '@/lib/diversified-portfolio';
import { useId,useState,useRef } from 'react';
import { useLanguage } from '@/components/language-provider';
import { Button } from '@/components/ui/button';
import { InstrumentPicker } from '@/components/instrument-picker';
import { instrumentOptions } from '@/lib/instrument-catalog';
import { instrumentFor } from '@/lib/market';
import { LoadingPlaceholder } from '@/components/presentation-foundation/loading-placeholder';
import { InlineError } from '@/components/presentation-foundation/inline-error';
import { benchmarkColor,benchmarkPresetColors,defaultBenchmarkColor,defaultComparisonPreferences,type BenchmarkKey,type ComparisonPreferences,type ComparisonProfile } from '@/lib/comparison-profile';
import { ColorChoices } from '@/components/presentation-foundation/color-choices';
import { Popover,PopoverContent,PopoverTrigger } from '@/components/ui/popover';
import { categoryPaletteColors } from '@/lib/category-colors';
import type { CSSProperties } from 'react';

/** The swatch beside a benchmark: shows its line colour and opens the palette to change it. */
function BenchmarkColor({benchmark,label,colors,disabled,onChange}:{benchmark:string;label:string;colors:ComparisonPreferences['colors'];disabled:boolean;onChange:(color:string|null)=>void}){
 const {t}=useLanguage();
 const [open,setOpen]=useState(false);
 return <Popover open={open} onOpenChange={setOpen}><PopoverTrigger type="button" className="benchmark-color" disabled={disabled} aria-label={t('Colour of {name}',{name:label})} style={{'--swatch':benchmarkColor(benchmark,colors)} as CSSProperties}/><PopoverContent align="end" className="benchmark-color-menu"><ColorChoices<string> value={colors?.[benchmark]??null} colors={categoryPaletteColors} presets={benchmarkPresetColors} custom automatic={defaultBenchmarkColor(benchmark)} onChange={(color,live)=>{onChange(color);if(!live)setOpen(false);}}/></PopoverContent></Popover>;
}
import { formatNumber, formatPercent } from '@/lib/format';
import { requestJson } from '@/lib/api-client';
import { useSessionResource } from '@/hooks/use-owner-resource';
const noProfile:ComparisonProfile|null=null;
/** A saved CUSTOM benchmark reads as its stock. */
const draftOf=(saved:ComparisonPreferences):ComparisonPreferences=>({...saved,custom_symbol:'',benchmarks:[...new Set(saved.benchmarks.map(key=>key==='CUSTOM'&&saved.custom_symbol?`STOCK:${saved.custom_symbol}` as BenchmarkKey:key).filter(key=>key!=='CUSTOM'))]});
export function InvestmentComparisonSettings({demo,currencies}:{demo:boolean;currencies:string[]}){
 const {t,locale}=useLanguage();
 const portfolioEditButton=useRef<HTMLButtonElement>(null);
 const [portfolioOpen,setPortfolioOpen]=useState(false);
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
 // The saved profile, the same read as the Overview chart's (one request when both are open); the draft starts from it until it is edited.
 const {data:profile,loading,error,retry}=useSessionResource('/api/comparison-profile',!demo,0,noProfile);
 const [edited,setDraft]=useState<ComparisonPreferences|null>(null);
 const draft=edited??(profile?draftOf(profile.preferences):defaultComparisonPreferences);
 const options=([{key:'BTC',label:'Bitcoin · BTC'},{key:'SPY',label:'S&P 500 · SPY'},{key:'HYG',label:t('High-yield bonds · HYG')},{key:'BIL',label:t('US Treasury bills · BIL')},{key:'depositUZS',label:t('{currency} deposit · {rate}',{currency:'UZS',rate:formatPercent(21,locale)})},{key:'depositUSD',label:t('{currency} deposit · {rate}',{currency:'USD',rate:formatPercent(8,locale)})},{key:'PORTFOLIO',label:t('Diversified portfolio')}] as Array<{key:BenchmarkKey;label:string}>)
  // A deposit benchmark is offered in the account's own currencies (or while it is already chosen), never one country's to everyone.
  .filter(option=>!option.key.startsWith('deposit')||currencies.includes(option.key.slice('deposit'.length))||draft.benchmarks.includes(option.key));
 // Before one is saved, the portfolio offered puts its deposit and cash in the primary currency, never one country's.
 const portfolio=draft.portfolio??defaultPortfolioFor(currencies[0]);
 const portfolioTotal=portfolioAssets(portfolio).reduce((sum,asset)=>sum+asset.weight,0);
 const stockKeys=draft.benchmarks.filter(key=>key.startsWith('STOCK:'));
 const demoNote=useId();
 // Why Save is unavailable: the sample note below already says it for the sample workspace.
 const portfolioReason=diversifiedPortfolioSchema.safeParse(draft.portfolio).success?undefined:Math.abs(portfolioTotal-100)>=1e-8?t('Target weights must add up to {percent}.',{percent:formatPercent(100,locale)}):t('Check each asset in the portfolio.');
 const saveReason=draft.benchmarks.includes('PORTFOLIO')?portfolioReason:undefined;
 const selectedStockSymbols=[...stockKeys.map(key=>key.slice(6)),...draft.benchmarks.filter(key=>key==='SPY'||key==='HYG'||key==='BIL')];
 function recolour(benchmark:string,color:string|null){const colors={...draft.colors};if(color)colors[benchmark]=color;else delete colors[benchmark];setDraft({...draft,colors});setMessage('');}
 async function save(){if(draft.benchmarks.includes('PORTFOLIO')&&!diversifiedPortfolioSchema.safeParse(draft.portfolio).success)return;setBusy(true);setMessage('');try{await requestJson('/api/comparison-profile',{method:'PUT',body:{...draft,portfolio:diversifiedPortfolioSchema.safeParse(draft.portfolio).success?draft.portfolio:null}});showSaved();window.dispatchEvent(new Event('comparison-settings-saved'));return true;}catch(reason){setMessage((reason as Error).message);return false;}finally{setBusy(false);}}
 return <section className="panel settings-form comparison-settings"><h2>{t('Investment benchmarks')}<InfoHint>{t('Choose benchmarks for your investment decisions.')} {t('Compare original purchases or start from recorded investment values on a chosen date. Transfers and reinvested proceeds do not add fresh funding.')}</InfoHint></h2>{loading?<LoadingPlaceholder label={t('Loading settings…')}/>:error?<InlineError message={t(error)} onRetry={retry}/>:<form onSubmit={event=>{event.preventDefault();void save();}}><div className="comparison-settings-options">{options.map(option=><label key={option.key}><input type="checkbox" checked={draft.benchmarks.includes(option.key)} disabled={draft.benchmarks.length===1&&draft.benchmarks.includes(option.key)} onChange={event=>{if(option.key==='PORTFOLIO'&&event.target.checked)setPortfolioOpen(true);setDraft({...draft,portfolio:option.key==='PORTFOLIO'&&event.target.checked?portfolio:draft.portfolio,benchmarks:event.target.checked?[...draft.benchmarks,option.key]:draft.benchmarks.filter(key=>key!==option.key)});}}/>{option.label}<BenchmarkColor benchmark={option.key} label={option.label} colors={draft.colors} disabled={busy} onChange={color=>recolour(option.key,color)}/></label>)}</div>{draft.benchmarks.includes('PORTFOLIO')&&<Button type="button" variant="outline" ref={portfolioEditButton} onClick={()=>setPortfolioOpen(true)}><SlidersHorizontal size={16} aria-hidden="true"/>{t('Edit portfolio')}</Button>}<div className="benchmark-stocks"><div className="benchmark-stocks-heading"><h3>{t('Stock benchmarks')}</h3><span className="benchmark-stock-count">{t('{count} of {limit}',{count:formatNumber(stockKeys.length,locale),limit:formatNumber(10,locale)})}</span></div>{stockKeys.length>0&&<ul className="benchmark-stock-list">{stockKeys.map(key=>{const symbol=key.slice(6),instrument=instrumentOptions('Stock').find(item=>item.symbol===symbol);return <li key={key} className="benchmark-stock-row"><div className="benchmark-stock-identity"><strong>{symbol}</strong>{instrument&&<span>{instrument.name}</span>}</div><BenchmarkColor benchmark={key} label={symbol} colors={draft.colors} disabled={busy} onChange={color=>recolour(key,color)}/><Button type="button" variant="outline" size="icon" className="benchmark-stock-remove" disabled={busy||draft.benchmarks.length===1} title={t('Remove {symbol}',{symbol})} aria-label={t('Remove {symbol}',{symbol})} onClick={()=>{setDraft({...draft,benchmarks:draft.benchmarks.filter(item=>item!==key)});setMessage('');}}><Trash2 size={16} aria-hidden="true"/></Button></li>;})}</ul>}<InstrumentPicker kind="Stock" value="" actionLabel={t('Add stock or ETF')} excludedSymbols={selectedStockSymbols} disabled={busy||stockKeys.length>=10} onChange={value=>{const symbol=instrumentFor({kind:'Stock',name:value})?.symbol;if(!symbol)return;const key:BenchmarkKey=`STOCK:${symbol}`;if(draft.benchmarks.includes(key)||draft.benchmarks.includes(symbol as BenchmarkKey)){setMessage('This stock is already selected.');return;}setDraft({...draft,benchmarks:[...draft.benchmarks,key]});setMessage('');}}/></div><div className="benchmark-settings-footer"><p className="comparison-note">{t('Your investment history stays unchanged.')}</p>{message&&<p role="status">{t(message)}</p>}<span title={busy||demo?undefined:saveReason}><Button aria-describedby={demo?demoNote:undefined} disabled={busy||demo||!!saveReason||(draft.benchmarks.includes('CUSTOM')&&!draft.custom_symbol)} type="submit">{t(busy?'Saving…':'Save comparison choices')}</Button></span></div>{demo&&<p id={demoNote} className="comparison-note">{t('Sign in to save investment comparisons.')}</p>}</form>}<Dialog open={portfolioOpen} onOpenChange={setPortfolioOpen}><DialogContent onCloseAutoFocus={event=>{event.preventDefault();portfolioEditButton.current?.focus();}} className="portfolio-editor-dialog sm:max-w-3xl"><DialogHeader><DialogTitle>{t('Diversified portfolio')}<InfoHint>{t('Add or remove assets and set their allocations. Save to make this portfolio available in Overview.')}</InfoHint></DialogTitle><DialogDescription className="sr-only">{t('Add or remove assets and set their allocations. Save to make this portfolio available in Overview.')}</DialogDescription></DialogHeader><div className="portfolio-editor-body"><fieldset disabled={busy}><DiversifiedPortfolioSettings currencies={currencies} value={portfolio} onChange={portfolio=>{setDraft({...draft,portfolio});setMessage('');}}/></fieldset></div><DialogFooter className="portfolio-editor-footer"><div className="portfolio-editor-status"><p role="status" className={Math.abs(portfolioTotal-100)<1e-8?'':'error'}>{t('Total allocation: {total}',{total:formatPercent(portfolioTotal,locale)})}</p>{message&&<p role="status">{t(message)}</p>}</div><span title={busy?undefined:demo?t('Sign in to save investment comparisons.'):portfolioReason}><Button type="button" disabled={busy||demo||!!portfolioReason} onClick={async()=>{if(await save())setPortfolioOpen(false);}}>{t(busy?'Saving…':'Save comparison choices')}</Button></span></DialogFooter></DialogContent></Dialog></section>;
}
