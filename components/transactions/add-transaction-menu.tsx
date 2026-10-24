import { Plus } from 'lucide-react';
import { useLanguage } from '@/components/language-provider';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import type { Entry } from '@/lib/finance';

/** "Add transaction" offers both directions; each opens the existing income or expense form. */
export function AddTransactionMenu({ onAdd }: { onAdd: (kind: Entry['kind']) => void }) {
 const { t } = useLanguage();
 return <DropdownMenu>
  <DropdownMenuTrigger asChild><Button><Plus size={16} aria-hidden="true"/>{t('Add transaction')}</Button></DropdownMenuTrigger>
  <DropdownMenuContent align="end">
   <DropdownMenuItem onSelect={() => onAdd('Other income')}>{t('Add income')}</DropdownMenuItem>
   <DropdownMenuItem onSelect={() => onAdd('Other expense')}>{t('Add expense')}</DropdownMenuItem>
  </DropdownMenuContent>
 </DropdownMenu>;
}
