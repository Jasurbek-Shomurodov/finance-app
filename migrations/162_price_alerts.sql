-- Price alerts (Investments › Performance) are a workspace preference: the holding, the direction and the price, with
-- the day each was announced. The preference key check gains 'price_alerts'; nothing else changes and no row is
-- touched. Re-runnable. Apply after 161.
BEGIN;
ALTER TABLE public.workspace_preferences DROP CONSTRAINT IF EXISTS workspace_preferences_key_check;
ALTER TABLE public.workspace_preferences ADD CONSTRAINT workspace_preferences_key_check CHECK(key IN ('allocation','watchlists','import_profiles','debt_plan','goal_scenarios','goal_order','daily_plan','entry_templates','reminders','dashboard','account_order','category_order','business_order','tag_order','tax_lines','category_icons','removed_categories','price_alerts'));

-- The capability version moves to 162, so the app can ask for this migration.
CREATE OR REPLACE FUNCTION public.finance_capabilities() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT jsonb_build_object('schema_version',162,'record_revisions',true,'verified_restore',true)
$$;

NOTIFY pgrst,'reload schema';
COMMIT;
