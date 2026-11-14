import type { Entry } from './finance';
import { holdingAccountValue, type HoldingAccount } from './holding-accounts';
import { isHolding } from './asset-movements';
import type { MarketData } from './market';
import type { PlanningData } from './planning';

export type DirectoryGroup = 'cash' | 'deposits' | 'investments';
/** One row of the Accounts directory: a cash account or deposit (`record:`), or an investment account (`investment:`).
 * `total` is null when an investment account cannot be valued for missing rates; `count` is its number of holdings. */
export type DirectoryItem = { key: string; id: string; account: Entry | HoldingAccount; total: number | null; group: DirectoryGroup; count: number | null };

export const directoryGroups: ReadonlyArray<readonly [DirectoryGroup, string]> = [['cash', 'Cash'], ['deposits', 'Deposits'], ['investments', 'Investments']];

/** Cash accounts outside an investment account, and deposits: the accounts that hold a balance of their own. */
export const balanceAccounts = (records: readonly Entry[]) => records.filter(record => (record.kind === 'Cash' && !record.holding_account_id) || record.kind === 'Deposit');

/** Stocks and crypto not yet placed in an investment account. */
export const unassignedHoldings = (records: readonly Entry[]) => records.filter(record => ['Stock', 'Crypto'].includes(record.kind) && !record.holding_account_id);

/** Every account in the directory, balances first, before the person's own order is applied. */
export function directoryItems(data: PlanningData, market: MarketData | null): DirectoryItem[] {
 return [
  ...balanceAccounts(data.records).map(account => ({ key: `record:${account.id}`, account, total: account.amount as number | null, group: (account.kind === 'Deposit' ? 'deposits' : 'cash') as DirectoryGroup, count: null as number | null })),
  ...(data.holdingAccounts ?? []).map(account => {
   const { total, holdings } = holdingAccountValue(account, data.records, market);
   return { key: `investment:${account.id}`, account, total, group: 'investments' as DirectoryGroup, count: holdings.filter(isHolding).length };
  }),
 ].map(item => ({ ...item, id: item.account.id }));
}

/** The business an account belongs to; investment accounts have none. */
export const directoryBusiness = (item: DirectoryItem) => 'business_id' in item.account ? item.account.business_id ?? null : null;

/** One total per currency, never added across currencies. A currency's total is null when one of its accounts has none. */
export function currencyTotals(items: readonly DirectoryItem[]) {
 return [...new Set(items.map(item => item.account.currency))].map(currency => {
  const own = items.filter(item => item.account.currency === currency);
  return { currency, total: own.some(item => item.total === null) ? null : own.reduce((sum, item) => sum + (item.total ?? 0), 0) };
 });
}

/** What the savings goals of a cash account hold of its balance; archived goals hold nothing. */
export const allocatedToGoals = (goals: PlanningData['goals'], accountId: string) => goals.filter(goal => goal.account_id === accountId && !goal.archived).reduce((sum, goal) => sum + Number(goal.allocated), 0);

/** Records with their accounts in the person's order: the saved Accounts order first, then the rest as they were
 * created. Only account positions change, so every account picker lists them as the Accounts page does. */
export function inAccountOrder<T extends Entry>(records: readonly T[], ids: readonly string[]): T[] {
 const accounts = new Set<Entry>(balanceAccounts(records));
 const position = new Map(ids.map((id, index) => [id, index]));
 const created = (record: Entry) => (record as { created_at?: string }).created_at ?? '';
 const sorted = [...accounts].sort((a, b) => (position.get(a.id) ?? Infinity) - (position.get(b.id) ?? Infinity) || created(a).localeCompare(created(b)));
 let next = 0;
 return records.map(record => accounts.has(record) ? sorted[next++] as T : record);
}

/** One part of the Accounts mix bar: cash, deposits, or the investment accounts of one kind. `kind` names its colour and label. */
export type MixSegment = { kind: 'Cash' | 'Deposit' | 'Stock' | 'Crypto' | 'Cash investment account'; amount: number };

/** What the listed accounts hold by type, and what of the cash is free to spend (not held for a savings goal), all in
 * one currency through `convert`. Null when a balance has no value or no rate, so no share is drawn from a partial total. */
export function accountMix(items: readonly DirectoryItem[], goals: PlanningData['goals'], convert: (amount: number, from: string) => number | null): { segments: MixSegment[]; available: number } | null {
 const totals = new Map<MixSegment['kind'], number>();
 let available = 0;
 for (const item of items) {
  const value = item.total === null ? null : convert(item.total, item.account.currency);
  if (value === null) return null;
  const kind = item.group === 'cash' ? 'Cash' : item.group === 'deposits' ? 'Deposit' : item.account.kind === 'Cash' ? 'Cash investment account' : item.account.kind as 'Stock' | 'Crypto';
  totals.set(kind, (totals.get(kind) ?? 0) + value);
  if (item.group !== 'cash') continue;
  const held = convert(allocatedToGoals(goals, item.id), item.account.currency);
  if (held === null) return null;
  available += value - held;
 }
 return { segments: [...totals].filter(([, amount]) => amount > 0).map(([kind, amount]) => ({ kind, amount })), available };
}
