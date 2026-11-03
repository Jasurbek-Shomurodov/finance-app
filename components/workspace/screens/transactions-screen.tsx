"use client";
import { useCallback, useMemo, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { ListChecks, Paperclip, ReceiptText, Search, Wand2 } from 'lucide-react';
import { useLanguage } from '@/components/language-provider';
import { useDisplayMoney } from '@/components/display-money';
import { CategoryIcon } from '@/components/presentation-foundation/category-icon';
import { EmptyState } from '@/components/presentation-foundation/empty-state';
import { InlineError } from '@/components/presentation-foundation/inline-error';
import { TransactionsSkeleton } from '@/components/presentation-foundation/screen-skeletons';
import { DateRangePicker, type DateRange } from '@/components/presentation-foundation/date-range-picker';
import { PageHeader } from '@/components/presentation-foundation/page-header';
import { Pagination } from '@/components/presentation-foundation/pagination';
import { Segmented } from '@/components/presentation-foundation/segmented';
import { AddTransactionMenu } from '@/components/transactions/add-transaction-menu';
import { BulkEditBar } from '@/components/transactions/bulk-edit';
import { BulkEditSheet, RuleDialog, RulesDialog } from '@/components/transactions/lazy';
import { TransactionsSummary } from '@/components/transactions/transactions-summary';
import { BusinessPicker, CategoryPicker, OwnerPicker, choiceNamer } from '@/components/transactions/pickers';
import { TagFilter } from '@/components/transactions/tags';
import { DayGroup, MortgageSplit, TransactionAmount, transactionRowLabel } from '@/components/transactions/transaction-row';
import { BusinessFilter } from '@/components/presentation-foundation/business-filter';
import { OwnerFilter } from '@/components/presentation-foundation/owner-filter';
import { TagChip } from '@/components/presentation-foundation/tag-chip';
import { inOwnerFilter, ownerChoices, ownerOf, sharedWorkspace } from '@/lib/household';
import { queryList, useLocationSearch } from '@/hooks/use-location-search';
import { businessMovable, nextPaletteColor } from '@/lib/business';
import { tagsByRecord } from '@/lib/tags';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { useWorkspace } from '@/components/workspace/workspace-provider';
import { useArrivals } from '@/hooks/use-arrivals';
import { useOwnerResource } from '@/hooks/use-owner-resource';
import { useTransactionRules } from '@/hooks/use-transaction-rules';
import { depositToday } from '@/lib/deposit-interest';
import { showAction, showError, showNotice } from '@/lib/feedback';
import { normalizeEntry, type Entry } from '@/lib/finance';
import { formatNumber } from '@/lib/format';
import { convertAmount, marketRates } from '@/lib/market';
import { emptyPlanning } from '@/lib/planning';
import { ratesOf } from '@/lib/transaction-rates';
import { bulkEditPlan, chunks, emptyTransactionFilter, filtersTransactions, groupPageByDay, earliestTransactionDay, periodDays, signedAmount, summarizeTransactions, transactionPeriodLabels, transactionPeriods, transactionsIn, transactionsQuery, type TransactionPeriod } from '@/lib/transaction-list';
import { canRecategorize, categoryChoices, choiceKey, newRule, ruleFromBusiness, ruleFromChange, type CategoryChoice, type TransactionRule } from '@/lib/transaction-rules';
import { TransactionInsights } from '@/components/transaction-insights';
import { shownName } from '@/lib/record-names';

const transactionsPerPage = 20;

export function TransactionsScreen() {
 const { t, locale } = useLanguage();
 const { enteredSigned } = useDisplayMoney();
 const { user, demo, reload, currency, market, planning, transactionTools, workspaceLoading, addCashFlow, setViewing, storedRecord, categorize, assignTransactionsBusiness, businessList, tags, attachments, refreshRecords, household, readOnly, assignRecordOwner, removedCategories, reviewRecurring } = useWorkspace();
 // In a shared household: whose transactions to show, and who each one belongs to.
 const homes = household.state;
 const owners = useMemo(() => homes && sharedWorkspace(homes) ? ownerChoices(homes, { shared: t('Shared'), unnamed: t('Partner') }) : [], [homes, t]);
 const [ownerFilter, setOwnerFilter] = useState<string[]>([]);
 const ownerOption = (record: Entry) => { const id = ownerOf(record, homes!); return owners.find(item => item.id === id) ?? owners[0]; };
 const today = depositToday();
 const [period, setPeriod] = useState<TransactionPeriod | 'custom'>('three_months');
 const [custom, setCustom] = useState<DateRange>(() => periodDays('three_months', today));
 const [filter, setFilter] = useState(emptyTransactionFilter);
 // Links such as /transactions?tag=…, ?business=… or a Sankey's ?type=expense&q=…&from=…&to=… open the list already filtered.
 const search = useLocationSearch();
 const [appliedSearch, setAppliedSearch] = useState('');
 if (search !== appliedSearch) {
  setAppliedSearch(search);
  if (search) { const query = transactionsQuery(search, key => queryList(search, key)); setFilter(query.filter); if (query.range) setCustom(query.range); setPeriod(query.period ?? 'custom'); }
 }
 const [editingMany, setEditingMany] = useState(false);
 const [selecting, setSelecting] = useState(false);
 const [selected, setSelected] = useState<Set<string>>(new Set());
 const [rule, setRule] = useState<TransactionRule | null>(null);
 const [rulesOpen, setRulesOpen] = useState(false);
 const live = !!user && !demo;
 const range = period === 'custom' ? custom : periodDays(period, today);
 const remote = useOwnerResource(`/api/planning?scope=budget&month=${range.to.slice(0, 7)}&from=${range.from.slice(0, 7)}`, user, live, reload, emptyPlanning);
 const data = useMemo(() => live ? { ...remote.data, records: remote.data.records.map(normalizeEntry) } : planning.data, [live, remote.data, planning.data]);
 const splits = transactionTools.data.splits;
 const tagMap = useMemo(() => tagsByRecord(tags.data.links), [tags.data.links]);
 const tagsOf = useCallback((id: string) => tagMap.get(id) ?? [], [tagMap]);
 const rules = useTransactionRules(user, demo, reload, data.records, splits, { categorize, assignBusiness: assignTransactionsBusiness, changeTags: tags.change, tagsOf }, refreshRecords);
 const choiceName = useMemo(() => choiceNamer(data.categories, t), [data.categories, t]);
 const nameOf = useCallback((record: Entry) => choiceName({ kind: record.kind, category_id: record.custom_category_id ?? null }), [choiceName]);
 const { from, to } = range;
 const records = useMemo(() => transactionsIn(data.records, { from, to }, today, filter, nameOf, tagsOf).filter(record => !owners.length || inOwnerFilter(ownerFilter, ownerOf(record, homes!))), [data.records, from, to, today, filter, nameOf, tagsOf, owners, ownerFilter, homes]);
 const tagById = new Map(tags.data.tags.map(tag => [tag.id, tag]));
 const createTag = async (name: string) => { const id = crypto.randomUUID(); await tags.save({ id, name, color: nextPaletteColor(tags.data.tags.map(tag => tag.color)) }); return id; };
 const rates = marketRates(market);
 const convert = useCallback((amount: number, unit: string, record?: Entry) => convertAmount(amount, unit, currency, ratesOf(record, rates)), [currency, rates]);
 // Twenty transactions a page; changing the period or a filter starts again at the first page.
 const listKey = JSON.stringify([range, filter, ownerFilter]);
 const [paging, setPaging] = useState({ key: listKey, page: 1 });
 // Forget the old page as soon as the list changes, so coming back to an earlier period does not reopen its last page.
 if (paging.key !== listKey) setPaging({ key: listKey, page: 1 });
 const pageCount = Math.max(1, Math.ceil(records.length / transactionsPerPage));
 const page = paging.key === listKey ? Math.min(paging.page, pageCount) : 1;
 const days = useMemo(() => groupPageByDay(records, (page - 1) * transactionsPerPage, page * transactionsPerPage, convert), [records, page, convert]);
 const arrived = useArrivals(useMemo(() => days.flatMap(day => day.records.map(record => record.id)), [days]));
 const summary = useMemo(() => summarizeTransactions(records, convert), [records, convert]);
 const accounts = new Map(data.records.filter(record => record.kind === 'Cash').map(record => [record.id, record.name]));
 const chosen = records.filter(record => selected.has(record.id));
 const categoryOptions = [...categoryChoices(data.categories, 'income', removedCategories.kinds), ...categoryChoices(data.categories, 'expense', removedCategories.kinds)];

 async function change(targets: Entry[], choice: CategoryChoice) {
  try {
   const changed = await categorize(targets.map(record => record.id), choice);
   const skipped = targets.length - changed;
   if (targets.length === 1 && changed === 1) showAction('Updated to {category}', { params: { category: choiceName(choice) }, detail: 'Create a rule to do this automatically in the future.', action: 'Create rule', onAction: () => setRule(ruleFromChange(targets[0], choice)) });
   else showNotice(skipped ? t('{changed} updated; {skipped} could not change category here.', { changed: formatNumber(changed, locale, 0), skipped: formatNumber(skipped, locale, 0) }) : t('{changed} updated', { changed: formatNumber(changed, locale, 0) }));
  } catch (error) { showError((error as Error).message || 'Could not save changes.'); }
 }
 async function moveToBusiness(record: Entry, business: string | null) {
  try {
   const changed = await assignTransactionsBusiness([record.id], business);
   const name = business ? businessList.find(item => item.id === business)?.name ?? '' : t('Household');
   if (changed && business) showAction('Moved to {business}', { params: { business: name }, detail: 'Create a rule to do this automatically in the future.', action: 'Create rule', onAction: () => setRule(ruleFromBusiness(record, business)) });
   else showNotice(changed ? t('Moved to {business}', { business: name }) : t('This transaction keeps its business.'));
  } catch (error) { showError((error as Error).message || 'Could not save changes.'); }
 }
 async function giveTo(record: Entry, owner: string) {
  try { await assignRecordOwner([record.id], owner); showNotice(t('Owner of {name} changed to {owner}', { name: record.name, owner: owners.find(item => item.id === owner)?.name ?? '' })); } catch (error) { showError((error as Error).message || 'Could not save changes.'); }
 }
 /** The Edit multiple drawer: every field that changed, applied to the transactions it can apply to. A failure part way
  * says what was already applied; the drawer stays open with the reason, and trying again is harmless. */
 async function editMany(change: { choice: CategoryChoice | null; business: string | null | undefined; owner: string | undefined; add: string[]; remove: string[] }) {
  const ids = chosen.map(record => record.id), plan = bulkEditPlan(chosen, change, splits), count = (value: number) => formatNumber(value, locale, 0);
  // Each change reports only its own count, so the notice gives the largest.
  let changed = 0;
  // The database takes up to 500 transactions at a time.
  const each = async (list: string[], run: (part: string[]) => Promise<number>) => { let sum = 0; for (const part of chunks(list, 500)) { sum += await run(part); changed = Math.max(changed, sum); } };
  try {
   const { choice, business, owner } = change;
   if (business !== undefined) await each(ids, part => assignTransactionsBusiness(part, business));
   if (choice) await each(plan.movable.map(record => record.id), part => categorize(part, choice));
   if (owner !== undefined) await each(ids, part => assignRecordOwner(part, owner));
   if (change.add.length || change.remove.length) await each(ids, part => tags.change(part, change.add, change.remove));
  } catch (reason) {
   if (changed) showNotice(t('{changed} updated', { changed: count(changed) }));
   throw reason;
  }
  const { fixedCategory, kept } = plan, done = count(changed);
  // Transfer fees, split and linked payments keep their category, and planned spending, business income and salary from a source their business: say how many.
  showNotice(fixedCategory && kept ? t('{changed} updated; {category} could not change category and {business} could not change business here.', { changed: done, category: count(fixedCategory), business: count(kept) }) : fixedCategory ? t('{changed} updated; {skipped} could not change category here.', { changed: done, skipped: count(fixedCategory) }) : kept ? t('{changed} updated; {skipped} could not change business here.', { changed: done, skipped: count(kept) }) : t('{changed} updated', { changed: done }));
  setSelected(new Set());
 }
 const toggle = (id: string) => setSelected(previous => { const next = new Set(previous); if (next.has(id)) next.delete(id); else next.add(id); return next; });
 const open = (record: Entry) => (event: MouseEvent | KeyboardEvent) => {
  // Popovers and menus are portaled out of the row, but React still bubbles their events here.
  if (!(event.currentTarget as HTMLElement).contains(event.target as Node) || (event.target as HTMLElement).closest('button,a,input,label')) return;
  if ('key' in event && event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  // A row opens the transaction's details: what was entered, its account, category and notes, with Edit and Delete.
  if (selecting) toggle(record.id); else setViewing(storedRecord(record));
 };
 const loading = workspaceLoading || (live ? remote.initialLoading : planning.loading);
 const error = live ? remote.error : planning.error;

 return <div data-page="Transactions" className="content transactions-content">
  <PageHeader title={t('Transactions')} tabs={<Segmented className="page-tabs" as="nav" label={t('Type')} options={[{ value: 'all', label: t('All') }, { value: 'income', label: t('Income') }, { value: 'expense', label: t('Expenses') }] as const} value={filter.direction} onChange={direction => setFilter({ ...filter, direction })}/>} hint={t('Every income and spending record in one list, grouped by day. Click a category to change it.')}>
   <Button variant="outline" onClick={() => setRulesOpen(true)}><Wand2 size={16} aria-hidden="true"/>{t('Rules')}</Button>
   <Button variant="outline" disabled={readOnly} aria-pressed={selecting} onClick={() => { setSelecting(!selecting); setSelected(new Set()); }}><ListChecks size={16} aria-hidden="true"/>{t('Edit multiple')}</Button>
   <AddTransactionMenu onAdd={addCashFlow}/>
  </PageHeader>
  <div className="transactions-tools">
   <label className="transactions-search"><Search size={16} aria-hidden="true"/><Input type="search" placeholder={t('Search transactions')} aria-label={t('Search transactions')} maxLength={200} value={filter.query} onChange={event => setFilter({ ...filter, query: event.currentTarget.value })}/></label>
   <DateRangePicker label={t('Period')} presets={transactionPeriods} presetLabels={transactionPeriodLabels} preset={period} range={range} min={earliestTransactionDay(today)} max={today} onPreset={setPeriod} onRange={next => { setCustom(next); setPeriod('custom'); }}/>
   <NativeSelect aria-label={t('Category')} value={filter.category} onChange={event => setFilter({ ...filter, category: event.currentTarget.value })}>
    <option value="all">{t('All categories')}</option>
    {categoryOptions.map(choice => <option key={choiceKey(choice)} value={choiceKey(choice)}>{choice.custom ? choice.name : t(choice.name)}</option>)}
   </NativeSelect>
   {businessList.length > 0 && <BusinessFilter businesses={businessList} value={filter.businesses} onChange={businesses => setFilter({ ...filter, businesses })}/>}
   {tags.data.tags.length > 0 && <TagFilter tags={tags.data.tags} value={filter.tags} match={filter.tagMatch} onChange={(chosen, tagMatch) => setFilter({ ...filter, tags: chosen, tagMatch })}/>}
   {owners.length > 0 && <OwnerFilter owners={owners} value={ownerFilter} onChange={setOwnerFilter}/>}
  </div>
  {selecting && <BulkEditBar count={chosen.length} total={records.length} onAll={select => setSelected(new Set(select ? records.map(record => record.id) : []))} onEdit={() => setEditingMany(true)} onCancel={() => { setSelecting(false); setSelected(new Set()); }}/>}
  {error ? <InlineError message={t(error)} onRetry={live ? remote.retry : refreshRecords}/> : loading ? <TransactionsSkeleton label={t('Loading records…')} tools={false}/> : <div className="transactions-layout">
   <section className="panel transactions-list" aria-label={t('Transactions')}>
    {days.length ? days.map(day => <DayGroup key={day.date} date={day.date} total={day.total} currency={currency} today={today}>
     {day.records.map(record => {
      const editable = canRecategorize(record, splits);
      const recordTags = tagsOf(record.id).map(id => tagById.get(id)).filter(tag => !!tag);
      return <li key={record.id} className="transaction-row" data-selected={selected.has(record.id) || undefined} data-arrived={arrived.has(record.id) || undefined} tabIndex={0} aria-label={transactionRowLabel(t('View details for {name}', { name: shownName(record, t, nameOf(record)) }), record, nameOf(record), locale, enteredSigned(signedAmount(record), record.currency))} onClick={open(record)} onKeyDown={open(record)}>
       {selecting && <input type="checkbox" aria-label={t('Select {name}', { name: record.name })} checked={selected.has(record.id)} onChange={() => toggle(record.id)}/>}
       <span className="transaction-merchant"><CategoryIcon kind={record.custom_category_id ? nameOf(record) : record.kind}/><span>{attachments.counts.get(record.id) ? <span className="transaction-name"><strong>{shownName(record, t, nameOf(record))}</strong><Paperclip className="transaction-attachment-mark" size={13} role="img" aria-label={t('Attachments: {count}', { count: attachments.counts.get(record.id)! })}/></span> : <strong>{shownName(record, t, nameOf(record))}</strong>}{record.account_id && accounts.get(record.account_id) && <small>{accounts.get(record.account_id)}</small>}<MortgageSplit record={record}/>{recordTags.length > 0 && <span className="transaction-tags">{recordTags.map(tag => <TagChip key={tag.id} name={tag.name} color={tag.color}/>)}</span>}</span></span>
       <span className="transaction-labels">{owners.length > 0 && <OwnerPicker record={record} owner={ownerOption(record)} owners={owners} disabled={readOnly || selecting} onChange={owner => void giveTo(record, owner)}/>}<CategoryPicker record={record} categories={data.categories} removed={removedCategories.kinds} disabled={!editable || selecting || readOnly} onChange={choice => change([record], choice)}/>
       {businessList.length > 0 && <BusinessPicker record={record} businesses={businessList} disabled={selecting || readOnly || !businessMovable(record)} onChange={business => moveToBusiness(record, business)}/>}</span>
       <TransactionAmount record={record}/>
      </li>;
     })}
    </DayGroup>) : <EmptyState icon={<ReceiptText/>} title={t('No transactions')} description={t(filtersTransactions(filter) || ownerFilter.length ? 'Nothing matches these filters in this period.' : 'Income and spending you record appear here, grouped by day.')}><AddTransactionMenu onAdd={addCashFlow}/></EmptyState>}
    <Pagination label={t('Transaction pages')} summary={t('Page {page} of {pages} · {count} transactions', { page: formatNumber(page, locale, 0), pages: formatNumber(pageCount, locale, 0), count: formatNumber(records.length, locale, 0) })} page={page} pageCount={pageCount} hasNext={page < pageCount} onPage={next => { setPaging({ key: listKey, page: next }); document.querySelector('.transactions-list')?.scrollIntoView({ block: 'start', behavior: 'smooth' }); }}/>
   </section>
   <TransactionsSummary summary={summary} currency={currency}/>
  </div>}
  {!loading && !error && <TransactionInsights owner={user} demo={demo} revision={reload} records={planning.data.records} today={today} onReview={reviewRecurring}/>}
  {editingMany && <BulkEditSheet records={chosen} categories={data.categories} removed={removedCategories.kinds} businesses={businessList} owners={owners} tags={tags.data.tags} tagsOf={tagsOf} onCreateTag={createTag} onSave={editMany} onClose={() => setEditingMany(false)}/>}
  {rule && <RuleDialog key={rule.id} rule={rule} records={demo ? data.records : undefined} categories={data.categories} removed={removedCategories.kinds} businesses={businessList} accounts={[...accounts].map(([id, name]) => ({ id, name }))} tags={tags.data.tags} tagsOf={tagsOf} onCreateTag={createTag} splits={splits} onSave={async (next, apply) => { const changed = await rules.save(next, apply); if (apply) showNotice(t('{changed} updated', { changed: formatNumber(changed, locale, 0) })); return changed; }} onClose={() => setRule(null)}/>}
  {rulesOpen && !rule && <RulesDialog rules={rules.rules} loading={rules.loading} error={rules.error} onRetry={rules.retry} categories={data.categories} businesses={businessList} tags={tags.data.tags} onEdit={setRule} onAdd={() => setRule(newRule())} onRemove={item => rules.remove(item.id)} onClose={() => setRulesOpen(false)}/>}
 </div>;
}
