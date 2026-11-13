// The rate of one day between two currencies, for a payment or a record saved in another currency. Read from the kept
// day tables (`exchange_rate_days`) alone, so nobody waits for a rate: the daily Vercel job downloads them
// (lib/exchange-rate-service.ts). Each table is units per US dollar, so every pair goes through the dollar.
import { shiftDay } from './calendar-days';
import { inForceDays, keptDay, keptDaysBetween } from './day-rate-tables';
import type { ServiceDatabase } from './service-role';

export type DatedExchangeRate = { from: string; to: string; date: string; effective_date: string; rate: number; source: string };

/** A published rate stays in force until the next one: when a day is not kept yet, the latest kept day at most
 * `inForceDays` before it answers, named as its effective date. */
export async function loadOfficialRate(from: string, to: string, date: string, deps: { db?: ServiceDatabase | null } = {}): Promise<DatedExchangeRate> {
 let day = date, kept = await keptDay(date, deps.db);
 if (!kept) {
  day = (await keptDaysBetween(shiftDay(date, -inForceDays), date, deps.db)).at(-1) ?? date;
  kept = day === date ? undefined : await keptDay(day, deps.db);
 }
 const rate = Number(kept?.rates[to]) / Number(kept?.rates[from]);
 if (!kept || !Number.isFinite(rate) || rate <= 0) throw Error('Historical exchange rates are unavailable.');
 return { from, to, date, effective_date: day, rate, source: kept.source };
}
