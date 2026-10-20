import type { ReactNode } from 'react';
import { InfoHint } from '@/components/presentation-foundation/info-hint';

/** A field whose explanation sits behind an ⓘ beside its label rather than as a grey sentence under it. The control comes
 * before the ⓘ in the markup, so clicking the label text still focuses the control; the stylesheet puts the ⓘ on the label's line. */
export function HintedLabel({ label, hint, className, children }: { label: ReactNode; hint: ReactNode; className?: string; children: ReactNode }) {
 return <label className={className ? `hinted-label ${className}` : 'hinted-label'}><span className="hinted-label-text">{label}</span>{children}<InfoHint>{hint}</InfoHint></label>;
}
