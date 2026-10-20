"use client";
import { useLanguage } from '@/components/language-provider';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { RecordIcon } from '@/components/presentation-foundation/record-icon';
import { assetRecordKinds, type Entry } from '@/lib/finance';

/** Cash and deposits are added as accounts; every other kind of asset is offered here. */
export const choosableAssetKinds = assetRecordKinds.filter(kind => kind !== 'Cash' && kind !== 'Deposit') as Entry['kind'][];

/** Investments' Add asset: the kinds of asset as tiles; choosing one closes the dialog and opens that kind's form. */
export function AddAssetDialog({ open, onOpenChange, onChoose }: { open: boolean; onOpenChange: (open: boolean) => void; onChoose: (kind: Entry['kind']) => void }) {
 const { t } = useLanguage();
 return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="record-dialog"><DialogTitle>{t('Add asset')}</DialogTitle><DialogDescription className="sr-only">{t('Category')}</DialogDescription><div className="asset-type-options">
  {choosableAssetKinds.map(kind => <button key={kind} type="button" onClick={() => { onOpenChange(false); onChoose(kind); }}><RecordIcon record={{ kind, name: '' }}/><span>{t(kind)}</span></button>)}
 </div></DialogContent></Dialog>;
}
