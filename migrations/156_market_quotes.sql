-- Kept market prices. Apply after 155.
-- Every dashboard load used to ask six outside price feeds (CBU, open.er-api, Coinbase, Kraken, Twelve Data,
-- gold-api.com) and waited for all of them, so one slow feed held the screen for 20 seconds or more. The latest answer
-- of each feed is now kept here for every workspace: a reader is answered from this table at once, and a value past its
-- freshness is refreshed after the answer (lib/market-cache.ts). One row is one feed answer: `fx` (the CBU dollar
-- rate), `rates` (the global rate table) or one instrument (`Crypto:BTC`, `Stock:AAPL`, `Metal:XAU`). Public prices
-- only, no personal data; only the server reads and writes it, with the server-only key. Re-runnable; no rows change.
BEGIN;
CREATE TABLE IF NOT EXISTS public.market_quotes(
 key text PRIMARY KEY CHECK(key ~ '^(fx|rates|(Crypto|Stock|Metal):[A-Z0-9][A-Z0-9.-]{0,14})$'),
 data jsonb NOT NULL CHECK(jsonb_typeof(data)='object'),
 fetched_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.market_quotes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.market_quotes FROM PUBLIC,anon,authenticated;

-- Database review (performance advisor): these two policies called auth.uid() once per row instead of once per query.
DROP POLICY IF EXISTS "Owners read app activity" ON public.user_app_activity;
CREATE POLICY "Owners read app activity" ON public.user_app_activity FOR SELECT TO authenticated USING(user_id=(SELECT auth.uid()));
DROP POLICY IF EXISTS owner_read ON public.backup_recovery_points;
CREATE POLICY owner_read ON public.backup_recovery_points FOR SELECT TO authenticated USING(user_id=(SELECT auth.uid()));
-- Deleting a category checks its split lines; no index led with the category, so each check read every split.
CREATE INDEX IF NOT EXISTS transaction_splits_category ON public.transaction_splits(category_id,user_id) WHERE category_id IS NOT NULL;

-- The capability version moves to 156, so the app can ask for this migration.
CREATE OR REPLACE FUNCTION public.finance_capabilities() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT jsonb_build_object('schema_version',156,'record_revisions',true,'verified_restore',true)
$$;

NOTIFY pgrst,'reload schema';
COMMIT;
