# Net worth history and daily snapshots

What is true on 23 November 2026. Two things carry "history" in the app, and they are separate.

## The net worth chart (Dashboard)

The chart is rebuilt on every read from the records themselves; it never draws a stored total.

- **One read.** `/api/portfolio-history` (`lib/portfolio-history-read.ts`) returns the current records, their balance
  events, one-time transactions, income schedules, account operations, movements between holdings, the kept closes of
  quoted holdings and the kept exchange rates. Reads that do not depend on one another run together, a long table's
  pages are read together, and every table is asked only for the columns the charts use. A busy cash account sends one
  balance snapshot a day (`lastCashValuations`); its first balance and every dated movement are kept. Everything is read
  with the signed-in person's token, so row security decides what comes back. Deleted records are not read, so they
  leave every past day.
- **Each past day at its own rate.** Past days convert at the official rates kept in `exchange_rate_days`
  (`keptHistoryRates` in `lib/history-fx.ts`): only the currencies the history is kept or shown in, the latest 400 days
  one by one and older ones one a week. No rate service is asked at request time. Today converts at the live rates
  today's own figure uses (`historyFx`, `dayRates` in `lib/history-rates.ts`). With nothing kept, every day falls back
  to today's rates. The benchmark comparison reads the same series (`mergeFx`), so the headline's "Investment returns"
  and "Your own money" stand on one basis.
- **Cash accounts are rebuilt from their dated records.** The database writes a balance snapshot on the day an account
  changes, so a transaction deleted or edited later used to leave a dent between its date and the day it was
  corrected. Where an account's ledger is complete (its opening balance plus every change still on record comes to its
  balance today), its past is today's balance walked back through those dated changes and the stale snapshots are not
  used (`cashLedgers` in `lib/cash-ledger.ts`). An account that does not add up (a balance typed over, a payment at an
  unknown rate, a row the read did not return), or one with no change on record, keeps its snapshots.
- **Late entries count on their own day.** For every record that is not rebuilt, a transaction, a payment from an
  account or a mortgage payment typed after its date moves the balance on the day it happened, not the day it was typed
  (`balanceMoves` in `lib/net-worth-moves.ts`).
- **Quoted holdings follow their price.** A stock or coin is carried between its snapshots by its kept closes
  (`lib/holding-prices.ts`, `priceScale` in `lib/portfolio-history.ts`). Metals and equity compensation still use their
  stored values.
- **Incomplete days.** A day drawn before every record has a balance is marked `partial`. A record whose history begins
  inside the period (a holding added today without an opening date) is taken to have been owned before: the day it is
  first counted carries its value as `joined`, and the period's change leaves that out (`periodChange`), so adding a
  holding neither reads as a gain nor hides the change of everything else. The headline says so behind its ⓘ and shows
  no returns split for such a period. A record that names its opening day counts from that day at its first recorded
  balance, and an explicit zero opening counts from the start.
- **Today** is the live figure from current records and prices, on the day the read names (`chartDay`).

Not done: metals and equity compensation by price; a `closed_on` date for accounts and holdings; a server-side cached
daily series (the browser still replays the events after each save, though the quadratic loops are gone).

## Daily snapshots (`portfolio_snapshots`, migration 017)

One row per owner per day: assets and debts valued in USD with the rates observed then. The signed-in workspace captures
it after market refreshes and record changes (`usePortfolioSnapshots`, `/api/portfolio-snapshots`), and the daily cron
`/api/cron/portfolio-snapshots` captures it while the app is closed. The server values the holdings itself; quotes,
totals and dates sent by a browser are ignored, a missing price or rate prevents an incomplete snapshot from replacing a
good one, and only today's row can be written. Reads enforce owner row security.

Snapshots are aggregate observations, so they cannot be reconciled with a record deleted or corrected later. The net
worth chart therefore does not draw them. They feed the surfaces that need a figure for a past day without replaying
records: goal forecasts, the financial review, and the Telegram digest and monthly report.

The investment comparison drawn on the same card follows [its own rules](investment-comparison.md).
