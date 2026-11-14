"use client";
import { useState, type ReactNode } from 'react';
import { Plus } from 'lucide-react';
import { useLanguage } from '@/components/language-provider';
import { DeleteButton } from '@/components/presentation-foundation/delete-button';
import { SortableItem, SortableList } from '@/components/presentation-foundation/sortable';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { currencyLabel, currencyMatches, maxPreferredCurrencies, movePreferredCurrency, replacePreferredCurrency, togglePreferredCurrency } from '@/lib/currencies';
import { formatNumber } from '@/lib/format';
import { quotedPair } from '@/lib/market';

type Rates = number | Record<string, number> | undefined;
type Props = { currencies: string[]; onChange: (currencies: string[]) => void; rates?: Rates; labelId: string;
 /** The rates' source and date, shown under the list. */ children?: ReactNode };

/** The preferred currencies as one ordered list: the first row is the primary currency, so dragging a row to the top
 * makes it primary. Codes alone; removing one never changes a record. */
export function PreferredCurrencies({ currencies, onChange, rates, labelId, children }: Props) {
 const { t, locale } = useLanguage();
 const [notice, setNotice] = useState<{ code: string; reason: 'full' | 'last' } | null>(null);
 function toggle(code: string) {
  const result = togglePreferredCurrency(currencies, code);
  if ('blocked' in result) setNotice({ code, reason: result.blocked });
  else onChange(result.currencies);
 }
 const only = currencies.length === 1;
 return <div className="preferred-currencies">
  <SortableList id="preferred-currencies" items={currencies} nameOf={code => code} onMove={(code, over) => onChange(movePreferredCurrency(currencies, code, over))} disabled={only}>
   <ul className="preferred-currency-list" aria-labelledby={labelId}>{currencies.map((code, index) => <SortableItem as="li" key={code} id={code} label={code} className="preferred-currency">
    <span className="preferred-currency-code">{code}</span>
    {index === 0 ? <span className="preferences-primary">{t('Primary')}</span> : <PairRate primary={currencies[0]} code={code} rates={rates} locale={locale}/>}
    <DeleteButton variant="ghost" className="preferred-currency-remove" label={t('Remove {currency}', { currency: code })} reason={only ? t('Keep at least one currency') : undefined} onClick={() => onChange(currencies.filter(item => item !== code))}/>
   </SortableItem>)}</ul>
  </SortableList>
  <div className="preferred-currency-actions">
   <CurrencyCatalogue currencies={currencies} onToggle={toggle}/>
   <span className="preferred-currency-count">{t('{count} of {limit}', { count: formatNumber(currencies.length, locale, 0), limit: formatNumber(maxPreferredCurrencies, locale, 0) })}</span>
  </div>
  {children}
  <AlertDialog open={!!notice} onOpenChange={open => { if (!open) setNotice(null); }}><AlertDialogContent>
   <AlertDialogTitle>{t(notice?.reason === 'last' ? 'Keep at least one currency' : 'You already have two currencies')}</AlertDialogTitle>
   <AlertDialogDescription>{notice && t(notice.reason === 'last' ? '{code} is your only currency, so it can’t be cleared. Pick another currency first.' : 'You can keep up to two preferred currencies. Choose which one {code} replaces.', { code: notice.code })}</AlertDialogDescription>
   <AlertDialogFooter>{notice?.reason === 'full' ? <><AlertDialogCancel>{t('Cancel')}</AlertDialogCancel>{currencies.map(code => <AlertDialogAction key={code} onClick={() => onChange(replacePreferredCurrency(currencies, code, notice.code))}>{t('Replace {code}', { code })}</AlertDialogAction>)}</> : <AlertDialogAction>{t('OK')}</AlertDialogAction>}</AlertDialogFooter>
  </AlertDialogContent></AlertDialog>
 </div>;
}

/** How the second currency trades against the primary one, when a rate is known. */
function PairRate({ primary, code, rates, locale }: { primary: string; code: string; rates: Rates; locale: string }) {
 const pair = quotedPair(primary, code, rates);
 if (!pair) return null;
 return <span className="preferred-currency-rate" dir="ltr">{formatNumber(1, locale, 0)} {pair.from} = {formatNumber(pair.rate, locale, pair.rate >= 100 ? 0 : 4)} {pair.to}</span>;
}

/** The full fiat catalogue, searchable by code or name; it lives only in Settings. */
function CurrencyCatalogue({ currencies, onToggle }: { currencies: string[]; onToggle: (code: string) => void }) {
 const { t, locale } = useLanguage();
 const [open, setOpen] = useState(false), [query, setQuery] = useState('');
 const matches = currencyMatches(query, locale);
 return <Dialog open={open} onOpenChange={next => { setOpen(next); if (!next) setQuery(''); }}>
  <DialogTrigger asChild><Button type="button" variant="outline" size="sm" className="currency-search-trigger"><Plus size={16} aria-hidden="true"/>{t(currencies.length < maxPreferredCurrencies ? 'Add currency' : 'Change currencies')}</Button></DialogTrigger>
  <DialogContent className="currency-search-dialog sm:max-w-xl" showCloseButton={false}>
   <DialogHeader><DialogTitle>{t('Preferred currencies')}</DialogTitle><DialogDescription>{t('Choose one or two currencies. The primary currency opens by default.')}</DialogDescription></DialogHeader>
   <Input aria-label={t('Search currencies')} placeholder={t('Search currencies')} value={query} onChange={event => setQuery(event.target.value)}/>
   <div className="currency-catalogue">{matches.map(code => <label key={code}><input type="checkbox" checked={currencies.includes(code)} onChange={() => onToggle(code)}/><span>{currencyLabel(code, locale)}</span></label>)}{!matches.length && <p className="muted currency-search-empty" role="status">{t('No matching currencies.')}</p>}</div>
   <div className="currency-search-footer"><DialogClose asChild><Button type="button">{t('Done')}</Button></DialogClose></div>
  </DialogContent>
 </Dialog>;
}
