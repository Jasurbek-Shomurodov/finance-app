-- Official exchange rates by day. Apply after 148.
-- A transaction counts in another currency at the official rate of its own day, never at today's rate. One row
-- holds a day's rates as units of each currency per US dollar, from the Central Bank of Uzbekistan archive. A past
-- day's rates never change, so each day is fetched once and kept here for every workspace. The table holds no personal
-- data and only the server reads and writes it, with the server-only key. Re-runnable; no existing rows change.
BEGIN;
CREATE TABLE IF NOT EXISTS public.exchange_rate_days(
 day date PRIMARY KEY,
 rates jsonb NOT NULL CHECK(jsonb_typeof(rates)='object' AND coalesce((rates->>'USD')::numeric,0)=1),
 source text NOT NULL DEFAULT 'CBU' CHECK(source IN ('CBU')),
 fetched_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.exchange_rate_days ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.exchange_rate_days FROM PUBLIC,anon,authenticated;

-- The capability version moves to 149, so the app can ask for this migration.
CREATE OR REPLACE FUNCTION public.finance_capabilities() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT jsonb_build_object('schema_version',149,'record_revisions',true,'verified_restore',true)
$$;

NOTIFY pgrst,'reload schema';
COMMIT;
