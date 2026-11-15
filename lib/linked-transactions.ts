import type { Entry } from './finance';

/** A transaction written by a larger action: a transfer or trade, an account operation, a mortgage payment or an asset
 * tracker update. Its category, business and tags change like any transaction's and a mortgage payment has its own
 * Edit (migration 164); the amounts of the others change by deleting, which undoes the whole action (migration 126). */
export const isLinkedTransaction = (record: Pick<Entry, 'movement_id' | 'operation_id' | 'mortgage_payment_id' | 'history_event_id'>) =>
 !!(record.movement_id || record.operation_id || record.mortgage_payment_id || record.history_event_id);

/** What wrote a linked transaction that has no form of its own, as an English key; null for a mortgage payment
 * (its details name the mortgage) and for a plain transaction. */
export function linkedSourceLabel(record: Pick<Entry, 'movement_id' | 'operation_id' | 'mortgage_payment_id' | 'history_event_id'>) {
 if (record.mortgage_payment_id) return null;
 if (record.operation_id) return 'Transfer or repayment fee';
 if (record.movement_id) return 'Asset transfer';
 return record.history_event_id ? 'Asset tracker update' : null;
}
