// What every section of the personal financial report reads from a backup: records once each, the period, the
// reporting currency and the shared formatters, and the blocks the report is made of (every label and figure arrives
// formatted). lib/financial-report.ts and lib/financial-report-visuals.ts fill them; lib/report-pdf-layout.ts lays them out.
import { monthEnd } from './calendar-days';
import { depositToday } from './deposit-interest';
import type { MarketData } from './market';
import type { Entry } from './finance';
import { formatDate, formatDateTime, formatMoney, formatPercent } from './format';
import { isCurrency } from './currencies';
import { locales, type Language } from './languages';
import { translate } from './translations';
import { happened } from './transaction-rates';
import { reportCurrencies, reportLedger, reportNumber as number, reportWealth, wealthTotals, type FinanceBackup, type ReportCashFlow, type ReportLedger, type ReportRow, type WealthItem, type WealthTotals } from './report-figures';

/** good is money in or a surplus, bad is a shortfall or an overspend; plain states a figure without judging it. */
export type ReportTone='positive'|'negative'|'plain';
/** A key figure: a caption, the figure, and an optional second figure (a change, an amount behind a rate). */
export type ReportTile={label:string;value:string;detail?:string;tone?:ReportTone};
/** A category's look: its emoji, drawn on a tile in its hue, as `CategoryIcon` shows it in the app. */
export type ReportIcon={emoji:string;hue:number};
/** One node of a Sankey: its name, its amount formatted and as a number, and its icon. */
export type ReportFlowNode={label:string;value:string;amount:number;kind:'income'|'total'|'expense'|'savings';icon?:ReportIcon};
/** One share of a whole: its name, amount, percentage and fraction (0–1), with its category icon. */
export type ReportShare={label:string;value:string;share:string;fraction:number;icon:ReportIcon};
/** One month's pair of bars; null when a transaction in it could not be converted. */
export type ReportBar={label:string;income:number|null;spending:number|null};

export type ReportBlock=
 |{kind:'title'|'heading'|'subheading'|'text';text:string}
 |{kind:'table';text:string;headers:string[];rows:string[][];widths:number[];numeric?:number[]}
 /** The opening of the first page: the report's name, the brand, and the lines under them (period, generated). */
 |{kind:'cover';text:string;brand:string;lines:string[]}
 |{kind:'tiles';text:string;tiles:ReportTile[]}
 /** Income sources into one total, out to spending categories and savings (`sankeyFlows`). */
 |{kind:'sankey';text:string;nodes:ReportFlowNode[];links:Array<{source:number;target:number;value:number}>}
 /** Income and spending per month, with the axis ticks already formatted. */
 |{kind:'bars';text:string;legend:[string,string];bars:ReportBar[];ticks:Array<{value:number;label:string}>;missing?:string}
 /** One figure over time, a point per month (null where none was saved), on formatted ticks; `note` sits under the axis. */
 |{kind:'line';text:string;points:Array<{label:string;value:number|null}>;ticks:Array<{value:number;label:string}>;note?:string}
 /** Short sentences on their own card under a title, each with a dot. */
 |{kind:'list';text:string;items:string[]}
 /** Shares of a whole, each a row with its icon and a bar; `stacked` also draws them as one bar above the rows. */
 |{kind:'shares';text:string;rows:ReportShare[];stacked?:boolean};

/** `dayRates`: each day's official rates (units per US dollar), so combined figures add transactions at their own day's rates. */
export type ReportOptions={currency?:string;dayRates?:Readonly<Record<string,Record<string,number>>>};
export type Block='heading'|'subheading'|'text';
/** What every section reads: the backup's records and tables, the period, the currencies and the shared formatters. */
export type Report={
 t:(key:string,params?:Record<string,string|number>)=>string;na:string;locale:string;
 add:(kind:Block,text:string)=>void;push:(block:ReportBlock)=>void;table:(headers:string[],rows:string[][],widths:number[],numeric?:number[])=>void;issues:Set<string>;
 money:(n:number|null,c:string)=>string;date:(v:unknown)=>string;percent:(n:unknown)=>string;
 tables:Record<string,ReportRow[]>;ledger:ReportLedger;records:Entry[];byId:ReadonlyMap<unknown,ReportRow>;
 today:string;month:string;start:string;end:string;reporting:string;currencies:string[];market:MarketData|null;
 wealth:WealthItem[];flows:Map<string,ReportCashFlow>;consolidated:WealthTotals|null;
};

/** Everything the sections read from a backup: records once each, the period and the reporting currency. */
export function reportContext(backup:FinanceBackup,language:Language,market:MarketData|null,options:ReportOptions,blocks:ReportBlock[]):Report{
 const locale=locales[language],t=(key:string,params?:Record<string,string|number>)=>translate(language,key,params),na=t('Not available');
 const tables:Record<string,ReportRow[]>={...backup.tables,...(backup.income_sources?{income_sources:backup.income_sources}:{})};
 const today=depositToday(new Date(backup.exported_at)),month=today.slice(0,7);
 const read=reportLedger(tables),days=options.dayRates;
 // Each transaction carries its day's rates, as the app's own reads attach them.
 const ledger=days?{...read,records:read.records.map(record=>happened(record,today)?{...record,day_rates:days[record.date]??null}:record)}:read,{records,byId}=ledger;
 const preferred=tables.user_preferences?.[0]?.currencies;
 const reporting=options.currency??(Array.isArray(preferred)?String(preferred[0]):'USD');
 if(!isCurrency(reporting))throw Error('Choose a valid reporting currency.');
 const wealth=reportWealth(records,byId,market);
 // The bundled PDF font has no true minus sign (U+2212), so the report prints negatives with a hyphen.
 const money=(n:number|null,c:string)=>n===null||!Number.isFinite(n)||!isCurrency(c)?na:formatMoney(n,c,locale).replace(/−/g,'-');
 const date=(v:unknown)=>{const input=typeof v==='string'?v:'';const result=input.includes('T')?formatDateTime(input,locale):formatDate(input,locale);return result==='—'?na:result;};
 return {t,na,locale,issues:new Set<string>(),money,date,percent:n=>number(n)===null?na:formatPercent(Number(n),locale,2).replace(/−/g,'-'),
  add:(kind,text)=>{blocks.push({kind,text});},push:block=>{blocks.push(block);},
  table:(headers,rows,widths,numeric=[])=>{if(rows.length)blocks.push({kind:'table',text:'',headers:headers.map(header=>t(header)),rows,widths,numeric});},
  tables,ledger,records,byId,today,month,start:month+'-01',end:monthEnd(month),reporting,market,wealth,flows:new Map(),consolidated:wealthTotals(wealth,reporting,market),
  currencies:reportCurrencies(records,tables)};
}
