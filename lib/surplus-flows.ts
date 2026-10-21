import type { estimatedCashFlow } from './finance';

export type SurplusParts = Pick<ReturnType<typeof estimatedCashFlow>, 'estimatedIncome' | 'otherIncome' | 'plannedIncome' | 'monthlyExpenses' | 'mortgagePayments' | 'loanPayments' | 'forecast'>;
type Kind = 'income' | 'total' | 'expense' | 'savings' | 'debt' | 'untraced';
export type SurplusLine = { key: string; amount: number; kind: Kind };

// The monthly surplus as its parts: income in, then what leaves it. The surplus is what is left; a shortfall (spending
// above income) is drawn as money coming in from outside the estimate, so the Sankey still balances.
// With `goalFunding`, the surplus is split into what the goal plan uses and what stays unassigned.
export function surplusLines(parts: SurplusParts, goalFunding = 0): { incoming: SurplusLine[]; outgoing: SurplusLine[] } {
 const positive = (line: SurplusLine) => Number.isFinite(line.amount) && line.amount > 0;
 const incoming: SurplusLine[] = ([
  { key: 'Estimated asset income', amount: parts.estimatedIncome, kind: 'income' },
  { key: 'Other recurring income', amount: parts.otherIncome, kind: 'income' },
  { key: 'Shortfall', amount: -parts.forecast, kind: 'untraced' },
 ] as SurplusLine[]).filter(positive);
 const outgoing: SurplusLine[] = ([
  { key: 'Expenses', amount: parts.monthlyExpenses, kind: 'expense' },
  { key: 'Estimated mortgage payments', amount: parts.mortgagePayments, kind: 'debt' },
  { key: 'Estimated loan payments', amount: parts.loanPayments, kind: 'debt' },
  ...(goalFunding > 0 && parts.forecast > 0 ? [
   { key: 'Planned goal funding', amount: Math.min(goalFunding, parts.forecast), kind: 'savings' as const },
   { key: 'Unassigned monthly surplus', amount: parts.forecast - Math.min(goalFunding, parts.forecast), kind: 'savings' as const },
  ] : [{ key: 'Left after expenses', amount: parts.forecast, kind: 'savings' as const }]),
 ] as SurplusLine[]).filter(positive);
 return { incoming, outgoing };
}

/** The Sankey of the surplus: each income line into one total, the total out to spending, payments and what is left. */
export function surplusFlows(parts: SurplusParts, label: (key: string) => string, goalFunding = 0) {
 const { incoming, outgoing } = surplusLines(parts, goalFunding);
 const nodes = [...incoming.map(line => ({ name: label(line.key), kind: line.kind })), { name: label('Income'), kind: 'total' as const }, ...outgoing.map(line => ({ name: label(line.key), kind: line.kind }))];
 const total = incoming.length;
 const links = [...incoming.map((line, index) => ({ source: index, target: total, value: line.amount })), ...outgoing.map((line, index) => ({ source: total, target: total + 1 + index, value: line.amount }))];
 return { nodes, links };
}
