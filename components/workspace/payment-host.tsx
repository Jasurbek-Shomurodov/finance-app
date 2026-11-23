"use client";
import { useEffect } from 'react';
import { PaymentDialog } from '@/components/workspace/workspace-lazy';
import { useWorkspace } from '@/components/workspace/workspace-provider';
import { debtPaymentNote, type PaymentRequest } from '@/lib/payment-plan';
import { payRequest } from '@/lib/recurring';

/** Answers a link that names a payment (`#pay=<schedule or loan>:<due date>`, from the Dashboard or a message): opens
 * Record payment for it once the records are here, and clears the address first, so going back or reloading does not
 * open it again. The router sets the address after the page first renders, so it is read after every render until found. */
export function usePayLink(ready: boolean, open: (request: PaymentRequest) => void) {
 useEffect(() => {
  const read = () => {
   const request = payRequest(window.location.hash);
   if (!request || !ready) return;
   window.history.replaceState(null, '', window.location.pathname + window.location.search);
   open(request);
  };
  read();
  window.addEventListener('hashchange', read);
  return () => window.removeEventListener('hashchange', read);
 });
}

/** The one Record payment dialog of the workspace: whatever screen asked for it (`openPayment`), it saves each kind of
 * obligation the way it always was, and the planning data shows a loan's payment before the reload returns. */
export function WorkspacePayment() {
 const { paying, setPaying, openPayment, planning, preferencesData, recordMortgagePayment } = useWorkspace();
 usePayLink(planning.data.records.length > 0, openPayment);
 if (!paying) return null;
 return <PaymentDialog key={paying.target.id + ':' + paying.date} plan={paying} data={planning.data} currencies={preferencesData.currencies}
  saves={{ mortgage: recordMortgagePayment, planning: planning.save }}
  onPaid={(plan, draft) => { const note = debtPaymentNote(plan, draft); if (note) planning.noteDebtPayment(note.payment, note.principal); }}
  onClose={() => setPaying(null)}/>;
}
