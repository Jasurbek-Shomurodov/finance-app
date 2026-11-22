import { signInAgain } from '@/lib/api-route';
import { depositToday } from '@/lib/deposit-interest';
import { keptHistoryRates } from '@/lib/history-fx';
import { keptSeries } from '@/lib/holding-price-reader';
import { personalRequest } from '@/lib/household';
import { pagePath, readPagesTogether } from '@/lib/owner-rows';
import { readPortfolioHistory } from '@/lib/portfolio-history-read';
import { session, supa } from '@/lib/supabase';

export async function GET() {
 try {
  const auth = await session();
  if (!auth) return signInAgain();
  // Every owner read uses the signed-in person's token, so row security decides what comes back; a long table's pages
  // are read together rather than one after another.
  const read = <T,>(path: string) => readPagesTogether<T>(range => supa(pagePath(path, range), {}, auth.token), 'History unavailable');
  const preferred = async () => {
   const response = await supa('/rest/v1/user_preferences?select=currencies&user_id=eq.' + auth.user.id, personalRequest(), auth.token);
   return response.ok ? (await response.json() as { currencies?: string[] | null }[])[0]?.currencies ?? [] : [];
  };
  // The day is the one the database dates balance snapshots by; the chart ends on the day named here.
  const history = await readPortfolioHistory({ read, preferred, closes: keptSeries, rates: keptHistoryRates, today: depositToday() });
  return Response.json(history, { headers: { 'Cache-Control': 'no-store' } });
 } catch {
  return Response.json({ error: 'Could not load portfolio history.' }, { status: 503 });
 }
}
