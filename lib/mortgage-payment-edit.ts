import { decimalSum } from './decimal-amounts';
import { expenses, type Entry } from './finance';
import { applyRecordChange } from './record-balance';
import type { CategoryChoice } from './transaction-rules';

/** A recorded mortgage payment as its form reads and saves it. `account_id` is the cash account that paid it;
 * `category` is set only when the person chose one (a new payment otherwise takes the latest payment's, migration 164). */
export type MortgagePayment = { id: string; mortgage_id: string; principal: number; interest: number; date: string; notes: string; account_id?: string; exchange_rate?: number; category?: CategoryChoice };

/** A payment as the server takes it: the category travels on its own, as a category change. */
export const paymentFields = (payment: MortgagePayment) => ({ id: payment.id, mortgage_id: payment.mortgage_id, principal: payment.principal, interest: payment.interest, date: payment.date, notes: payment.notes,
 ...(payment.account_id ? { account_id: payment.account_id } : {}), ...(payment.exchange_rate !== undefined ? { exchange_rate: payment.exchange_rate } : {}) });

const general: CategoryChoice = { kind: 'Other expense', category_id: null };
const choiceOf = (record: Pick<Entry, 'kind' | 'custom_category_id'>): CategoryChoice => ({ kind: record.kind, category_id: record.custom_category_id ?? null });

/** The transactions a mortgage's payments wrote. A payment row carries the mortgage's name and currency; the
 * database keeps the real link (`mortgage_payments`), which the client rows do not carry. */
export const paymentsOf = (rows: readonly Entry[], mortgage: Pick<Entry, 'name' | 'currency'>) =>
 rows.filter(row => !!row.mortgage_payment_id && row.name === mortgage.name && row.currency === mortgage.currency);

/** The category a new payment on this mortgage starts in: its latest payment's, else Other expense. */
export function latestPaymentCategory(rows: readonly Entry[], mortgage: Pick<Entry, 'name' | 'currency'>): CategoryChoice {
 const latest = paymentsOf(rows, mortgage).filter(row => expenses.includes(row.kind)).sort((a, b) => b.date.localeCompare(a.date))[0];
 return latest ? choiceOf(latest) : general;
}

/** The mortgage a payment row belongs to, by the name and currency the payment copied from it. */
export const mortgageOfPayment = (rows: readonly Entry[], payment: Pick<Entry, 'name' | 'currency'>) =>
 rows.find(row => row.kind === 'Mortgage' && row.name === payment.name && row.currency === payment.currency);

/** A payment row as the form's starting values. */
export const paymentFromRow = (row: Entry, mortgageId: string): MortgagePayment => ({
 id: row.id, mortgage_id: mortgageId, principal: Number(row.payment_principal ?? 0), interest: Number(row.payment_interest ?? 0), date: row.date, notes: row.notes,
 account_id: row.account_id ?? undefined,
});

/** The expense a payment writes, on top of `base` (a fresh entry, or the row being edited so what described it stays). */
export function paymentRow(base: Entry, mortgage: Pick<Entry, 'name' | 'currency'>, payment: MortgagePayment, category: CategoryChoice): Entry {
 return { ...base, id: payment.id, name: mortgage.name, kind: category.kind, custom_category_id: category.category_id, currency: mortgage.currency,
  amount: decimalSum([payment.principal, payment.interest]), date: payment.date, frequency: 'Once', account_id: payment.account_id ?? null, account_exchange_rate: payment.exchange_rate ?? null,
  notes: payment.notes, mortgage_payment_id: payment.id, payment_principal: payment.principal, payment_interest: payment.interest };
}

/** The sample workspace's copy of recording a payment: the mortgage owes the principal less and the cash account
 * pays the total. Too little cash refuses it (`applyRecordChange`). */
export function withPayment(rows: Entry[], base: Entry, payment: MortgagePayment): Entry[] {
 const mortgage = rows.find(row => row.id === payment.mortgage_id);
 if (!mortgage) throw Error('Mortgage not found.');
 const expense = paymentRow(base, mortgage, payment, payment.category ?? latestPaymentCategory(rows, mortgage));
 return applyRecordChange(rows.map(row => row.id === mortgage.id ? { ...row, amount: row.amount - payment.principal } : row), undefined, expense);
}

/** The sample workspace's copy of `edit_mortgage_payment`: the old payment is undone and the new one applied, and
 * the row keeps its category (unless one was chosen), business, owner and tags. */
export function withEditedPayment(rows: Entry[], payment: MortgagePayment): Entry[] {
 const old = rows.find(row => row.id === payment.id && !!row.mortgage_payment_id), mortgage = rows.find(row => row.id === payment.mortgage_id);
 if (!old || !mortgage) throw Error('Payment not found.');
 const owed = mortgage.amount + Number(old.payment_principal ?? 0) - payment.principal;
 if (owed < 0) throw Error('Principal exceeds the outstanding balance.');
 const next = paymentRow(old, mortgage, payment, payment.category ?? choiceOf(old));
 return applyRecordChange(rows.map(row => row.id === mortgage.id ? { ...row, amount: owed } : row), old, next);
}

/** What the form may take from the cash account: its balance, plus what this payment already took from it when the
 * payment being edited was paid from the same account in the mortgage's currency. */
export function availableForPayment(account: Pick<Entry, 'id' | 'amount' | 'currency'>, mortgage: Pick<Entry, 'currency'>, editing?: MortgagePayment): number {
 const sameAccount = !!editing && editing.account_id === account.id && account.currency === mortgage.currency;
 return account.amount + (sameAccount ? decimalSum([editing.principal, editing.interest]) : 0);
}
