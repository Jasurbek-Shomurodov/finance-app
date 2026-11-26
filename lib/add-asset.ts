import type { AssetMovement } from './asset-movements';
import { assetRecordKinds, fullValue, ownedPercent, shareOf, simpleInterestKinds, unitPricedKinds, valuedKinds, type Entry } from './finance';
import { coOwnersProblem } from './co-owners';
import { changeHoldingCost, holdingCostStart, shownHoldingTotal, type HoldingCost, type HoldingCostField } from './holding-cost';
import { instrumentFor } from './market';
import { changeRecordKind } from './record-kind';
import { freshEntry } from './record-save';

/** Cash and deposits are added as accounts; every other kind of asset is offered as a tile. */
export const choosableAssetKinds = assetRecordKinds.filter(kind => kind !== 'Cash' && kind !== 'Deposit') as Entry['kind'][];

/** The steps of Add asset. The last one saves; "Paid from" exists only for kinds a cash account can pay for. */
export type AssetStep = 'kind' | 'what' | 'amount' | 'paid';
/** A field of the flow that can stop Continue or Save, named as its `data-field`. */
export type AssetField = 'name' | 'quantity' | 'price' | 'value' | 'units' | 'unit' | 'ownership' | 'maturity' | 'vesting' | 'account' | 'date' | 'total' | 'debited' | 'paid';
/** Why a field stops the flow: an English key, with the money its `{amount}` stands for. */
export type AssetProblem = { message: string; money?: { amount: number; currency: string } };
export type AssetProblems = Partial<Record<AssetField, AssetProblem>>;

export type AssetDraft = {
 /** The record being built, in the shape the record form edits, so its field components work on it unchanged. */
 entry: Entry;
 /** A kind was chosen: the tiles are behind, and the kind shows as a chip. */
 chosen: boolean;
 /** A quoted holding's total paid, and which two of quantity, unit price and total were typed last. */
 costs: { recent: HoldingCostField[]; total: number; /** The person typed a price or a total; a quote no longer fills it in. */ typed: boolean };
 /** Where the money came from: nowhere (it was owned already) or a cash account on a day. */
 pay: { from: 'owned' | 'account'; account_id: string; date: string; /** What left the account, in its own currency, when that differs from the asset's. */ debited: number; /** What was paid for a valued asset; null follows its owned value. */ paid: number | null; /** The purchase's id, so a retry never records it twice. */ id: string };
};

const quoted = (kind: string) => unitPricedKinds.includes(kind);
/** Kinds a cash account can pay for in the same save: a Buy for holdings held in units, Money invested for valued assets. */
export const purchaseKind = (kind: string): 'buy' | 'contribution' | null =>
 kind === 'Equity compensation' ? null : quoted(kind) ? 'buy' : valuedKinds.includes(kind) && kind !== 'Business' ? 'contribution' : null;
/** Which picker names the kind's instrument; null for kinds named in words. */
export const instrumentKind = (kind: string): 'Stock' | 'Crypto' | null => kind === 'Crypto' ? 'Crypto' : kind === 'Stock' || kind === 'Equity compensation' ? 'Stock' : null;

export const assetSteps = (kind: string): AssetStep[] => purchaseKind(kind) ? ['kind', 'what', 'amount', 'paid'] : ['kind', 'what', 'amount'];

/** A blank flow in the workspace currency, dated today; `preset` starts it on a kind (Add holding inside an account). */
export function newAssetDraft(currency: string, today: string, ids: () => string, preset?: { kind: Entry['kind']; holdingAccountId?: string; currency?: string }): AssetDraft {
 const entry: Entry = { ...freshEntry(), id: ids(), currency, date: today, lent_date: today, opened_on: today };
 const blank: AssetDraft = { entry, chosen: false, costs: { recent: ['quantity', 'cost'], total: 0, typed: false }, pay: { from: 'owned', account_id: '', date: today, debited: 0, paid: null, id: ids() } };
 if (!preset) return blank;
 const started = withKind(blank, preset.kind, today);
 return { ...started, entry: { ...started.entry, currency: preset.currency ?? currency, holding_account_id: preset.holdingAccountId ?? null } };
}

/** Choosing a kind, the first time or again through the chip's Change: fields the new kind does not show start again,
 * and a name is kept only while it still means the same thing (a ticker is not a property's name). */
