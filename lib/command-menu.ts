import { assets, expenses, income, liabilities, type Entry } from './finance';

/** The window event that opens the command menu. */
export const commandMenuEvent = 'hoggish:command-menu';
/** Opens the command menu from anywhere in the shell (the top bar's search button). */
export const openCommandMenu = () => { window.dispatchEvent(new Event(commandMenuEvent)); };

/** One line of the command menu: a page, an action, or something the person saved. */
export type Command = { id: string; group: 'pages' | 'actions' | 'records'; label: string; /** Extra words a search may match (a kind, a page's long name). */ keywords?: string; /** A short word shown beside the label. */ detail?: string; /** A feature inside a page (Rules on Transactions): found by a search, not listed before one. */ searchOnly?: boolean };

/** How well `text` answers `query`: 3 it starts with it, 2 one of its words does, 1 it holds it, 0 it does not. */
export function matchRank(text: string, query: string, locale: string) {
 const needle = query.trim().toLocaleLowerCase(locale), hay = text.toLocaleLowerCase(locale);
 if (!needle) return 1;
 if (hay.startsWith(needle)) return 3;
 if (hay.split(/[\s/&·,.()-]+/).some(word => word.startsWith(needle))) return 2;
 return hay.includes(needle) ? 1 : 0;
}

/** The commands that answer the search, best first; a label match outranks a keyword match, and ties keep their order.
 * Without a search every page and action is listed; saved records and the features inside pages stay out of the way. */
export function matchCommands<T extends Command>(commands: readonly T[], query: string, locale: string, limit = 8): T[] {
 if (!query.trim()) return commands.filter(command => command.group !== 'records' && !command.searchOnly);
 const ranked = commands.map((command, index) => ({ command, index, rank: Math.max(matchRank(command.label, query, locale) * 2, matchRank(command.keywords ?? '', query, locale)) })).filter(item => item.rank > 0).sort((a, b) => b.rank - a.rank || a.index - b.index);
 const counts = new Map<string, number>();
 return ranked.filter(({ command }) => { const count = (counts.get(command.group) ?? 0) + 1; counts.set(command.group, count); return count <= limit; }).map(item => item.command);
}

/** The page that lists a saved record, so choosing it in the menu opens where it lives. */
export function recordPath(record: Pick<Entry, 'kind' | 'frequency' | 'holding_account_id'>) {
 if (income.includes(record.kind) || expenses.includes(record.kind)) return record.frequency === 'Once' ? '/transactions' : '/upcoming';
 if (liabilities.includes(record.kind) || record.kind === 'Money lent') return '/loans-debts';
 // Accounts lists cash outside an investment account and every deposit (`balanceAccounts`), as the Dashboard links them.
 if ((record.kind === 'Cash' && !record.holding_account_id) || record.kind === 'Deposit') return '/accounts';
 return assets.includes(record.kind) ? '/assets' : '/accounts';
}

/** What the person saved that a search can find: accounts, holdings, loans and schedules by name, each once, never a
 * one-time transaction (those are searched on Transactions) nor anything archived. */
export function searchableRecords<T extends Pick<Entry, 'id' | 'name' | 'kind' | 'frequency' | 'archived' | 'holding_account_id'>>(records: readonly T[]) {
 const seen = new Set<string>();
 return records.filter(record => {
  if (!record.name?.trim() || record.archived || seen.has(record.id)) return false;
  if ((income.includes(record.kind) || expenses.includes(record.kind)) && record.frequency === 'Once') return false;
  seen.add(record.id);
  return true;
 });
}
