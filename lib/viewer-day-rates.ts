import { withPlanningDayRates } from '@/lib/day-rate-tables';
import { depositToday } from '@/lib/deposit-interest';
import { personalRequest } from '@/lib/household';
import { reportError } from '@/lib/monitoring';
import { supa } from '@/lib/supabase';

/** The signed-in person's preferred currencies: the ones the top bar can show totals in. A read that fails leaves the
 * records' own currencies to decide, and is reported so a database that keeps failing alerts (no one's id travels). */
export async function preferredCurrencies(auth: { token: string; user: { id: string } }): Promise<string[]> {
 try {
  const response = await supa('/rest/v1/user_preferences?select=currencies&user_id=eq.' + auth.user.id, personalRequest(), auth.token);
  if (!response.ok) throw Object.assign(new Error(`Preferred currencies could not be read (HTTP ${response.status}).`), { name: 'DatabaseError', stack: '' });
  const rows = await response.json() as { currencies?: string[] | null }[];
  return rows[0]?.currencies ?? [];
 } catch (error) { await reportError('day-rates', error, { status: 503 }, { alert: 'repeated' }); return []; }
}

/** `data` with each transaction's day rates (lib/day-rate-tables.ts) in the currencies this person can show; days not
 * loaded in time are fetched after the response, so the next read has them. A route that knows it will date its rows
 * starts `preferredCurrencies` beside its own reads and passes it here, so the currencies never wait for the rows. */
export async function withViewerDayRates<D extends Parameters<typeof withPlanningDayRates>[0]>(data: D, auth: { token: string; user: { id: string } }, currencies: Promise<string[]> = preferredCurrencies(auth)): Promise<D> {
 return withPlanningDayRates(data, await currencies, { today: depositToday() });
}
