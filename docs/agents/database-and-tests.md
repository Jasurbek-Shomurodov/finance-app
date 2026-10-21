# Database migrations and browser tests

## Database migrations

Keep all incremental SQL migrations in the root `migrations/` folder. Name them with sequential three-digit prefixes and descriptive snake_case names: `001_lending_dates.sql`, `002_charity.sql`, `003_record_pagination.sql`. Use the next available number for new migrations, in execution order. Do not use date prefixes or create another migrations folder. `database/setup.sql` is the fresh-database setup script, not an incremental migration. Every migration bumps
`finance_capabilities()`'s `schema_version` to its own number and `requiredSchemaVersion` in
`lib/database-capabilities.ts` follows it; the pre-commit hook runs `scripts/check-migrations.mjs`
(`npm run migrations:check`), which reads that version from the database named in `.env` / `.env.local` and
lists the migration files not yet applied (a warning; `MIGRATIONS_CHECK=strict` refuses the commit instead).

## Browser tests

`npm run test:e2e` runs the P0 flows in Chromium (`e2e/p0.spec.mjs`, Playwright) against a production build
(`npm run build:production` first, or `npm run test:e2e:full`). The app talks to `e2e/fake-supabase.mjs`: the real
`database/setup.sql` in PGlite behind the PostgREST and Auth endpoints the app calls, seeded through the app's own API
with the fixed workspace in `e2e/fixture.mjs` and restored from a snapshot before each test. Keys from local env files
are blanked for the test server, so a run never reaches a real service. CI runs it on every push (`e2e` job). When a
new query uses a PostgREST feature the stand-in lacks, extend it there rather than working around it in the app.
