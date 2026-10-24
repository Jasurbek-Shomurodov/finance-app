import { useLanguage } from '@/components/language-provider';
import { BudgetProgress, useCategoryName } from '@/components/budget/budget-rows';
import { signTone } from '@/components/presentation-foundation/tone';
import { budgetOverall, budgetRows, budgetRowsForMode, flexBucketCategory, isFlexibleCategory, monthsBetween, type BudgetAmount, type BudgetCategory, type BudgetMode, type BudgetOverall, type BudgetRow, type MonthActuals } from '@/lib/budget';
import { flexPlan } from '@/lib/budget-schedules';
import type { Entry } from '@/lib/finance';
import { formatMoney, formatMonthShort } from '@/lib/format';

/** The Year view: every category by month, actuals for past months and the plan for the months ahead, with the year's totals. */
export function BudgetYear({ rows, mode, month, history, amounts, schedules, currency, rates, today }: { rows: BudgetCategory[]; mode: BudgetMode; month: string; history: Map<string, MonthActuals>; amounts: BudgetAmount[]; schedules: Entry[]; currency: string; rates?: number | Record<string, number>; today: string }) {
 const { t, locale } = useLanguage();
 const name = useCategoryName();
 const months = monthsBetween(month.slice(0, 4) + '-01', month.slice(0, 4) + '-12');
 const current = today.slice(0, 7);
 const table = months.map(item => budgetRowsForMode(budgetRows(rows, amounts, history, item, currency, rates, schedules), mode));
 const flexible = mode === 'flex' ? months.map(item => flexPlan({ amounts, schedules }, rows, item, currency, rates)) : null;
 const bucketCell = (budget: number | null, list: BudgetRow[]): BudgetRow => { const actual = list.filter(isFlexibleCategory).reduce((sum, row) => sum + row.actual, 0); return { ...flexBucketCategory([]), budget, actual, rolloverIn: 0, remaining: budget === null ? null : budget - actual, progress: budget ? actual / budget : actual > 0 ? 1 : 0, missing: budget === null }; };
 const lines = [...rows.map((row, index) => ({ row, cells: table.map(list => list[index]) })), ...(flexible ? [{ row: flexBucketCategory([]), cells: flexible.map((budget, position) => bucketCell(budget, table[position])) }] : [])];
 // A row planned by the bucket (budget null, nothing missing) shows its spending alone; the rest hide until something is planned or spent.
 const own = (cell: BudgetRow) => cell.budget !== null || cell.missing;
 const visible = lines.filter(({ row, cells }) => !row.excluded && cells.some(cell => cell.budget || cell.actual || cell.missing));
 const overall = table.map((list, position) => { const sum = budgetOverall(list), bucket = flexible?.[position]; return bucket === undefined ? sum : bucket === null ? { ...sum, missing: sum.missing + 1 } : { ...sum, plannedExpenses: sum.plannedExpenses + bucket }; });
 // A plan no rate converts (budget null) reads —, and so does a total that would add it.
 const plan = (value: number | null) => value === null ? '—' : formatMoney(value, currency, locale);
 return <section className="panel budget-year">
  {visible.length ? <div className="budget-year-scroll"><table>
   <thead><tr><th scope="col">{t('Category')}</th>{months.map(item => <th scope="col" key={item} data-current={item === current || undefined}>{formatMonthShort(item, locale)}</th>)}<th scope="col">{t('Total')}</th></tr></thead>
   <tbody>{visible.map(({ row, cells }) => {
    const total = cells.reduce<number | null>((sum, cell, position) => { const value = months[position] <= current ? cell.actual : own(cell) ? cell.budget : 0; return sum === null || value === null ? null : sum + value; }, 0);
    return <tr key={row.key}>
     <th scope="row">{name(row)}</th>
     {cells.map((cell, position) => {
      const past = months[position] <= current;
      const marks = { 'data-future': !past || undefined, 'data-current': months[position] === current || undefined };
      if (!cell.actual && !cell.budget && !cell.missing) return <td key={months[position]} {...marks}>—</td>;
      return <td key={months[position]} {...marks}>
       <span>{past ? formatMoney(cell.actual, currency, locale) : own(cell) ? plan(cell.budget) : '—'}</span>
       {past && own(cell) && <small>{t('of {amount}', { amount: plan(cell.budget) })}</small>}
       {past && cell.budget ? <BudgetProgress row={cell}/> : null}
      </td>;
     })}
     <td><strong>{plan(total)}</strong></td>
    </tr>;
   })}</tbody>
   <BudgetYearOverall months={months} overall={overall} current={current} currency={currency}/>
  </table></div> : <p className="budget-left-empty">{t('Nothing planned or recorded this year yet.')}</p>}
 </section>;
}

/** The Year view's overall rows: income, spending and what is left, per month and for the year. Past months show actuals with the plan below. */
function BudgetYearOverall({ months, overall, current, currency }: { months: string[]; overall: BudgetOverall[]; current: string; currency: string }) {
 const { t, locale } = useLanguage();
 const lines = [
  { label: t('Total income'), actual: (item: BudgetOverall) => item.income, plan: (item: BudgetOverall) => item.plannedIncome },
  { label: t('Total expenses'), actual: (item: BudgetOverall) => item.expenses, plan: (item: BudgetOverall) => item.plannedExpenses },
  { label: t('Net'), net: true, actual: (item: BudgetOverall) => item.income - item.expenses, plan: (item: BudgetOverall) => item.plannedIncome - item.plannedExpenses },
 ];
 return <tfoot>{lines.map(line => {
  const total = overall.some((item, position) => months[position] > current && item.missing) ? null : overall.reduce((sum, item, position) => sum + (months[position] <= current ? line.actual(item) : line.plan(item)), 0);
  const plan = (item: BudgetOverall) => item.missing ? '—' : formatMoney(line.plan(item), currency, locale);
  return <tr key={line.label} data-net={line.net || undefined}>
   <th scope="row">{line.label}</th>
   {overall.map((item, position) => {
    const past = months[position] <= current;
    const value = past ? line.actual(item) : line.plan(item);
    const marks = { 'data-future': !past || undefined, 'data-current': months[position] === current || undefined };
    if (!item.income && !item.expenses && !item.plannedIncome && !item.plannedExpenses && !item.missing) return <td key={months[position]} {...marks}>—</td>;
    return <td key={months[position]} {...marks} data-tone={line.net && (past || !item.missing) ? signTone(value, true) : undefined}>
     <span>{past ? formatMoney(value, currency, locale) : plan(item)}</span>
     {past && <small>{t('of {amount}', { amount: plan(item) })}</small>}
    </td>;
   })}
   <td data-tone={line.net && total !== null ? signTone(total, true) : undefined}><strong>{total === null ? '—' : formatMoney(total, currency, locale)}</strong></td>
  </tr>;
 })}</tfoot>;
}
