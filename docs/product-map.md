# Product map and redesign plan

Written 21 November 2026 from a full read of the app (screens, dialogs, database, net worth chart); status last checked
against the code on 23 November 2026. It says what the app does, where each feature belongs, what was duplicated, and
the order the redesign is built in. Update it when a phase lands.

## What the app answers

Each screen exists to answer one question. A feature belongs on the screen whose question it answers, and nowhere else;
other screens link to it.

| Screen | The question | Leads with |
|---|---|---|
| Dashboard | Am I fine, and what needs me today? | Net worth over time, safe to spend, what is due |
| Accounts | Where is my money right now? | Balances per account |
| Transactions | What exactly happened? | The ledger, search and bulk edit |
| Cash flow | Where does my money come from and go this month, and what is ahead? | This month, then the forecast |
| Reports | How did a period, a business or a category do? | Any period, any business, export |
| Budget | How much may I still spend, per category? | Left to budget |
| Recurring | What repeats, and what is due? | The schedule list and calendar |
| Goals | Am I on track for what I am saving for? | Goal progress |
| Investments | What do I own and how is it doing? | Holdings, businesses and their shares |
| Loans & debts | What do I owe and when am I free of it? | Debt-free date |

## Feature groups

1. **Money in and out:** expenses, income, transfers, splits, receipts, categories, tags, rules, imports.
2. **Planning:** budget, recurring bills and incomes, subscriptions, reminders, goals, forecast, what-if.
3. **Wealth:** cash accounts, deposits, stocks, crypto, metals, property, vehicles, businesses, loans, mortgages,
   money lent, benchmarks, net worth history.
4. **Business:** business profile, ownership share, business income and expenses, profit and loss, tax prep.
5. **Insight:** monthly review, watchlists, reports, assistant, Telegram digests.
6. **Workspace:** households and owners, currencies, languages, backup, Recently deleted, settings.

## One home per feature

What was shown in several places on 21 November, where it lives now, and whether that is built (`tests/one-home.mjs`
pins the built rows).

| Feature | One home | Elsewhere | Status |
|---|---|---|---|
| "What is left" | **Safe to spend** on the Dashboard (`safeToSpend` in `lib/dashboard-glance.ts`): the budget less what was spent and the payments still due that no budget category covers; with no budget, expected income less spending and everything due | Budget keeps Left to budget; Cash flow keeps Still to come | Done |
| Budget card | Budget | One compact card on the Dashboard (share used and three categories) | Done |
| Upcoming payments | Recurring | Dashboard "Upcoming payments" card; each row opens that payment (`payLink`) | Done |
| Money flow diagram | Cash flow (this month) and Reports (any period) | Budget and Recurring link to `/income-expenses#flow` | Done |
| Spending pace | One chart with last month and budget lines (`SpendingPaceChart`) | Dashboard and Budget share it | Done |
| Ranked bars | One piece (`rankedBar` in `components/cash-flow/flow-bars.tsx`) | Cash flow, Reports and the Dashboard's Where it is going | Done |
| Recent transactions | Transactions | Dashboard card; Cash flow dropped its table | Done |
| Spending watchlists | Budget (`/budget#watchlists`) | Cash flow › Spending links there | Done |
| Mortgage payments list | Cash flow › Spending | Overview dropped it | Done |
| Period switch and long-range trend | Reports | Cash flow keeps six recent months with the net line and average, and "See all periods" | Done |
| Rules | Transactions (`/transactions#rules`) | Settings links there | Done |
| Review suggestions | Recurring | Removed from Transactions | Done |
| Payout calendar, price alerts, Bitcoin panel | Investments › Payouts & alerts | Left Profit & loss | Done |
| Investment benchmarks | Settings › Investment benchmarks (`/settings#benchmarks`) | The net worth chart's details link there | Done (edited in Settings, not on the chart) |
| Transfer | `AssetMovementDialog` | The unused `AccountOperation` transfer branch is removed | Done |
| Record a loan or mortgage payment | One payment dialog | Opened from Loans, Recurring, Cash flow, Dashboard | Not done: being built separately |

## Oddly placed, and where it moves

- **Business setup** starts from Investments › Add asset ("Add business" / "Set up business tracking"). Done. Settings ›
  Businesses still lists and edits them.
- **Business tax prep** stays in Reports and is always listed, with an invitation when no business exists. Done.
- **Age of Money** sits with the Budget it measures. Done.
- **Business income and expenses** added from the business's own page, with category, account and tags. Not done.

## Decisions taken (21 November 2026, on the owner's "decide and build")

1. **Add on every screen.** Done. The top bar's Add offers Expense, Income and Transfer everywhere; Transfer opens
   Accounts with the dialog ready (`/accounts#transfer`, also in ⌘K). Add income always opens on a one-time "Other
   income" and saves with only an amount and an account; a blank name falls back to its category.
2. **Fast entry.** Done. Expense and income forms have Save and add another (⌘/Ctrl+Enter), which keeps the category or
   income source, date, account and currency. Problems are said under their field and the first one is focused; a
   Save that is switched off says why in words. A past name fills its category and, into an empty amount, its last
   amount. The transfer dialog opens in its amount and says why Save is blocked.
3. **Cash flow and Reports stay separate.** Done. Cash flow is this month and what is ahead, with six recent months;
   Reports is any period and any business.
4. **Net worth without investments.** Done. With two days of history the net worth line is drawn alone and the
   invitation to add an investment sits under it.
