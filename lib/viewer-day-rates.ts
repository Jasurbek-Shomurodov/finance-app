import { after } from 'next/server';
import { withPlanningDayRates } from '@/lib/day-rate-tables';
import { depositToday } from '@/lib/deposit-interest';
import { personalRequest } from '@/lib/household';
import { supa } from '@/lib/supabase';

/** The signed-in person's preferred currencies: the ones the top bar can show totals in. */
async function preferredCurrencies(auth: { token: string; user: { id: string } }) {
 try {
  const response = await supa('/rest/v1/user_preferences?select=currencies&user_id=eq.' + auth.user.id, personalRequest(), auth.token);
  const rows = response.ok ? await response.json() as { currencies?: string[] | null }[] : [];
  return rows[0]?.currencies ?? [];
 } catch { return []; }
}

/** `data` with each transaction's day rates (lib/day-rate-tables.ts) in the currencies this person can show; days not
 * loaded in time are fetched after the response, so the next read has them. */
export async function withViewerDayRates<D extends Parameters<typeof withPlanningDayRates>[0]>(data: D, auth: { token: string; user: { id: string } }): Promise<D> {
 return withPlanningDayRates(data, await preferredCurrencies(auth), { today: depositToday(), later: work => { try { after(work); } catch { void work(); } } });
}
