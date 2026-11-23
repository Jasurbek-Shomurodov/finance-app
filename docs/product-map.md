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
- **Business income and expenses** are added from the business's own page, with category, account and tags (done: the Tracker's Add income and Add expense open the normal forms).
- **Business tax prep** stays in Reports but is always listed, with an invitation when no business exists.
- **Review suggestions** (bottom of Transactions) move to Recurring: they propose schedules.
- **Price alerts, payout calendar, Bitcoin panel** leave Profit & loss for their own Investments tab.
- **Investment benchmarks** are edited from the net worth chart they affect; Settings keeps a link.
- **Age of Money** and **Spending watchlists** sit with the Budget they measure.

## Decisions taken (21 November 2026, on the owner's "decide and build")

1. **Add on every screen.** The top bar's Add offers Expense, Income and Transfer everywhere; Transfer opens Accounts
   with the dialog ready (`/accounts#transfer`, also in ⌘K). The expense form has Save and add another, which keeps the
   category, date and account. Still to do: the same on the income form.
2. **Cash flow and Reports stay separate.** Cash flow is this month and what is ahead; Reports is any period and any
   business. Cash flow's Overview no longer repeats the Budget card, mortgage payments, watchlists (all on Spending)
   or recent transactions (Transactions). Still to do: move the period switch and long-range trend to Reports.
3. **Net worth without investments.** With two days of history the net worth line is drawn alone and the invitation to
   add an investment sits under it.

## System design

### Net worth history (the chart everyone looks at)

Found, in order of harm:

1. Fixed 21 November 2026: stock and crypto history used the stored value and only today used live prices, so the
   line was flat and jumped on its last day. Each quoted holding is now carried between its snapshots by its price
   (`lib/holding-prices.ts`, `priceScale` in `lib/portfolio-history.ts`); the history read returns the closes from the
   kept price cache. Metals and equity compensation still use stored values.
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

Built 23 November 2026 (migrations 166 and 167 are files; the owner applies them).

- **Owned share.** Every asset valued by hand (`valuedKinds`: property, business, valuables, vehicle, retirement
  account) carries `ownership_percentage`, above 0 up to 100. `ownedShare` / `ownedPercent` (`lib/finance.ts`) is the
  one rule; `value()` is the whole value at that share, so totals, net worth, today's parts, snapshots, the assistant
  and the Telegram digests follow. History keeps the share each value was recorded at
  (`balance × ownership_percentage / 100` per event), so changing the share is a dated update and never rewrites the
  days before it.
- **Counted assets.** A valued asset with a unit name (`unit_label`, "sheep") is counted: `quantity` is how many and
  `amount` is the value of ONE unit, so the whole asset is `amount × quantity` (`isCounted`, `fullValue`). Without a
  unit name the quantity column means nothing and the record reads as before. A value update of a counted asset is
  its two numbers and any past date; `investment_history` keeps `quantity` and `unit_value` beside the balance.
- **Whole business or my share.** A one-time income or expense of a part-owned business says how its amount was
  entered (`amount_basis`). 'mine' (the default, and every row from before) counts in full; 'whole' counts at
  `business_share`, the ownership on the day the transaction was linked, kept afterwards. `ownAmount` applies it in the
  one spending walk (`cashFlowItems`, `spendingAmount`), so Cash flow, Budget actuals, the Dashboard, reports and
  digests agree; a single transaction still reads as it was entered. Reports has a Your share / Whole business switch
  (`linesOn`); the whole-business view also scales 'mine' amounts up by their kept share.
- **Entering business money.** A business's or a property's Tracker opens the normal income and expense forms with it
  chosen (`assetEntryStart`); the Tracker's own income and expense entries remain only for vehicles, valuables and
  retirement accounts, which no transaction can name.
- **Decision: cash accounts of a part-owned business count in full.** A cash account assigned to a business is money
  in an account the person holds, so it stays at 100% in net worth, whatever the business's share; nobody's net worth
  shrank when ownership reached every valued kind. A per-business "count its cash at my share" switch is NOT built:
  the net worth history replays cash accounts day by day and would have to apply the same share on the same days, or
  the headline and the chart would disagree. It belongs with build-order step 7 (net worth history). Until then a
  jointly held account is best entered at the person's own part of its balance.
- A business saved at 0% before migration 166 keeps reading as nothing owned, and must be given a share when it is
  next edited (the stricter check is `NOT VALID`).
- `record_investment_event` keeps its seven arguments, because older migrations patch it by that signature; the count,
  value per unit and share arrive through a ten-argument form that passes them as transaction-local settings.

### Database cleanup, by value

1. Business profile columns move off `finance_records` into `business_profiles`.
2. The three income-payment link pairs become the one canonical pair.
3. `expense_plans`, `expense_plan_versions`, `expense_plan_id`, `import_key` are retired once old backups are migrated.
4. The hard-coded `Asia/Tashkent` day in the history trigger is replaced by the date the client passes.
5. Money columns in history tables gain their own currency.

## Build order

1. **Net worth line always draws.** Done.
2. **Entry:** global Add (done), save and add another (expenses done), inline field errors, one payment dialog, investment stepper that can
   pay from an account.
3. **Dashboard:** safe to spend, where it is going, what to improve; every row opens its item.
4. **Shimmers:** Cash flow tabs, Overview cards, Investments, Loans, Recently deleted; headers outside the skeleton.
5. **De-duplicate:** the table above (Cash flow Overview done; `/benchmarks` and unused styles removed), then the
   unused transfer branch.
6. **Ownership and valuations:** migrations 166 and 167, asset page, share-aware profit and loss. Done; the cash-at-share switch waits for step 7.
7. **Net worth history:** historical prices (done), day rates, deletion dents, speed.
8. **Close account:** `closed_on`, one deletion rule across surfaces.
9. **Motion:** one press scale and row tint, tab content transition, reduced-motion rules in one place.

Design rules adopted from the outside review (they match `UI-AGENT.md` where it already speaks): one primary figure
per screen; group by spacing before adding boxes and never nest cards; tabular numerals for money; gain and loss never
by colour alone; motion 100 to 300 ms on transform and opacity only; a card is one tap target of at least 44 px;
errors sit under their field.