5. **Dashboard at a glance.** Done. Safe to spend replaces Budget left; Where it is going ranks the month's categories
   with their share and change against last month by this day, each row opening Transactions for that category; What to
   improve gives at most three lines (overdue payment, the day cash goes below zero, categories over budget, the biggest
   mover). No figure is both a tile and a card, and every row opens its own item: an allocation row opens Investments
   filtered to that kind (`/assets?kind=…`), a goal its history, a payment its Record payment form.

## System design

### Net worth history (the chart everyone looks at)

Found on 21 November, in order of harm, and where each stands (details in `docs/portfolio-snapshots.md`):

1. **Done.** Stock and crypto history used the stored value and only today used live prices, so the line was flat and
   jumped on its last day. Each quoted holding is carried between its snapshots by its price (`lib/holding-prices.ts`,
   `priceScale` in `lib/portfolio-history.ts`). Not done: metals and equity compensation still use stored values.
2. **Done.** The line disappeared whenever benchmark data was loading or unavailable. It draws alone.
3. **Done.** Past days converted at today's exchange rate. Each day now converts at its own day's kept rate
   (`exchange_rate_days`, `lib/history-fx.ts`, `lib/history-rates.ts`), never from a rate service at request time, and
   the headline's Investment returns / Your own money split reads the same rates.
4. **Done.** Deleting or editing an old transaction left a dent from its date until today. A cash account whose records
   explain its balance is rebuilt from them (`lib/cash-ledger.ts`); one that does not add up keeps its snapshots. No
   valuation rows are rewritten.
5. **Done.** A holding added today without an opening date hid the whole period's change. It now counts from its first
   recorded value and the change of everything else is shown (`periodChange`, `joined`).
6. **Partly done.** The history read runs its pages together, asks only for the columns the charts use and sends one
   cash valuation per account per day; the quadratic loops in the comparison are gone. Not done: one reduced daily
   series from the server, cached by revision. The browser still replays the events after every save.

### Closing and deleting accounts

An account or holding with any history cannot be deleted, a cash account stays undeletable after its transactions are
gone, and stock or crypto account containers cannot be deleted at all. There is no "closed" state. The Dashboard drops
a deleted holding from history while reports, goals and Telegram keep it, so they disagree.

Design: a `closed_on` date on accounts and holdings. History is kept up to that day and is zero after it; closed items
leave pickers and totals. Delete stays for mistakes and removes the record from every surface's history; empty account
containers become deletable.

### Ownership and valuations

Businesses already carry an ownership percentage, and net worth counts only the owned share. Missing: the same for
property, vehicles and other valued assets; counted assets (1,000 sheep × value per head) with a dated history of both
numbers; profit and loss by share.

- Migration 166: ownership on every valued kind; `quantity` and `unit_label` on valued kinds; `quantity` and
  `unit_value` on `investment_history`; dated valuations through `record_investment_event`.
- Migration 167: `business_share` and `amount_basis` ('whole' or 'mine') on business transactions, so a figure entered
  for the whole business is reported at the owner's share. Existing rows stay 'mine'; nothing changes retroactively.
- One `ownedShare(record)` helper used by totals, history and reports.

### Database cleanup, by value

1. Business profile columns move off `finance_records` into `business_profiles`.
2. The three income-payment link pairs become the one canonical pair.
3. `expense_plans`, `expense_plan_versions`, `expense_plan_id`, `import_key` are retired once old backups are migrated.
4. The hard-coded `Asia/Tashkent` day in the history trigger is replaced by the date the client passes.
5. Money columns in history tables gain their own currency.

## Build order

Status on 23 November 2026.

1. **Net worth line always draws.** Done.
2. **Entry.** Done: global Add, Save and add another on both forms, inline field errors, the transfer dialog's amount
   focus and reason. Not done: one loan and mortgage payment dialog, and an investment stepper that can pay from an
   account (both being built separately).
3. **Dashboard.** Done: Safe to spend, Where it is going, What to improve, one spending pace chart, every row opens its
   item, the shimmer matches the board card for card.
4. **Shimmers.** Done: Cash flow's tabs (Forecast, Spending watchlists, Income estimate, the Overview income table),
   Investments (summary, account and asset card grids, Profit & loss, Payouts & alerts, Target allocation), Loans (side
   cards only when shown, the payoff planner), Recently deleted, Recurring (Reminders, Calendar), Budget Year, Reports
   Tax, Assistant; page-heading tabs and actions are reserved on phones.
5. **De-duplicate.** Done: every row of the table above except the one payment dialog.
6. **Ownership and valuations.** Not started: migrations 166 and 167, asset page, share-aware profit and loss.
7. **Net worth history.** Done: historical prices, day rates, deletion dents, late entries, newly recorded holdings,
   the faster read. Not done: metals and equity compensation by price, a cached daily series from the server.
8. **Close account.** Not started: `closed_on`, one deletion rule across surfaces.
9. **Motion.** Done: one press scale (`--press`, `--press-wide`) and row tint (`--row-hover`, `--row-press`) with press
   and focus states on every tappable row, pointer glow on tappable cards, a 180 ms content change on page tabs,
   scripted scrolls that respect reduced motion, and one reduced-motion block in `app/styles/motion.css` that stills
   every press and transition (an animation's own reduced-motion rule stays beside its keyframes).
10. **Database cleanup.** Not started.

Design rules adopted from the outside review (they match `UI-AGENT.md` where it already speaks): one primary figure
per screen; group by spacing before adding boxes and never nest cards; tabular numerals for money; gain and loss never
by colour alone; motion 100 to 300 ms on transform and opacity only; a card is one tap target of at least 44 px;
errors sit under their field.
