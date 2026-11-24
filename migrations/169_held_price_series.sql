-- Kept price series for holdings. Apply after 168.
-- The kept daily closes (migration 157) held a stock's dividend-adjusted closes and a coin's. The net worth chart now
-- carries a held stock or vested share by closes adjusted for splits only (`shares:AAPL`: its dividends are paid out
-- as income, so they must not lift the holding too) and gold by its daily spot price (`metal:XAU`), so the series name
-- may also start with `shares:` or `metal:`. Public prices only; no rows change. Re-runnable.
BEGIN;
ALTER TABLE public.price_history DROP CONSTRAINT IF EXISTS price_history_series_check;
ALTER TABLE public.price_history ADD CONSTRAINT price_history_series_check CHECK(series ~ '^(stock|shares|crypto|metal):[A-Z0-9][A-Z0-9.-]{0,14}$');

-- The capability version moves to 169, so the app can ask for this migration.
CREATE OR REPLACE FUNCTION public.finance_capabilities() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT jsonb_build_object('schema_version',169,'record_revisions',true,'verified_restore',true)
$$;

NOTIFY pgrst,'reload schema';
COMMIT;