export function withKind(draft: AssetDraft, kind: Entry['kind'], today: string): AssetDraft {
 if (draft.chosen && draft.entry.kind === kind) return draft;
 const before = draft.entry, same = draft.chosen && instrumentKind(before.kind) === instrumentKind(kind) && (before.kind === 'Precious metals') === (kind === 'Precious metals');
 const changed = changeRecordKind(before, kind, today), kept = same && quoted(kind) && quoted(before.kind);
 // A holding's quantity starts empty, so it is typed rather than assumed; anything else is one thing unless counted.
 const entry = { ...changed, name: same ? before.name : '', amount: kept ? before.amount : changed.amount, quantity: kept ? before.quantity : quoted(kind) ? 0 : changed.quantity, cost: kept ? before.cost : 0, date: before.date || today };
 return { ...draft, chosen: true, entry, costs: same ? draft.costs : { recent: ['quantity', 'cost'], total: 0, typed: false }, pay: { ...draft.pay, from: purchaseKind(kind) ? draft.pay.from : 'owned', paid: null } };
}

/** The quantity, unit price and total as the three linked fields read them. */
export const draftCosts = (draft: AssetDraft): HoldingCost => draft.costs.recent.includes('total')
 ? { quantity: draft.entry.quantity, cost: draft.entry.cost, total: draft.costs.total, recent: draft.costs.recent }
 : { ...holdingCostStart(draft.entry.quantity, draft.entry.cost), recent: draft.costs.recent };
/** One of the three typed: the one not among the last two typed is worked out from them. */
export function withCost(draft: AssetDraft, field: HoldingCostField, amount: number): AssetDraft {
 const next = changeHoldingCost(draftCosts(draft), field, amount);
 return { ...draft, entry: { ...draft.entry, quantity: next.quantity, cost: next.cost }, costs: { recent: next.recent, total: next.total, typed: draft.costs.typed || field !== 'quantity' } };
}
/** What was paid in total, as the field and the review line show it. */
export const totalPaid = (draft: AssetDraft) => shownHoldingTotal(draftCosts(draft));

/** A quote arrived: it is the current price and, until the person types what they paid, the purchase price too. */
export function withQuote(draft: AssetDraft, price: number): AssetDraft {
 const priced = { ...draft, entry: { ...draft.entry, amount: price } };
 if (draft.costs.typed) return priced;
 const next = changeHoldingCost({ ...holdingCostStart(priced.entry.quantity, priced.entry.cost), recent: ['quantity', 'cost'] }, 'cost', price);
 return { ...priced, entry: { ...priced.entry, cost: next.cost }, costs: { recent: ['quantity', 'cost'], total: next.total, typed: false } };
}

/** The whole asset's value and the part the person owns, in the asset's currency. */
export const draftWorth = (draft: AssetDraft) => { const full = fullValue(draft.entry); return { full, owned: shareOf(full, ownedPercent(draft.entry)) }; };
/** What a valued asset cost when paid from an account: as typed, or its owned value in whole units. */
export const amountPaid = (draft: AssetDraft) => draft.pay.paid ?? Math.round(draftWorth(draft).owned);

const positive = (amount: unknown) => Number.isFinite(Number(amount)) && Number(amount) > 0;
const need = (message: string): AssetProblem => ({ message });

function whatProblems({ entry }: AssetDraft, needsName: boolean): AssetProblems {
 const picker = instrumentKind(entry.kind);
 if (picker) return instrumentFor(entry) ? {} : { name: need(picker === 'Crypto' ? 'Choose a coin.' : 'Choose a stock or ETF.') };
 return needsName && !entry.name.trim() ? { name: need('Enter a name.') } : {};
}

