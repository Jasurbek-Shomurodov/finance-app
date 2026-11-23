"use client";
import { useId, type ReactNode } from 'react';
import { useLanguage } from '@/components/language-provider';
import { FieldError } from '@/components/presentation-foundation/field-error';
import { InlineError } from '@/components/presentation-foundation/inline-error';
import type { AssetDraft, AssetField, AssetProblem, AssetProblems } from '@/lib/add-asset';
import type { Entry } from '@/lib/finance';
import { formatMoney } from '@/lib/format';
import type { QuoteState } from './use-asset-quote';

/** What every step of Add asset is given: the draft, how to change it, what is wrong with it (once Continue was
 * pressed), and whether a save is under way. */
export type StepProps = { draft: AssetDraft; change: (next: AssetDraft) => void; problems: AssetProblems; disabled: boolean };
/** What a step that shows the current price also needs: where the quote stands and how to ask for it again. */
export type QuoteProps = { quote: QuoteState; onQuote: (entry: Entry) => void };

/** One labelled field of the flow with its problem under it. `name` is how the flow finds the field to focus
 * (`data-field`); the control takes `invalid` and `describedBy` from the render callback. */
export function Field({ name, label, problem, children }: { /** Left out for a field that can never be at fault. */ name?: AssetField; label: ReactNode; problem?: AssetProblem; children: (aria: { invalid: boolean; describedBy?: string }) => ReactNode }) {
 const { locale } = useLanguage();
 const id = useId();
 const values = problem?.money ? { amount: formatMoney(problem.money.amount, problem.money.currency, locale) } : undefined;
 return <div className="asset-field" data-field={name}>
  <label>{label}{children({ invalid: !!problem, describedBy: problem ? id : undefined })}</label>
  <FieldError id={id} message={problem?.message} values={values}/>
 </div>;
}

/** Where the current price stands, beside the field it fills: on its way, or why it did not come, with Retry. A price
 * that arrived needs no words; it is in the field. */
export function QuoteStatus({ entry, quote, onQuote }: QuoteProps & { entry: Entry }) {
 const { t } = useLanguage();
 if (quote.status === 'loading') return <p className="muted asset-quote" role="status">{t('Fetching prices…')}</p>;
 if (quote.status === 'failed') return <InlineError className="asset-quote" message={t(quote.message === 'Exchange rate unavailable.' ? quote.message : 'The current price could not be fetched. You can type it yourself.')} onRetry={() => onQuote(entry)}/>;
 return null;
}

/** Puts the keyboard in the first control of a field, for the first problem Continue found. */
export function focusField(root: HTMLElement | null, field: AssetField | undefined) {
 if (!field) return;
 root?.querySelector<HTMLElement>(`[data-field="${field}"] :is(input,select,textarea,button):not([disabled])`)?.focus();
}
