# Product map and redesign plan

Written 21 November 2026 from a full read of the app (screens, dialogs, database, net worth chart). It says what the
app does, where each feature belongs, what is duplicated, and the order the redesign is built in. Update it when a
phase lands.

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

## What is duplicated today, and the one home for each

| Feature | Shown today | One home | Elsewhere |
|---|---|---|---|
| "What is left" | Eight figures with different definitions | **Safe to spend** on the Dashboard: budget left minus bills still due this month (`useMonthOutlook`) | Budget keeps Left to budget; Cash flow keeps Still to come |
| Budget card | Dashboard, Cash flow Overview, Cash flow Spending | Budget | One compact card on the Dashboard |
| Upcoming payments | Six lists | Recurring | Dashboard "Due" card; rows open the item, not the page |
| Money flow diagram | Cash flow, Budget, Recurring, Reports | Cash flow (this month) and Reports (any period) | Budget and Recurring link to it |
| Spending pace | Two components with one name | One chart with last month and budget lines | Dashboard and Budget share it |
| Recent transactions | Dashboard, Cash flow (older table), Transactions | Transactions | Dashboard card; Cash flow drops its table |
| Mortgage payments, watchlists | Cash flow Overview and Spending | Cash flow Spending | Overview drops them |
| Record a loan or mortgage payment | Four dialogs | One payment dialog | Opened from Loans, Recurring, Cash flow, Dashboard |
| Transfer | Two dialogs (one unreachable) | `AssetMovementDialog` | The unused `AccountOperation` branch is removed |
| Rules | Transactions and Settings | Transactions | Settings links there |

## Oddly placed, and where it moves

- **Business setup** (Settings only) moves to Investments, where a business is an asset; Settings links to it.
- **Business income and expenses** are added from the business's own page, with category, account and tags.
- **Business tax prep** stays in Reports but is always listed, with an invitation when no business exists.
- **Review suggestions** (bottom of Transactions) move to Recurring: they propose schedules.
- **Price alerts, payout calendar, Bitcoin panel** leave Profit & loss for their own Investments tab.
- **Investment benchmarks** are edited from the net worth chart they affect; Settings keeps a link.
- **Age of Money** and **Spending watchlists** sit with the Budget they measure.

## Open decisions (they reverse an earlier choice, so the owner decides)

1. **Add on every screen.** Today Add expense is in the top bar only on Cash flow, by an earlier rule. Proposal: one
   global Add (expense, income, transfer) on every screen, with ⌘Enter to save and add another.
2. **Cash flow and Reports.** Proposal: keep both. Cash flow is this month and what is ahead; Reports is any period and
   any business. Cash flow loses its period switch and long-range trend to Reports.
3. **Net worth chart with no investments.** Today it shows "No investments yet". Proposal: draw the net worth line for
   anyone with at least two days of history and invite the first investment below it.

## System design

### Net worth history (the chart everyone looks at)

Found, in order of harm:

1. Stock and crypto history uses the stored value, and only today uses live prices, so the line is flat and jumps on
   its last day. Fix: value quoted holdings on past days as quantity that day × that day's close, from the existing
   price cache.
2. Fixed 21 November 2026: the line disappeared whenever benchmark data was loading or unavailable. It now draws alone.
3. Past days convert at today's exchange rate. Fix: each day at its own rate, as transactions already do.
4. Deleting or editing an old transaction leaves a dent from its date until today. Fix: adjust the account's valuation
   rows from the transaction's date.
5. The whole history is re-read after every save, page by page. Fix: one reduced daily series from the server, cached
   by revision; memoise the client work.

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

1. **Net worth line always draws.** Done.
2. **Entry:** global Add, save and add another, inline field errors, one payment dialog, investment stepper that can
   pay from an account.
3. **Dashboard:** safe to spend, where it is going, what to improve; every row opens its item.
4. **Shimmers:** Cash flow tabs, Overview cards, Investments, Loans, Recently deleted; headers outside the skeleton.
5. **De-duplicate:** the table above, then dead code (`/benchmarks`, unused transfer branch, unused styles).
6. **Ownership and valuations:** migrations 166 and 167, asset page, share-aware profit and loss.
7. **Net worth history:** historical prices, day rates, deletion dents, speed.
8. **Close account:** `closed_on`, one deletion rule across surfaces.
9. **Motion:** one press scale and row tint, tab content transition, reduced-motion rules in one place.

Design rules adopted from the outside review (they match `UI-AGENT.md` where it already speaks): one primary figure
per screen; group by spacing before adding boxes and never nest cards; tabular numerals for money; gain and loss never
by colour alone; motion 100 to 300 ms on transform and opacity only; a card is one tap target of at least 44 px;
errors sit under their field.
