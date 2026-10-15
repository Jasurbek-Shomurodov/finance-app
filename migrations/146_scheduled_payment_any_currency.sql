-- Record payment in any currency. Apply after 145.
-- Migration 144 let a scheduled payment be typed in its schedule's currency or the
-- cash account's. A USD salary that arrives as sum into a USD cash account could
-- still not be entered as sum. A payment may now be in any currency: one that is not
-- the cash account's carries the dated rate the account moves by, which the
-- finance_records guard already requires, and the planning read counts it in the
-- schedule's currency (migration 120). No rows are rewritten.
BEGIN;

CREATE OR REPLACE FUNCTION public.scheduled_payment_currency(schedule_currency text,account uuid,asked text) RETURNS text
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
BEGIN
 IF asked IS NULL THEN RETURN schedule_currency; END IF;
 IF asked !~ '^[A-Z]{3}$' THEN RAISE EXCEPTION 'Check the account fields.'; END IF;
 RETURN asked;
END $$;
REVOKE ALL ON FUNCTION public.scheduled_payment_currency(text,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.scheduled_payment_currency(text,uuid,text) TO authenticated;

-- The capability version moves to 146, so the app can ask for this migration.
CREATE OR REPLACE FUNCTION public.finance_capabilities() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT jsonb_build_object('schema_version',146,'record_revisions',true,'verified_restore',true)
$$;

NOTIFY pgrst,'reload schema';
COMMIT;
