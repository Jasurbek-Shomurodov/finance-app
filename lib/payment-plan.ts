import { decimalSum } from './decimal-amounts';
import { income, liabilities, type Entry } from './finance';
import { typicalMortgagePayment } from './form-suggestions';
import { availableForPayment, latestPaymentCategory, type MortgagePayment } from './mortgage-payment-edit';
import { upcomingPayments, type DebtPayment, type PlanningData } from './planning';
import { occurrencesBetween, openDueDates, type RecurringItem } from './recurring';
import type { CategoryChoice } from './transaction-rules';

/** What Record payment is asked to open: a loan, debt or mortgage itself, one row of Recurring, a schedule's due date
 * named by a link (`#pay=`), or a recorded mortgage payment to change. */
export type PaymentRequest =
 | { record: Entry; date?: string; /** Opened from the loan itself (Loans, the records table, the expense form): a repayment without interest is kept in the loan's Tracker history, where it can be deleted. */ tracked?: boolean }
 | { item: RecurringItem }
 | { recordId: string; date: string }
 | { record: Entry; editing: MortgagePayment; category?: CategoryChoice };

/** The kinds of obligation: a scheduled income or bill (`occurrence`), a loan, debt or money lent (a `repayment`, or a
 * Tracker withdrawal when it was opened from the loan itself), and a mortgage with its principal and interest. */
export type PaymentKind = 'schedule' | 'debt' | 'mortgage';
/** A request worked out against the planning data: what is paid, how much is still due in its own currency, and what the form starts with. */
export type PaymentPlan = {
 kind: PaymentKind; target: Entry;
 /** A schedule's due date; for a loan or mortgage the day the payment starts on. */
 date: string;
 /** The amount the form starts with: the scheduled amount, or what is still to come of a recorded one. */
 amount: number;
 /** What is still due, in the target's own currency. */
 due: number;
 /** Money that arrives: an income, or a repayment of money lent. */
 incoming: boolean;
 /** Another payment for a due date that is already recorded. */
 extra?: boolean;
 /** A loan or debt opened from its own row: see `PaymentRequest`. */
 tracked?: boolean;
 /** A schedule's open due dates this payment may settle instead, `date` among them. */
 dues?: string[];
 /** The recorded mortgage payment being changed. */
 editing?: MortgagePayment;
 /** The category a mortgage payment starts in. */
 category?: CategoryChoice;
};
type Data = Pick<PlanningData, 'records' | 'occurrences' | 'debtPayments'>;

const debtPlan = (target: Entry, date: string): PaymentPlan => ({ kind: target.kind === 'Mortgage' ? 'mortgage' : 'debt', target, date, amount: 0, due: Number(target.amount), incoming: target.kind === 'Money lent' });
/** A new mortgage payment starts in the category of the mortgage's latest payment. */
const inLatestCategory = (plan: PaymentPlan, data: Data): PaymentPlan => plan.kind === 'mortgage' && !plan.category ? { ...plan, category: latestPaymentCategory(data.records, plan.target) } : plan;

/** What a confirmed loan or mortgage payment adds to the planning data at once: the payment that settles its month
 * (what it paid, in the loan's currency) and the principal the loan owes less. Null for a scheduled payment. */
export function debtPaymentNote(plan: PaymentPlan, draft: PaymentDraft): { payment: DebtPayment; principal: number } | null {
 if (plan.kind === 'schedule' || plan.editing) return null;
 return { payment: { record_id: plan.target.id, date: draft.date, amount: draftTotal(plan, draft), currency: plan.target.currency, account_id: draft.account_id }, principal: plan.kind === 'mortgage' ? draft.principal : draft.amount };
}

/** A Recurring row: a loan's month opens the loan itself; a recorded occurrence takes another payment, starting at what is
 * still to come; an open one starts at its scheduled amount and may settle any open due date of its schedule. */
function itemPlan(item: RecurringItem, data: Data, today: string): PaymentPlan {
 // A loan month is settled by a payment dated in it, so one carried from an earlier month starts on its own due date.
 if (item.installment) return debtPlan(item.record, item.date.slice(0, 7) < today.slice(0, 7) ? item.date : today);
 const incoming = income.includes(item.record.kind);
 if (item.status === 'paid') {
  const amount = Math.max(Math.ceil(item.amount - (item.recorded ?? item.amount)), 0);
  return { kind: 'schedule', target: item.record, date: item.date, amount, due: amount, incoming, extra: true };
 }
 const dues = [...new Set([...openDueDates(data.records, data.occurrences, item.record.id, today), item.date])].sort();
 return { kind: 'schedule', target: item.record, date: item.date, amount: item.amount, due: item.amount, incoming, dues };
}

