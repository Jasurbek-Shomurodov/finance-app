# Shared modules to reach for first

- API routes: `lib/api-route.ts` (`sameOrigin`, `reply`, `readJson`, `parseAction`,
  `postgrestFailure`, the standard 401/403/429 replies) and the validators in
  `lib/api-validation.ts` (`uuid`, `isoDate`, `fiatCurrency`). Paged PostgREST reads
  go through `readAllPages` (`lib/owner-rows.ts`) or `readOwnerRows`
  (`lib/server-records.ts`).
- Exchange rates: only `lib/exchange-rate-service.ts` downloads them, from the daily
  Vercel cron `/api/cron/exchange-rates`.
  Everything else reads the database: `loadOfficialRate` (`lib/official-rate.ts`) for
  a day's pair, `dayTables` / `ratesOf` for transactions, `cachedMarket` for today's.
  Each table is units per US dollar; any other pair goes through the dollar. Never
  fetch a rate from a request, never ask a provider for a pair such as EUR/UZS, and
  never save a rate the client sent: a route works the pair out itself and at most
  checks the client's against it. A day that is not kept yet (today before the
  download, a day the provider skipped) reads the rates in force on it: the latest
  kept day of the week before (`inForceDayTables`, `loadOfficialRate`).
- Closed accounts and holdings: `lib/closed-records.ts` (`splitClosed`, `openOnly`, `recordAmong`, `isEmptyRecord`).
  A list people choose from reads `planning.data.records`, which holds no closed record; a read of its own filters with
  `openOnly`. What still points at an account before a delete: `deletionBlockers` (`lib/account-deletion.ts`) and
  `/api/closing?id=`.
- Abuse limits: `rateLimited` from `lib/rate-limit.ts` (Postgres-backed, migration
  106). Every new sign-in, code-sending or paid-API route needs one.
- The visitor's address or country: `clientIp` (`lib/rate-limit.ts`) and `cloudflareHeader`
  (`lib/cloudflare.ts`), never a forwarding header read in a route. Behind Cloudflare
  (`docs/cloudflare.md`) Vercel's headers name Cloudflare, not the visitor.
- Day and month arithmetic: `lib/calendar-days.ts` (`shiftDay`, `daysBetween`,
  `shiftMonth`, `monthEnd`); "today" is `depositToday()`, never
  `new Date().toISOString()`.
- Client requests: `requestJson` from `lib/api-client.ts`; owner resources load
  through `useOwnerResource`. A screen's reads that need only the owner start beside the workspace's
  through `lib/section-reads.ts` (`warmRead`), under the same URL and revision the card asks with.
- Reads in one route that do not need each other's answer start together. Rows dated for the viewer
  (`withViewerDayRates`, `lib/viewer-day-rates.ts`) get the currencies from `preferredCurrencies(auth)`
  started beside the rows' own read. A rate-limit check stays in front of the read it guards.
- Telegram messages: `lib/telegram-kit.ts` (`messageKit`, `keyboardRows`,
  `backButton`); typed amounts through `parseTypedAmount`. Scheduled reports
  (digest, recap, monthly) are pictures: a `ReportCard` (`lib/report-card.ts`)
  sent by `deliverReport` (`lib/telegram-report.ts`), which keeps the text for
  languages the bundled font cannot draw. The bot answers private
  chats only, and only the Telegram user linked to the subscription.
