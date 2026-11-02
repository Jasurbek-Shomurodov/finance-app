# Shared modules to reach for first

- API routes: `lib/api-route.ts` (`sameOrigin`, `reply`, `readJson`, `parseAction`,
  `postgrestFailure`, the standard 401/403/429 replies) and the validators in
  `lib/api-validation.ts` (`uuid`, `isoDate`, `fiatCurrency`). Paged PostgREST reads
  go through `readAllPages` (`lib/owner-rows.ts`) or `readOwnerRows`
  (`lib/server-records.ts`).
- Exchange rates: only `lib/exchange-rate-service.ts` downloads them, from the daily
  jobs (`npm run rates:fill` on the Mac, `/api/cron/exchange-rates` on the server).
  Everything else reads the database: `loadOfficialRate` (`lib/official-rate.ts`) for
  a day's pair, `dayTables` / `ratesOf` for transactions, `cachedMarket` for today's.
  Each table is units per US dollar; any other pair goes through the dollar. Never
  fetch a rate from a request, and never ask a provider for a pair such as EUR/UZS.
- Abuse limits: `rateLimited` from `lib/rate-limit.ts` (Postgres-backed, migration
  106). Every new sign-in, code-sending or paid-API route needs one.
- Day and month arithmetic: `lib/calendar-days.ts` (`shiftDay`, `daysBetween`,
  `shiftMonth`, `monthEnd`); "today" is `depositToday()`, never
  `new Date().toISOString()`.
- Client requests: `requestJson` from `lib/api-client.ts`; owner resources load
  through `useOwnerResource`.
- Telegram messages: `lib/telegram-kit.ts` (`messageKit`, `keyboardRows`,
  `backButton`); typed amounts through `parseTypedAmount`. Scheduled reports
  (digest, recap, monthly) are pictures: a `ReportCard` (`lib/report-card.ts`)
  sent by `deliverReport` (`lib/telegram-report.ts`), which keeps the text for
  languages the bundled font cannot draw. The bot answers private
  chats only, and only the Telegram user linked to the subscription.