/** Works a request out, or null when it names nothing that can be paid (a skipped date, a record that is gone). */
export function planPayment(request: PaymentRequest, data: Data, today: string): PaymentPlan | null {
 const plan = requestPlan(request, data, today);
 return plan && inLatestCategory(plan, data);
}
function requestPlan(request: PaymentRequest, data: Data, today: string): PaymentPlan | null {
 if ('item' in request) return request.item.status === 'skipped' ? null : itemPlan(request.item, data, today);
 if ('editing' in request) return { ...debtPlan(request.record, request.editing.date), kind: 'mortgage', editing: request.editing, category: request.category };
 if ('record' in request) return { ...debtPlan(request.record, request.date ?? today), ...(request.tracked && request.record.kind !== 'Mortgage' ? { tracked: true } : {}) };
 const item = occurrencesBetween(data.records, data.occurrences, request.date, request.date, today, data.debtPayments).find(entry => entry.record.id === request.recordId && entry.date === request.date);
 if (item) return item.status === 'skipped' ? null : itemPlan(item, data, today);
 const debt = data.records.find(record => record.id === request.recordId && liabilities.includes(record.kind));
 return debt ? debtPlan(debt, today) : null;
}

/** The form's values. `amount` is the whole payment; a mortgage splits it into `principal` and `interest`, a loan adds
 * `interest` on top of it. `due` is the schedule date it settles and `date` the day it was paid. */
export type PaymentDraft = { id: string; account_id: string; due: string; date: string; amount: number; principal: number; interest: number; notes: string; currency?: string; category?: CategoryChoice };

/** The draft a plan opens on. A scheduled payment is dated its due date, never ahead of today; a mortgage starts as a
 * normal month (the estimated payment split into interest and principal). */
export function paymentDraft(plan: PaymentPlan, id: string, accountId: string, today: string): PaymentDraft {
 if (plan.editing) { const { principal, interest } = plan.editing; return { id: plan.editing.id, account_id: plan.editing.account_id ?? '', due: plan.date, date: plan.editing.date, amount: decimalSum([principal, interest]), principal, interest, notes: plan.editing.notes }; }
 const base = { id, account_id: accountId, due: plan.date, notes: '' };
 if (plan.kind === 'schedule') return { ...base, date: [plan.date, today].sort()[0], amount: plan.amount, principal: 0, interest: 0 };
 const split = plan.kind === 'mortgage' ? typicalMortgagePayment(plan.target) : null;
 return { ...base, date: plan.date, amount: split ? split.principal + split.interest : 0, principal: split?.principal ?? 0, interest: split?.interest ?? 0 };
}

/** Typing the whole mortgage payment keeps the interest and gives the rest to the principal. */
export function withAmount(draft: PaymentDraft, amount: number): PaymentDraft {
 const interest = Math.min(draft.interest, amount);
 return { ...draft, amount, interest, principal: decimalSum([amount, -interest]) };
}
/** Typing one part of the split makes the whole payment follow. */
export const withSplit = (draft: PaymentDraft, part: Partial<Pick<PaymentDraft, 'principal' | 'interest'>>): PaymentDraft => {
 const next = { ...draft, ...part };
 return { ...next, amount: decimalSum([next.principal, next.interest]) };
};

/** What a mortgage owes without the payment being edited. */
export const owedBefore = (plan: PaymentPlan) => plan.due + (plan.editing?.principal ?? 0);
/** The currency the amount is typed in: a scheduled payment's own choice, else the target's. */
export const draftCurrency = (plan: PaymentPlan, draft: PaymentDraft) => (plan.kind === 'schedule' ? draft.currency : undefined) ?? plan.target.currency;
/** What leaves or reaches the cash account, in the currency the amount is typed in. */
export const draftTotal = (plan: PaymentPlan, draft: PaymentDraft) => plan.kind === 'debt' ? decimalSum([draft.amount, draft.interest]) : draft.amount;

export type PaymentField = 'amount' | 'split' | 'date' | 'account';
export type PaymentProblems = Partial<Record<PaymentField, string>>;
type Rate = { needed: boolean; value: number | null; loading?: boolean };

/** The cash account's side of the payment: what it moves in the account's currency (null without a rate) and whether the
 * account holds it. Only a mortgage or a debt paid out is checked; an edited payment from an account in another currency
 * took an amount only the server knows. */
export function cashSide(plan: PaymentPlan, draft: PaymentDraft, account: Entry | undefined, rate: Rate) {
 const moved = !account ? null : !rate.needed ? draftTotal(plan, draft) : rate.value ? draftTotal(plan, draft) / rate.value : null;
 const available = !account ? 0 : plan.kind === 'mortgage' ? availableForPayment(account, plan.target, plan.editing) : Number(account.amount);
 const checked = plan.kind !== 'schedule' && !plan.incoming && !(plan.editing && rate.needed);
 return { moved, available, short: checked && moved !== null && moved > available };
}

