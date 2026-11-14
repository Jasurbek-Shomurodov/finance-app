-- A goal joins the monthly funding plan when it is created (the user's rule, 14 November 2026): the column default
-- moves to true. Goals that already exist keep their setting, and a goal restored from Recently deleted keeps the one
-- it was deleted with. No row is touched. Re-runnable. Apply after 162.
BEGIN;
ALTER TABLE public.savings_goals ALTER COLUMN funding_enabled SET DEFAULT true;

-- The capability version moves to 163, so the app can ask for this migration.
CREATE OR REPLACE FUNCTION public.finance_capabilities() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT jsonb_build_object('schema_version',163,'record_revisions',true,'verified_restore',true)
$$;

NOTIFY pgrst,'reload schema';
COMMIT;
