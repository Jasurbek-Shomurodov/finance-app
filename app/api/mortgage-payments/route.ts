import { z } from 'zod';
import { isoDate, nonnegativeAmount, uuid } from '@/lib/api-validation';
import { crossSite, postgrestFailure, readJson, signInAgain } from '@/lib/api-route';
import { session, supa, sameOrigin } from '@/lib/supabase';
import { queueMilestoneCheck } from '@/lib/notify-action';
import { loadOfficialRate } from '@/lib/official-rate';
import { depositToday } from '@/lib/deposit-interest';
const schema = z.object({
 account_id: uuid.optional(), id: uuid, mortgage_id: uuid,
 principal: nonnegativeAmount, interest: nonnegativeAmount,
 date: isoDate,
 notes: z.string().max(2000),
}).refine(v => v.principal + v.interest > 0 && v.principal + v.interest <= 1e15);
// A refusal the database explains (P0001) is shown in its words; a database without the function answers 503 (lib/api-route.ts).
const databaseUpdate = 'The app database needs an update. Ask the administrator to apply the latest migrations.';
export async function POST(req: Request) {
 if (!sameOrigin(req)) return crossSite();
 try {
  const auth = await session();
  if (!auth) return signInAgain();
  const parsed = schema.safeParse(await readJson(req));
  if (!parsed.success) return Response.json({ error: 'Check the payment fields.' }, { status: 400 });
  const p = parsed.data;
  if(!p.account_id)return Response.json({error:'Choose a cash account.'},{status:400});
  const result = await supa('/rest/v1/rpc/planning_action', { method: 'POST', body: JSON.stringify({p_action:'mortgage',p_data:{id:p.id,account_id:p.account_id,target_id:p.mortgage_id,amount:p.principal,received:0,fee:p.interest,date:p.date,notes:p.notes}}) }, auth.token);
  if (!result.ok) return postgrestFailure(result, 'Could not save the payment. Check the database migration and try again.', { codes: { PGRST202: [databaseUpdate, 503] } });
  queueMilestoneCheck(auth,{type:'mortgage',account_id:p.account_id,target_id:p.mortgage_id,principal:p.principal,interest:p.interest,date:p.date});
  return Response.json(await result.json());
 } catch { return Response.json({ error: 'Payment could not be confirmed. Retry with the same details.' }, { status: 503 }); }
}

type PaymentRow = { id: string; mortgage_id: string; principal: number; interest: number; paid_on: string; notes: string };
type AccountLink = { account_id: string };
const rowsOf = async <T,>(path: string, token: string): Promise<T[] | null> => { const response = await supa(path, {}, token); return response.ok ? await response.json() as T[] : null; };

/** One recorded payment as its form needs it: the amounts, the day, the note and the cash account that paid it
 * (kept by the account operation, or by the dated cash link when the account is in another currency). */
export async function GET(req: Request) {
 try {
  const auth = await session();
  if (!auth) return signInAgain();
  const id = uuid.safeParse(new URL(req.url).searchParams.get('id'));
  if (!id.success) return Response.json({ error: 'Check the payment fields.' }, { status: 400 });
  const [payments, operations, links] = await Promise.all([
   rowsOf<PaymentRow>(`/rest/v1/mortgage_payments?select=id,mortgage_id,principal,interest,paid_on,notes&id=eq.${id.data}`, auth.token),
   rowsOf<AccountLink>(`/rest/v1/account_activity?select=account_id&action=eq.mortgage&id=eq.${id.data}`, auth.token),
   rowsOf<AccountLink>(`/rest/v1/investment_account_links?select=account_id&id=eq.${id.data}`, auth.token),
  ]);
  if (!payments || !operations || !links) return Response.json({ error: 'Could not load the payment.' }, { status: 503 });
  const [payment] = payments;
  if (!payment) return Response.json({ error: 'Payment not found.' }, { status: 404 });
  return Response.json({ id: payment.id, mortgage_id: payment.mortgage_id, principal: Number(payment.principal), interest: Number(payment.interest), date: payment.paid_on, notes: payment.notes, account_id: operations[0]?.account_id ?? links[0]?.account_id ?? null }, { headers: { 'Cache-Control': 'no-store' } });
 } catch { return Response.json({ error: 'Could not load the payment.' }, { status: 503 }); }
}

const edit = z.object({
 id: uuid, account_id: uuid, principal: nonnegativeAmount, interest: nonnegativeAmount,
 date: isoDate.refine(date => date <= depositToday()), notes: z.string().max(2000),
 exchange_rate: z.number().finite().positive().max(1e15).optional(),
}).refine(v => v.principal + v.interest > 0 && v.principal + v.interest <= 1e15);

/** Changes a recorded payment in one database transaction (`edit_mortgage_payment`, migration 164): the old payment is
 * undone and the new one recorded under the same id. The rate of an account in another currency is worked out here. */
export async function PATCH(req: Request) {
 if (!sameOrigin(req)) return crossSite();
 try {
  const auth = await session();
  if (!auth) return signInAgain();
  const parsed = edit.safeParse(await readJson(req));
  if (!parsed.success) return Response.json({ error: 'Check the payment fields.' }, { status: 400 });
  const p = parsed.data;
  const payments = await rowsOf<{ mortgage_id: string }>(`/rest/v1/mortgage_payments?select=mortgage_id&id=eq.${p.id}`, auth.token);
  if (!payments) return Response.json({ error: 'Could not load the payment.' }, { status: 503 });
  if (!payments[0]) return Response.json({ error: 'Payment not found.' }, { status: 404 });
  const records = await rowsOf<{ id: string; kind: string; currency: string }>(`/rest/v1/finance_records?select=id,kind,currency&id=in.(${payments[0].mortgage_id},${p.account_id})`, auth.token);
  if (!records) return Response.json({ error: 'Could not load accounts or exchange history.' }, { status: 503 });
  const account = records.find(record => record.id === p.account_id && record.kind === 'Cash'), mortgage = records.find(record => record.id === payments[0].mortgage_id);
  if (!account || !mortgage) return Response.json({ error: 'Choose one of your cash accounts.' }, { status: 400 });
  const data: Record<string, unknown> = { account_id: p.account_id, principal: p.principal, interest: p.interest, date: p.date, notes: p.notes };
  if (account.currency !== mortgage.currency) {
   // Never accept a client-supplied conversion rate as authoritative.
   try { const quote = await loadOfficialRate(account.currency, mortgage.currency, p.date); data.rate = quote.rate; data.rate_date = quote.effective_date; }
   catch { return Response.json({ error: 'Historical exchange rates are unavailable.' }, { status: 422 }); }
   if (data.rate !== p.exchange_rate) return Response.json({ error: 'The exchange rate changed. Refresh the rate and review the amounts.' }, { status: 409 });
  }
  const result = await supa('/rest/v1/rpc/edit_mortgage_payment', { method: 'POST', body: JSON.stringify({ p_id: p.id, p_data: data }) }, auth.token);
  if (!result.ok) return postgrestFailure(result, 'Could not save the payment. Check the database migration and try again.', { codes: { PGRST202: [databaseUpdate, 503] } });
  return Response.json({ ok: true });
 } catch { return Response.json({ error: 'Payment could not be confirmed. Retry with the same details.' }, { status: 503 }); }
}