/** What stops the save, by field, as English keys, in the order the form shows its fields. A zero scheduled payment
 * is a real one; a loan or mortgage payment needs an amount within what is owed. */
export function paymentProblems({ plan, draft, account, rate, today }: { plan: PaymentPlan; draft: PaymentDraft; account?: Entry; rate: Rate; today: string }): PaymentProblems {
 const problems: PaymentProblems = {};
 if (plan.kind !== 'schedule' && !(draft.amount > 0)) problems.amount = 'Enter an amount greater than zero.';
 else if (plan.kind === 'debt' && draft.amount > plan.due) problems.amount = 'Repayment cannot exceed the outstanding balance.';
 if (plan.kind === 'mortgage' && draft.principal > owedBefore(plan)) problems.split = 'Principal exceeds the outstanding balance.';
 const start = plan.kind === 'schedule' ? plan.target.date : plan.kind === 'mortgage' ? plan.target.opened_on : null;
 if (!draft.date || draft.date > today) problems.date = 'Actual income and expenses cannot be dated in the future.';
 else if (start && draft.date < start) problems.date = 'Payment date cannot precede the start date.';
 if (!account) problems.account = 'Choose a cash account.';
 else if (rate.needed && !rate.value && !rate.loading) problems.account = 'Exchange rate unavailable.';
 else if (cashSide(plan, draft, account, rate).short) problems.account = 'Not enough money in the selected cash account.';
 return problems;
}

/** What is sent, and where: a mortgage payment to its own route, a loan's plain repayment opened from the loan to its
 * Tracker history, anything else as a planning action. */
export type PaymentSave = { path: 'mortgage'; payment: MortgagePayment } | { path: 'tracker'; data: Record<string, unknown> } | { path: 'planning'; action: 'repayment' | 'occurrence'; data: Record<string, unknown> };

/** The payload of a save, exactly as the earlier payment forms sent it: key for key, in their order. `rate` is the dated
 * rate from the account's currency, only when the account's currency differs from the payment's. */
export function paymentSave(plan: PaymentPlan, draft: PaymentDraft, rate: number | null): PaymentSave {
 const fx = rate === null ? {} : { exchange_rate: rate };
 if (plan.kind === 'mortgage') return { path: 'mortgage', payment: { id: draft.id, mortgage_id: plan.target.id, principal: draft.principal, interest: draft.interest, date: draft.date, notes: draft.notes, account_id: draft.account_id, ...(draft.category ? { category: draft.category } : {}), ...fx } };
 const head = { id: draft.id, account_id: draft.account_id, target_id: plan.target.id };
 // Interest is an expense (or income) of its own, which only the repayment action records.
 if (plan.kind === 'debt' && plan.tracked && !(draft.interest > 0)) return { path: 'tracker', data: { id: draft.id, record_id: plan.target.id, type: 'withdrawal', date: draft.date, amount: draft.amount, balance: null, notes: draft.notes, account_id: draft.account_id, ...fx } };
 if (plan.kind === 'debt') return { path: 'planning', action: 'repayment', data: { ...head, date: draft.date, amount: draft.amount, fee: draft.interest, notes: draft.notes, ...fx, received: 0 } };
 return { path: 'planning', action: 'occurrence', data: { ...head, date: draft.due, paid_on: draft.date, amount: draft.amount, fee: 0, notes: draft.notes, ...(draft.currency ? { currency: draft.currency } : {}), ...fx, ...(plan.extra ? { extra: true } : {}), received: 0 } };
}

/** After a payment: the next open due date of the same obligation, or null when none is left. A schedule offers its
 * oldest open date; a loan or mortgage its oldest unpaid month, while something is still owed. */
export function nextPayment(plan: PaymentPlan, draft: PaymentDraft, data: Data, today: string): PaymentPlan | null {
 if (plan.editing || plan.extra) return null;
 if (plan.kind === 'schedule') {
  // The data at hand was read before this payment: its due date is settled now.
  const open = openDueDates(data.records, data.occurrences, plan.target.id, today).filter(date => date !== draft.due);
  const next = open.length ? planPayment({ recordId: plan.target.id, date: open[0] }, data, today) : null;
  return next && { ...next, dues: open };
 }
 const principal = plan.kind === 'mortgage' ? draft.principal : draft.amount, left = decimalSum([plan.due, -principal]);
 if (!data.debtPayments || !(left > 0)) return null;
 const paidMonth = draft.date.slice(0, 7);
 const [open] = upcomingPayments(data.records, data.occurrences, today, today, data.debtPayments).filter(item => item.type === 'installment' && item.record.id === plan.target.id && item.date.slice(0, 7) !== paidMonth);
 return open ? { ...debtPlan({ ...plan.target, amount: left }, open.date.slice(0, 7) < today.slice(0, 7) ? open.date : today), ...(plan.tracked ? { tracked: true } : {}), ...(plan.category ? { category: plan.category } : {}) } : null;
}
