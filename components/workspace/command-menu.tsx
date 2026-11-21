"use client";
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowDownLeft, ArrowRightLeft, ArrowUpRight, Coins, CornerDownLeft, Moon, Search, Sun, Target, Wallet } from 'lucide-react';
import { useTheme } from 'next-themes';
import { transferLink } from '@/lib/add-links';
import { useLanguage } from '@/components/language-provider';
import { RecordIcon } from '@/components/presentation-foundation/record-icon';
import { useThemeSwitch } from '@/components/theme-provider';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { sections } from '@/components/workspace/navigation';
import { useWorkspace } from '@/components/workspace/workspace-provider';
import { commandMenuEvent as openEvent, matchCommands, recordPath, searchableRecords, type Command as MenuCommand } from '@/lib/command-menu';

type Line = MenuCommand & { icon: ReactNode; run: () => void };

/** Whether a key press belongs to something being typed, where "/" is a character and not a shortcut. */
const typing = (target: EventTarget | null) => target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));

/** The command menu: every page, the common actions and whatever the person saved, one search away. It opens with
 * ⌘K (Ctrl+K), with "/" outside a field, or from the top bar. `onNavigate` opens a page as the drawer does. */
export function CommandMenu({ onNavigate }: { onNavigate: (path: string) => void }) {
 const { t, locale } = useLanguage();
 const { planning, readOnly, quickExpense, addCashFlow, addAccountRecord, currency, setCurrency, preferencesData } = useWorkspace();
 const { resolvedTheme } = useTheme();
 const switchTheme = useThemeSwitch();
 const [open, setOpen] = useState(false), [query, setQuery] = useState('');
 useEffect(() => {
  const show = () => setOpen(true);
  const key = (event: KeyboardEvent) => {
   if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey) { event.preventDefault(); setOpen(value => !value); }
   // "/" searches, as on the web at large, unless it is being typed or a dialog is already open.
   else if (event.key === '/' && !event.metaKey && !event.ctrlKey && !event.altKey && !typing(event.target) && !document.querySelector('[role=dialog],[role=alertdialog]')) { event.preventDefault(); setOpen(true); }
  };
  window.addEventListener(openEvent, show); document.addEventListener('keydown', key);
  return () => { window.removeEventListener(openEvent, show); document.removeEventListener('keydown', key); };
 }, []);
 const change = (next: boolean) => { setOpen(next); if (!next) setQuery(''); };
 /** Closes the menu first, so a form the command opens takes the focus the menu gives back. */
 const run = (action: () => void) => () => { change(false); action(); };
 const records = planning.data.records, goals = planning.data.goals;
 const lines = useMemo<Line[]>(() => {
  const pages: Line[] = sections.map(({ name, label, icon: Icon, path }) => ({ id: 'page:' + path, group: 'pages', label: t(label), keywords: `${t(name)} ${name} ${label}`, icon: <Icon aria-hidden="true"/>, run: () => onNavigate(path) }));
  const adds: Line[] = readOnly ? [] : [
   { id: 'add-expense', group: 'actions', label: t('Add expense'), icon: <ArrowUpRight aria-hidden="true"/>, run: quickExpense },
   { id: 'add-income', group: 'actions', label: t('Add income'), icon: <ArrowDownLeft aria-hidden="true"/>, run: () => addCashFlow('Other income') },
   { id: 'transfer', group: 'actions', label: t('Transfer money'), icon: <ArrowRightLeft aria-hidden="true"/>, run: () => onNavigate(transferLink) },
   { id: 'add-account', group: 'actions', label: t('Add account'), icon: <Wallet aria-hidden="true"/>, run: () => addAccountRecord('Cash') },
  ];
  const dark = resolvedTheme !== 'light';
  const display: Line[] = [
   { id: 'theme', group: 'actions', label: t(dark ? 'Switch to light mode' : 'Switch to dark mode'), keywords: t('Theme'), icon: dark ? <Sun aria-hidden="true"/> : <Moon aria-hidden="true"/>, run: () => switchTheme() },
   ...preferencesData.currencies.filter(code => code !== currency).map((code): Line => ({ id: 'currency:' + code, group: 'actions', label: t('Show amounts in {currency}', { currency: code }), keywords: t('Display currency'), icon: <Coins aria-hidden="true"/>, run: () => setCurrency(code) })),
  ];
  const saved: Line[] = [
   ...searchableRecords(records).map((record): Line => ({ id: 'record:' + record.id, group: 'records', label: record.name, keywords: t(record.kind), detail: t(record.kind), icon: <RecordIcon record={record}/>, run: () => onNavigate(recordPath(record)) })),
   ...goals.filter(goal => !goal.archived).map((goal): Line => ({ id: 'goal:' + goal.id, group: 'records', label: goal.name, keywords: t('Goals'), detail: t('Goals'), icon: <Target aria-hidden="true"/>, run: () => onNavigate('/goals') })),
  ];
  return [...pages, ...adds, ...display, ...saved];
 }, [t, readOnly, resolvedTheme, currency, preferencesData.currencies, records, goals]); // eslint-disable-line react-hooks/exhaustive-deps -- the actions are rebuilt by the workspace on every render and read only when a line runs
 const shown = matchCommands(lines, query, locale);
 const group = (name: Line['group'], heading: string) => {
  const items = shown.filter(line => line.group === name);
  return items.length > 0 && <CommandGroup heading={heading}>{items.map(line => <CommandItem key={line.id} value={line.id} onSelect={run(line.run)} className="command-line"><span className="command-line-icon">{line.icon}</span><span className="command-line-label">{line.label}</span>{line.detail && <small>{line.detail}</small>}<CornerDownLeft className="command-line-enter" aria-hidden="true"/></CommandItem>)}</CommandGroup>;
 };
 const search = query.trim();
 return <Dialog open={open} onOpenChange={change}>
  <DialogContent className="command-menu" showCloseButton={false}>
   <DialogTitle className="sr-only">{t('Command menu')}</DialogTitle><DialogDescription className="sr-only">{t('Search or jump to…')}</DialogDescription>
   <Command shouldFilter={false} loop>
    <CommandInput aria-label={t('Search or jump to…')} placeholder={t('Search or jump to…')} value={query} onValueChange={setQuery} maxLength={120}/>
    <CommandList aria-label={t('Command menu')}>
     <CommandEmpty>{t('No results.')}</CommandEmpty>
     {group('pages', t('Go to'))}
     {group('actions', t('Actions'))}
     {group('records', t('Your records'))}
     {search && <CommandGroup heading={t('Transactions')}><CommandItem value="transactions-search" onSelect={run(() => onNavigate('/transactions?q=' + encodeURIComponent(search)))} className="command-line"><span className="command-line-icon"><Search aria-hidden="true"/></span><span className="command-line-label">{t('Search transactions for “{query}”', { query: search })}</span><CornerDownLeft className="command-line-enter" aria-hidden="true"/></CommandItem></CommandGroup>}
    </CommandList>
   </Command>
   <footer className="command-menu-keys" aria-hidden="true"><span><kbd>↑</kbd><kbd>↓</kbd>{t('Navigate')}</span><span><kbd>↵</kbd>{t('Select')}</span><span><kbd>esc</kbd>{t('Close')}</span></footer>
  </DialogContent>
 </Dialog>;
}
