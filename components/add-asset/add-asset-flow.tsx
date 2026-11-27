"use client";
import { ArrowLeft, Check, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useDiscardChanges } from '@/components/discard-changes';
import { useLanguage } from '@/components/language-provider';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useDatedExchangeRate } from '@/hooks/use-dated-exchange-rate';
import { useStepFocus } from '@/hooks/use-step-focus';
import { assetProblems, assetSavePlan, assetSteps, firstProblem, newAssetDraft, purchaseKind, withKind, withQuote, type AssetStep } from '@/lib/add-asset';
import type { Entry } from '@/lib/finance';
import { formatNumber } from '@/lib/format';
import type { HoldingAccount } from '@/lib/holding-accounts';
import { metals } from '@/lib/precious-metals';
import { quoteKey } from '@/lib/unit-quote';
import { AmountStep } from './amount-step';
import { focusField } from './field';
import { PaidStep, PartialNotice, ReviewLine } from './paid-step';
import { useAssetQuote } from './use-asset-quote';
import { useAssetSave, type AssetSavers } from './use-asset-save';
import { KindChip, KindStep, WhatStep } from './what-step';

const stepLabels: Record<AssetStep, string> = { kind: 'Kind', what: 'What', amount: 'How much', paid: 'Paid from' };

export type AddAssetProps = {
 /** Starts on a kind, inside an investment account when one is named (Add holding on an account's card). */
 preset?: { kind: Entry['kind']; holdingAccountId?: string; currency?: string };
 /** The workspace currency a new asset starts in, and the currencies it may be kept in. */
 currency: string; currencies: string[];
 /** The workspace's records, for the cash accounts that can pay; `accountsReady` once their balances have loaded. */
 accounts: readonly Entry[]; accountsReady: boolean; holdingAccounts: readonly HoldingAccount[];
 today: string; demo?: boolean;
 /** The current price of one unit of a holding, in its own currency. */
 quote: (target: Entry) => Promise<number>;
 savers: AssetSavers;
 /** A business is tracked through its own setup, which this starts in place of the flow. */
 onBusinessSetup: () => void;
 onClose: () => void;
 /** The asset is saved (with or without its purchase): the lists read again and the flow closes. */
 onSaved: () => void;
};

/** The flow's draft, the step it is on and everything worked out from them. */
function useAssetFlow({ preset, currency, accounts, today, quote, savers, onBusinessSetup, onClose, onSaved }: AddAssetProps) {
 const { t } = useLanguage();
 const [draft, setDraft] = useState(() => newAssetDraft(currency, today, () => crypto.randomUUID(), preset));
 const [step, setStep] = useState(preset ? 1 : 0), [touched, setTouched] = useState(false), [savedOn, setSavedOn] = useState('');
 const { entry, pay } = draft, steps = assetSteps(entry.kind), name = steps[step] ?? 'kind', last = step === steps.length - 1;
 const quotes = useAssetQuote(quote, (key, price) => setDraft(current => quoteKey(current.entry) === key ? withQuote(current, price) : current));
 const account = accounts.find(item => item.id === pay.account_id);
 // Only a valued asset paid in another currency converts; a Buy takes both amounts as they were.
 const fx = useDatedExchangeRate(pay.from === 'account' && purchaseKind(entry.kind) === 'contribution' ? account?.currency : undefined, entry.currency, pay.date);
 const context = { today, accounts, rate: fx.rate, optionalName: entry.kind === 'Precious metals' };
 const saving = useAssetSave(savers, onSaved);
 const problems = assetProblems(draft, name, context);
 const guard = useDiscardChanges(draft.chosen && !saving.recorded, onClose, saving.busy);
 const go = (to: number) => { setTouched(false); setStep(to); };
 function choose(kind: Entry['kind']) {
  if (kind === 'Business') { onClose(); onBusinessSetup(); return; }
  setDraft(withKind(draft, kind, today)); go(1);
 }
 function next(event: FormEvent) {
  event.preventDefault();
  if (saving.busy) return;
  if (name === 'kind') { if (draft.chosen) go(1); return; }
  const field = firstProblem(problems);
  if (field) { setTouched(true); focusField(event.currentTarget as HTMLElement, field); return; }
  if (!last) { go(step + 1); return; }
  setTouched(false);
  if (!saving.recorded) setSavedOn(pay.date);
  const metal = entry.kind === 'Precious metals' ? metals.find(item => item.code === (entry.metal ?? 'XAU'))?.name : undefined;
  void saving.save(assetSavePlan(draft, { ...context, name: metal && t(metal) }));
 }
 /** Closing after the record was saved keeps it: the lists read again. Before that, typed work asks first. */
 const close = () => { if (saving.busy) return; if (saving.recorded) onSaved(); else guard.close(); };
 return { draft, setDraft, step, steps, name, last, touched, problems: touched ? problems : {}, quotes, fx, saving, guard, savedOn, go, choose, next, close };
}

