"use client";
import { useState, type ReactNode } from 'react';
import { SurplusBreakdownDialog } from '@/components/cash-flow-drill-lazy';
import { useLanguage } from '@/components/language-provider';
import type { SurplusParts } from '@/lib/surplus-flows';

/** A surplus figure that opens how it is worked out. Without its parts it is plain text. */
export function SurplusButton({ parts, currency, goalFunding, className, children }: { parts: SurplusParts | null | undefined; currency: string; goalFunding?: number; className?: string; children: ReactNode }) {
 const { t } = useLanguage();
 const [open, setOpen] = useState(false);
 if (!parts) return <span className={className}>{children}</span>;
 return <>
  <button type="button" className={className ? `surplus-button ${className}` : 'surplus-button'} title={t('How is this calculated?')} onClick={() => setOpen(true)}>{children}</button>
  {open && <SurplusBreakdownDialog parts={parts} currency={currency} goalFunding={goalFunding} onClose={() => setOpen(false)}/>}
 </>;
}
