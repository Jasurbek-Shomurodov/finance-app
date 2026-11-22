import { cashFlowAmountMissing, requiresCashAccount } from './cash-account-required';
import { depositToday } from './deposit-interest';
import { isBusinessAccount } from './business';
import { expenses, income, liabilities, simpleInterestKinds, type Entry } from './finance';
import { scheduledPaymentDue, type Occurrence } from './planning';

const today = depositToday;

/** A blank record for a form to fill in, dated today. */
export const freshEntry = (): Entry => ({ id: crypto.randomUUID(), name: '', kind: 'Cash', currency: 'USD', amount: 0, quantity: 1, cost: 0, rate: 0, date: today(), lent_date: today(), frequency: 'Once', notes: '', business_id: null, ownership_percentage: 100, estimated_monthly_income: 0, estimated_monthly_payment: 0 });

/** The income source a saved receipt named, kept for the next one: its name, the source or plan, and the due date the
 * form then moves to the next open one. */
const keptSource = (saved: Entry): Partial<Entry> => income.includes(saved.kind) && (saved.earning_source_id || saved.income_source_id || saved.business_id)
 ? { name: saved.name, earning_source_id: saved.earning_source_id, payment_type: saved.payment_type, earning_due_on: saved.earning_due_on, income_source_id: saved.income_source_id, income_due_on: saved.income_due_on, business_id: saved.business_id } : {};

/** The next blank record after "Save and add another": the same kind, category, income source, currency, date, account
 * and owner, so a run of receipts needs only each amount. */
export const anotherEntry = (saved: Entry): Entry => ({ ...freshEntry(), kind: saved.kind, custom_category_id: saved.custom_category_id, currency: saved.currency, date: saved.date, account_id: saved.account_id, shared: saved.shared, member_id: saved.member_id, frequency: 'Once', ...keptSource(saved) });

/** The fields of the income and expense forms that can stop a save. */
export type EntryField = 'amount' | 'source' | 'name' | 'account';
/** Why each field stops the save, named as the server would name it; a field that is fine is left out. */
export type FieldProblems = Partial<Record<EntryField, string>>;

/** What an income or expense form still needs before it can be saved, by the field it belongs under. `needs.source`:
 * the income names no source yet; `needs.name`: this form's name is required (a schedule or a salary plan). */
export function entryFieldProblems(editing: Entry, needs: { source?: boolean; name?: boolean } = {}): FieldProblems {
 const problems: FieldProblems = {};
 if (cashFlowAmountMissing(editing)) problems.amount = 'Enter an amount greater than zero.';
 if (needs.source) problems.source = 'Choose an income source.';
 if (needs.name && !editing.name.trim()) problems.name = 'Enter a name.';
 if (requiresCashAccount(editing) && !editing.account_id) problems.account = 'Choose a cash account.';
 return problems;
}

/** The rule a record breaks before it is sent, named as the server would name it; empty when it may be saved. */
export function recordSaveProblem(editing: Entry) {
 const dateProblem = editing.kind === 'Money lent' ? (!editing.lent_date ? 'Date lent is required.' : editing.date && editing.date < editing.lent_date ? 'Due date must not precede lending date.' : '')
  : !editing.date ? 'Date is required.' : simpleInterestKinds.includes(editing.kind) && editing.opened_on && editing.date < editing.opened_on ? 'The maturity date cannot be before the purchase date.' : '';
 if (dateProblem) return dateProblem;
 if (cashFlowAmountMissing(editing)) return 'Enter an amount greater than zero.';
 if (requiresCashAccount(editing) && editing.date > today()) return 'Actual income and expenses cannot be dated in the future.';
 return '';
}

/** The name an expense or an income is saved under when left blank: its custom category, or its kind's key, which
 * `shownName` reads in the current language. A note is a comment, shown under the name, never the name itself. */
export function expenseName(editing: Entry, categoryName: string | undefined, kindName: string) {
 return (expenses.includes(editing.kind) || income.includes(editing.kind)) && !editing.name.trim() ? (categoryName || kindName) : editing.name;
}

/** Income or spending is booked to a cash account of the workspace (once the accounts have loaded, `ready`), and in
 * another currency only at a known rate. */
export function cashAccountProblem(editing: Entry, records: readonly Entry[], ready: boolean, rate: number) {
 const account = records.find(record => record.id === editing.account_id);
 if (requiresCashAccount(editing) && (!editing.account_id || !ready || account?.kind !== 'Cash')) return 'Choose a cash account.';
 if (editing.account_id && account?.currency !== editing.currency && (!Number.isFinite(rate) || rate <= 0)) return 'Historical exchange rates are unavailable.';
 return '';
}

/** The sample workspace's copy of name_scheduled_payment for a source receipt or a salary with a plan (migration 140):
 * the row names the schedule it pays and the due date it chose, so the income cards and Recurring join it by that one id. */
export function demoScheduleLink(editing: Entry, patch: Pick<Entry, 'earning_due_on' | 'income_due_on'>, sources: readonly { id: string; schedule_id?: string | null }[], schedules: { records: readonly Entry[]; occurrences: readonly Occurrence[] } = { records: [], occurrences: [] }): Partial<Entry> {
 if (editing.frequency !== 'Once') return {};
 // A payment that names its schedule (Scheduled payment, a due bill) gets the due date the database would pick.
 if (editing.occurrence_record_id) {
  if (editing.occurrence_due_on) return {};
  const schedule = schedules.records.find(record => record.id === editing.occurrence_record_id);
  const due = schedule ? scheduledPaymentDue(schedule, editing.date, schedules.occurrences) : null;
  return due ? { occurrence_due_on: due } : { occurrence_record_id: null };
 }
 const source = sources.find(source => source.id === editing.earning_source_id);
 if (source && patch.earning_due_on) return { occurrence_record_id: source.schedule_id ?? source.id, occurrence_due_on: patch.earning_due_on };
 if (editing.kind === 'Salary' && editing.income_source_id && patch.income_due_on) return { occurrence_record_id: editing.income_source_id, occurrence_due_on: patch.income_due_on };
 return {};
}

/** A debt starts when it is first saved, never in the future and never after it is due. */
export const debtDatesProblem = (record: Entry) => liabilities.includes(record.kind) && record.opened_on && (record.opened_on > today() || record.date < record.opened_on) ? 'Check the start and due dates.' : '';

/** The business a saved account had, when the form moves it to another: the account is saved in its old business
 * and then moved, so its transactions move with it. */
export function businessMoveFrom(editing: Entry, saved: Entry | undefined) {
 return isBusinessAccount(editing) && saved && (saved.business_id ?? null) !== (editing.business_id ?? null) ? { from: saved.business_id ?? null } : null;
}
