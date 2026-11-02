-- A day's rates now come from the daily Vercel job, which downloads the Currency API's USD table: cbu.uz answers only
-- addresses in Uzbekistan. Days saved so far keep their CBU source; each row names where its rates came from.
BEGIN;

ALTER TABLE public.exchange_rate_days DROP CONSTRAINT IF EXISTS exchange_rate_days_source_check;
ALTER TABLE public.exchange_rate_days ADD CONSTRAINT exchange_rate_days_source_check CHECK(source IN ('CBU','Currency API'));

-- The capability version moves to 160, so the app can ask for this migration.
CREATE OR REPLACE FUNCTION public.finance_capabilities() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT jsonb_build_object('schema_version',160,'record_revisions',true,'verified_restore',true)
$$;

NOTIFY pgrst,'reload schema';
COMMIT;
