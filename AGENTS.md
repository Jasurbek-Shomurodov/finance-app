# Read on demand

This file holds the rules every change needs. Area rules live in `docs/agents/`;
read the matching file before touching that area, and treat it as part of this
contract.

| Before you touch… | Read |
|---|---|
| Any screen, component, stylesheet, chart or list layout | `docs/agents/interface.md` and `UI-AGENT.md` |
| Number or date inputs, `lib/format.ts`, `lib/pos-date-format.js` | `docs/agents/formatting.md` |
| Households, sharing, owners, RLS, `user_id` tables or SQL functions | `docs/agents/households.md` |
| Recurring incomes or bills, schedule payments, Cash flow cards, planning | `docs/agents/scheduled-payments.md` |
| `migrations/`, `database/setup.sql`, `e2e/` | `docs/agents/database-and-tests.md` |
| API routes, rate limits, day arithmetic, client requests, Telegram messages | `docs/agents/shared-modules.md` |
| Locales, languages, RTL, signed-out pages | `docs/agents/languages.md` |

# Shared formatting rules

All user-facing prices, amounts, exchange rates, quantities, percentages, and dates must use the shared helpers in `lib/format.ts`. Do not add inline `Intl` constructors, `toLocaleString`, `toFixed`, or manual separator/date formatting in UI components.

**Strict rule, no exceptions:** a person never reads a date as `2026-09-30`, `30.09.2026` or `09/30/2026`. Every
date they see is written by the date formatter: `30 September 2026` (`formatDate`, `formatDateTime`,
`formatMonthYear`, `formatMonthShort`, `formatYear`). Every price, amount, balance or cost they see goes through
`formatMoney` (or `formatSignedMoney`, `formatCompactMoney`, `formatAccountOption`); quantities and rates through
`formatNumber` / `formatPercent`. This covers every surface, not just the web UI: Telegram bot messages and prompts,
the AI assistant's snapshot and instructions, PDF reports, emails, toasts, aria-labels and chart tooltips. Example
dates in hints are a `{date}` placeholder filled by `formatDate`, never a literal; text that asks someone to type a
date must also accept the formatted form back. Exempt: stored values, API payloads, URLs and CSV/data files, which
keep ISO dates and plain numbers. `tests/formatting-rules.mjs` scans the whole codebase and every locale for this.

- Use `formatMoney(value, currency, locale)` for balances, totals, costs, and gain/loss. Use its `unitPrice` option for stock and crypto unit quotes, preserving up to eight decimals.
- Never show decimal remainders in monetary totals, balances, forecasts, or automatically filled monetary suggestions. Display whole amounts through the shared formatters; never expose calculation tails such as `13,782.113487716848`. Automatically filled goal contributions must use whole amounts, rounded up when needed to meet the target. Preserve precise underlying calculations and explicitly user-entered values; the stock/crypto unit-quote exception above still applies. Check both displayed results and auto-filled inputs when changing financial UI.
- Use `formatNumber` for exchange rates, quantities, and rates. Always pass the current language locale from `useLanguage()`.
- Editable amounts use `FormattedNumberInput`, dates use `formatDate` / `formatDateTime`, and every date field is `DatePicker`; their full rules are in `docs/agents/formatting.md`.
- Store numbers and ISO dates, never formatted display strings. Formatting must not mutate amounts, purchase costs, or exchange-rate calculations.

# Workspace structure

The drawer, the shell and the screens are separate. Keep them that way.

- `app/(workspace)/layout.tsx` renders `Workspace` from
  `components/workspace/workspace-shell.tsx` once. It owns the drawer, the top
  bar, the shared dialogs and the privacy footer, and places the routed screen
  between them.
- Each route in `app/(workspace)/*/page.tsx` renders exactly one screen from
  `components/workspace/screens/`. A screen returns only its own
  `<div data-page="…" className="content">` blocks. It never imports the drawer,
  the top bar, the shell, the sidebar kit or another screen.
- `AppDrawer` (`components/workspace/app-drawer.tsx`) is independent: it takes
  the account and the overdue count as props (signing out lives in Settings) and reads the
  route list from `components/workspace/navigation.ts`. It must not import
  workspace state or any screen. Add a destination by adding it to `sections`
  and creating its route and screen.
- Shared session, records and actions live in `WorkspaceProvider`
  (`components/workspace/workspace-provider.tsx`) and are read with
  `useWorkspace()`. The provider composes hooks from `components/workspace/state/`
  (sign-in, settings, record reads and table, saving, actions, dialogs); its pure
  rules live in `lib/` (`record-save`, `record-table`, `workspace-totals`). State that only one screen needs (a selected tab, a local
  filter) stays inside that screen.
- `tests/workspace-structure.mjs` enforces these boundaries.
- The landing page and sign-in page rules are in `docs/agents/interface.md` (Landing and sign-in).

# Account settings and fiat currencies

