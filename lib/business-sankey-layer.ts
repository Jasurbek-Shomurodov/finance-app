import type { BusinessPnl, BusinessSankey, Direction, Drill, PnlLine, SankeyNode } from './business-report';

export type SankeyLabels = { category: (key: string) => string; business: (id: string) => string; total: string; savings: string; profit: string; loss: (name: string) => string; otherIncome: string; otherExpense: string; inBusiness: (name: string, business: string) => string };
export type TopFlow = { name: string; amount: number; drill: Drill };
/** One business's layer of the flow. `total` is the household's income node, or -1 when the household is left out. */
export function businessFlows(business: BusinessPnl, { node, links, top, labels, total }: { node: (item: SankeyNode) => number; links: BusinessSankey['links']; top: (items: PnlLine[], other: string, direction: Direction, business: string | null) => TopFlow[]; labels: SankeyLabels; total: number }) {
 const name = labels.business(business.id), owner = business.id;
 // A business that earned nothing while the household paid its spending only passes household money on: its expenses
 // leave household income directly, named for the business, rather than through a node of its own that would stand
 // alone in a column between the total and the spending and cross every other flow to reach it.
 if (total >= 0 && !business.grossIncome) {
  for (const item of top(business.expenses, labels.otherExpense, 'expense', business.id)) links.push({ source: total, target: node({ name: labels.inBusiness(item.name, name), kind: 'expense', drill: item.drill, owner }), value: item.amount });
  return;
 }
 const hub = node({ name, kind: 'business', drill: { business: owner }, owner });
 // A business with a single kind of income is its own source: a node named only "Business income" would say less
 // than the business's name and repeat beside every other business.
 // With the household, a loss is the household's money covering the business: household income flows into the business,
 // so the business's own income must be drawn too, or the business would stand as a source of money it never earned.
 const covered = total >= 0 && business.net < 0;
 if (business.income.length > 1 || covered) for (const item of top(business.income, labels.otherIncome, 'income', business.id)) links.push({ source: node({ name: item.name, kind: 'income', drill: item.drill, owner }), target: hub, value: item.amount });
 for (const item of top(business.expenses, labels.otherExpense, 'expense', business.id)) links.push({ source: hub, target: node({ name: item.name, kind: 'expense', drill: item.drill, owner }), value: item.amount });
 if (business.net > 0) links.push({ source: hub, target: total >= 0 ? total : node({ name: labels.profit, kind: 'savings', drill: { savings: business.net, business: owner }, owner }), value: business.net });
 else if (business.net < 0) {
  if (covered) links.push({ source: total, target: hub, value: -business.net });
  else links.push({ source: node({ name: labels.loss(name), kind: 'loss', drill: { business: owner }, owner }), target: hub, value: -business.net });
 }
}
