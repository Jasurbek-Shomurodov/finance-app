"use client";
import { useId } from 'react';
import { useLanguage } from '@/components/language-provider';
import { Input } from '@/components/ui/input';
import { borrowers } from '@/lib/lending-groups';
import type { Entry } from '@/lib/finance';

/** The group money lent belongs to (Family, a friend with several loans). Groups already used are offered, so loans to the same group sit together. */
export function BorrowerField({ entry, records, disabled, onChange }: { entry: Entry; records: readonly Entry[]; disabled?: boolean; onChange: (group: string) => void }) {
 const { t } = useLanguage();
 const list = useId();
 return <label>{t('Borrower group (optional)')}
  <Input list={list} maxLength={120} value={entry.borrower_group ?? ''} disabled={disabled} placeholder={t('e.g. Family')} onChange={event => onChange(event.currentTarget.value)}/>
  <datalist id={list}>{borrowers(records).map(name => <option key={name} value={name}/>)}</datalist>
 </label>;
}
