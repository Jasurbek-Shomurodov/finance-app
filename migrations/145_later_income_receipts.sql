-- A salary or income source may be received in several parts. Apply after 144.
-- Add income refused a second receipt of a fixed income source, or a second salary
-- recorded against a salary plan, for a due date that was already recorded ("This
-- scheduled payment is already recorded."), so an advance and the rest of a month's
-- salary could not both be entered. Such a receipt is now a later payment of that due
-- date, as Record payment on a paid row makes one (migration 112): the first receipt
-- still settles the due date, and the later one names it through
-- occurrence_record_id and occurrence_due_on, which name_scheduled_payment fills from
-- the source due date (migration 140). No rows are rewritten.
BEGIN;

-- Exact guarded patches keep restore guards and earlier in-place patches.
CREATE OR REPLACE FUNCTION pg_temp.patch_later_receipts(fn regprocedure,old_text text,new_text text,expected integer) RETURNS void LANGUAGE plpgsql AS $$
DECLARE definition text:=pg_get_functiondef(fn); found integer;
BEGIN
 -- Re-running is a no-op once every expected match was already patched.
 IF (length(definition)-length(replace(definition,new_text,'')))/length(new_text)=expected THEN RETURN; END IF;
 found:=(length(definition)-length(replace(definition,old_text,'')))/length(old_text);
 IF found<>expected THEN RAISE EXCEPTION 'Unexpected function definition: % (% of % matches)',fn,found,expected; END IF;
 EXECUTE replace(definition,old_text,new_text);
END $$;

-- A fixed income source's receipt.
SELECT pg_temp.patch_later_receipts('public.validate_earning_receipt()'::regprocedure,
 $old$RAISE EXCEPTION 'This scheduled payment is already recorded.';$old$,
 $new$NULL /* A later receipt of a recorded due date adds to it (migration 145). */;$new$,1);

-- A salary recorded against a salary plan.
SELECT pg_temp.patch_later_receipts('public.validate_income_source()'::regprocedure,
 $old$RAISE EXCEPTION 'This salary payment is already recorded.';$old$,
 $new$NULL /* A later salary payment of a recorded pay day adds to it (migration 145). */;$new$,1);

-- The capability version moves to 145, so the app can ask for this migration.
CREATE OR REPLACE FUNCTION public.finance_capabilities() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT jsonb_build_object('schema_version',145,'record_revisions',true,'verified_restore',true)
$$;

NOTIFY pgrst,'reload schema';
COMMIT;
