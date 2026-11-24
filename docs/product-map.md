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
| Where net income went | Cash flow (Left over) | Reports opens the same dialog from Net income (or a business's Net profit) for its period; narrowed to a business, a person or the whole business it counts only those lines and stops at the accounts they landed in. The Reports flow chart draws it in place of Net income, beside the spending on the right: each account the money stayed in, holding bought and debt principal paid; an account drawn down is a source on the left beside the income; each opens its own Sankey | Done |
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
| Add an asset | One Add asset flow (`components/add-asset/`, opened with `startAsset`; rules in `lib/add-asset.ts`) | Investments › Add asset, an investment account's Add holding (Investments and Accounts) and ⌘K; editing a saved record keeps the record form | Done |
| Close or delete an account or holding | One Close dialog and one delete confirmation (`components/closing/`, opened with `requestClose` / `requestDelete`) | Accounts and Investments menus; the Closed fold on both | Done |
| Record a payment (loan, mortgage, scheduled bill or income) | One Record payment dialog (`components/payments/`, opened with `openPayment`) | Loans, Recurring, Cash flow, Dashboard, the records table and the expense form's Debt / mortgage tab | Done (see `docs/agents/scheduled-payments.md`) |

## Oddly placed, and where it moves

- **Business setup** starts from the Business tile of Add asset, which closes the flow and opens the setup. Done. Settings ›
  Businesses still lists and edits them.
- **Business tax prep** stays in Reports and is always listed, with an invitation when no business exists. Done.
- **Age of Money** sits with the Budget it measures. Done.
- **Business income and expenses** are added from the business's or property's own Tracker (Add income, Add expense open the normal forms with it preselected). Done.

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

Built 23 November 2026 (migration 168 is a file; the owner applies it). Two actions, with one meaning each:

- **Close** retires something that has history. `closed_on` on `finance_records` and `holding_accounts`
  (`close_finance_record`, `close_holding_account`, and their reopen pair). A closed record keeps every day before its
  closing day and counts nothing from it; the database holds it at zero until it is reopened (`guard_closed_record`),
  so current totals, allocation, forecasts, snapshots and digests leave it out by themselves. Closing needs an empty
  record: a cash account or deposit sends what is left to another account in its currency through the ordinary
  transfer, dated the closing day; anything else is sold, moved or revalued to zero first. A goal saved in the account,
  a running income schedule of the asset, or activity dated after the closing day keeps it open, each with its own
  message. An investment account closes with its holdings: they move to another account (or to none), or close with it.
- **Delete** is for mistakes and means "this never existed" on every surface. An account or holding goes to Recently
  deleted with its whole balance history (the automatic snapshots of its balance and its own Tracker updates), and
  Restore returns all of it, closed state included. It is refused only while something else still points at the
  record, and the refusal names what (`record_delete_blockers`: transactions, recurring income, transfers, payments,
  goals, corporate events, reconciled statements). An investment account with nothing in it is deleted for good
  (`delete_holding_account`).
- **Where closed things are.** The planning read's records pass through `splitClosed` (`lib/closed-records.ts`) in
  `usePlanning`: closed records and investment accounts leave `records` and `holdingAccounts`, so no picker, list or
  "what is left" figure offers them, and wait in `closed` / `closedAccounts` for the Closed fold at the foot of
  Accounts and Investments (`ClosedFold`, with Reopen) and for naming the account of a past transaction
  (`recordAmong`). The Telegram bot and the assistant leave them out of their account lists the same way.
- **The dialogs predict the database.** Delete on an account or holding asks `/api/closing?id=` what still points at
  it before it offers Delete (`DeleteHeldDialog`); with a blocker it names it and offers Close instead. Both dialogs
  say what Close and Delete each do, in one sentence.
- **One rule for a deleted record.** The net worth chart reads no deleted record. The daily snapshots follow: the
  delete takes the record's value out of every day (`remove_from_portfolio_snapshots`), keeps what it took in
  `deleted_items.snapshot_changes`, and Restore puts exactly that back. See `docs/portfolio-snapshots.md`.

Not built: Close in Loans & debts (the database accepts a loan; no screen offers it), a transfer in another currency
from the Close dialog (transfer first, then close), and writing a holding off to zero from the dialog.

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

Status on 23 November 2026.

1. **Net worth line always draws.** Done.
2. **Entry.** Done: global Add, Save and add another on both forms, inline field errors, the transfer dialog's amount
   focus and reason, the one Record payment dialog, and Add asset as a guided flow (23 November 2026): Kind, What, How
   much, Paid from, one Save. A stock, coin or metal paid from a cash account is saved empty and filled by a Buy
   (`/api/asset-movements`); a property, vehicle, valuable or retirement account is saved at its value and Money
   invested debits the account (`/api/investment-history`). When the second request fails the flow says what was saved
   and retries the purchase alone, under the same id. Not done: paying for a Treasury bill or a bond from an account
   (their Tracker contribution needs a balance the flow cannot check without a database), and vested shares, which are
   not bought.
3. **Dashboard.** Done: Safe to spend, Where it is going, What to improve, one spending pace chart, every row opens its
   item, the shimmer matches the board card for card.
4. **Shimmers.** Done: Cash flow's tabs (Forecast, Spending watchlists, Income estimate, the Overview income table),
   Investments (summary, account and asset card grids, Profit & loss, Payouts & alerts, Target allocation), Loans (side
   cards only when shown, the payoff planner), Recently deleted, Recurring (Reminders, Calendar), Budget Year, Reports
   Tax, Assistant; page-heading tabs and actions are reserved on phones.
5. **De-duplicate.** Done: every row of the table above.
6. **Ownership and valuations.** Done: migrations 166 and 167 (applied to the live database on 23 November 2026), ownership and counted
   units on every valued asset, income and expenses from the asset, share-aware reports. Not done: counting a part-owned
   business's cash accounts at the owner's share (they count in full).
7. **Net worth history.** Done: historical prices, day rates, deletion dents, late entries, newly recorded holdings,
   the faster read. Not done: metals and equity compensation by price, a cached daily series from the server.
8. **Close account.** Done: migration 168 (a file; not applied), `closed_on` on accounts, holdings and investment
   accounts, the Closed fold on Accounts and Investments, a delete that works for anything with only its own history,
   empty investment accounts deletable, and the daily snapshots following a delete and a restore. Not done: Close on
   Loans & debts, a cross-currency transfer or a write-off inside the Close dialog.
9. **Motion.** Done: one press scale (`--press`, `--press-wide`) and row tint (`--row-hover`, `--row-press`) with press
   and focus states on every tappable row, pointer glow on tappable cards, a 180 ms content change on page tabs,
   scripted scrolls that respect reduced motion, and one reduced-motion block in `app/styles/motion.css` that stills
   every press and transition (an animation's own reduced-motion rule stays beside its keyframes).
10. **Database cleanup.** Not started.

Design rules adopted from the outside review (they match `UI-AGENT.md` where it already speaks): one primary figure
per screen; group by spacing before adding boxes and never nest cards; tabular numerals for money; gain and loss never
by colour alone; motion 100 to 300 ms on transform and opacity only; a card is one tap target of at least 44 px;
errors sit under their field.
