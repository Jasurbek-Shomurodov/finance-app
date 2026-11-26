# Database migrations and browser tests

## Database migrations

Keep all incremental SQL migrations in the root `migrations/` folder. Name them with sequential three-digit prefixes and descriptive snake_case names: `001_lending_dates.sql`, `002_charity.sql`, `003_record_pagination.sql`. Use the next available number for new migrations, in execution order. Do not use date prefixes or create another migrations folder. `database/setup.sql` is the fresh-database setup script, not an incremental migration. Every migration bumps
`finance_capabilities()`'s `schema_version` to its own number and `requiredSchemaVersion` in
`lib/database-capabilities.ts` follows it; the pre-commit hook runs `scripts/check-migrations.mjs`
(`npm run migrations:check`), which reads that version from the database named in `.env` / `.env.local` and
lists the migration files not yet applied (a warning; `MIGRATIONS_CHECK=strict` refuses the commit instead).

**Apply a new migration to the live database before pushing it (the user's rule, 26 November 2026).** Main deploys
straight away, so a migration reaches Supabase first (the connector's `apply_migration`, named after the file, or the
SQL editor), in number order, and `select finance_capabilities()` shows its `schema_version` before the push. If it
cannot be applied, the push waits and the user hears why.

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
2. Linux: push to main. Its `e2e` job redraws the Linux pictures that changed (`--update-snapshots=changed`), the
   `pictures` job commits them to main ("e2e: the Linux pictures for …"), cancels the stale run and starts a strict
   one on the new commit. `git pull` to take that commit and look at the pictures in its diff. (`npm run
   screenshots:ci` is only for a strict run, on a pull request or a re-run, that failed on a picture.)

### CI on main

`.github/workflows/checks.yml` runs on every push in four jobs, no more (the user's ask, 26 November 2026): `verify`
(audit, lint, type check, production build, integration test), `unit` (every unit test with coverage and the
`scripts/coverage-floor.json` check, `node scripts/test.mjs --coverage --concurrency=$(nproc)`, one test file per
core), `e2e` (every Playwright test on one build and database) and `pictures` (commits what `e2e` redrew). The three
test jobs run side by side, so a run takes as long as `e2e`. Don't bring back shard matrices to save minutes.

**No branches (the user's rule, 26 November 2026, replacing the feature-branch flow of 24 November).** Commit on
main and push to main; the pre-push hook refuses a push to any other branch and still refuses a failing type check.
Never skip the hook with `--no-verify`. Main has no gate before CI any more, so run the tests that cover your change
locally before pushing, watch the run that follows, and fix a red main at once (after a UI change, `git pull` for CI's
pictures commit).

Loading shimmers are pictured too, in light and at phone width: `shimmer-data-<screen>` holds a fresh visit's data
requests (everything but the session's) so the screen keeps its own skeleton, and `shimmer-drawer-<screen>` holds a
drawer tap's route request (`?_rsc=`) so the drawer shimmer from `screenSkeletons` stays. Put each beside the loaded
`<screen>-light` picture to check the shimmer-follows-the-screen rule block for block; a screen change refreshes all
three. (The Assistant and Settings load no records, and Settings is not a drawer link.)

A dialog picture is the window with the dialog open over its screen, opened the way a person opens it; buttons are
found by the app's own wording in the test's language (`lib/locales/ar.json` for Arabic), and dialog pictures allow 250
differing pixels for edge shading behind the overlay. A new dialog gets a row in `dialogs`; a new screen gets a row in the spec's `workspace` list, with `ready` naming a piece of the fixture it shows; every
picture waits for that, for fonts and for nothing to be loading (`aria-busy`, a `skeleton` class) first.
