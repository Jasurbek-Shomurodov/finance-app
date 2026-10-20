"use client";
import { useId, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useLanguage } from '@/components/language-provider';
import { formatNumber } from '@/lib/format';

/** One choice: its name, the group it is listed under, and anything shown beside or under the name. */
export type PickerItem = { id: string; name: string; group: string; disabled?: boolean; badge?: ReactNode; details?: ReactNode };
type Props = {
 label: string; placeholder: string; searchLabel: string; allLabel: string; emptyText: string;
 /** The groups in the order the side column lists them; a group with nothing matching the search is left out. */
 groups: readonly string[]; groupLabel: (group: string) => string;
 items: PickerItem[]; value: string; disabled?: boolean; onChange: (id: string) => void;
};

/** A choice from a searchable popover: groups down the side, the matching items beside them, and arrow keys between them.
 * Income source and an expense's Linked to are both this picker. */
export function GroupedPicker({ label, placeholder, searchLabel, allLabel, emptyText, groups, groupLabel, items, value, disabled, onChange }: Props) {
 const { locale } = useLanguage();
 const [open, setOpen] = useState(false), [search, setSearch] = useState(''), [group, setGroup] = useState('all');
 const labelId = useId(), resultsId = useId();
 const results = useRef<HTMLDivElement>(null);
 const query = search.trim().toLocaleLowerCase(locale);
 const matching = items.filter(item => `${item.name} ${groupLabel(item.group)}`.toLocaleLowerCase(locale).includes(query));
 const shown = groups.filter(key => matching.some(item => item.group === key));
 const active = group === 'all' || shown.includes(group) ? group : 'all';
 const visible = matching.filter(item => active === 'all' || item.group === active);
 const selected = items.find(item => item.id === value);
 const choose = (id: string) => { onChange(id); setOpen(false); };
 const firstResult = () => results.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
 return <div className="income-source-field"><span id={labelId}>{label}</span><Popover modal open={open} onOpenChange={next => { setOpen(next); if (next) { setSearch(''); setGroup('all'); } }}>
  <PopoverTrigger asChild><Button type="button" variant="outline" className="income-source-trigger" disabled={disabled} aria-labelledby={labelId}>
   <span>{selected?.name ?? placeholder}</span><ChevronDown size={16}/>
  </Button></PopoverTrigger>
  <PopoverContent align="start" className="income-source-popover" aria-labelledby={labelId}>
   <div className="income-source-search"><Search size={17}/><Input aria-label={searchLabel} placeholder={searchLabel} value={search} onChange={event => setSearch(event.target.value)} onKeyDown={event => { if (event.key === 'ArrowDown') { event.preventDefault(); firstResult(); } }}/></div>
   <div className="income-source-columns"><div className="income-source-categories" aria-label={label}>
    {['all', ...shown].map(key => <button type="button" key={key} aria-pressed={active === key} aria-controls={resultsId} onMouseEnter={() => setGroup(key)} onFocus={() => setGroup(key)} onClick={() => setGroup(key)} onKeyDown={event => { if (event.key === 'ArrowRight') { event.preventDefault(); firstResult(); } }}>
     <span>{key === 'all' ? allLabel : groupLabel(key)}</span><small>{formatNumber(matching.filter(item => key === 'all' || item.group === key).length, locale, 0)}</small>
    </button>)}
   </div><div id={resultsId} ref={results} className="income-source-results" onKeyDown={event => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const buttons = Array.from(results.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement); if (index < 0) return;
    event.preventDefault(); buttons[event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus();
   }}>
    <p className="muted">{active === 'all' ? allLabel : groupLabel(active)}</p>
    {visible.map(item => <button type="button" key={item.id} disabled={item.disabled} aria-pressed={value === item.id} onClick={() => choose(item.id)}><span><span className="income-source-title-row"><strong>{item.name}</strong>{item.badge}</span>{item.details}</span></button>)}
    {!visible.length && <p role="status" className="muted">{emptyText}</p>}
   </div></div>
  </PopoverContent>
 </Popover></div>;
}
