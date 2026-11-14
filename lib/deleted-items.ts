import { expenses, income, type Entry } from './finance';
import type { Goal } from './planning';
import { depositToday } from './deposit-interest';
/** A spending plan deleted before plans became Budget categories (migration 131); restoring one brings it back as a category. */
type DeletedPlan={id:string;name:string;currency:string;amount:number};
/** A split transaction's parts, kept with it in the bin (the `splits` column, migration 035); restored with it. */
export type DeletedSplit={category_id:string;amount:number};
export type DeletedItem = {id:string;deleted_at:string;splits?:DeletedSplit[]} & ({source:'finance_records';data:Entry}|{source:'expense_plans';data:DeletedPlan}|{source:'savings_goals';data:Goal});

/** The type tabs of Recently deleted. A spending plan from before migration 131 shows under All only. */
export const deletedTypes=['transactions','recurring','goals','accounts'] as const;
export type DeletedType=typeof deletedTypes[number];
const flows:readonly string[]=[...income,...expenses];
/** Which tab an item belongs to: one-time income and spending are transactions, scheduled ones recurring, and every other
 * record (cash, holdings, loans and debts) an account. `deletedItemsFilter` asks the database the same question. */
export function deletedItemType(item:DeletedItem):DeletedType|null{
 if(item.source==='savings_goals')return 'goals';
 if(item.source==='expense_plans')return null;
 return flows.includes(item.data.kind)?(item.data.frequency==='Once'?'transactions':'recurring'):'accounts';
}
/** A search as the bin matches it: the characters PostgREST reads as syntax become spaces. */
export const deletedSearchTerm=(search:string)=>search.replace(/[*%,()"\\]/g,' ').replace(/\s+/g,' ').trim().slice(0,100);
const param=(key:string,value:string)=>'&'+encodeURIComponent(key)+'='+encodeURIComponent(value);
const flowList='('+flows.map(kind=>'"'+kind+'"').join(',')+')';
/** PostgREST filters for one tab and a search, as `deletedItemType` and `matchesDeletedSearch` read an item. */
export function deletedItemsFilter(type:DeletedType|null,search:string){
 const term=deletedSearchTerm(search);
 const byType=type==='goals'?param('source','eq.savings_goals')
  :type==='transactions'?param('source','eq.finance_records')+param('data->>kind','in.'+flowList)+param('data->>frequency','eq.Once')
  :type==='recurring'?param('source','eq.finance_records')+param('data->>kind','in.'+flowList)+param('data->>frequency','neq.Once')
  :type==='accounts'?param('source','eq.finance_records')+param('data->>kind','not.in.'+flowList):'';
 return byType+(term?param('data->>name','ilike.*'+term+'*'):'');
}
/** Whether an item's saved name holds the search, ignoring case, as `ilike` does in the database. */
export function matchesDeletedSearch(item:DeletedItem,search:string){
 const term=deletedSearchTerm(search).toLowerCase();
 return !term||String(item.data.name??'').toLowerCase().includes(term);
}
/** The bin's items by the day they were deleted (the app's own calendar day), newest day first, in the order given. */
export function deletedDays(items:readonly DeletedItem[]){
 const days=new Map<string,DeletedItem[]>();
 for(const item of items){const day=depositToday(new Date(item.deleted_at));days.set(day,[...(days.get(day)??[]),item]);}
 return [...days].map(([day,list])=>({day,items:list}));
}
