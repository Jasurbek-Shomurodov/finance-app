// The Mac's daily exchange rate job: runs lib/exchange-rate-service.ts from a computer in Uzbekistan. cbu.uz answers only
// addresses in Uzbekistan (checked 2026-10-29 from twelve countries: every one timed out). A past day never changes, so
// each is read once. With no arguments it asks every day since December 2015, which also closes any gap left while the
// Mac was off, or name days: `npm run rates:fill -- 2026-10-01 2026-10-02`. Needs SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY in .env / .env.local; writes only public rates, never prints keys.
import { pathToFileURL } from 'node:url';
import { readEnv } from './check-migrations.mjs';

/** The days to fill: every day from December 2015 through `today`. */
export function defaultDays(today) {
 const days = [];
 for (let cursor = Date.parse('2015-12-31T00:00:00Z'), day; (day = new Date(cursor).toISOString().slice(0, 10)) <= today; cursor += 86400000) days.push(day);
 return days;
}

export async function fill(days, { env, loadTS, today, log = console.log }) {
 const db = loadTS('lib/service-role.ts').serviceDatabase(env);
 if (!db) throw Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local to fill the rates.');
 const { refreshExchangeRates } = loadTS('lib/exchange-rate-service.ts', { './service-role': { serviceDatabase: () => db } });
 const result = await refreshExchangeRates(days, { db, today });
 log(`${result.asked} days asked, kept ${result.kept} new days${result.missing.length ? `; not answered: ${result.missing.join(', ')}` : ''}`);
 log(result.dollar ? `today's CBU rate: ${result.dollar}` : 'today\'s CBU rate was not answered');
 log(`global rate table: ${result.global}`);
 return result;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
 const { loadTS } = await import('../tests/helpers/load-ts.mjs');
 const { depositToday } = loadTS('lib/deposit-interest.ts');
 const env = { ...readEnv(['.env', '.env.local']), ...process.env };
 const today = depositToday(), named = process.argv.slice(2);
 const result = await fill(named.length ? named.sort() : defaultDays(today), { env, loadTS, today });
 process.exit(result.missing.length || !result.dollar ? 1 : 0);
}
