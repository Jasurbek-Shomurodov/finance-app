// Closed accounts and holdings (migration 168, product map "Closing and deleting accounts"). A closed record keeps its
// history up to `closed_on` and counts nothing from that day. It is worth nothing (the database holds it at zero), so
// every total, allocation and snapshot leaves it out by itself; what is left to the app is to keep it out of the lists
// and pickers people choose from, and to show it under "Closed" with a way back.
import { assets, isCounted, liabilities, unitPricedKinds, type Entry } from './finance';
import type { HoldingAccount } from './holding-accounts';

/** The kinds that can be closed: everything that has a balance. */
export const closableKinds: readonly string[] = [...assets, ...liabilities];
export const isClosable = (record: Pick<Entry, 'kind'>) => closableKinds.includes(record.kind);
export const isClosed = (item: { closed_on?: string | null }) => !!item.closed_on;
export const openOnly = <T extends { closed_on?: string | null }>(items: readonly T[]): T[] => items.filter(item => !item.closed_on);
/** Closed items, the latest closing first. */
export const closedOnly = <T extends { closed_on?: string | null }>(items: readonly T[]): T[] =>
 items.filter(isClosed).sort((a, b) => String(b.closed_on).localeCompare(String(a.closed_on)));

/** Nothing is left in it: closing needs this (the database's own rule, `guard_closed_record`). A holding sold out to
 * zero units is empty whatever its last price. */
export const isEmptyRecord = (record: Pick<Entry, 'kind' | 'amount' | 'quantity' | 'unit_label'>) =>
 unitPricedKinds.includes(record.kind) || isCounted(record) ? Number(record.quantity) === 0 || Number(record.amount) === 0 : Number(record.amount) === 0;

/** A cash account or deposit can send what is left to another account as it closes; anything else is brought to zero
 * first (sold, moved or revalued). */
export const closesWithTransfer = (record: Pick<Entry, 'kind'>) => record.kind === 'Cash' || record.kind === 'Deposit';
/** Where a closing account's balance can go: the open cash accounts and deposits in its own currency. */
export const closingTargets = (record: Entry, records: readonly Entry[]) =>
 records.filter(other => other.id !== record.id && !other.closed_on && closesWithTransfer(other) && other.currency === record.currency);
/** The transfer that empties a closing account, as the movement route takes it: the whole balance, dated the closing day. */
export const closingTransfer = (id: string, record: Pick<Entry, 'id' | 'amount'>, targetId: string, date: string) =>
 ({ id, kind: 'transfer' as const, source_id: record.id, target_id: targetId, sent: Number(record.amount), received: Number(record.amount), source_value: Number(record.amount), target_value: Number(record.amount), fee: 0, date, notes: '' });

type Lists = { records: Entry[]; holdingAccounts?: HoldingAccount[] };
/** The planning data as screens read it: closed records and investment accounts leave `records` and `holdingAccounts`
 * (so no picker, list or "what is left" figure offers them) and wait in `closed` and `closedAccounts`. */
export function splitClosed<T extends Lists>(data: T): T & { closed: Entry[]; closedAccounts: HoldingAccount[] } {
 const accounts = data.holdingAccounts ?? [];
 if (!data.records.some(isClosed) && !accounts.some(isClosed)) return { ...data, closed: [], closedAccounts: [] };
 return { ...data, records: openOnly(data.records), closed: closedOnly(data.records), ...(data.holdingAccounts ? { holdingAccounts: openOnly(accounts) } : {}), closedAccounts: closedOnly(accounts) };
}

/** A record by id among the open and the closed ones: a past transaction still names the account it was paid from. */
export const recordAmong = (id: string | null | undefined, data: { records: readonly Entry[]; closed?: readonly Entry[] }) =>
 id ? data.records.find(record => record.id === id) ?? data.closed?.find(record => record.id === id) : undefined;

/** What an investment account still holds, for its Close dialog: the holdings that would move or close with it, and
 * whether every one of them is empty (only then can they close with it). */
export function accountHoldings(account: Pick<HoldingAccount, 'id'>, records: readonly Entry[]) {
 const holdings = records.filter(record => record.holding_account_id === account.id && !record.closed_on);
 return { holdings, allEmpty: holdings.every(isEmptyRecord) };
}

/** Said instead of the delete confirmation when an investment account still names holdings (the database's own words). */
export const accountHoldsMessage = 'This account still has holdings. Move or delete them first, or close the account instead.';
/** Whether any holding, open or closed, still sits in an investment account: such an account is closed, not deleted. */
export const accountHasHoldings = (account: Pick<HoldingAccount, 'id'>, data: { records: readonly Entry[]; closed?: readonly Entry[] }) =>
 [...data.records, ...(data.closed ?? [])].some(record => record.holding_account_id === account.id);

/** The sample workspace's own close and reopen: the same rules the database keeps, on local rows. */
export function closeLocally(rows: readonly Entry[], id: string, closedOn: string, targetId?: string | null): Entry[] {
 const record = rows.find(row => row.id === id);
 if (!record) return [...rows];
 const moved = targetId && !isEmptyRecord(record) ? Number(record.amount) : 0;
 if (!moved && !isEmptyRecord(record)) throw Error('Bring the balance to zero before closing.');
 return rows.map(row => row.id === id ? { ...row, amount: moved ? 0 : row.amount, closed_on: closedOn } : moved && row.id === targetId ? { ...row, amount: Number(row.amount) + moved } : row);
}
export const reopenLocally = (rows: readonly Entry[], id: string): Entry[] => rows.map(row => row.id === id ? { ...row, closed_on: null } : row);
