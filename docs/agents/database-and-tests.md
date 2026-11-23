# Database migrations and browser tests

## Database migrations

Keep all incremental SQL migrations in the root `migrations/` folder. Name them with sequential three-digit prefixes and descriptive snake_case names: `001_lending_dates.sql`, `002_charity.sql`, `003_record_pagination.sql`. Use the next available number for new migrations, in execution order. Do not use date prefixes or create another migrations folder. `database/setup.sql` is the fresh-database setup script, not an incremental migration. Every migration bumps
`finance_capabilities()`'s `schema_version` to its own number and `requiredSchemaVersion` in
`lib/database-capabilities.ts` follows it; the pre-commit hook runs `scripts/check-migrations.mjs`
(`npm run migrations:check`), which reads that version from the database named in `.env` / `.env.local` and
lists the migration files not yet applied (a warning; `MIGRATIONS_CHECK=strict` refuses the commit instead).

A migration that changes a function older migrations patch by text keeps that function's signature and the patched
text in place: tests re-apply older migrations to the finished schema (`tests/database-integrity-sql.mjs`,
`tests/more-asset-kinds.mjs`, `tests/asset-payment-links-sql.mjs`) and expect them to change nothing. Add a parameter
through a second signature (as 166 does for `record_investment_event`), and add a column to `save_finance_record`'s
list in the middle, never at its end.

A function that takes a new argument through a second signature keeps the first as a thin wrapper (as 168 does for
`capture_portfolio_snapshot`), and a test that re-applies an older migration and compares every function re-applies
the later ones that set the capability version after it (`tests/edit-linked-transactions-sql.mjs`).

## Browser tests

`npm run test:e2e` runs the P0 flows in Chromium (`e2e/p0.spec.mjs`, Playwright) against a production build
(`npm run build:production` first, or `npm run test:e2e:full`). The app talks to `e2e/fake-supabase.mjs`: the real
`database/setup.sql` in PGlite behind the PostgREST and Auth endpoints the app calls, seeded through the app's own API
with the fixed workspace in `e2e/fixture.mjs` and restored from a snapshot before each test. Keys from local env files
are blanked for the test server, so a run never reaches a real service. CI runs it on every push (`e2e` job). When a
new query uses a PostgREST feature the stand-in lacks, extend it there rather than working around it in the app.

Every process of a run stands on one fixed day, 13 March 2030 at noon in Tashkent (`e2e/fixed-clock.mjs`): the
runner through `e2e/fixture.mjs`, both servers through `NODE_OPTIONS`, PGlite's `now()` with them, and each page
through the `test` in `e2e/test.mjs`, which every spec imports instead of `@playwright/test`. The clock ticks on from
that moment. The day is in the future because the browser drops cookies that expired by its real clock; move it
forward, and refresh every screenshot, before real time reaches it.

### Screenshot tests

`e2e/screens.spec.mjs` compares whole pages with saved pictures (`toHaveScreenshot`): every workspace screen (the
drawer's list in `components/workspace/navigation.ts`), the signed-out landing and sign-in pages, and the main dialogs
(the spec's `dialogs` list: add, edit and delete an expense, its details, add account, transfer, record payment, add
recurring, the Add goal and Add asset steppers, sell a holding, add loan, loan payment, Customize, search, Budget
settings), each in light, dark, at phone width (390 px) and in Arabic right to left, and the loading shimmers. They catch layout jumps, theme breaks and blocks that
change size; the figures stay in `e2e/p0.spec.mjs`. Fonts draw differently on each system, so every picture is saved
twice: `-darwin` (a Mac) and `-linux` (CI). A screen redesign refreshes both sets in the same change, as with any test
that asserts on markup:

1. Mac: `npx playwright test e2e/screens.spec.mjs --update-snapshots` (`-g "SHOT budget"` for one screen) after `npm run build:production`, and
   look at every picture it wrote.
2. Linux: push to a `feature/…` branch. Its e2e job fails on the old pictures and uploads what it drew; then
   `npm run screenshots:ci` copies those into the `-linux` files. Look at them, commit and push again; the job turns green.

Loading shimmers are pictured too, in light and at phone width: `shimmer-data-<screen>` holds a fresh visit's data
requests (everything but the session's) so the screen keeps its own skeleton, and `shimmer-drawer-<screen>` holds a
drawer tap's route request (`?_rsc=`) so the drawer shimmer from `screenSkeletons` stays. Put each beside the loaded
`<screen>-light` picture to check the shimmer-follows-the-screen rule block for block; a screen change refreshes all
three. (The Assistant and Settings load no records, and Settings is not a drawer link.)

A dialog picture is the window with the dialog open over its screen, opened the way a person opens it; buttons are
found by the app's own wording in the test's language (`lib/locales/ar.json` for Arabic), and dialog pictures allow 250
differing pixels for edge shading behind the overlay. A new dialog gets a row in `dialogs`; a new screen gets a row in the spec's `workspace` list, with `ready` naming a piece of the fixture it shows; every
picture waits for that, for fonts and for nothing to be loading (`aria-busy`, a `skeleton` class) first.
