"use client";
import { Briefcase } from 'lucide-react';
import { useLanguage } from '@/components/language-provider';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { RecordIcon } from '@/components/presentation-foundation/record-icon';
import { assetRecordKinds, type Entry } from '@/lib/finance';

/** Cash and deposits are added as accounts; every other kind of asset is offered here. */
export const choosableAssetKinds = assetRecordKinds.filter(kind => kind !== 'Cash' && kind !== 'Deposit') as Entry['kind'][];

type Props = { open: boolean; onOpenChange: (open: boolean) => void; onChoose: (kind: Entry['kind']) => void;
 /** Starts business tracking setup (profile, accounts, guide), the flow Settings › Businesses starts; left out for a viewer. */onBusinessSetup?: () => void;
 /** A business is tracked already, so the setup adds another. */tracksBusinesses?: boolean };

/** Investments' Add asset: the kinds of asset as tiles; choosing one closes the dialog and opens that kind's form. A
 * business is an asset too, so its tracking setup starts here as well as from Settings. */
export function AddAssetDialog({ open, onOpenChange, onChoose, onBusinessSetup, tracksBusinesses = false }: Props) {
 const { t } = useLanguage();
 return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="record-dialog"><DialogTitle>{t('Add asset')}</DialogTitle><DialogDescription className="sr-only">{t('Category')}</DialogDescription><div className="asset-type-options">
  {choosableAssetKinds.map(kind => <button key={kind} type="button" onClick={() => { onOpenChange(false); onChoose(kind); }}><RecordIcon record={{ kind, name: '' }}/><span>{t(kind)}</span></button>)}
 </div>
 {onBusinessSetup && <div className="record-form-footer"><Button variant="outline" onClick={() => { onOpenChange(false); onBusinessSetup(); }}><Briefcase size={16} aria-hidden="true"/>{t(tracksBusinesses ? 'Add business' : 'Set up business tracking')}</Button></div>}
 </DialogContent></Dialog>;
}
