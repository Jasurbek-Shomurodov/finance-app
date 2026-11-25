import { loadOfficialRate } from '@/lib/official-rate';
import { supa } from '@/lib/supabase';

/** What `lend_from_account` takes beside the record when the cash account is in another currency (migration 170). */
export type LendExchange = { p_rate: number; p_rate_date: string; p_account_currency: string; p_record_currency: string };
type Loan = { id: string; currency: string; lent_date?: string | null; lent_from?: string | null; lent_exchange_rate?: number | null };

/** New money lent from a cash account: null when the account is in the loan's currency, the dated rate when it is not,
 * or the refusal to send back. The rate is the server's own (or the one a lost response already saved); the form's
 * only has to match it, so a rate that moved since the form loaded is reviewed again, never trusted. */
export async function lendExchange(loan: Loan, token: string): Promise<{ fx: LendExchange | null } | { error: string; status: number }> {
 if (!loan.lent_from) return { fx: null };
 const [accountResponse, priorResponse] = await Promise.all([
  supa(`/rest/v1/finance_records?select=id,kind,currency&id=eq.${loan.lent_from}`, {}, token),
  supa(`/rest/v1/investment_account_links?select=account_id,exchange_rate,rate_date&id=eq.${loan.id}`, {}, token),
 ]);
 if (!accountResponse.ok || !priorResponse.ok) return { error: 'Could not load accounts or exchange history.', status: 503 };
 const [account] = await accountResponse.json() as { id: string; kind: string; currency: string }[];
 if (account?.kind !== 'Cash') return { error: 'Choose one of your cash accounts.', status: 400 };
 if (account.currency === loan.currency) return { fx: null };
 const [prior] = await priorResponse.json() as { account_id: string; exchange_rate: number | null; rate_date: string }[];
 let rate: number, rateDate: string;
 if (prior?.account_id === account.id && prior.exchange_rate) { rate = Number(prior.exchange_rate); rateDate = prior.rate_date; }
 else {
  if (!loan.lent_date) return { error: 'Check the record fields.', status: 400 };
  try { const quote = await loadOfficialRate(account.currency, loan.currency, loan.lent_date); rate = quote.rate; rateDate = quote.effective_date; }
  catch { return { error: 'Historical exchange rates are unavailable.', status: 422 }; }
 }
 if (loan.lent_exchange_rate !== rate) return { error: 'The exchange rate changed. Refresh the rate and review the amounts.', status: 409 };
 return { fx: { p_rate: rate, p_rate_date: rateDate, p_account_currency: account.currency, p_record_currency: loan.currency } };
}