function holdingProblems(entry: Entry): AssetProblems {
 const problems: AssetProblems = {};
 if (!positive(entry.quantity)) problems.quantity = need('Enter a quantity greater than zero.');
 if (!positive(entry.amount)) problems.price = need('Enter the current price per unit.');
 if (entry.kind === 'Equity compensation' && !entry.date) problems.vesting = need('Date is required.');
 return problems;
}
/** A counted asset needs its count and unit name; every valued asset a share the person can own. */
function ownedProblems(entry: Entry): AssetProblems {
 const problems: AssetProblems = {}, share = Number(entry.ownership_percentage ?? 100);
 if (entry.unit_label != null && !positive(entry.quantity)) problems.units = need('Enter a quantity greater than zero.');
 if (entry.unit_label != null && !entry.unit_label.trim()) problems.unit = need('Enter a unit name.');
 if (!(share > 0 && share <= 100)) problems.ownership = need('Enter a share above 0 and up to 100.');
 else if (coOwnersProblem(entry)) problems.ownership = need(coOwnersProblem(entry));
 return problems;
}
/** A bill or a bond runs from a purchase date that has come to a maturity date after it. */
function termProblems(entry: Entry, today: string): AssetProblems {
 const problems: AssetProblems = {};
 if (!entry.opened_on) problems.date = need('Date is required.'); else if (entry.opened_on > today) problems.date = need('Choose today or an earlier date.');
 if (!entry.date) problems.maturity = need('Date is required.');
 else if (entry.opened_on && entry.date < entry.opened_on) problems.maturity = need('The maturity date cannot be before the purchase date.');
 return problems;
}
function amountProblems({ entry }: AssetDraft, today: string): AssetProblems {
 if (quoted(entry.kind)) return holdingProblems(entry);
 return { ...(positive(entry.amount) ? {} : { value: need('Enter an amount greater than zero.') }),
  ...(valuedKinds.includes(entry.kind) ? ownedProblems(entry) : {}), ...(simpleInterestKinds.includes(entry.kind) ? termProblems(entry, today) : {}) };
}

/** What the paying account needs: an amount, in its own currency where that differs, and enough money to cover it.
 * `rate` is the dated rate from the account's currency to the asset's, for a valued asset paid in another currency. */
function accountProblems(draft: AssetDraft, account: Entry, rate: number | null | undefined): AssetProblems {
 const problems: AssetProblems = {}, cross = account.currency !== draft.entry.currency, buy = purchaseKind(draft.entry.kind) === 'buy';
 const field: AssetField = buy ? (cross ? 'debited' : 'total') : 'paid';
 if (!positive(buy ? totalPaid(draft) : amountPaid(draft))) problems[buy ? 'total' : 'paid'] = need(buy ? 'Enter what you paid in total.' : 'Enter an amount greater than zero.');
 if (buy && cross && !positive(draft.pay.debited)) problems.debited = need('Enter an amount greater than zero.');
 if (!buy && cross && !positive(rate)) problems.paid ??= need('Historical exchange rates are unavailable.');
 const leaves = debitOf(draft, account, rate);
 if (leaves !== null && leaves > Number(account.amount)) problems[field] ??= { message: 'Only {amount} available', money: { amount: Number(account.amount), currency: account.currency } };
 return problems;
}
/** What the last step needs: a day that has come and, when an account pays, the account and what it pays. */
function paidProblems(draft: AssetDraft, { today, accounts, rate }: AssetContext): AssetProblems {
 const { pay } = draft, problems: AssetProblems = {};
 if (!pay.date) problems.date = need('Date is required.'); else if (pay.date > today) problems.date = need('Choose today or an earlier date.');
 if (pay.from === 'owned') return problems;
 const account = accounts.find(item => item.id === pay.account_id && item.kind === 'Cash');
 return account ? { ...problems, ...accountProblems(draft, account, rate) } : { account: need('Choose a cash account.'), ...problems };
}

/** What leaves the cash account, in its own currency; null while it cannot be known (no amount yet, no rate). */
export function debitOf(draft: AssetDraft, account: Pick<Entry, 'currency'>, rate?: number | null): number | null {
 const cross = account.currency !== draft.entry.currency;
 if (purchaseKind(draft.entry.kind) === 'buy') { const amount = cross ? draft.pay.debited : totalPaid(draft); return positive(amount) ? amount : null; }
 const paid = amountPaid(draft);
 if (!positive(paid)) return null;
 return cross ? (positive(rate) ? paid / Number(rate) : null) : paid;
}

export type AssetContext = { today: string; /** The workspace's accounts; only cash accounts can pay. */ accounts: readonly Entry[]; /** The dated rate from the paying account's currency to the asset's. */ rate?: number | null; /** A kind whose blank name is filled in at the save (a metal is named after itself). */ optionalName?: boolean };