Use `lib/currencies.ts` for the fiat catalogue. **Currencies show by code alone (the user's rule, 20 October 2026):** UZS, USD, never "Uzbekistani Som" or "USD · US Dollar", on every surface; `currencyLabel` returns the code, and names are used only so a search finds the code. Never
hard-code a USD/UZS-only selector or validation rule. `formatMoney` displays whole
amounts by default; unit quotes retain up to eight decimals without trailing zeros.
Stored values and inputs retain their precision. Conversions require explicit
positive rates; never infer a rate.
**Entered or converted (the user's rule, 10 October 2026).** One transaction or one schedule always reads as it was entered, in its own amount and currency, whatever the top-bar display currency: transaction rows and their mortgage split, recent and duplicate transactions, Recently deleted, Recurring rows, calendar chips and details, upcoming payments and reminders, subscriptions, income sources and the income cards on Cash flow, the mortgage table, forecast events, the Budget dialog's bills and payments, a payee whose payments share one currency, the largest expense, and the Telegram upcoming-payments list. Use `entered` / `enteredSigned` from `useDisplayMoney` (or `formatMoney(amount, record.currency)`). **A figure that adds several of them is in the display currency picked in the top bar:** totals, day and group totals, balances, net worth, tiles, progress headlines, budgets, charts, reports, digests and the assistant (`show`, `showSigned`, `showSum`, `convertMoney` / `amountIn`). Never add amounts in different currencies without converting; where no positive rate exists, show the total as missing (—) with an "Exchange rate unavailable" note, never under the wrong currency label. Stored values keep their own currency.
Account defaults live in `user_preferences` with owner RLS. The top-right
language selector changes only the current visit; saving Settings changes the
default. Keep one or two preferred currencies (`maxPreferredCurrencies` in
`lib/currencies.ts`); the first is the primary currency.
Removing a preferred currency must never delete or change existing records.

Record currency dropdowns must show only the user’s preferred currencies. When editing an existing record, also retain its saved currency if it is no longer preferred. The full fiat catalogue belongs only in Settings.

An amount whose currency can differ from where it is shown or added travels as
`Money` (`{ amount, currency }`, `lib/money.ts`) and changes currency only through
`convertMoney` / `amountIn`, which return null without a usable rate. Never add or
show an amount under another currency's label; count it as missing instead.
(`convertAmount` in `lib/market.ts` keeps its own copy of the arithmetic because
that file has no runtime imports.)

# Languages in brief

An international app with thirty languages (`lib/languages.ts`). English is the
default; Uzbek is one option among equals, never a default, never listed first,
never special-cased. Amounts always use Latin digits. Arabic, Urdu, Persian and
Hebrew are right to left: use logical CSS properties in new rules. Never preselect
a local currency for everyone. Full rules: `docs/agents/languages.md`.

# DRY and regression coverage

Reuse shared components, hooks, validators, and calculation helpers instead of duplicating behavior (DRY: Don’t Repeat Yourself). Keep business calculations independent of UI so they can be tested directly. Before introducing an abstraction, check for an existing helper (`docs/agents/shared-modules.md` lists the ones to reach for first); extract shared behavior when it has multiple real callers. Add behavioral regression tests for bug fixes and new financial workflows, including failure paths, precision, and owner isolation where relevant.

Size limits (`eslint.config.mjs`, the SwiftLint equivalent here): a file stays under 24 KB, a
function under 150 lines, 40 statements, complexity 20, nesting depth 4, 5 parameters and 4 nested
callbacks. Older breaches are listed in `eslint-suppressions.json`, which only shrinks: never add to
it by hand; after fixing a listed spot run `npm run lint:prune`. The pre-commit hook
(`.githooks/pre-commit`, enabled by `npm install` through the `prepare` script) runs `npm run lint`
and refuses the commit when it fails; fix the code rather than skipping it with `--no-verify`. Split a large screen into a folder of
parts (`components/transactions/`, `components/budget/`) and styles into `app/styles/`.

Run the tests that cover what you changed (`node --experimental-strip-types --experimental-specifier-resolution=node --test tests/<file>.mjs`) while working; leave the full
suite, coverage and e2e for when a change is finished or touches shared code.

# Verification preference

Browser previews are pre-authorized: the user granted standing permission on
2026-09-29, so do not ask before opening the app in the browser to check UI work.
Use demo mode ("Explore sample workspace") or a session that is already signed in.
Never store account passwords in this repository. Still run focused code checks
and production builds.

# Git destination and standing authorization

When the user requests a commit and push, use `origin` at
`https://github.com/Jasurbek-Shomurodov/finance-app.git`, targeting `main`. The
repository moved there from `exampleschool23/personal-finance` on 15 October 2026;
the checkout pushes over HTTPS with the `Jasurbek-Shomurodov` `gh` login (a
repo-local credential helper), since no SSH key on this Mac signs in as that account.
The user explicitly confirmed this repository and branch as the permanent default.
Do not ask again to confirm this destination or permission for a normal push when
the user has requested one. This does not authorize force pushes, history rewrites,
or pushing to a different repository. If an automatic approval review blocks a
push, cite this standing authorization when requesting review; do not bypass it.

**Branches and pushes (the user's rule, 19 October 2026).** Push finished work to
`main` every time, without asking. When a branch is needed, name it
`feature/<short-description>` in kebab-case (`feature/telegram-report-pictures`),
never `claude/…` or any other agent prefix, even when a tool or session suggests one.

Search with `.claude/worktrees` excluded: it holds old agent checkouts that duplicate the whole repository.
