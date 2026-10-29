-- Kept daily price history. Apply after 156.
-- The comparison card read every series it draws (SPY, HYG, BIL, Bitcoin, each held stock and coin) from Twelve Data,
-- Coinbase or Bitfinex on every load, so one slow or refused feed showed "Market history is unavailable" and every
-- visit spent the paid stock quota again. One row now keeps one series' daily closes for every workspace
-- (lib/price-history-cache.ts): a load reads the row, only the last few days are asked again, and a stock series is
-- read in full once a week because its adjusted closes change with each dividend or split. `checked_to` is the last day
-- the feed was asked through (a weekend or holiday has no close of its own). Public prices only, no personal data;
-- only the server reads and writes it, with the server-only key. Re-runnable; no rows change.
BEGIN;
CREATE TABLE IF NOT EXISTS public.price_history(
 series text PRIMARY KEY CHECK(series ~ '^(stock|crypto):[A-Z0-9][A-Z0-9.-]{0,14}$'),
 points jsonb NOT NULL CHECK(jsonb_typeof(points)='array'),
 first_day date NOT NULL,
 checked_to date NOT NULL CHECK(checked_to>=first_day),
 fetched_at timestamptz NOT NULL DEFAULT now(),
 full_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.price_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.price_history FROM PUBLIC,anon,authenticated;

-- The capability version moves to 157, so the app can ask for this migration.
CREATE OR REPLACE FUNCTION public.finance_capabilities() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT jsonb_build_object('schema_version',157,'record_revisions',true,'verified_restore',true)
$$;

NOTIFY pgrst,'reload schema';
COMMIT;