/** What a step still needs, by field and in the order the fields are shown; empty when it may be left. */
export function assetProblems(draft: AssetDraft, step: AssetStep, context: AssetContext): AssetProblems {
 if (step === 'kind') return {};
 if (step === 'what') return whatProblems(draft, !context.optionalName);
 if (step === 'amount') return amountProblems(draft, context.today);
 return paidProblems(draft, context);
}
/** The order fields are shown in, which is the order they are focused in. */
const fieldOrder: AssetField[] = ['name', 'quantity', 'price', 'value', 'units', 'unit', 'ownership', 'vesting', 'account', 'date', 'maturity', 'total', 'debited', 'paid'];
export const firstProblem = (problems: AssetProblems) => fieldOrder.find(field => problems[field]);

/** The second request of a paid purchase, and what it changes, for the sample workspace and the message when it fails. */
export type AssetPurchase = { kind: 'buy' | 'contribution'; url: string; body: AssetMovement | Record<string, unknown>; account_id: string; /** What leaves the account, in its currency. */ debit: number; /** The quantity and unit cost the holding has once the Buy is recorded. */ holding?: { quantity: number; cost: number } };
export type AssetSavePlan = { record: Entry; purchase: AssetPurchase | null };

/** The record as it is saved when it was owned already: everything typed, dated by its purchase or record date. */
function ownedRecord(draft: AssetDraft, context: AssetContext & { name?: string }): Entry {
 const { entry, pay } = draft, kind = entry.kind, name = entry.name.trim() || context.name || '';
 if (kind === 'Equity compensation') return { ...entry, name, opened_on: entry.date < context.today ? entry.date : context.today };
 if (quoted(kind)) return { ...entry, name, opened_on: pay.date, date: pay.date };
 if (simpleInterestKinds.includes(kind)) return { ...entry, name };
 return { ...entry, name, unit_label: entry.unit_label == null ? entry.unit_label : entry.unit_label.trim(), date: pay.date, opened_on: null };
}

/** The requests one Save sends. Owned already: the record alone, as the record form saves it. Paid from an account: a
 * holding is saved empty and a Buy fills it (so cash is debited and the Tracker shows the Buy); a valued asset is saved
 * at its value and Money invested debits the account. `context.name` names a record whose name was left blank. */
export function assetSavePlan(draft: AssetDraft, context: AssetContext & { name?: string }): AssetSavePlan {
 const record = ownedRecord(draft, context), { pay } = draft;
 const account = pay.from === 'account' ? context.accounts.find(item => item.id === pay.account_id) : undefined;
 const kind = purchaseKind(record.kind), debit = account ? debitOf(draft, account, context.rate) : null;
 if (!account || !kind || debit === null) return { record, purchase: null };
 if (kind === 'buy') {
  const total = totalPaid(draft), movement: AssetMovement = { id: pay.id, kind: 'buy', source_id: account.id, target_id: record.id, sent: debit, received: record.quantity, source_value: debit, target_value: total, fee: 0, date: pay.date, notes: '' };
  return { record: { ...record, quantity: 0, cost: 0 }, purchase: { kind, url: '/api/asset-movements', body: movement, account_id: account.id, debit, holding: { quantity: record.quantity, cost: total / record.quantity } } };
 }
 const cross = account.currency !== record.currency;
 const body = { id: pay.id, record_id: record.id, account_id: account.id, type: 'contribution', date: pay.date, amount: amountPaid(draft), balance: null, notes: '', ...(cross ? { exchange_rate: Number(context.rate) } : {}) };
 return { record, purchase: { kind, url: cross ? '/api/investment-history/exchange' : '/api/investment-history', body, account_id: account.id, debit } };
}

/** The sample workspace's copy of the purchase: the account pays, and a bought holding takes its quantity and cost. */
export function demoPurchase(rows: readonly Entry[], plan: AssetSavePlan): Entry[] {
 const purchase = plan.purchase;
 if (!purchase) return [...rows];
 return rows.map(row => row.id === purchase.account_id ? { ...row, amount: Number(row.amount) - purchase.debit }
  : row.id === plan.record.id && purchase.holding ? { ...row, ...purchase.holding } : row);
}
