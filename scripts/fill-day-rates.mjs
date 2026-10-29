// Fills `exchange_rate_days` with the Central Bank of Uzbekistan's official rates, from a computer in Uzbekistan.
// cbu.uz answers only addresses in Uzbekistan (checked 2026-10-29 from twelve countries: every one timed out), so the
// app's servers cannot read the archive themselves; every day they convert with must be kept here first. A past day
// never changes, so each is read once. Run it with no arguments for the days the app reads most (every month's last
// day since 2015 and each of the last 14 days), or name days: `npm run rates:fill -- 2026-10-01 2026-10-02`.
// Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env / .env.local; writes only public rates, never prints keys.
import { pathToFileURL } from 'node:url';
import { readEnv } from './check-migrations.mjs';

/** The days to fill: each month's last day from December 2015, and the last `recent` days through `today`. */
export function defaultDays(today, recent = 14) {
 const days = new Set();
 for (let cursor = new Date(Date.UTC(2016, 0, 0)); cursor.toISOString().slice(0, 10) <= today; cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 2, 0))) days.add(cursor.toISOString().slice(0, 10));
 for (let back = 0; back < recent; back++) days.add(new Date(Date.parse(today + 'T00:00:00Z') - back * 86400000).toISOString().slice(0, 10));
 return [...days].filter(day => day <= today).sort();
}

export async function fill(days, { env, loadTS, today, log = console.log }) {
 const { serviceDatabase } = loadTS('lib/service-role.ts');
 const db = serviceDatabase(env);
 if (!db) throw Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local to fill the rates.');
 const { dayTables, keptDaysBetween } = loadTS('lib/day-rate-tables.ts', { './service-role': { serviceDatabase: () => db } });
 const before = await keptDaysBetween(days[0], days.at(-1), db);
 const wanted = days.filter(day => !before.has(day));
 log(`${days.length} days asked, ${days.length - wanted.length} already kept, ${wanted.length} to read from cbu.uz`);
 // No budget: this runs by hand and may take a minute; the archive takes a second or two a day.
 const tables = await dayTables(wanted, { db, today, budgetMs: Infinity, concurrency: 4 });
 const missing = wanted.filter(day => !tables.has(day));
 log(`kept ${tables.size} new days${missing.length ? `; not answered: ${missing.join(', ')}` : ''}`);
 return { kept: tables.size, missing };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
 const { loadTS } = await import('../tests/helpers/load-ts.mjs');
 const { depositToday } = loadTS('lib/deposit-interest.ts');
 const env = { ...readEnv(['.env', '.env.local']), ...process.env };
 const today = depositToday(), named = process.argv.slice(2);
 const result = await fill(named.length ? named.sort() : defaultDays(today), { env, loadTS, today });
 process.exit(result.missing.length ? 1 : 0);
}
