"use client";
import { useMemo, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useLanguage } from '@/components/language-provider';
import { useIsMobile } from '@/hooks/use-mobile';
import { countryOptions } from '@/lib/countries';

/** The countries whose translated name contains the search, or whose two-letter code is the search. */
export function matchingCountries(countries: ReadonlyArray<{ code: string; name: string }>, query: string, locale: string) {
 const search = query.trim().toLocaleLowerCase(locale);
 return search ? countries.filter(item => item.name.toLocaleLowerCase(locale).includes(search) || item.code.toLowerCase() === search) : [...countries];
}

/** Country or region as a searchable list instead of some 250 options in a native select. Optional: the first choice clears it.
 * On phones the list opens full screen, so the search stays on top and the list scrolls above the keyboard. */
export function CountryCombobox({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (code: string) => void }) {
 const { t, locale } = useLanguage();
 const [open, setOpen] = useState(false), [query, setQuery] = useState('');
 const mobile = useIsMobile();
 const countries = useMemo(() => countryOptions(locale), [locale]);
 const matches = matchingCountries(countries, query, locale);
 const name = countries.find(item => item.code === value)?.name;
 const toggle = (next: boolean) => { setOpen(next); if (!next) setQuery(''); };
 const choose = (code: string) => { onChange(code); toggle(false); };
 const picker = <Command shouldFilter={false} className="country-command">
  <CommandInput aria-label={t('Search countries')} placeholder={t('Search countries')} value={query} onValueChange={setQuery} maxLength={60}/>
  <CommandList id={id + '-list'} aria-label={label} className="country-list">
   <CommandEmpty>{t('No matching countries.')}</CommandEmpty>
   <CommandGroup>
    {!query.trim() && <CommandItem value="none" onSelect={() => choose('')} className="country-option" data-chosen={!value || undefined}><span>{t('Select your country')}</span>{!value && <Check size={16} aria-hidden="true"/>}</CommandItem>}
    {matches.map(item => <CommandItem key={item.code} value={item.code} onSelect={() => choose(item.code)} className="country-option" data-chosen={item.code === value || undefined}><span>{item.name}</span>{item.code === value && <Check size={16} aria-hidden="true"/>}</CommandItem>)}
   </CommandGroup>
  </CommandList>
 </Command>;
 return <>
  <Popover open={open && !mobile} onOpenChange={toggle}>
   <PopoverTrigger asChild><Button id={id} type="button" variant="outline" className="country-trigger" role="combobox" aria-expanded={open} aria-controls={open ? id + '-list' : undefined} data-empty={!name || undefined}>
    <span>{name ?? t('Select your country')}</span><ChevronDown size={16} aria-hidden="true"/>
   </Button></PopoverTrigger>
   <PopoverContent align="start" collisionPadding={16} className="country-popover">{picker}</PopoverContent>
  </Popover>
  {mobile && <Dialog open={open} onOpenChange={toggle}><DialogContent className="country-sheet"><DialogTitle>{label}</DialogTitle>{picker}</DialogContent></Dialog>}
 </>;
}
