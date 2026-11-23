import type { PlanningData } from './planning';

/** Shown when an account cannot be deleted because other items still point to it. */
export const linkedAccountMessage = 'This account has linked transactions, transfers or goals. Delete or move them first, or keep the account.';
/** The database's refusal to delete an account or holding that something still points at (migration 168). Its detail
 * names what: the keys of `blockerLabels`. */
export const linkedRecordMessage = 'This record still has linked items. Delete or move them first, or close it instead.';

/** What can still point at an account or holding and keep it from being deleted, by the database's own names
 * (`record_delete_blockers`), with the words the confirmation shows for each. */
export const blockerLabels = { transactions: 'transactions', schedules: 'recurring income', transfers: 'transfers', payments: 'payments', goals: 'goals', events: 'corporate events', statements: 'reconciled statements' } as const;
export type DeleteBlocker = keyof typeof blockerLabels;
export const isDeleteBlocker = (value: unknown): value is DeleteBlocker => typeof value === 'string' && Object.hasOwn(blockerLabels, value);
/** A refusal's detail ("transactions,goals") as the blockers it names, in the order the confirmation lists them. */
export const blockersFrom = (detail: unknown): DeleteBlocker[] => {
 const named = new Set(String(detail ?? '').split(',').map(part => part.trim()));
 return (Object.keys(blockerLabels) as DeleteBlocker[]).filter(key => named.has(key));
};

type Linked = Pick<PlanningData, 'records' | 'goals' | 'activity' | 'movements' | 'investmentLinks'>;
/** What the loaded data shows still pointing at an account or holding. Its own balance history never blocks: it is
 * deleted and restored with the record. The database gives the final answer (`/api/closing?id=`), since history that
 * is not loaded (an old transaction, a statement, a corporate event) can only be seen there. */
export function deletionBlockers(id: string, data: Linked): DeleteBlocker[] {
 const found: Record<DeleteBlocker, boolean> = {
  transactions: data.records.some(record => record.account_id === id || record.business_id === id),
  schedules: data.records.some(record => record.income_source_id === id),
  transfers: data.activity.some(item => item.account_id === id || item.target_id === id) || (data.movements ?? []).some(item => item.source_id === id || item.target_id === id),
  payments: (data.investmentLinks ?? []).some(item => item.account_id === id || item.investment_history?.record_id === id),
  goals: data.goals.some(goal => goal.account_id === id),
  events: false, statements: false,
 };
 return (Object.keys(blockerLabels) as DeleteBlocker[]).filter(key => found[key]);
}

/** Whether a cash or deposit account is still used by loaded transactions, operations, transfers, goals or investment payments.
 * The database makes the final check, so an account referenced by history that is not loaded is still refused there. */
export function accountHasLinks(id: string, data: Linked): boolean {
 return deletionBlockers(id, data).length > 0;
}