/** The bar across the top: Back, the numbered steps (a finished one is a way back to it) and Close. */
function FlowBar({ flow, onClose }: { flow: ReturnType<typeof useAssetFlow>; onClose: () => void }) {
 const { t, locale } = useLanguage();
 const { step, steps, saving, go } = flow, fixed = saving.busy || saving.recorded;
 return <>
  <header className="goal-setup-bar">
   {step > 0 && !saving.recorded ? <Button type="button" variant="ghost" size="icon" disabled={saving.busy} aria-label={t('Back')} onClick={() => go(step - 1)}><ArrowLeft size={18} aria-hidden="true"/></Button> : <span className="goal-setup-spacer"/>}
   <DialogTitle className="sr-only">{t('Add asset')}</DialogTitle><DialogDescription className="sr-only">{t(stepLabels[flow.name])}</DialogDescription>
   <ol className="goal-setup-steps">{steps.map((each, index) => <li key={each} aria-current={index === step ? 'step' : undefined}>
    {index < step ? <button type="button" disabled={fixed} onClick={() => go(index)}><span className="goal-setup-step-mark" aria-hidden="true"><Check size={13}/></span>{t(stepLabels[each])}</button> : <span><span className="goal-setup-step-mark" aria-hidden="true">{formatNumber(index + 1, locale, 0)}</span>{t(stepLabels[each])}</span>}
   </li>)}</ol>
   <Button type="button" variant="ghost" size="icon" disabled={saving.busy} aria-label={t('Close')} onClick={onClose}><X size={18} aria-hidden="true"/></Button>
  </header>
  <div className="goal-setup-progress" aria-hidden="true"><span style={{ width: `${(step + 1) / steps.length * 100}%` }}/></div>
 </>;
}

/** The step the flow is on, under the chosen kind's chip and, after a purchase failed, what was and was not saved. */
function FlowStep({ flow, props }: { flow: ReturnType<typeof useAssetFlow>; props: AddAssetProps }) {
 const { draft, setDraft, name, problems, quotes, saving } = flow, { entry } = draft;
 const stepProps = { draft, change: setDraft, problems, disabled: saving.busy || saving.recorded };
 const quoteProps = { quote: quotes.stateFor(entry), onQuote: (target: Entry) => void quotes.fetch(target) };
 return <div className="asset-flow-step" key={name}>
  {name !== 'kind' && <KindChip kind={entry.kind} disabled={stepProps.disabled} onChange={() => flow.go(0)}/>}
  {saving.partial && <PartialNotice draft={draft} accounts={props.accounts} partial={saving.partial} onClose={props.onSaved}/>}
  {name === 'kind' && <KindStep current={draft.chosen ? entry.kind : undefined} onChoose={flow.choose}/>}
  {name === 'what' && <WhatStep {...stepProps} {...quoteProps} holdingAccounts={props.holdingAccounts}/>}
  {name === 'amount' && <AmountStep {...stepProps} {...quoteProps} today={props.today} currencies={props.currencies}/>}
  {name === 'paid' && <PaidStep {...stepProps} disabled={saving.busy} today={props.today} accounts={props.accounts} accountsReady={props.accountsReady} fx={flow.fx} partial={saving.partial} minDate={saving.recorded ? flow.savedOn : undefined}/>}
 </div>;
}

/** Add asset, from every place that offers it: the kind, what it is, how much, and where the money came from, then one
 * Save. Enter moves on; Back keeps everything typed; a step that is not ready says why under its field. */
export function AddAssetFlow(props: AddAssetProps) {
 const { t } = useLanguage();
 const flow = useAssetFlow(props);
 // Each step opens on its heading, for the keyboard and a screen reader alike.
 const { ref: stepRef, onOpenAutoFocus: focusStep } = useStepFocus<HTMLDivElement>(flow.step);
 const { draft, name, last, saving } = flow, saves = last && name !== 'kind';
 const action = saving.busy ? 'Saving…' : saving.partial ? 'Retry' : !saves ? 'Continue' : props.demo ? 'Save in demo' : 'Save';
 return <><Dialog open onOpenChange={open => { if (!open) flow.close(); }}>
  <DialogContent className="goal-setup asset-flow" size="full" showCloseButton={false} onOpenAutoFocus={focusStep}>
   <form className="asset-flow-form" noValidate onSubmit={flow.next}>
    <FlowBar flow={flow} onClose={flow.close}/>
    <div className="goal-setup-body" ref={stepRef}><FlowStep flow={flow} props={props}/></div>
    {(name !== 'kind' || draft.chosen) && <footer className="goal-setup-footer asset-flow-footer">
     {saves && <ReviewLine draft={draft} accounts={props.accounts}/>}
     {saving.error && <p role="alert" className="field-error asset-save-error">{t('Nothing was saved. {reason}', { reason: t(saving.error) })}</p>}
     <Button disabled={saving.busy}>{t(action)}</Button>
    </footer>}
   </form>
  </DialogContent>
 </Dialog>{flow.guard.confirmation}</>;
}
