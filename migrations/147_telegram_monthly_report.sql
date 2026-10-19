-- Monthly Telegram report. Apply after 146.
-- The scheduled Telegram messages gain a monthly report, sent on the 1st for the
-- month that just ended and keyed by that month's first day. Its delivery claims go
-- in telegram_deliveries beside the digest and the weekly recap, so a retried run
-- never sends it twice. Re-runnable; no existing rows change.
BEGIN;
ALTER TABLE public.telegram_deliveries DROP CONSTRAINT IF EXISTS telegram_deliveries_kind_check;
ALTER TABLE public.telegram_deliveries ADD CONSTRAINT telegram_deliveries_kind_check CHECK (kind IN ('digest','recap','monthly'));

-- The capability version moves to 147, so the app can ask for this migration.
CREATE OR REPLACE FUNCTION public.finance_capabilities() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT jsonb_build_object('schema_version',147,'record_revisions',true,'verified_restore',true)
$$;

NOTIFY pgrst,'reload schema';
COMMIT;
