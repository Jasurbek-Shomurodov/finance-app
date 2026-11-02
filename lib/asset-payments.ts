import { expenses, income, type Entry } from './finance';
import type { TrackerEvent } from './investment-history';
import { amountIn } from './money';
import { ratesOf } from './transaction-rates';

export type AssetRow = Pick<Entry, 'id' | 'name' | 'kind' | 'amount' | 'currency' | 'date' | 'frequency' | 'notes' | 'account_id' | 'account_currency' | 'account_exchange_rate' | 'day_rates'> & { created_at: string };

const columns = 'id,name,kind,amount,currency,date,frequency,notes,account_id,account_currency,account_exchange_rate,day_rates,created_at';
/** The asset itself and every payment that names it as its business or property: its currency comes from the same read.
 * Tracker copies (`history_event_id`) and transfer legs are left out, since their own event or movement records them. */
export const assetPaymentsQuery = (id: string) => `select=${columns}&or=(id.eq.${id},and(frequency.eq.Once,history_event_id.is.null,movement_id.is.null,operation_id.is.null,mortgage_payment_id.is.null,or(business_id.eq.${id},property_id.eq.${id},income_source_id.eq.${id})))&order=id.asc`;
/** A property's rent schedules. A receipt of one may name only the schedule, as `paymentProperty` reads it. */
export const assetSchedulesQuery = (id: string) => `select=id&kind=eq.Rent%20income&frequency=neq.Once&income_source_id=eq.${id}&order=id.asc`;
/** The payments of those schedules, with the same exclusions as `assetPaymentsQuery`. */
export const schedulePaymentsQuery = (ids: readonly string[]) => `select=${columns}&occurrence_record_id=in.(${ids.join(',')})&frequency=eq.Once&history_event_id=is.null&movement_id=is.null&operation_id=is.null&mortgage_payment_id=is.null&order=id.asc`;

/** A bill paid for a business or property is money invested in it, and an income is what it paid out, without the person
 * recording them twice. Each reads as entered; `amount` is its value in the asset's currency, null when no rate converts it. */
export function assetPaymentEvents(rows: readonly AssetRow[], assetId: string): TrackerEvent[] {
 const asset = rows.find(row => row.id === assetId);
 if (!asset || !['Business', 'Property'].includes(asset.kind)) return [];
 return rows.flatMap(row => {
  const spent = expenses.includes(row.kind);
  if ((!spent && !income.includes(row.kind)) || !row.date) return [];
  const entered = { amount: Number(row.amount), currency: row.currency, name: row.name };
  return [{
   id: row.id, record_id: assetId, event_type: spent ? 'contribution' as const : 'income' as const, occurred_on: row.date, created_at: row.created_at,
   amount: amountIn(entered, asset.currency, ratesOf(row, null)), balance: null, ownership_percentage: 100, principal: 0, interest: 0, notes: row.notes || row.name, entered,
   account_link: row.account_id ? { account_id: row.account_id, amount: spent ? -entered.amount : entered.amount } : null,
  }];
 });
}
