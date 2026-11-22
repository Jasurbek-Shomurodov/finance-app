"use client";
import type { ReactNode } from 'react';
import { useLanguage } from '@/components/language-provider';
import { Button } from '@/components/ui/button';

type Props = { busy?: boolean; onCancel: () => void; cancelLabel?: string; /** Why the form cannot be saved yet, already translated: shown beside a Save that is switched off. */ blocked?: string; children?: ReactNode };

/** The closing row of a dialog form: a Cancel button that respects the busy state, then the form's own actions. A Save
 * that is switched off never stands alone: `blocked` says why, in words, above the buttons. */
export function FormFooter({ busy = false, onCancel, cancelLabel, blocked, children }: Props) {
 const { t } = useLanguage();
 return <div className="record-form-footer">{blocked && !busy && <p className="form-blocked-reason" role="status">{blocked}</p>}<Button type="button" variant="outline" disabled={busy} onClick={onCancel}>{cancelLabel ?? t('Cancel')}</Button>{children}</div>;
}
