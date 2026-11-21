"use client";
import Link from 'next/link';
import { ArrowDownLeft, ArrowRightLeft, ArrowUpRight, Plus } from 'lucide-react';
import { useLanguage } from '@/components/language-provider';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { transferLink } from '@/lib/add-links';

/** The bar's Add, on every screen: an expense, an income or a transfer, each in its own form. */
export function AddMenu({ onExpense, onIncome }: { onExpense: () => void; onIncome: () => void }) {
 const { t } = useLanguage();
 return <DropdownMenu>
  <DropdownMenuTrigger asChild><Button size="sm" className="quick-add" aria-label={t('Add')}><Plus size={16} aria-hidden="true"/><span>{t('Add')}</span></Button></DropdownMenuTrigger>
  <DropdownMenuContent align="end">
   <DropdownMenuItem onSelect={onExpense}><ArrowUpRight aria-hidden="true"/>{t('Expense')}</DropdownMenuItem>
   <DropdownMenuItem onSelect={onIncome}><ArrowDownLeft aria-hidden="true"/>{t('Income')}</DropdownMenuItem>
   <DropdownMenuItem asChild><Link href={transferLink}><ArrowRightLeft aria-hidden="true"/>{t('Transfer')}</Link></DropdownMenuItem>
  </DropdownMenuContent>
 </DropdownMenu>;
}
