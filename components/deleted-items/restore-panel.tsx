"use client";
import { RotateCcw } from 'lucide-react';
import { useLanguage } from '@/components/language-provider';
import { useDisplayMoney } from '@/components/display-money';
import { DeleteButton } from '@/components/presentation-foundation/delete-button';
import { InfoHint } from '@/components/presentation-foundation/info-hint';
import { ProgressLine } from '@/components/presentation-foundation/progress-line';
import { Button } from '@/components/ui/button';
import type { DeletedItem } from '@/lib/deleted-items';
import { frequencyLabels } from '@/lib/finance';
import { formatDate, formatDateTime } from '@/lib/format';
import type { Change, RestorePreview } from '@/lib/restore-preview';
import { DeletedAmount, DeletedIcon, deletedName, deletedTypeLabel, type ItemNames } from './deleted-row';

export type PanelNames = ItemNames & { accountName: (id: string | null | undefined) => string | null };

/** The details a person checks before bringing an item back: its date, category, account or schedule. */
function details(item: DeletedItem, names: PanelNames, t: (key: string) => string, locale: string): [string, string][] {
 if (item.source === 'savings_goals') return [['Target date', item.data.target_date ? formatDate(item.data.target_date, locale) : ''], ['Account', names.accountName(item.data.account_id) ?? '']];
 if (item.source === 'expense_plans') return [];
 const entry = item.data, once = entry.frequency === 'Once';
 return [[once ? 'Date' : 'Frequency', once ? formatDate(entry.date, locale) : t(frequencyLabels[entry.frequency])], ['Category', names.categoryName(entry)], ['Account', names.accountName(entry.account_id) ?? '']];
}

/** One figure the restore moves: its old value struck through, then the new one. */
function ChangeRow({ label, change, show, extra }: { label: string; change: Change; show: (value: number) => string; extra?: string }) {
 return <><dt>{label}</dt><dd><s>{show(change.before)}</s> {show(change.after)}{extra && <small> {extra}</small>}</dd></>;
}

/** What restoring the item moves, figures the workspace can tell exactly; nothing at all when it can tell none. */
function RestoreChanges({ preview }: { preview: RestorePreview }) {
 const { t } = useLanguage();
 const { entered } = useDisplayMoney();
 const { account, category } = preview;
 if (!account && !category) return null;
 const display = (value: number) => entered(value, category?.currency ?? '');
 return <div className="recovery-changes">
  <h3>{t('Restoring changes')}<InfoHint>{t('Figures as they will read once this item is back.')}</InfoHint></h3>
  <dl>
   {account && <ChangeRow label={account.name} change={account.balance} show={value => entered(value, account.currency)}/>}
   {category && <ChangeRow label={t('{category} spent', { category: category.name })} change={category.spent} show={display} extra={category.budget !== undefined ? t('of {amount}', { amount: display(category.budget) }) : undefined}/>}
   {category?.left && <ChangeRow label={t('Left in {category}', { category: category.name })} change={category.left} show={display}/>}
  </dl>
  {category?.budget !== undefined && <ProgressLine value={category.spent.after} target={category.budget} tone="expense"/>}
 </div>;
}

type Props = { item: DeletedItem; names: PanelNames; preview: RestorePreview | null; busy: boolean; onRestore: () => void; onDiscard: () => void };
/** The side panel: the selected item, what restoring it changes, one Restore, and a quiet bin to delete it for good. */
export function RestorePanel({ item, names, preview, busy, onRestore, onDiscard }: Props) {
 const { t, locale } = useLanguage();
 const name = deletedName(item, t);
 const rows = details(item, names, t, locale).filter(([, value]) => value);
 return <aside className="panel recovery-detail" aria-label={name}>
  <header className="recovery-detail-head">
   <DeletedIcon item={item} names={names}/>
   <div><h2>{name}</h2><small>{t(deletedTypeLabel(item))} · {t('Deleted on')} {formatDateTime(item.deleted_at, locale)}</small></div>
   <DeletedAmount item={item}/>
  </header>
  {rows.length > 0 && <dl className="recovery-facts">{rows.map(([label, value]) => <div key={label}><dt>{t(label)}</dt><dd>{value}</dd></div>)}</dl>}
  {preview && <RestoreChanges preview={preview}/>}
  <div className="recovery-detail-actions">
   <DeleteButton variant="ghost" label={t('Delete permanently')} disabled={busy} onClick={onDiscard}/>
   <Button disabled={busy} onClick={onRestore}><RotateCcw size={16} aria-hidden="true"/>{t('Restore {name}', { name })}</Button>
  </div>
 </aside>;
}
