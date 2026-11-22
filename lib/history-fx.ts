// Server only: the official rates of each past day for the net worth history, from the kept day tables
// (`exchange_rate_days`) and nowhere else: a request never asks a rate service. Only the currencies the history is kept
// or shown in are read (`rates->CODE`), since a whole table per day is megabytes over a few years.
import type { FxPoint } from './benchmark-data';
import { shiftDay } from './calendar-days';
import { pageSize } from './owner-rows';
import { serviceDatabase, type ServiceDatabase } from './service-role';

/** A day before the first recorded balance this many days back may stand for it (a rate stays in force until the next). */
const leadDays = 7;
/** The latest days are kept one by one; older ones one a week, which a rate in force for days answers closely. */
const dailyDays = 400;
const weekMs = 7 * 86400000;
const code = /^[A-Z]{3}$/;
const validDay = (day: string) => /^\d{4}-\d{2}-\d{2}$/.test(day);

/** The currencies a history needs rates for: every one named, without the dollar the tables are quoted in. */
export function historyCurrencies(...lists: ReadonlyArray<Iterable<string | null | undefined>>): string[] {
 const found = new Set<string>();
 for (const list of lists) for (const currency of list) if (currency && currency !== 'USD' && code.test(currency)) found.add(currency);
 return [...found].sort();
}

/** `rows` (sorted by day) without the days that repeat the point before them (a weekend repeats Friday's rates), and
 * with one day a week for days older than `dailyDays` before `today`. The weeks are counted from a fixed day, so every
 * read keeps the same days. */
export function thinRates(rows: readonly FxPoint[], today: string): FxPoint[] {
 const recent = shiftDay(today, -dailyDays), points: FxPoint[] = [];
 let kept = '', week = -1;
 for (const row of rows) {
  const bucket = row.date < recent ? Math.floor(Date.parse(row.date + 'T00:00:00Z') / weekMs) : -1;
  if (bucket !== -1 && bucket === week) continue;
  week = bucket;
  const signature = JSON.stringify(Object.entries(row.rates).sort(([a], [b]) => a.localeCompare(b)));
  if (signature === kept) continue;
  kept = signature;
  points.push(row);
 }
 return points;
}

/** The kept rates of `currencies` from a few days before `from` through `to`, oldest first. The span is read in windows
 * of one page each, together. Nothing kept, no server key or a failed read answers with no points: the history then
 * converts at today's rates, as it did before day rates were kept. */
export async function keptHistoryRates(from: string, to: string, currencies: readonly string[], db: ServiceDatabase | null = serviceDatabase()): Promise<FxPoint[]> {
 const wanted = currencies.filter(currency => code.test(currency) && currency !== 'USD');
 if (!db || !wanted.length || !validDay(from) || !validDay(to) || from > to) return [];
 const select = ['day', ...wanted.map(currency => `${currency}:rates->${currency}`)].join(',');
 const windows: Array<[string, string]> = [];
 for (let start = shiftDay(from, -leadDays); start <= to; start = shiftDay(start, pageSize)) {
  const end = shiftDay(start, pageSize - 1);
  windows.push([start, end < to ? end : to]);
 }
 try {
  const pages = await Promise.all(windows.map(([start, end]) => db.read<Array<{ day: string } & Record<string, unknown>>>(`/rest/v1/exchange_rate_days?select=${select}&day=gte.${start}&day=lte.${end}&order=day.asc&limit=${pageSize}`)));
  const rows = pages.flat().map(({ day, ...quoted }) => {
   const rates: Record<string, number> = { USD: 1 };
   for (const currency of wanted) {
    const rate = Number(quoted[currency]);
    if (quoted[currency] != null && Number.isFinite(rate) && rate > 0) rates[currency] = rate;
   }
   return { date: day, rates };
  });
  return thinRates(rows, to);
 } catch { return []; }
}
