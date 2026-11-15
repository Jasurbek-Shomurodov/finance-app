"use client";
import { useEffect, useRef, useState } from 'react';
import type { Entry } from '@/lib/finance';
import type { MortgagePayment } from '@/lib/mortgage-payment-edit';

/** The payment behind a mortgage payment's transaction: its mortgage, amounts and the account that paid it. The row
 * itself carries neither the mortgage nor the account, so they are read once the row is opened. Null for any other
 * row and while loading; `error` when it could not be read. */
export function useMortgagePaymentSource(record: Entry | null, load: (record: Entry) => Promise<MortgagePayment>) {
 const [state, setState] = useState<{ id: string; source?: MortgagePayment; error?: string } | null>(null);
 const loader = useRef(load);
 useEffect(() => { loader.current = load; });
 const id = record?.mortgage_payment_id ? record.id : null;
 useEffect(() => {
  if (!id || !record) return;
  let live = true;
  loader.current(record).then(source => { if (live) setState({ id, source }); }, (reason: Error) => { if (live) setState({ id, error: reason.message || 'Could not load the payment.' }); });
  return () => { live = false; };
  // Read once per payment: the row object changes with every refresh.
  // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [id]);
 return state && state.id === id ? state : null;
}
