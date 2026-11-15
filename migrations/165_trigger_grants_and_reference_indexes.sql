-- Database review (15 November 2026). Apply after 164.
-- * Trigger functions are run by their triggers, never called by name. Ten of them were still callable through
--   /rest/v1/rpc by anyone, signed in or not (the database linter's SECURITY DEFINER warnings). Every trigger and
--   event-trigger function in the public schema now refuses a direct call; triggers keep firing, because a trigger
--   needs no EXECUTE grant to run its function.
-- * protect_category_direction ran with the caller's search_path; it is pinned to public like every other function.
-- * References that had no index of their own get one, so deleting an account, a goal, a category, a business or a
--   person's workspace no longer scans the tables that point at it. finance_records and transaction_tag_links are
--   left alone: their references are already answered by an index that starts with the same column.
-- No row changes. Re-runnable.
BEGIN;

DO $grants$
DECLARE fn regprocedure;
BEGIN
 FOR fn IN SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.prokind='f' AND p.prorettype IN ('trigger'::regtype,'event_trigger'::regtype)
 LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',fn);
 END LOOP;
END $grants$;

ALTER FUNCTION public.protect_category_direction() SET search_path=public;

CREATE INDEX IF NOT EXISTS corporate_events_target ON public.corporate_events(user_id,target_id);
CREATE INDEX IF NOT EXISTS deleted_tracker_updates_owner ON public.deleted_tracker_updates(user_id);
CREATE INDEX IF NOT EXISTS expense_plan_versions_owner ON public.expense_plan_versions(user_id);
CREATE INDEX IF NOT EXISTS forecast_assignments_account ON public.forecast_assignments(user_id,account_id);
CREATE INDEX IF NOT EXISTS goal_events_goal ON public.goal_events(goal_id,user_id);
CREATE INDEX IF NOT EXISTS goal_events_operation ON public.goal_events(operation_id) WHERE operation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS household_invites_accepted_by ON public.household_invites(accepted_by) WHERE accepted_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS import_batches_account ON public.import_batches(account_id,user_id);
CREATE INDEX IF NOT EXISTS income_sources_linked_record ON public.income_sources(user_id,linked_record_id) WHERE linked_record_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS income_sources_schedule ON public.income_sources(user_id,schedule_id) WHERE schedule_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS investment_history_owner ON public.investment_history(user_id);
CREATE INDEX IF NOT EXISTS savings_goals_holding_account ON public.savings_goals(holding_account_id,user_id) WHERE holding_account_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS transaction_rules_category ON public.transaction_rules(category_id,user_id) WHERE category_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS transaction_rules_account_ref ON public.transaction_rules(user_id,account_id) WHERE account_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS transaction_rules_business_ref ON public.transaction_rules(user_id,business_id) WHERE business_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS transaction_rules_match_business_ref ON public.transaction_rules(user_id,match_business_id) WHERE match_business_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS transaction_rules_match_category_ref ON public.transaction_rules(match_category_id,user_id) WHERE match_category_id IS NOT NULL;

-- The capability version moves to 165, so the app can ask for this migration.
CREATE OR REPLACE FUNCTION public.finance_capabilities() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT jsonb_build_object('schema_version',165,'record_revisions',true,'verified_restore',true)
$$;

NOTIFY pgrst,'reload schema';
COMMIT;
