"use client";
import { useId, useState } from 'react';
import { Input } from '@/components/ui/input';
import { useLanguage } from '@/components/language-provider';
import { FieldError } from '@/components/presentation-foundation/field-error';
import { matchingNames, type NameMatch } from '@/lib/record-names';
import { formatNumber } from '@/lib/format';
import type { Entry } from '@/lib/finance';

type Props = {
  entry: Entry; rows: Entry[]; onChange: (name: string) => void; placeholder: string; label?: string; original?: Entry; optional?: boolean;
  /** The kinds whose past names are offered; the record's own kind when left out. */
  kinds?: readonly string[];
  /** Takes a chosen suggestion instead of `onChange`, so the form can fill in more than the name (its category and last amount). */
  onPick?: (match: NameMatch) => void;
  /** Why the name stops the save, as an English key: shown under the field. */
  error?: string;
};

export function RecordNameInput({ entry, rows, onChange, placeholder, label, original, optional = false, kinds, onPick, error }: Props) {
  const { t, locale } = useLanguage();
  const id = useId();
  const [selection, setSelection] = useState<{ id: string; kind: string | null; name: string } | null>(null);
  // A chosen suggestion stays put away until the name is typed again or the kind changes; a form that fills the category
  // from it (`onPick`) may change the kind itself, so there only the name counts.
  const dismissed = selection?.id === entry.id && selection.name === entry.name && (selection.kind === null || selection.kind === entry.kind);
  const matches = matchingNames(rows, entry, original, kinds);
  const exact = matches.find(match => match.exact);
  const described = [!dismissed && matches.length ? id + '-matches' : '', error ? id + '-error' : ''].filter(Boolean).join(' ');
  const pick = (match: NameMatch) => { setSelection({ id: entry.id, kind: onPick ? null : entry.kind, name: match.name }); if (onPick) onPick(match); else onChange(match.name); };
  return <div className="record-name-field"><label htmlFor={id}>{label || t('Name')}</label><Input id={id} value={entry.name} onChange={e => { setSelection(null); onChange(e.target.value); }} maxLength={120} placeholder={placeholder} required={!optional} autoComplete="off" aria-invalid={error ? true : undefined} aria-describedby={described || undefined}/>
    <FieldError id={id + '-error'} message={error}/>
    {!dismissed && matches.length > 0 && <div id={id + '-matches'} className="name-matches"><p role="status">{t(exact ? 'This name already exists. You can add another record.' : 'Matching existing names')}</p><ul>{matches.slice(0, 8).map(match => <li key={match.name}><button type="button" onClick={() => pick(match)}><strong>{match.name}</strong><span>{t('Existing records: {count}', { count: formatNumber(match.count, locale, 0) })}</span></button></li>)}</ul></div>}
  </div>;
}
