-- Each benchmark line may have a colour the owner chose (Settings › Investment benchmarks). Apply after 150.
-- `colors` maps a benchmark key (BTC, SPY, depositUSD, STOCK:NVDA…) to a palette colour name; a benchmark not in it
-- keeps its default colour. Re-runnable; existing rows keep their choices and start with no colours.
BEGIN;
ALTER TABLE public.investment_comparison_preferences ADD COLUMN IF NOT EXISTS colors jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.investment_comparison_preferences DROP CONSTRAINT IF EXISTS investment_comparison_preferences_colors;
ALTER TABLE public.investment_comparison_preferences ADD CONSTRAINT investment_comparison_preferences_colors CHECK(jsonb_typeof(colors)='object');

-- The capability version moves to 151, so the app can ask for this migration.
CREATE OR REPLACE FUNCTION public.finance_capabilities() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT jsonb_build_object('schema_version',151,'record_revisions',true,'verified_restore',true)
$$;

NOTIFY pgrst,'reload schema';
COMMIT;
