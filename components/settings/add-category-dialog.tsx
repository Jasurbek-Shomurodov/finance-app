"use client";
import { useState } from 'react';
import { CategoryIconPicker } from '@/components/category-icon-picker';
import { useDiscardChanges } from '@/components/discard-changes';
import { useLanguage } from '@/components/language-provider';
import { ErrorPopup } from '@/components/presentation-foundation/error-popup';
import { FormFooter } from '@/components/presentation-foundation/form-footer';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { categoryEmoji } from '@/lib/category-icons';
import { duplicateCategoryMessage } from '@/lib/category-names';
import type { Category } from '@/lib/planning';

type Props = { direction: Category['direction']; iconsDisabled: boolean;
 /** Whether a category of this direction already answers to the name (letter case aside). */ taken: (name: string) => boolean;
 /** Saves the category, then its icon when one was picked. */ onAdd: (name: string, icon: string | null) => Promise<void>; onClose: () => void };

/** A new income or expense category: its icon and its name. The name is saved before the icon. */
export function AddCategoryDialog({ direction, iconsDisabled, taken, onAdd, onClose }: Props) {
 const { t } = useLanguage();
 const [name, setName] = useState(''), [icon, setIcon] = useState<string | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
 const guard = useDiscardChanges(!!name.trim() || !!icon, onClose, busy);
 const duplicate = taken(name), ready = !!name.trim() && !duplicate;
 const title = t(direction === 'income' ? 'New income category' : 'New expense category');
 async function submit(event: { preventDefault: () => void }) {
  event.preventDefault(); if (busy || !ready) return;
  setBusy(true); setError('');
  try { await onAdd(name.trim(), icon); onClose(); }
  catch (reason) { setError((reason as Error).message); }
  finally { setBusy(false); }
 }
 return <><Dialog open onOpenChange={open => { if (!open) guard.close(); }}><DialogContent className="record-dialog category-edit-dialog" showCloseButton={!busy} aria-describedby={undefined}>
  <DialogTitle>{title}</DialogTitle>
  <form className="record-form" onSubmit={submit}>
   <div className="category-edit-fields">
    <CategoryIconPicker icon={icon ?? categoryEmoji(name)} label={t('Choose an icon')} chosen={!!icon} disabled={busy || iconsDisabled} onChoose={setIcon}/>
    <label>{t('Name')}<Input required autoFocus maxLength={80} value={name} disabled={busy} aria-invalid={duplicate || undefined} placeholder={t(direction === 'income' ? 'e.g. Freelance' : 'e.g. Leisure')} onChange={event => setName(event.target.value)}/></label>
   </div>
   {duplicate && <p className="error" role="alert">{t(duplicateCategoryMessage)}</p>}
   <ErrorPopup message={error}/>
   <FormFooter busy={busy} onCancel={guard.close}><Button disabled={busy || !ready} title={name.trim() ? undefined : t('Enter a name.')}>{t(busy ? 'Saving…' : direction === 'income' ? 'Add income category' : 'Add expense category')}</Button></FormFooter>
  </form>
 </DialogContent></Dialog>{guard.confirmation}</>;
}
